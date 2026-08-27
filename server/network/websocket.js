import crypto from "crypto";
import {
  createRoom,
  findAvailableRoom,
  findRoom,
  getRoomPlayerCount,
  rooms,
  playerRoom,
  playerWs,
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
const RECONNECT_GRACE_MS = 20_000;
const resumeSessions = new Map();

function hashResumeToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createResumeSession(playerId) {
  const token = crypto.randomBytes(32).toString("hex");
  resumeSessions.set(hashResumeToken(token), { playerId, timer: null, expiresAt: null });
  return token;
}

function sendJoined(ws, room, playerId, resumeToken) {
  ws.send(JSON.stringify({
    type: "joined",
    playerId,
    roomId: room.id,
    roomType: room.type,
    roomCode: room.code,
    ownerId: room.ownerId,
    resumeToken,
    walls,
    shopZone: SHOP_ZONE,
    weaponConfig: WEAPON_CONFIG,
    consumableConfig: CONSUMABLE_CONFIG,
    roomState: room.state,
    players: Object.values(room.players).map((p) => ({
      id: p.id,
      name: p.name,
      ready: !!p.ready,
      connected: p.connected !== false,
    })),
  }));
}

function removePlayer(playerId) {
  const roomId = playerRoom[playerId];
  const room = rooms[roomId];
  if (room) {
    delete room.players[playerId];
    if (room.state === "lobby") broadcastLobbyUpdate(room);
    if (Object.keys(room.players).length === 0) {
      stopGameLoop(room);
      delete rooms[roomId];
      console.log(`Room ${roomId} removed (empty)`);
    }
  }
  delete playerRoom[playerId];
  delete playerWs[playerId];
  for (const [tokenHash, session] of resumeSessions) {
    if (session.playerId === playerId) {
      if (session.timer) clearTimeout(session.timer);
      resumeSessions.delete(tokenHash);
    }
  }
}

export function setupWebsocket(wss) {
  wss.on("connection", (ws) => {
    let playerId = null;

    ws.on("message", (msg) => {
      const data = JSON.parse(msg);

      if (data.type === "resume") {
        const session = typeof data.resumeToken === "string"
          ? resumeSessions.get(hashResumeToken(data.resumeToken))
          : null;
        const room = session ? rooms[playerRoom[session.playerId]] : null;
        const player = session && room ? room.players[session.playerId] : null;
        if (!session || !room || !player || (session.expiresAt && session.expiresAt < Date.now())) {
          ws.send(JSON.stringify({ type: "resume_failed" }));
          return;
        }

        if (session.timer) clearTimeout(session.timer);
        session.timer = null;
        session.expiresAt = null;
        playerId = session.playerId;
        const previousWs = playerWs[playerId];
        if (previousWs && previousWs !== ws) previousWs.close();
        player.connected = true;
        player.disconnectedAt = null;
        playerWs[playerId] = ws;
        sendJoined(ws, room, playerId, data.resumeToken);
        broadcastLobbyUpdate(room);
        return;
      }

      if (
        data.type === "create_lobby" ||
        data.type === "join_public" ||
        data.type === "join"
      ) {
        playerId = playerIdCounter++;

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

        room.players[playerId] = {
        id: playerId,
        name: data.name || `Player${playerId}`,
        x: spawn.x,
        y: spawn.y,
        health: 100,
        alive: true,
        score: 0,
        ready: data.type === "create_lobby",
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
          connected: true,
          disconnectedAt: null,
      };
        playerRoom[playerId] = room.id;
          playerWs[playerId] = ws;
          const resumeToken = createResumeSession(playerId);

          sendJoined(ws, room, playerId, resumeToken);

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

      if (!playerId) return;

      if (data.type === "leave") {
        removePlayer(playerId);
        playerId = null;
        return;
      }

      const room = rooms[playerRoom[playerId]];
      if (!room) return;
      const p = room.players[playerId];

      if (data.type === "set_ready") {
        if (!room.players[playerId]) return;
        room.players[playerId].ready = !!data.ready;
        broadcastLobbyUpdate(room);
        return;
      }

      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", sentAt: data.sentAt }));
        return;
      }

      if (data.type === "start_game") {
        if (room.state !== "lobby") return;
        if (room.ownerId !== playerId) {
          ws.send(
            JSON.stringify({ type: "start_failed", reason: "not_owner" }),
          );
          return;
        }
        const players = Object.values(room.players).filter(
          (player) => player.connected !== false,
        );
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
      if (playerWs[playerId] !== ws) return;
      const roomId = playerRoom[playerId];
      const room = rooms[roomId];
      const player = room?.players[playerId];
      const tokenSession = [...resumeSessions.values()].find((session) => session.playerId === playerId);
      if (!room || !player || !tokenSession) return;

      delete playerWs[playerId];
      player.connected = false;
      player.disconnectedAt = Date.now();
      player.shooting = false;
      player.channeling = null;
      tokenSession.expiresAt = Date.now() + RECONNECT_GRACE_MS;
      tokenSession.timer = setTimeout(() => removePlayer(playerId), RECONNECT_GRACE_MS);
      broadcastLobbyUpdate(room);
      console.log(`Player ${playerId} disconnected; grace period started`);
    });
  });
}