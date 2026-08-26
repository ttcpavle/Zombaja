import {
  createRoom,
  findAvailableRoom,
  findRoom,
  getRoomPlayerCount,
  rooms,
  playerRoom,
  playerWs,
  generateRoomCode,
} from "../rooms/roomManager.js";
import { checkWallCollision } from "../utils.js";
import { SPAWN_POINTS, walls } from "../world/map.js";
import { startGameLoop, stopGameLoop } from "../game/gameLoop.js";
import { broadcastToRoom, broadcastLobbyUpdate } from "../game/broadcast.js";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  MAX_PLAYERS_PER_ROOM,
} from "../config/constants.js";
import { SHOP_ZONE } from "../world/map.js";
import { WEAPON_CONFIG, upgradeCostAtLevel } from "../game/weaponConfig.js";
import {
  CONSUMABLE_CONFIG,
  createConsumableState,
  startConsumableUse,
  cancelChannelIfShooting,
  cancelChannelOnWeaponSwitch,
} from "../game/consumables.js";

let playerIdCounter = 1;

function createPlayerState(id, name, spawn, ready) {
  return {
    id,
    name: name || `Player${id}`,
    x: spawn.x,
    y: spawn.y,
    health: 100,
    alive: true,
    score: 0,
    ready: !!ready,
    shooting: false,
    shootDir: { dx: 1, dy: 0 },
    lastShotAt: 0,
    gunIndex: 0,
    currency: 0,
    weapons: {
      pistol:  { owned: true,  level: 1, ammo: Infinity },
      shotgun: { owned: false, level: 0, ammo: 0 },
      rifle:   { owned: false, level: 0, ammo: 0 },
      granata: { owned: false, level: 0, ammo: 0 },
    },
    consumables: createConsumableState(),
    adrenalineBar: 0,
    channeling: null,
  };
}

// Zove se svaki put kad neko napusti sobu ili se neko pridruzi - garantuje da
// soba uvek ima validnog vlasnika (nekog ko je stvarno jos u room.players).
function ensureRoomOwner(room, fallbackId) {
  if (room.ownerId == null || !room.players[room.ownerId]) {
    const remaining = Object.keys(room.players);
    room.ownerId = fallbackId ?? (remaining.length > 0 ? Number(remaining[0]) : null);
  }
}

function sendJoinedConfirmation(ws, room, playerId) {
  ws.send(
    JSON.stringify({
      type: "joined",
      playerId,
      roomId: room.id,
      roomType: room.type,
      roomCode: room.code,
      ownerId: room.ownerId,
      walls,
      shopZone: SHOP_ZONE,
      weaponConfig: WEAPON_CONFIG,
      consumableConfig: CONSUMABLE_CONFIG,
      roomState: room.state,
      players: Object.values(room.players).map((p) => ({
        id: p.id,
        name: p.name,
        ready: !!p.ready,
      })),
    }),
  );
}

