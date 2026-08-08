import { broadcastToRoom } from "./broadcast.js";
import { computeDamage, computeShootSpeed, WEAPON_CONFIG, getMajorAbilities } from "./weaponConfig.js";
import { trackShotBullet } from "./shotTracking.js";

let bulletIdCounter = 1;
let shotIdCounter = 1;

function fireShotgunVolley(room, player, x, y, dx, dy, damage, abilities, gunDef, shotId) {
  const rangeMult = abilities.rangeMultiplier || 1;
  const knockback = abilities.knockback || 0;
  const stunChance = abilities.stunChance || 0;
  const stunDuration = abilities.stunDuration || 0;

  for (let i = 0; i < gunDef.buckshotCount; i++) {
    const rotated = rotate2D(dx, dy, (Math.random() * 2 - 1) * gunDef.spreadAngle);
    trackShotBullet(room, shotId, player.id);
    room.bullets.push({
      id: bulletIdCounter++,
      x,
      y,
      dx: rotated.x,
      dy: rotated.y,
      speed: gunDef.speed + (Math.random() * 2 - 1),
      owner: player.id,
      damage,
      lifetime: (300 + (Math.random() * 2 - 1) * 100) * rangeMult,
      drag: 0.99,
      knockback,
      stunChance,
      stunDuration,
      shotId,
    });
  }
  broadcastToRoom(room, {
    type: "gunshot",
    ownerId: player.id,
    weapon: gunDef.name,
    x,
    y,
  });
}

export const guns = {
  pistol: {
    name: "pistol",
    damage: 2,
    shootSpeed: 0.5,
    speed: 12,
    fire(room, player, x, y, dx, dy) {
      const st = player.weapons[this.name];
      const damage = computeDamage(this.name, this.damage, st.level);
      if (!WEAPON_CONFIG[this.name].infiniteAmmo) st.ammo -= 1;

      const abilities = getMajorAbilities(this.name, st.level);
      const shotId = shotIdCounter++;
      trackShotBullet(room, shotId, player.id);
      room.bullets.push({
        id: bulletIdCounter++,
        x,
        y,
        dx,
        dy,
        speed: this.speed,
        owner: player.id,
        damage: damage,
        lifetime: 2000,
        drag: 0.99,
        pierceRemaining: abilities.pierceCount ?? 0,
        pierceRamp: abilities.pierceRamp ?? 0,
        shotId,
      });
      broadcastToRoom(room, {
        type: "gunshot",
        ownerId: player.id,
        weapon: this.name,
        x,
        y,
      });
    },
  },

  shotgun: {
    name: "shotgun",
    damage: 5,
    shootSpeed: 1.0,
    speed: 20,
    buckshotCount: 20,
    spreadAngle: 30,
    fire(room, player, x, y, dx, dy) {
      const st = player.weapons[this.name];
      const damage = computeDamage(this.name, this.damage, st.level);
      if (!WEAPON_CONFIG[this.name].infiniteAmmo) st.ammo -= 1;

      const abilities = getMajorAbilities(this.name, st.level);
      const shotId = shotIdCounter++;
      fireShotgunVolley(room, player, x, y, dx, dy, damage, abilities, this, shotId);

      if (abilities.doubleShotChance && Math.random() < abilities.doubleShotChance) {
        fireShotgunVolley(room, player, x, y, dx, dy, damage, abilities, this, shotId);
      }
    },
  },

  rifle: {
    name: "rifle",
    damage: 1,
    shootSpeed: 0.05,
    speed: 16,
    fire(room, player, x, y, dx, dy) {
      const st = player.weapons[this.name];
      const damage = computeDamage(this.name, this.damage, st.level);
      if (!WEAPON_CONFIG[this.name].infiniteAmmo) st.ammo -= 1;

      const abilities = getMajorAbilities(this.name, st.level);
      const shotId = shotIdCounter++;
      trackShotBullet(room, shotId, player.id);
      const rotated = rotate2D(dx, dy, (Math.random() * 2 - 1) * 5);
      room.bullets.push({
        id: bulletIdCounter++,
        x,
        y,
        dx: rotated.x,
        dy: rotated.y,
        speed: this.speed + (Math.random() * 2 - 1) * 1,
        owner: player.id,
        damage,
        lifetime: 1500 + (Math.random() * 2 - 1) * 300,
        drag: 0.99,
        bleedChance: abilities.bleedChance || 0,
        critChance: abilities.critChance || 0,
        critMultiplier: abilities.critMultiplier || 1,
        instakillChance: abilities.instakillChance || 0,
        shotId,
      });
      broadcastToRoom(room, {
        type: "gunshot",
        ownerId: player.id,
        weapon: this.name,
        x,
        y,
      });
    },
  },

  granata: {
    name: "granata",
    damage: 20,
    shootSpeed: 2,
    shrapnelCount: 52,
    speed: 20,
    fire(room, player, x, y, dx, dy) {
      const st = player.weapons[this.name];
      const damage = computeDamage(this.name, this.damage, st.level);
      if (!WEAPON_CONFIG[this.name].infiniteAmmo) st.ammo -= 1;

      const abilities = getMajorAbilities(this.name, st.level);
      const shotId = shotIdCounter++;
      trackShotBullet(room, shotId, player.id);

      room.bullets.push({
        id: bulletIdCounter++,
        x,
        y,
        dx,
        dy,
        speed: this.speed,
        owner: player.id,
        damage: damage,
        lifetime: 3000,
        type: "granata",
        shrapnelCount: this.shrapnelCount,
        drag: 0.95,
        shotId,
        explosionOptions: {
          fireZone: !!abilities.fireZone,
          fireRadius: abilities.fireRadius || 60,
          burnLingers: !!abilities.burnLingers,
          miniGranataCount: abilities.miniGranataCount || 0,
        },
      });
      broadcastToRoom(room, {
        type: "gunshot",
        ownerId: player.id,
        weapon: this.name,
        x,
        y,
      });
    },
  },
};

