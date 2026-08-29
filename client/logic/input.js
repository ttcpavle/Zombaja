import { CANVAS_W, CANVAS_H, GAME_W, GAME_H } from "../constants.js";
import { state, resumeAudioContext } from "../connection/gameState.js";
import { camX, camY } from "../UI/draw.js";
import { isInShopZone, isShopOpen, openShop, closeShop, updateShopPrompt } from "../UI/shop.js";
import { isRouletteMounted } from "../UI/roulette.js";
import { isPauseOpen, openPause, closePause } from "../UI/pause.js";

const canvas = document.getElementById("game");
const keys = {};
const mouseState = {
  down: false,
  x: 0,
  y: 0,
};

let spaceDown = false;
let firing = false;

function updateFiringState() {
  const shouldFire = mouseState.down || spaceDown;
  if (shouldFire && !firing) {
    firing = true;
    sendShootCommand("start");
  } else if (!shouldFire && firing) {
    firing = false;
    sendShootCommand("stop");
  }
}

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (document.getElementById("gameScreen").classList.contains("active")) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

function checkWallCollision(x, y, size) {
  return state.walls.some(
    (w) => x < w.x + w.w && x + size > w.x && y < w.y + w.h && y + size > w.y,
  );
}

function getWorldMousePosition(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (CANVAS_W / rect.width) + camX,
    y: (clientY - rect.top) * (CANVAS_H / rect.height) + camY,
  };
}

function sendShootCommand(action) {
  const me = state.gameState.players[state.playerId];
  if (!me || !me.alive || !state.ws || state.ws.readyState !== 1) return;

  const pos = getWorldMousePosition(mouseState.x, mouseState.y);
  let dx = pos.x - (me.x + 10);
  let dy = pos.y - (me.y + 10);
  const dist = Math.hypot(dx, dy);
  if (dist === 0 && action !== "stop") return;

  const message = {
    type: `shoot_${action}`,
    x: me.x + 10,
    y: me.y + 10,
    dx: dx / dist,
    dy: dy / dist,
  };
  state.ws.send(JSON.stringify(message));
}

function useConsumable(item) {
  if (!state.ws || state.ws.readyState !== 1) return;
  state.ws.send(JSON.stringify({ type: "use_consumable", item }));
}

var selectedWeapon = 0;

function scroolWeapon(direction) {
  if (direction === "up") {
    selectedWeapon = (selectedWeapon + 1) % 4;
  }
  if (direction === "down") {
    selectedWeapon = (selectedWeapon - 1 + 4) % 4;
  }

  changeWeapon();
}

function setWeapon(index) {
  selectedWeapon = index - 1;

  changeWeapon();
}

function changeWeapon() {
  const message = {
    type: `weapon_change`,
    weapon: selectedWeapon,
  };
  state.ws.send(JSON.stringify(message));
}

canvas.addEventListener("mousemove", (e) => {
  mouseState.x = e.clientX;
  mouseState.y = e.clientY;
  if (firing) sendShootCommand("update");
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0 && e.button !== 2) return;
  resumeAudioContext();
  e.preventDefault();
  mouseState.down = true;
  mouseState.x = e.clientX;
  mouseState.y = e.clientY;
  updateFiringState();
});

canvas.addEventListener("mouseleave", () => {
  mouseState.down = false;
  updateFiringState();
});

window.addEventListener("mouseup", () => {
  mouseState.down = false;
  updateFiringState();
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (e.repeat) return;
  if (isShopOpen() || isPauseOpen()) return;
  resumeAudioContext();
  spaceDown = true;
  updateFiringState();
});

window.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  spaceDown = false;
  updateFiringState();
})

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (isShopOpen() || isPauseOpen()) return;

    if (e.deltaY < 0) {
      scroolWeapon("up");
    } else if (e.deltaY > 0) {
      scroolWeapon("down");
    }
  },
  { passive: false },
);

// E = SAMO shop (bez obzira na zonu van nje ne radi nista).
// Q/R/T = medkit/adrenalin/spas, rade svuda dok igrac zivi.

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  if (e.code === "Escape") {
    if (isShopOpen()) { closeShop(); return; }
    if (isPauseOpen()) { closePause(); return; }
    if (document.getElementById("gameScreen").classList.contains("active")) openPause();
    return;
  }

  if (e.code === "KeyH") {
      toggleControlsHint();
      return;
    }

  if (isPauseOpen()) return;

  if (e.code === "KeyE") {
    if (isShopOpen()) return;
    if (isInShopZone()) openShop();
    return;
  }
  if (e.code === "KeyQ") {
    if (isShopOpen()) return;
    useConsumable("medkit");
    return;
  }
  if (e.code === "KeyR") {
    if (isShopOpen()) return;
    useConsumable("adrenalin");
    return;
  }
  if (e.code === "KeyT") {
    if (isShopOpen()) return;
    useConsumable("spas");
    return;
  }
  if (e.code === "KeyG") {
    if (isShopOpen()) return;
    if (!state.ws || state.ws.readyState !== 1) return;
    state.ws.send(JSON.stringify({ type: "toggle_gambling_vote" }));
    return;
  }

  switch (e.key) {
    case "1": setWeapon(1); break;
    case "2": setWeapon(2); break;
    case "3": setWeapon(3); break;
    case "4": setWeapon(4); break;
  }
});

function toggleControlsHint() {
  const el = document.getElementById("controls");
  if (!el) return;
  el.classList.toggle("hidden");
}

function movePlayer() {
  updateShopPrompt();
  if (isShopOpen() || isPauseOpen() || isRouletteMounted()) return;
  const me = state.gameState.players[state.playerId];
  if (!me || !me.alive || !state.ws || state.ws.readyState !== 1) return;

  let speed = 3;
  if (me.channeling) speed *= 0.5;
  if (me.adrenalineBar) speed *= 1 + 0.30 * me.adrenalineBar; // 0.30 = ADRENALIN_MAX_SPEED_BONUS na serveru (consumables.js) - drzati sinhronizovano

  let dx = 0,
    dy = 0;
  if (keys["KeyW"] || keys["ArrowUp"]) dy -= speed;
  if (keys["KeyS"] || keys["ArrowDown"]) dy += speed;
  if (keys["KeyA"] || keys["ArrowLeft"]) dx -= speed;
  if (keys["KeyD"] || keys["ArrowRight"]) dx += speed;

  if (dx !== 0 || dy !== 0) {
    if (!checkWallCollision(me.x + dx, me.y, 20))
      me.x = Math.max(0, Math.min(GAME_W - 20, me.x + dx));
    if (!checkWallCollision(me.x, me.y + dy, 20))
      me.y = Math.max(0, Math.min(GAME_H - 20, me.y + dy));
    state.ws.send(JSON.stringify({ type: "move", dx, dy }));
  }
}

setInterval(movePlayer, 1000 / 60);

window.setWeaponFromHud = (index) => setWeapon(index + 1);
window.useConsumableFromHud = (item) => useConsumable(item);