export function setupWebsocket(wss) {
  wss.on("connection", (ws) => {
    let playerId = null;

    ws.on("message", (msg) => {
      const data = JSON.parse(msg);

      // ---- JOIN: assign player to a room ----
      if (
        data.type === "create_lobby" ||
        data.type === "join_public" ||
        data.type === "join"
      ) {
        playerId = playerIdCounter++;
        playerWs[playerId] = ws;

        let room;
        if (data.type === "create_lobby") {
          room = createRoom(true, playerId);
        } else if (data.type === "join_public") {
          room = findAvailableRoom();
        } else {
          room = findRoom(data.code);
        }

        if (!room) {
          ws.send(JSON.stringify({ type: "notJoined" }));
          return;
        }

        const spawnIdx = getRoomPlayerCount(room) % SPAWN_POINTS.length;
        const spawn = SPAWN_POINTS[spawnIdx];

        room.players[playerId] = createPlayerState(
          playerId,
          data.name,
          spawn,
          data.type === "create_lobby",
        );
        playerRoom[playerId] = room.id;
        ensureRoomOwner(room, room.ownerId ?? playerId);

        sendJoinedConfirmation(ws, room, playerId);
        broadcastLobbyUpdate(room);

        if (
          room.type === "public" &&
          Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM
        ) {
          room.state = "playing";
          room.startedAt = Date.now();
          startGameLoop(room);
          broadcastToRoom(room, { type: "game_started", startedAt: room.startedAt });
          console.log(`Public room ${room.id} auto-started (max players)`);
        }
        console.log(`Player ${playerId} (${data.name}) joined room ${room.id}`);
        return;
      }

      // ---- REJOIN: "igraj ponovo sa istim igracima" posle game over-a ----
      if (data.type === "rejoin_room") {
        const targetRoom = rooms[data.roomId];
        if (!targetRoom || targetRoom.state === "playing") {
          ws.send(JSON.stringify({ type: "notJoined" }));
          return;
        }
        clearTimeout(targetRoom.emptyGraceTimer);
        playerId = playerIdCounter++;
        playerWs[playerId] = ws;

        const isFirstBack = targetRoom.state === "gameover";
        if (isFirstBack) {
          targetRoom.state = "lobby";
          targetRoom.type = "private";
          targetRoom.code = generateRoomCode();
        }

        const spawnIdx = getRoomPlayerCount(targetRoom) % SPAWN_POINTS.length;
        const spawn = SPAWN_POINTS[spawnIdx];

        // Prvi koji se vrati (onaj ko sobu vraca iz "gameover" u "lobby") je
        // analogan create_lobby vlasniku - automatski ready, isto kao osnivac sobe.
        // Svi sledeci koji se prikljucuju istoj sobi i dalje moraju rucno da se ready-uju.
        targetRoom.players[playerId] = createPlayerState(playerId, data.name, spawn, isFirstBack);        
        playerRoom[playerId] = targetRoom.id;
        ensureRoomOwner(targetRoom, null);

        sendJoinedConfirmation(ws, targetRoom, playerId);
        broadcastLobbyUpdate(targetRoom);
        console.log(`Player ${playerId} (${data.name}) rejoined room ${targetRoom.id}`);
        return;
      }

      // All subsequent messages require playerId to be set
      if (!playerId) return;

      const room = rooms[playerRoom[playerId]];
      if (!room) return;
      const p = room.players[playerId];

      // ---- SET READY ----
      if (data.type === "set_ready") {
        if (!room.players[playerId]) return;
        room.players[playerId].ready = !!data.ready;
        broadcastLobbyUpdate(room);
        return;
      }

      // ---- PING/PONG ----
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", sentAt: data.sentAt }));
        return;
      }

      // ---- START GAME ----
      if (data.type === "start_game") {
        if (room.state !== "lobby") return;
        if (room.ownerId !== playerId) {
          ws.send(
            JSON.stringify({ type: "start_failed", reason: "not_owner" }),
          );
          return;
        }
        const players = Object.values(room.players);
        const allReady = players.length > 0 && players.every((p) => p.ready);
        if (!allReady) {
          ws.send(
            JSON.stringify({ type: "start_failed", reason: "not_all_ready" }),
          );
          return;
        }
        room.state = "playing";
        room.startedAt = Date.now();
        startGameLoop(room);
        broadcastToRoom(room, { type: "game_started", startedAt: room.startedAt });
        console.log(`Room ${room.id} game started`);
        return;
      }

      // ---- IN-GAME ACTIONS ----
      if (room.state !== "playing") return;
      if (!p || !p.alive) return;

      if (data.type === "move") {
        const nextX = p.x + data.dx;
        const nextY = p.y + data.dy;
        if (!checkWallCollision(nextX, p.y, 20))
          p.x = Math.max(0, Math.min(GAME_WIDTH - 20, nextX));
        if (!checkWallCollision(p.x, nextY, 20))
          p.y = Math.max(0, Math.min(GAME_HEIGHT - 20, nextY));
        return;
      }

      if (data.type === "shoot_start" || data.type === "shoot_update") {
        if (typeof data.dx === "number" && typeof data.dy === "number") {
          const len = Math.hypot(data.dx, data.dy);
          if (len > 0) {
            p.shootDir = { dx: data.dx / len, dy: data.dy / len };
          }
        }
        if (data.type === "shoot_start") {
          p.shooting = true;
          cancelChannelIfShooting(p);
        }
        return;
      }

      if (data.type === "shoot_stop") {
        p.shooting = false;
        return;
      }

      if (data.type === "weapon_change") {
        if (Number.isInteger(data.weapon) && data.weapon >= 0 && data.weapon <= 3) {
          cancelChannelOnWeaponSwitch(p, data.weapon);
          p.gunIndex = data.weapon;
        }
        return;
      }

      if (data.type === "use_consumable") {
        if (data.item === "medkit" || data.item === "adrenalin" || data.item === "spas") {
          startConsumableUse(room, p, data.item);
        }
        return;
      }

      if (data.type === "buy_weapon" || data.type === "upgrade_weapon" || data.type === "buy_ammo") {
        const inZone =
          p.x < SHOP_ZONE.x + SHOP_ZONE.w && p.x + 20 > SHOP_ZONE.x &&
          p.y < SHOP_ZONE.y + SHOP_ZONE.h && p.y + 20 > SHOP_ZONE.y;
        if (!inZone) return;

        const cfg = WEAPON_CONFIG[data.weapon];
        const st = p.weapons[data.weapon];
        if (!cfg || !st) return;

        if (data.type === "buy_weapon" && !st.owned && p.currency >= cfg.unlockCost) {
          p.currency -= cfg.unlockCost;
          st.owned = true;
          st.level = 1;
          st.ammo = cfg.infiniteAmmo ? Infinity : Math.round(cfg.ammoPerBuy / 2);
        }
        if (data.type === "upgrade_weapon" && st.owned && st.level < cfg.maxLevel) {
          const cost = upgradeCostAtLevel(cfg, st.level);
          if (p.currency >= cost) { p.currency -= cost; st.level += 1; }
        }
        if (data.type === "buy_ammo" && st.owned && !cfg.infiniteAmmo && p.currency >= cfg.ammoCost) {
          p.currency -= cfg.ammoCost;
          st.ammo += cfg.ammoPerBuy;
        }
        return;
      }

      if (data.type === "buy_consumable") {
        const inZone =
          p.x < SHOP_ZONE.x + SHOP_ZONE.w && p.x + 20 > SHOP_ZONE.x &&
          p.y < SHOP_ZONE.y + SHOP_ZONE.h && p.y + 20 > SHOP_ZONE.y;
        if (!inZone) return;

        const cfg = CONSUMABLE_CONFIG[data.item];
        const inv = p.consumables[data.item];
        if (!cfg || !inv) return;

        if (inv.count < cfg.maxCount && p.currency >= cfg.cost) {
          p.currency -= cfg.cost;
          inv.count += 1;
        }
        return;
      }
    });

    ws.on("close", () => {
      if (!playerId) return;
      const roomId = playerRoom[playerId];
      const room = rooms[roomId];
      if (room) {
        const wasOwner = room.ownerId === playerId;
        delete room.players[playerId];
        console.log(`Player ${playerId} left room ${roomId}`);

        if (Object.keys(room.players).length === 0) {
          stopGameLoop(room);
          if (room.state === "gameover") {
            // Igraci sa game-over ekrana upravo rekonektuju (stara konekcija se gasi
            // PRE nego sto nova posalje rejoin_room) - ostavi sobi kratak prozor.
            clearTimeout(room.emptyGraceTimer);
            room.emptyGraceTimer = setTimeout(() => {
              if (rooms[roomId] && Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
                console.log(`Room ${roomId} removed (empty, gameover grace expired)`);
              }
            }, 15000);
          } else {
            delete rooms[roomId];
            console.log(`Room ${roomId} removed (empty)`);
          }
        } else {
          if (wasOwner) ensureRoomOwner(room, null);
          if (room.state === "lobby") {
            broadcastLobbyUpdate(room);
          }
        }
      }
      delete playerRoom[playerId];
      delete playerWs[playerId];
    });
  });
}