const gunsByIndex = [guns.pistol, guns.shotgun, guns.rifle, guns.granata];

export function getGunByIndex(index) {
  return gunsByIndex[index] || guns.pistol;
}

export function spawnExplosion(
  room,
  x,
  y,
  playerId,
  damage = 20,
  shrapnelCount = 52,
  options = {},
  shotId,
) {
  for (let i = 0; i < shrapnelCount; i++) {
    const rotated = rotate2D(1, 1, (Math.random() * 2 - 1) * 180);
    if (playerId !== null) trackShotBullet(room, shotId, playerId);
    room.bullets.push({
      id: bulletIdCounter++,
      x,
      y,
      dx: rotated.x,
      dy: rotated.y,
      speed: 12 + (Math.random() * 2 - 1),
      owner: playerId,
      damage: damage,
      lifetime: 200 + (Math.random() * 2 - 1) * 100,
      drag: 1.01,
      shotId,
      originX: x,
      originY: y,
    });
  }

  if (options.fireZone) {
    if (!room.fireZones) room.fireZones = [];
    room.fireZones.push({
      x,
      y,
      radius: options.fireRadius || 60,
      endsAt: Date.now() + 3000,
      dps: damage,
      lingers: !!options.burnLingers,
      lingerDps: damage / Math.max(1, shrapnelCount),
      ownerId: playerId,
    });
  }

  if (options.miniGranataCount) {
    for (let i = 0; i < options.miniGranataCount; i++) {
      const angle = (360 / options.miniGranataCount) * i + (Math.random() * 20 - 10);
      const dir = rotate2D(1, 0, angle);
      if (playerId !== null) trackShotBullet(room, shotId, playerId);
      room.bullets.push({
        id: bulletIdCounter++,
        x,
        y,
        dx: dir.x,
        dy: dir.y,
        speed: 10 + Math.random() * 2,
        owner: playerId,
        damage,
        lifetime: 500 + Math.random() * 200,
        drag: 1.0,
        type: "granata",
        shrapnelCount: Math.round(shrapnelCount / 2),
        shotId,
        explosionOptions: { ...options, miniGranataCount: 0 },
      });
    }
  }
}

export function canFire(player, gun) {
  const now = Date.now();
  const st = player.weapons[gun.name];
  const shootSpeed = computeShootSpeed(gun.name, gun.shootSpeed, st.level);
  return !player.lastShotAt || now - player.lastShotAt >= shootSpeed * 1000;
}

export function processShooting(room) {
  const now = Date.now();
  Object.values(room.players).forEach((player) => {
    if (!player.alive || !player.shooting || !player.shootDir) return;

    const gun = getGunByIndex(player.gunIndex ?? 0);
    const st = player.weapons[gun.name];
    if (!st || !st.owned) return;
    if (!WEAPON_CONFIG[gun.name].infiniteAmmo && st.ammo <= 0) return;

    if (!canFire(player, gun)) return;
    gun.fire(
      room,
      player,
      player.x + 10,
      player.y + 10,
      player.shootDir.dx,
      player.shootDir.dy,
    );
    player.lastShotAt = now;
  });
}

function rotate2D(x, y, degrees) {
  const radians = degrees * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}