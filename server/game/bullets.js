import { checkWallCollision } from "../utils.js";
import { GAME_WIDTH, GAME_HEIGHT } from "../config/constants.js";
import { spawnExplosion } from "./guns.js";
import { killZombie } from "./zombies.js";
import { killPlayer } from "./gameLoop.js";

export function updateBullets(room, dt) {
  room.bullets.forEach((b) => {
    b.speed *= b.drag;
    b.x += b.dx * b.speed;
    b.y += b.dy * b.speed;
    b.lifetime -= dt /* delta time */;
    if (b.lifetime <= 0) b.dead = true;
    if (checkWallCollision(b.x, b.y, 5)) b.dead = true;

    if (b.type === "granata" && b.dead == true) {
      spawnExplosion(room, b.x, b.y, b.owner, b.damage, b.shrapnelCount);
    }
  });
  room.bullets = room.bullets.filter(
    (b) =>
      !b.dead && b.x > 0 && b.x < GAME_WIDTH && b.y > 0 && b.y < GAME_HEIGHT,
  );
}

export function checkCollisions(room) {
  room.bullets.forEach((b) => {
    if (b.owner === null) {
      Object.values(room.players).forEach((p) => {
        const dist = Math.hypot(b.x - (p.x + 10), b.y - (p.y + 10));
        if (dist < 20) {
          p.health -= b.damage;
          b.dead = true;
          if (p.health <= 0 && p.alive) {
            killPlayer(room, p);
          }
        }
      });
    }

    room.zombies.forEach((z, zi) => {
      const dist = Math.hypot(
        b.x - (z.x + z.size / 2),
        b.y - (z.y + z.size / 2),
      );
      if (dist < z.size) {
        z.health -= b.damage;

        b.dead = true;

        if (z.health <= 0) {
          killZombie(room, zi);
          if (b.owner != null && room.players[b.owner])
            room.players[b.owner].score++;
        }
      }
    });
  });
}
