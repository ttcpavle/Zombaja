const MINOR_CYCLE = ["damage", "damage", "firerate"];

export const WEAPON_CONFIG = {
  pistol: {
    unlockCost: 0,
    maxLevel: 40,
    infiniteAmmo: true,
    damageStep: 0.08,
    firerateStep: 0.05,
    upgradeCostBase: 100,
    upgradeCostGrowth: 1.05,
    majorLevels: {
      10:  { pierceCount: 1 },
      20: { pierceCount: 2 },
      30: { pierceCount: 4 },
      40: { pierceCount: Infinity, pierceRamp: 0.15 },
    },
  },
  shotgun: {
    unlockCost: 300,
    maxLevel: 40,
    ammoPerBuy: 40,
    ammoCost: 60,
    damageStep: 0.06,
    firerateStep: 0.05,
    upgradeCostBase: 150,
    upgradeCostGrowth: 1.10,
    majorLevels: {
      10:  { doubleShotChance: 0.25, knockback: 2 },
      20: { doubleShotChance: 0.50, rangeMultiplier: 1.2, knockback: 4 },
      30: { doubleShotChance: 1.00, knockback: 6 },
      40: { stunChance: 0.30, stunDuration: 1000, knockback: 8 },
    },
  },
  rifle: {
    unlockCost: 500,
    maxLevel: 40,
    ammoPerBuy: 90,
    ammoCost: 70,
    damageStep: 0.05,
    firerateStep: 0.08,
    upgradeCostBase: 120,
    upgradeCostGrowth: 1.10,
    majorLevels: {
      10:  { bleedChance: 0.10 },
      20: { bleedChance: 0.25 },
      30: { bleedChance: 0.50 },
      40: { bleedChance: 1.00, critChance: 0.25, critMultiplier: 2, instakillChance: 0.25 },
    },
  },
  granata: {
    unlockCost: 800,
    maxLevel: 40,
    ammoPerBuy: 10,
    ammoCost: 100,
    damageStep: 0.10,
    firerateStep: 0.05,
    upgradeCostBase: 300,
    upgradeCostGrowth: 1.15,
    majorLevels: {
      10:  { fireZone: true, fireRadius: 60 },
      20: { fireRadius: 100 },
      30: { burnLingers: true },
      40: { miniGranataCount: 5 },
    },
  },
};

// Deljena formula - poziva se ISTO i na serveru (za validaciju) i na klijentu (za prikaz).
// Nije deo WEAPON_CONFIG objekta jer taj objekat putuje kroz JSON preko WebSocket-a,
// a funkcije se gube pri JSON.stringify - zato je ovo odvojen export.
export function upgradeCostAtLevel(cfg, level) {
  return Math.round(cfg.upgradeCostBase * Math.pow(cfg.upgradeCostGrowth, level));
}

export function getMajorAbilities(gunName, level) {
  const cfg = WEAPON_CONFIG[gunName];
  const result = {};
  Object.keys(cfg.majorLevels)
    .map(Number)
    .filter((lvl) => lvl <= level)
    .sort((a, b) => a - b)
    .forEach((lvl) => Object.assign(result, cfg.majorLevels[lvl]));
  return result;
}

function getMinorMultipliers(gunName, level) {
  const cfg = WEAPON_CONFIG[gunName];
  let damageMult = 1;
  let fireRateMult = 1;
  let cycleIndex = 0;
  for (let lvl = 2; lvl <= level; lvl++) {
    if (lvl % 10 === 0) continue;
    const kind = MINOR_CYCLE[cycleIndex % MINOR_CYCLE.length];
    cycleIndex++;
    if (kind === "damage") damageMult *= 1 + cfg.damageStep;
    else fireRateMult *= 1 + cfg.firerateStep;
  }
  return { damageMult, fireRateMult };
}

export function computeDamage(gunName, baseDamage, level) {
  const { damageMult } = getMinorMultipliers(gunName, level);
  return baseDamage * damageMult;
}

export function computeShootSpeed(gunName, baseShootSpeed, level) {
  const { fireRateMult } = getMinorMultipliers(gunName, level);
  return baseShootSpeed / fireRateMult;
}