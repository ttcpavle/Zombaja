import { updateZombies, spawnZombie, zombieTypes } from "./zombies.js";
import { updateBullets, checkCollisions } from "./bullets.js";
import { broadcastRoomState } from "./broadcast.js";
import { processShooting } from "./guns.js";
import { SPAWN_POINTS } from "../world/map.js";

export function startGameLoop(room) {
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
  if (room.zombieSpawnInterval) clearInterval(room.zombieSpawnInterval);

  let lastTime = Date.now();

  room.gameLoopInterval = setInterval(() => {
    const now = Date.now();
    const dt = now - lastTime; // seconds
    lastTime = now;

    if (Object.keys(room.players).length === 0) return;
    processShooting(room);
    updateZombies(room);
    updateBullets(room, dt);
    checkCollisions(room);
    broadcastRoomState(room);
  }, 30);

  room.spawnCount = 0.5;
  room.spawnDelay = 3000;
  room.wave = 1;

  const scheduleSpawn = () => {
    if (!room || Object.keys(room.players).length === 0) {
      room.zombies = [];
      room.zombieSpawnInterval = null;
      return;
    }

    for (let i = 0; i < room.spawnCount; i++) {
      const zombieType =
        zombieTypes[Math.floor(Math.random() * zombieTypes.length)];
      spawnZombie(room, zombieType);
    }

    room.spawnCount = Math.min(room.spawnCount + 0.06, 12.52);
    room.spawnDelay = Math.max(300, 3000 - room.spawnCount * 120);
    room.zombieSpawnInterval = setTimeout(scheduleSpawn, room.spawnDelay);
  };

  room.zombieSpawnInterval = setTimeout(scheduleSpawn, room.spawnDelay);
}

export function stopGameLoop(room) {
  if (room.gameLoopInterval) {
    clearInterval(room.gameLoopInterval);
    room.gameLoopInterval = null;
  }
  if (room.zombieSpawnInterval) {
    clearTimeout(room.zombieSpawnInterval);
    room.zombieSpawnInterval = null;
  }
}

export function killPlayer(room, player) {
  player.alive = false;
  setTimeout(() => {
    player.x = SPAWN_POINTS[0].x;
    player.y = SPAWN_POINTS[0].y;
    player.health = 100;
    player.alive = true;
  }, 3000);
}
