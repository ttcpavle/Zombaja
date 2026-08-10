import { checkWallCollision } from "../utils.js";
import { GAME_WIDTH, GAME_HEIGHT } from "../config/constants.js";
import { spawnExplosion } from "./guns.js";
import { killZombie, addStatusEffect } from "./zombies.js";
import { killPlayer } from "./playerLifecycle.js";
import { sendToPlayer, broadcastToRoom } from "./broadcast.js";
import { awardHitScore } from "./scoring.js";
import { markShotHit, resolveShotBullet } from "./shotTracking.js";

const BLEED_HEALTH_PERCENT = 0.02;

// Domet na kome eksplozija prelazi sa "blizu" na "daleko" krivu za damage varijansu.
// Tunable - povecaj ako hoces da "blizu = skoro uvek veliki hit" vazi na vecoj povrsini.
const BLAST_FALLOFF_RANGE = 220;

function computeBlastDamageMultiplier(distance, maxRange) {
  const t = Math.min(1, distance / maxRange); // 0 = u centru eksplozije, 1 = na ivici dometa
  const pHigh = 0.85 - 0.7 * t; // blizu: 85% sanse za veliki roll, daleko: 15%

  if (Math.random() < pHigh) {
    return 1.4 + Math.random() * 0.8; // veliki roll: 1.4x - 2.2x
  }
  return 0.4 + Math.random() * 0.5; // mali roll: 0.4x - 0.9x
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
      spawnExplosion(room, b.x, b.y, b.owner, b.damage, b.shrapnelCount, b.explosionOptions || {}, b.shotId);
    }
  });

  room.bullets = room.bullets.filter((b) => {
    const alive = !b.dead && b.x > 0 && b.x < GAME_WIDTH && b.y > 0 && b.y < GAME_HEIGHT;
    if (!alive) resolveShotBullet(room, b.shotId);
    return alive;
  });
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

    room.zombies.forEach((z) => {
      if (z.dead) return; // vec oboren u ovom prolazu - fix za bag koji je preskakao susedne zombije nakon splice-a

      const dist = Math.hypot(
        b.x - (z.x + z.size / 2),
        b.y - (z.y + z.size / 2),
      );
      if (dist < z.size) {
        const hitOwnerId = b.owner;

        let damage = b.damage;

        // Blast falloff varijansa - samo za sacmu/sarpnel iz eksplozija (originX/Y se postavlja u guns.js)
        if (b.originX !== undefined && b.originY !== undefined) {
          const blastDist = Math.hypot(
            z.x + z.size / 2 - b.originX,
            z.y + z.size / 2 - b.originY,
          );
          damage *= computeBlastDamageMultiplier(blastDist, BLAST_FALLOFF_RANGE);
        }

        // Crit / instakill (rifle)
        if (b.critChance && Math.random() < b.critChance) {
          damage *= b.critMultiplier;
          if (b.instakillChance && Math.random() < b.instakillChance) {
            damage = z.health + 99999;
          }
        }

        const killed = z.health - damage <= 0;
        z.health -= damage;

        // Bleed (rifle)
        if (!killed && b.bleedChance && Math.random() < b.bleedChance) {
          addStatusEffect(z, {
            type: "bleed",
            endsAt: Date.now() + 3000,
            dps: z.health * BLEED_HEALTH_PERCENT * z.speed,
            ownerId: hitOwnerId,
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

        // Pierce (pistol) - namerno ostavljeno da bez pierce-a bullet moze
        // da pogodi vise razlicitih zombija u istom prolazu (pistol je slab, ovo ga kompenzuje)
        if (b.pierceRemaining && b.pierceRemaining > 0) {
          b.pierceRemaining -= 1;
          if (b.pierceRamp) b.damage *= 1 + b.pierceRamp;
        } else {
          b.dead = true;
        }

        if (hitOwnerId !== null) {
          markShotHit(room, b.shotId);
          awardHitScore(room, hitOwnerId, z, killed);
          broadcastToRoom(room, {
            type: "zombie_hit",
            ownerId: hitOwnerId,
            x: z.x + z.size / 2,
            y: z.y + z.size / 2,
          });
        }
        if (killed) {
          killZombie(room, z);
        }
      }
    });
  });

  room.zombies = room.zombies.filter((z) => !z.dead);
}