import { SPAWN_POINTS } from "../world/map.js";

// Vise NE respawnuje automatski posle 3s - ceka se kraj trenutne runde
// (vidi checkWaveProgress u gameLoop.js). Ako umru svi igraci pre kraja
// runde, triggerGameOver preuzima kontrolu pre nego sto ovo uopste postane bitno.
export function killPlayer(room, player) {
  player.alive = false;
  player.channeling = null;
}

export function respawnPlayer(player) {
  const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  player.x = spawn.x;
  player.y = spawn.y;
  player.health = 100;
  player.alive = true;
}