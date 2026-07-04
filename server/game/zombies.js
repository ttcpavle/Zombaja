import { GAME_WIDTH, GAME_HEIGHT } from "../config/constants.js";
import { checkWallCollision } from "../utils.js";
import { spawnExplosion } from "./guns.js";
import { killPlayer } from "./gameLoop.js";
import { broadcastToRoom, sendToPlayer } from "./broadcast.js";

export let zombieTypes = [
  {
    name: "default",
    health: 4,
    speed: 4,
    size: 20,
    color: "#3ccf37",
    secondaryColor: "#3f3300",
  },
  {
    name: "runner",
    health: 1,
    speed: 8,
    size: 16,
    color: "#ffd900",
    secondaryColor: "#73007e",
  },
  {
    name: "tank",
    health: 20,
    speed: 1.5,
    size: 40,
    color: "#6d341a",
    secondaryColor: "#f4ff56",
  },
  {
    name: "explode",
    health: 20,
    speed: 5,
    size: 22.4,
    color: "#e93351",
    secondaryColor: "#56f9ff",
  },
];

export function spawnZombie(room, zombieType) {
  const edges = [
    { x: Math.random() * GAME_WIDTH, y: 0 },
    { x: Math.random() * GAME_WIDTH, y: GAME_HEIGHT - 20 },
    { x: 0, y: Math.random() * GAME_HEIGHT },
    { x: GAME_WIDTH - 20, y: Math.random() * GAME_HEIGHT },
  ];

  for (let attempt = 0; attempt < 20; attempt++) {
    const pos = edges[Math.floor(Math.random() * edges.length)];
    const tooClose = room.zombies.some(
      (z) => Math.hypot(pos.x - z.x, pos.y - z.y) < 32,
    );
    const blocked = checkWallCollision(pos.x, pos.y, 20);

    if (!tooClose && !blocked) {
      room.zombies.push({
        x: pos.x,
        y: pos.y,
        xVel: 0,
        yVel: 0,
        ...zombieType,
      });
      return;
    }
  }
  const fallback = edges[Math.floor(Math.random() * edges.length)];
  room.zombies.push({
    x: fallback.x,
    y: fallback.y,
    xVel: 0,
    yVel: 0,
    ...zombieType,
  });
}

function getZombieSeparation(z, room) {
  let pushX = 0;
  let pushY = 0;
  let count = 0;

  room.zombies.forEach((other) => {
    if (other === z) return;
    const dx = z.x + z.size / 2 - (other.x + other.size / 2);
    const dy = z.y + z.size / 2 - (other.y + other.size / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < 30) {
      const strength = (30 - dist) / 30;
      pushX += (dx / dist) * strength;
      pushY += (dy / dist) * strength;
      count += 1;
    }
  });

  if (count === 0) return { x: 0, y: 0 };

  const magnitude = Math.hypot(pushX, pushY) || 1;
  return { x: (pushX / magnitude) * 10.4, y: (pushY / magnitude) * 10.4 };
}
//
//{ name: "explode", health: 20, speed: 5, size: 22.4, color: '#e93351',secondaryColor: '#56f9ff' },
export function updateZombies(room) {
  const alivePlayers = Object.values(room.players).filter((p) => p.alive);
  if (alivePlayers.length === 0) return;

  room.zombies.forEach((z) => {
    // Find nearest alive player
    let nearest = null;
    let nearestDist = Infinity;
    alivePlayers.forEach((p) => {
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    });
    if (!nearest) return;

    // Move toward player while keeping a little space from nearby zombies
    const dx = nearest.x - z.x;
    const dy = nearest.y - z.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;

      //acceleration effect
      z.xVel += nx * 0.5;
      z.yVel += ny * 0.5;
      const separate = getZombieSeparation(z, room);

      z.xVel += separate.x;
      z.yVel += separate.y;
      if (Math.hypot(z.xVel, z.yVel) > z.speed) {
        const mag = Math.hypot(z.xVel, z.yVel);
        z.xVel = (z.xVel / mag) * z.speed;
        z.yVel = (z.yVel / mag) * z.speed;
      }

      // Check both axes against original position, then apply independently
      const nextX = z.x + z.xVel;
      const nextY = z.y + z.yVel;
      const canMoveX = !checkWallCollision(nextX, z.y, z.size);
      const canMoveY = !checkWallCollision(z.x, nextY, z.size);
      if (canMoveX) z.x = nextX;
      else {
        z.x += Math.sign(z.xVel) * -0.1;
        z.xVel = 0;
      } // bounce back a bit
      if (canMoveY) z.y = nextY;
      else {
        z.y += Math.sign(z.yVel) * -0.1;
        z.yVel = 0;
      }
    }

    // Clamp to boundaries
    z.x = Math.max(0, Math.min(GAME_WIDTH - z.size, z.x));
    z.y = Math.max(0, Math.min(GAME_HEIGHT - z.size, z.y));

    // Damage player on contact
    if (nearestDist < z.size) {
      if (z.name === "explode") {
        killZombie(room, z);
      } else {
        nearest.health -= 5;
        sendToPlayer(nearest.id, {
          type: "player_damage",
          playerId: nearest.id,
        });
      }

      z.xVel -= nearest.x - z.x;
      z.yVel -= nearest.y - z.y;
      const mag = Math.hypot(z.xVel, z.yVel);
      z.xVel = (z.xVel / mag) * z.speed;
      z.yVel = (z.yVel / mag) * z.speed;

      z.x += z.xVel * 2;
      z.y += z.yVel * 2;

      if (nearest.health <= 0 && nearest.alive) {
        killPlayer(room, nearest);
      }
    }
  });
}

export function killZombie(room, zombieOrIndex) {
  let index;

  if (typeof zombieOrIndex === "number") {
    index = zombieOrIndex;
  } else {
    index = room.zombies.indexOf(zombieOrIndex);
  }

  if (room.zombies[index].name === "explode") {
    spawnExplosion(
      room,
      room.zombies[index].x,
      room.zombies[index].y,
      null,
      10,
      52,
    );
  }
  if (index !== -1) {
    broadcastToRoom(room, {
      type: "zombie_death",
      x: room.zombies[index].x,
      y: room.zombies[index].y,
    });
    room.zombies.splice(index, 1);
  }
}
