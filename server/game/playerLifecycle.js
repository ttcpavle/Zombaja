import { SPAWN_POINTS } from "../world/map.js";

export function killPlayer(room, player) {
  player.alive = false;
  player.channeling = null; // ne moze da ostane "u toku" lecenja dok je mrtav
  setTimeout(() => {
    player.x = SPAWN_POINTS[0].x;
    player.y = SPAWN_POINTS[0].y;
    player.health = 100;
    player.alive = true;
  }, 3000);
}