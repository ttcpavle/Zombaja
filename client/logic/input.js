import { CANVAS_W, CANVAS_H, GAME_W, GAME_H } from "../constants.js";
import { state, resumeAudioContext } from "../connection/gameState.js";
import { camX, camY } from "../UI/draw.js";

const canvas = document.getElementById("game");
const keys = {};
const mouseState = {
  down: false,
  x: 0,
  y: 0,
};

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

var selectedWeapon = 1;

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
  const weapon = document.getElementById("weapon");
  weapon.textContent =
    selectedWeapon === 0
      ? "pistol"
      : selectedWeapon === 1
        ? "shotgun"
        : selectedWeapon === 2
          ? "rifle"
          : "grenade";
  const message = {
    type: `weapon_change`,
    weapon: selectedWeapon,
  };
  state.ws.send(JSON.stringify(message));
}

canvas.addEventListener("mousemove", (e) => {
  mouseState.x = e.clientX;
  mouseState.y = e.clientY;
  if (mouseState.down) sendShootCommand("update");
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0 && e.button !== 2) return;
  resumeAudioContext();
  e.preventDefault();
  mouseState.down = true;
  mouseState.x = e.clientX;
  mouseState.y = e.clientY;
  sendShootCommand("start");
});

canvas.addEventListener("mouseup", () => {
  if (!mouseState.down) return;
  mouseState.down = false;
  sendShootCommand("stop");
});

canvas.addEventListener("mouseleave", () => {
  if (!mouseState.down) return;
  mouseState.down = false;
  sendShootCommand("stop");
});

window.addEventListener("mouseup", () => {
  if (!mouseState.down) return;
  mouseState.down = false;
  sendShootCommand("stop");
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Mouse scroll
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    if (e.deltaY < 0) {
      scroolWeapon("up");
    } else if (e.deltaY > 0) {
      scroolWeapon("down");
    }
  },
  { passive: false },
);

// Number keys 1-5
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  switch (e.key) {
    case "1":
      setWeapon(1);
      break;
    case "2":
      setWeapon(2);
      break;
    case "3":
      setWeapon(3);
      break;
    case "4":
      setWeapon(4);
      break;
    /* case '5':
            setWeapon(5);
            break;*/
  }
});

function movePlayer() {
  const me = state.gameState.players[state.playerId];
  if (!me || !me.alive || !state.ws || state.ws.readyState !== 1) return;

  let dx = 0,
    dy = 0;
  const speed = 3;
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
