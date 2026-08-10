import { killPlayer } from "./playerLifecycle.js";
import { awardHitScore } from "./scoring.js";
import { killZombie } from "./zombies.js";
import { broadcastToRoom } from "./broadcast.js";

// ===== Balans konstante - sve tunable =====
export const CONSUMABLE_CONFIG = {
  medkit:    { cost: 5000,  maxCount: 2, useDuration: 3000 },
  adrenalin: { cost: 10000, maxCount: 4, useDuration: 2000 },
  spas:      { cost: 100,   maxCount: 1, useDuration: 1000 },
};

const ADRENALIN_BAR_PER_PILL = 0.5;          // koliko puni bar jedna pilula (skala 0-1)
const ADRENALIN_DECAY_PER_MS = 0.5 / 60000;  // opada pola bara u 1 minut
export const ADRENALIN_MAX_SPEED_BONUS = 0.30; // +30% brzine na punom baru - MORA se poklapati sa vrednoscu u client/logic/input.js
const ADRENALIN_MAX_HEAL_PER_SEC = 0.5;      // hp/s na punom baru

const SPAS_KILL_RADIUS = 500;           // TUNABLE - cilj ~2x domet unapredjenog shotguna, testiraj i podesi
const SPAS_SELF_DEATH_CHANCE = 0.30;
const SPAS_RANDOM_OTHER_CHANCE = 0.10;  // od onih 30% - umesto korisnika, nasumican drugi zivi igrac

export function createConsumableState() {
  return {
    medkit: { count: 0 },
    adrenalin: { count: 0 },
    spas: { count: 0 },
  };
}

export function startConsumableUse(room, player, type) {
  const cfg = CONSUMABLE_CONFIG[type];
  if (!cfg || !player.alive) return;
  if (player.channeling) return;      // vec nesto koristi
  if (player.shooting) return;        // ne moze da zapocne koriscenje dok aktivno puca
  const inv = player.consumables[type];
  if (!inv || inv.count <= 0) return;

  player.channeling = {
    type,
    startedAt: Date.now(),
    duration: cfg.useDuration,
  };
}

// Poziva se kad igrac pocne da puca (shoot_start) - prekida trenutno koriscenje
export function cancelChannelIfShooting(player) {
  if (player.channeling) player.channeling = null;
}

// Poziva se PRE azuriranja p.gunIndex novom vrednoscu, da bi se uporedilo staro/novo
export function cancelChannelOnWeaponSwitch(player, newGunIndex) {
  if (player.channeling && newGunIndex !== player.gunIndex) {
    player.channeling = null;
  }
}

function finishMedkit(player) {
  player.health = 100;
}

function finishAdrenalin(player) {
  player.adrenalineBar = Math.min(1, (player.adrenalineBar || 0) + ADRENALIN_BAR_PER_PILL);
}

function finishSpas(room, player) {
  // Pobij sve zombije u radijusu oko igraca
  room.zombies.forEach((z) => {
    if (z.dead) return;
    const dist = Math.hypot(
      z.x + z.size / 2 - (player.x + 10),
      z.y + z.size / 2 - (player.y + 10),
    );
    if (dist <= SPAS_KILL_RADIUS) {
      awardHitScore(room, player.id, z, true);
      killZombie(room, z);
    }
  });

  // NAPOMENA ZA BALANS: ovo ide kroz isti combo sistem kao obicni kill-ovi,
  // sto znaci da masovni SPAS kill moze da nabuja combo multiplier jako visoko
  // i isplati mnogo vise nego sto je 100 pare kostalo. Namerno ostavljeno ovako
  // za sada; testiraj i po potrebi daj SPAS-u fiksnu/nizu nagradu po zombiju
  // umesto da ide kroz awardHitScore.

  let victim = null;
  if (Math.random() < SPAS_SELF_DEATH_CHANCE) {
    victim = player;
    if (Math.random() < SPAS_RANDOM_OTHER_CHANCE) {
      const others = Object.values(room.players).filter(
        (p) => p.id !== player.id && p.alive,
      );
      if (others.length > 0) {
        victim = others[Math.floor(Math.random() * others.length)];
      }
      // ako nema drugih zivih igraca, ostaje da strada sam korisnik
    }
  }

  broadcastToRoom(room, {
    type: "spas_used",
    userId: player.id,
    userName: player.name,
    victimId: victim ? victim.id : null,
    victimName: victim ? victim.name : null,
  });

  if (victim && victim.alive) {
    killPlayer(room, victim);
  }
}

export function updateConsumables(room, dt) {
  Object.values(room.players).forEach((player) => {
    if (player.adrenalineBar === undefined) player.adrenalineBar = 0;

    // Pasivni efekat adrenalina - nezavisan od aktivnog channeling-a, radi dok god bar > 0
    if (player.adrenalineBar > 0) {
      if (player.alive) {
        const healPerSec = ADRENALIN_MAX_HEAL_PER_SEC * player.adrenalineBar;
        player.health = Math.min(100, player.health + healPerSec * (dt / 1000));
      }
      player.adrenalineBar = Math.max(0, player.adrenalineBar - ADRENALIN_DECAY_PER_MS * dt);
    }

    if (!player.channeling) return;
    const elapsed = Date.now() - player.channeling.startedAt;
    if (elapsed < player.channeling.duration) return;

    const type = player.channeling.type;
    const inv = player.consumables[type];
    player.channeling = null;
    if (!inv || inv.count <= 0) return; // sigurnosna provera

    inv.count -= 1;

    if (type === "medkit") finishMedkit(player);
    else if (type === "adrenalin") finishAdrenalin(player);
    else if (type === "spas") finishSpas(room, player);
  });
}