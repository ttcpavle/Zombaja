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
import { setGun } from "../game/guns.js";

let playerIdCounter = 1;

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

        room.players[playerId] = {
          id: playerId,
          name: data.name || `Player${playerId}`,
          x: spawn.x,
          y: spawn.y,
          health: 100,
          alive: true,
          score: 0,
          ready: data.type === "create_lobby", // creator auto-ready
          shooting: false,
          shootDir: { dx: 1, dy: 0 },
          lastShotAt: 0,
        };
        playerRoom[playerId] = room.id;

        // Confirm join to this player
        ws.send(
          JSON.stringify({
            type: "joined",
            playerId,
            roomId: room.id,
            roomType: room.type,
            roomCode: room.code,
            ownerId: room.ownerId,
            walls,
            roomState: room.state,
            players: Object.values(room.players).map((p) => ({
              id: p.id,
              name: p.name,
              ready: !!p.ready,
            })),
          }),
        );

        // Notify everyone in lobby
        broadcastLobbyUpdate(room);
        // If public room reached max capacity, auto-start
        if (
          room.type === "public" &&
          Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM
        ) {
          room.state = "playing";
          startGameLoop(room);
          broadcastToRoom(room, { type: "game_started" });
          console.log(`Public room ${room.id} auto-started (max players)`);
        }
        console.log(`Player ${playerId} (${data.name}) joined room ${room.id}`);
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
        // only room owner can start
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
        // minimum 1 player enforced implicitly
        room.state = "playing";
        startGameLoop(room);
        broadcastToRoom(room, { type: "game_started" });
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
        }
        return;
      }

      if (data.type === "shoot_stop") {
        p.shooting = false;
        return;
      }

      if (data.type === "weapon_change") {
        setGun(data.weapon);
        return;
      }
    });

    ws.on("close", () => {
      if (!playerId) return;
      const roomId = playerRoom[playerId];
      const room = rooms[roomId];
      if (room) {
        delete room.players[playerId];
        console.log(`Player ${playerId} left room ${roomId}`);

        if (room.state === "lobby") {
          broadcastLobbyUpdate(room);
        }

        // Clean up empty rooms
        if (Object.keys(room.players).length === 0) {
          stopGameLoop(room);
          delete rooms[roomId];
          console.log(`Room ${roomId} removed (empty)`);
        }
      }
      delete playerRoom[playerId];
      delete playerWs[playerId];
    });
  });
}
