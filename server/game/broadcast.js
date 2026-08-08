import { playerWs } from "../rooms/roomManager.js";

export function broadcastToRoom(room, message) {
  const str = JSON.stringify(message);
  Object.keys(room.players).forEach((pid) => {
    const ws = playerWs[pid];
    if (ws && ws.readyState === 1) ws.send(str);
  });
}

export function sendToPlayer(playerId, message) {
  const ws = playerWs[playerId];
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

export function broadcastRoomState(room) {
  broadcastToRoom(room, {
    type: "state",
    players: room.players,
    zombies: room.zombies,
    bullets: room.bullets,
    wave: room.wave,
    waveActive: !!room.waveActive,
    waveSpawned: room.waveSpawned,
    waveTotal: room.waveTotal,
    waveSpawningComplete: !!room.waveSpawningComplete,
    waveSpawningEndedAt: room.waveSpawningEndedAt,
    startedAt: room.startedAt,
  });
}

export function broadcastLobbyUpdate(room) {
  broadcastToRoom(room, {
    type: "lobby_update",
    roomId: room.id,
    ownerId: room.ownerId,
    roomType: room.type,
    players: Object.values(room.players).map((p) => ({
      id: p.id,
      name: p.name,
      ready: !!p.ready,
    })),
  });
}