import { sendToPlayer } from "./broadcast.js";

const COMBO_WINDOW_MS = 1500;
const BASE_KILL_POINTS = 100;
const COMBO_MULTIPLIER_STEP = 1.05;

// Kad "shot" (ceo fire() poziv, ne pojedinacni pellet) ne pogodi bas nista,
// combo se resetuje - poziva se iz shotTracking.js
export function resetCombo(room, playerId) {
  if (!room.hitCombos) room.hitCombos = {};
  room.hitCombos[playerId] = { count: 0, lastTime: 0 };
}

// Jedinstvena funkcija za dodelu score/currency/feedback-a, bez obzira da li
// damage dolazi od metka, sacme, sacme granate ili DOT efekta (bleed/burn).
export function awardHitScore(room, playerId, z, killed) {
  if (playerId === null || playerId === undefined) return; // damage bez vlasnika (npr. chain-eksplozija), niko ne dobija nagradu

  if (!room.hitCombos) room.hitCombos = {};
  const combo = room.hitCombos[playerId] || { count: 0, lastTime: 0 };
  const now = Date.now();

  let points;
  if (killed) {
    const keepCombo = now - combo.lastTime <= COMBO_WINDOW_MS;
    combo.count = keepCombo ? combo.count + 1 : 1;
    combo.lastTime = now;
    const multiplier = combo.count > 1 ? Math.pow(COMBO_MULTIPLIER_STEP, combo.count - 1) : 1;
    points = Math.round(BASE_KILL_POINTS * multiplier);
  } else {
    // hit bez kila vise NE dira combo.count/lastTime - to sad iskljucivo radi
    // 1.5s tajmer (gore) ili potpun promasaj celog shot-a (shotTracking.js)
    points = 1;
  }

  room.hitCombos[playerId] = combo;

  const player = room.players[playerId];
  if (player) {
    player.score += points;
    player.currency += points;
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