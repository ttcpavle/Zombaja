import { GAME_WIDTH, GAME_HEIGHT } from "../config/constants.js";
import { checkWallCollision } from "../utils.js";
import { spawnExplosion } from "./guns.js";
import { killPlayer } from "./playerLifecycle.js";
import { broadcastToRoom, sendToPlayer } from "./broadcast.js";
import { awardHitScore } from "./scoring.js";

export let zombieTypes = [
  {
    name: "default",
    health: 4*4,
    speed: 4,
    size: 20,
    color: "#3ccf37",
    secondaryColor: "#3f3300",
  },
  {
    name: "runner",
    health: 1*4,
    speed: 8,
    size: 16,
    color: "#ffd900",
    secondaryColor: "#73007e",
  },
  {
    name: "tank",
    health: 20*4,
    speed: 1.5,
    size: 40,
    color: "#6d341a",
    secondaryColor: "#f4ff56",
  },
  {
    name: "explode",
    health: 20*4,
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
        effects: [],
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
    effects: [],
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

export function addStatusEffect(z, effect) {
  if (!z.effects) z.effects = [];
  const existing = z.effects.find((e) => e.type === effect.type);
  if (existing) Object.assign(existing, effect);
  else z.effects.push(effect);
}

export function updateFireZones(room) {
  if (!room.fireZones) room.fireZones = [];
  const now = Date.now();
  room.fireZones = room.fireZones.filter((zone) => zone.endsAt > now);
  if (room.fireZones.length === 0) return;

  room.zombies.forEach((z) => {
    const centerX = z.x + z.size / 2;
    const centerY = z.y + z.size / 2;
    const zone = room.fireZones.find(
      (zn) => Math.hypot(centerX - zn.x, centerY - zn.y) < zn.radius,
    );

    if (zone) {
      addStatusEffect(z, { type: "burn", endsAt: now + 300, dps: zone.dps, ownerId: zone.ownerId });
      z._inFireZone = true;
      z._lingerDps = zone.lingerDps;
      z._lingers = zone.lingers;
      z._lingerOwnerId = zone.ownerId;
    } else if (z._inFireZone) {
      z._inFireZone = false;
      if (z._lingers) {
        addStatusEffect(z, { type: "burn", endsAt: now + 2000, dps: z._lingerDps, ownerId: z._lingerOwnerId });
      }
    }
  });
}

export function hasEffect(z, type) {
  return !!(z.effects && z.effects.some((e) => e.type === type && e.endsAt > Date.now()));
}

const DOT_CREDIT_INTERVAL_MS = 400;

function applyStatusEffects(room, z, dt) {
  if (!z.effects || z.effects.length === 0) return null;
  const now = Date.now();
  let killerOwnerId = null;

  z.effects.forEach((e) => {
    if (e.endsAt <= now || (e.type !== "bleed" && e.type !== "burn")) return;

    z.health -= e.dps * (dt / 1000);

    if (z.health <= 0) {
      if (killerOwnerId === null) killerOwnerId = e.ownerId ?? null;
      return;
    }

    if (e.ownerId !== undefined && e.ownerId !== null) {
      if (!e.lastCreditAt || now - e.lastCreditAt >= DOT_CREDIT_INTERVAL_MS) {
        e.lastCreditAt = now;
        awardHitScore(room, e.ownerId, z, false);
      }
    }
  });

  z.effects = z.effects.filter((e) => e.endsAt > now);
  z.stunned = hasEffect(z, "stun");
  return killerOwnerId;
}

export function updateZombies(room, dt) {
  const alivePlayers = Object.values(room.players).filter(
    (p) => p.alive && p.connected !== false,
  );
  if (alivePlayers.length === 0) return;

  room.zombies.forEach((z) => {
    if (z.dead) return; // vec markiran (npr od SPAS pilule) - ne obradjuj dalje u ovom tick-u

    const killerOwnerId = applyStatusEffects(room, z, dt);
    if (z.health <= 0) {
      if (killerOwnerId !== null) {
        awardHitScore(room, killerOwnerId, z, true);
      }
      killZombie(room, z);
      return;
    }

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

    const dx = nearest.x - z.x;
    const dy = nearest.y - z.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && !z.stunned) {
      const nx = dx / dist;
      const ny = dy / dist;

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

      const nextX = z.x + z.xVel;
      const nextY = z.y + z.yVel;
      const canMoveX = !checkWallCollision(nextX, z.y, z.size);
      const canMoveY = !checkWallCollision(z.x, nextY, z.size);
      if (canMoveX) z.x = nextX;
      else {
        z.x += Math.sign(z.xVel) * -0.1;
        z.xVel = 0;
      }
      if (canMoveY) z.y = nextY;
      else {
        z.y += Math.sign(z.yVel) * -0.1;
        z.yVel = 0;
      }
    }

    z.x = Math.max(0, Math.min(GAME_WIDTH - z.size, z.x));
    z.y = Math.max(0, Math.min(GAME_HEIGHT - z.size, z.y));

    if (nearestDist < z.size) {
      if (z.name === "explode") {
        killZombie(room, z);
      } else {
        const burning = hasEffect(z, "burn");
        const contactDamage = burning ? 2.5 : 5;
        nearest.health -= contactDamage;
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

  room.zombies = room.zombies.filter((z) => !z.dead);
}

export function killZombie(room, zombieOrIndex) {
  let zombie;
  if (typeof zombieOrIndex === "number") {
    zombie = room.zombies[zombieOrIndex];
  } else {
    zombie = zombieOrIndex;
  }
  if (!zombie || zombie.dead) return;

  zombie.dead = true;

  if (zombie.name === "explode") {
    spawnExplosion(room, zombie.x, zombie.y, null, 10, 52);
  }

  broadcastToRoom(room, {
    type: "zombie_death",
    x: zombie.x,
    y: zombie.y,
  });
}