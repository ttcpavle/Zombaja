import { checkWallCollision } from "../utils.js";
import { GAME_WIDTH, GAME_HEIGHT } from "../config/constants.js";
import { spawnExplosion } from "./guns.js";
import { killZombie, addStatusEffect } from "./zombies.js";
import { killPlayer } from "./gameLoop.js";
import { sendToPlayer, broadcastToRoom } from "./broadcast.js";

const BLEED_HEALTH_PERCENT = 0.02;

function awardHitScore(room, playerId, z, killed) {
  const CURRENCY_PER_KILL = 100;
  if (!room.hitCombos) room.hitCombos = {};
  const combo = room.hitCombos[playerId] || { count: 0, lastTime: 0 };
  const now = Date.now();
  const comboWindow = 1500;
  const keepCombo = now - combo.lastTime <= comboWindow;

  let points = 0;
  if (killed) {
    combo.count = keepCombo ? combo.count + 1 : 1;
    combo.lastTime = now;
    const multiplier = combo.count > 1 ? Math.pow(1.05, combo.count - 1) : 1;
    points = Math.round(100 * multiplier);
  } else {
    combo.count = 0;
    combo.lastTime = 0;
    points = 1;
  }

  room.hitCombos[playerId] = combo;

  const player = room.players[playerId];
  if (player) {
    player.score += points;
    if (killed) player.currency += CURRENCY_PER_KILL;
  }

  sendToPlayer(playerId, {
    type: "hit_feedback",
    text: killed ? `+${points}` : "+1",
    x: z.x + z.size / 2,
    y: z.y + z.size / 2,
    killed,
    combo: killed ? combo.count : undefined,
  });
}

export function updateBullets(room, dt) {
  room.bullets.forEach((b) => {
    b.speed *= b.drag;
    b.x += b.dx * b.speed;
    b.y += b.dy * b.speed;
    b.lifetime -= dt;
    if (b.lifetime <= 0) b.dead = true;
    if (checkWallCollision(b.x, b.y, 5)) b.dead = true;

    if (b.type === "granata" && b.dead === true) {
      broadcastToRoom(room, {
        type: "explosion",
        ownerId: b.owner,
        x: b.x,
        y: b.y,
      });
      spawnExplosion(room, b.x, b.y, b.owner, b.damage, b.shrapnelCount, b.explosionOptions || {});
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
          sendToPlayer(p.id, { type: "player_damage", playerId: p.id });
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
      const hitOwnerId = b.owner;

      // Crit / instakill (rifle) - racuna se PRE nego sto znamo da li je killed
      let damage = b.damage;
      if (b.critChance && Math.random() < b.critChance) {
        damage *= b.critMultiplier;
        if (b.instakillChance && Math.random() < b.instakillChance) {
          // + z.isBoss provera ide ovde kad dodamo boss zombije
          damage = z.health + 99999;
        }
      }

      const killed = z.health - damage <= 0;
      z.health -= damage;

      // Bleed (rifle) - samo ako zombi prezivi ovaj hit, nema smisla bleedovati les
      if (!killed && b.bleedChance && Math.random() < b.bleedChance) {
        addStatusEffect(z, {
          type: "bleed",
          endsAt: Date.now() + 3000,
          dps: z.health * BLEED_HEALTH_PERCENT * z.speed,
        });
      }

      // Knockback (shotgun)
      if (b.knockback) {
        const nextX = z.x + b.dx * b.knockback;
        const nextY = z.y + b.dy * b.knockback;
        if (!checkWallCollision(nextX, z.y, z.size)) z.x = nextX;
        if (!checkWallCollision(z.x, nextY, z.size)) z.y = nextY;
      }

      // Stun (shotgun)
      if (b.stunChance && Math.random() < b.stunChance) {
        addStatusEffect(z, { type: "stun", endsAt: Date.now() + b.stunDuration });
      }

      // Pierce (pistol)
      if (b.pierceRemaining && b.pierceRemaining > 0) {
        b.pierceRemaining -= 1;
        if (b.pierceRamp) b.damage *= 1 + b.pierceRamp;
      } else {
        b.dead = true;
      }

      if (hitOwnerId !== null) {
        awardHitScore(room, hitOwnerId, z, killed);
        broadcastToRoom(room, {
          type: "zombie_hit",
          ownerId: hitOwnerId,
          x: z.x + z.size / 2,
          y: z.y + z.size / 2,
        });
      }
      if (killed) {
        killZombie(room, zi);
      }
    }
  });
  });
}
