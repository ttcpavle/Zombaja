import { resetCombo } from "./scoring.js";

// Prati da li je ceo "shot" (jedan fire() poziv - svi njegovi pelleti/sacma/
// naknadni sarpnel od granate) pogodio bas nesto. Ako pending padne na 0 a
// nista nije pogodjeno, combo tog igraca se resetuje.

export function trackShotBullet(room, shotId, ownerId) {
  if (shotId === undefined || shotId === null) return;
  if (!room.shotTracking) room.shotTracking = {};
  if (!room.shotTracking[shotId]) {
    room.shotTracking[shotId] = { ownerId, pending: 0, hit: false };
  }
  room.shotTracking[shotId].pending += 1;
}

export function markShotHit(room, shotId) {
  if (shotId === undefined || shotId === null) return;
  const entry = room.shotTracking && room.shotTracking[shotId];
  if (entry) entry.hit = true;
}

export function resolveShotBullet(room, shotId) {
  if (shotId === undefined || shotId === null) return;
  const entry = room.shotTracking && room.shotTracking[shotId];
  if (!entry) return;

  entry.pending -= 1;
  if (entry.pending <= 0) {
    if (!entry.hit) resetCombo(room, entry.ownerId);
    delete room.shotTracking[shotId];
  }
}