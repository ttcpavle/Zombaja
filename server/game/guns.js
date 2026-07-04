import { broadcastToRoom } from "./broadcast.js";

let bulletIdCounter = 1;

export const guns = {
  pistol: {
    name: "pistol",
    damage: 2,
    shootSpeed: 0.5,
    speed: 12,
    fire(room, playerId, x, y, dx, dy) {
      room.bullets.push({
        id: bulletIdCounter++,
        x,
        y,
        dx,
        dy,
        speed: this.speed,
        owner: playerId,
        damage: this.damage,
        lifetime: 2000,
        drag: 0.99,
      });
      broadcastToRoom(room, {
        type: "gunshot",
        ownerId: playerId,
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
    spreadAngle: 30, // degrees
    fire(room, playerId, x, y, dx, dy) {
      for (let i = 0; i < this.buckshotCount; i++) {
        const rotated = rotate2D(
          dx,
          dy,
          (Math.random() * 2 - 1) * this.spreadAngle,
        );
        room.bullets.push({
          id: bulletIdCounter++,
          x,
          y,
          dx: rotated.x,
          dy: rotated.y,
          speed: this.speed + (Math.random() * 2 - 1),
          owner: playerId,
          damage: this.damage,
          lifetime: 300 + (Math.random() * 2 - 1) * 100,
          drag: 0.99,
        });
      }
      broadcastToRoom(room, {
        type: "gunshot",
        ownerId: playerId,
        weapon: this.name,
        x,
        y,
      });
    },
  },

  rifle: {
    name: "rifle",
    damage: 1,
    shootSpeed: 0.05,
    speed: 16,
    fire(room, playerId, x, y, dx, dy) {
      const rotated = rotate2D(dx, dy, (Math.random() * 2 - 1) * 5);
      room.bullets.push({
        id: bulletIdCounter++,
        x,
        y,
        dx: rotated.x,
        dy: rotated.y,
        speed: this.speed + (Math.random() * 2 - 1) * 1,
        owner: playerId,
        damage: this.damage,
        lifetime: 1500 + (Math.random() * 2 - 1) * 300,
        drag: 0.99,
      });
      broadcastToRoom(room, {
        type: "gunshot",
        ownerId: playerId,
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
    fire(room, playerId, x, y, dx, dy) {
      room.bullets.push({
        id: bulletIdCounter++,
        x,
        y,
        dx,
        dy,
        speed: this.speed,
        owner: playerId,
        damage: this.damage,
        lifetime: 3000,
        type: "granata",
        shrapnelCount: this.shrapnelCount,
        drag: 0.95,
      });
      broadcastToRoom(room, {
        type: "gunshot",
        ownerId: playerId,
        weapon: this.name,
        x,
        y,
      });
    },
  },
};

export let currentGun = guns.pistol; // default
export function setGun(gunIndex) {
  switch (gunIndex) {
    case 0:
      currentGun = guns.pistol;
      break;
    case 1:
      currentGun = guns.shotgun;
      break;
    case 2:
      currentGun = guns.rifle;
      break;
    case 3:
      currentGun = guns.granata;
      break;
  }
}

export function spawnExplosion(
  room,
  x,
  y,
  playerId,
  damage = 20,
  shrapnelCount = 52,
) {
  for (let i = 0; i < shrapnelCount; i++) {
    const rotated = rotate2D(1, 1, (Math.random() * 2 - 1) * 180);
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
    });
  }
}

export function canFire(player, gun) {
  const now = Date.now();
  return !player.lastShotAt || now - player.lastShotAt >= gun.shootSpeed * 1000;
}

export function processShooting(room) {
  const now = Date.now();
  const gun = currentGun;
  Object.values(room.players).forEach((player) => {
    if (!player.alive || !player.shooting || !player.shootDir) return;
    if (!canFire(player, gun)) return;
    gun.fire(
      room,
      player.id,
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
