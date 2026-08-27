import { MAX_PLAYERS_PER_ROOM } from "../config/constants.js";

// ============================
// ROOM MANAGEMENT
// ============================
export let rooms = {}; // roomId -> room object
export let playerRoom = {}; // playerId -> roomId
export let playerWs = {}; // playerId -> ws

let roomIdCounter = 1;

export function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code;
  do {
    code = Array.from(
      { length: 5 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  } while (Object.values(rooms).some((r) => r.code === code));
  return code;
}

export function createRoom(privateR = false, ownerId = null) {
  const roomId = roomIdCounter++;
  const room = {
    id: roomId,
    state: "lobby",
    type: privateR ? "private" : "public",
    code: privateR ? generateRoomCode() : null,
    ownerId: ownerId,
    players: {},
    zombies: [],
    bullets: [],
    fireZones: [],
    zombieSpawnInterval: null,
    gameLoopInterval: null,
    spawnCount: 0,
    spawnDelay: 3000,
    wave: 1,
    waveActive: false,
    waveSpawningComplete: false,
    waveSpawned: 0,
    waveTotal: 0,
    waveSpawnQueue: [],
    waveSpawnTimer: null,
    waveTransitionTimer: null,
    waveCompletionTimer: null,
    waveSpawningEndedAt: null,
  };
  rooms[roomId] = room;
  console.log(
    `Room ${roomId} created (${room.type}${room.code ? ` code=${room.code}` : ""})`,
  );
  return room;
}

export function findAvailableRoom() {
  for (const room of Object.values(rooms)) {
    if (
      room.state === "lobby" &&
      room.type === "public" &&
      Object.keys(room.players).length < MAX_PLAYERS_PER_ROOM
    ) {
      return room;
    }
  }
  return createRoom(false);
}

export function findRoom(code) {
  for (const room of Object.values(rooms)) {
    if (
      room.state === "lobby" &&
      room.code === code &&
      getRoomPlayerCount(room, false) < MAX_PLAYERS_PER_ROOM
    ) {
      return room;
    }
  }
  return null;
}

export function getRoomPlayerCount(room, includeDisconnected = true) {
  if (includeDisconnected) return Object.keys(room.players).length;
  return Object.values(room.players).filter((player) => player.connected !== false).length;
}
