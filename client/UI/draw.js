import {
  CANVAS_W,
  CANVAS_H,
  GAME_W,
  GAME_H,
  PLAYER_COLORS,
} from "../constants.js";
import { state } from "../connection/gameState.js";

export let camX = 0,
  camY = 0;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function worldToScreen(wx, wy) {
  return { x: wx - camX, y: wy - camY };
}

function updateCamera() {
  const me = state.gameState.players[state.playerId];
  if (!me) return;
  camX = me.x + 10 - CANVAS_W / 2;
  camY = me.y + 10 - CANVAS_H / 2;
  camX = Math.max(0, Math.min(GAME_W - CANVAS_W, camX));
  camY = Math.max(0, Math.min(GAME_H - CANVAS_H, camY));
}

function draw() {
  updateCamera();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.translate(-camX, -camY);

  // Grid background (samo vidljivi deo)
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  const gx0 = Math.floor(camX / 40) * 40;
  const gy0 = Math.floor(camY / 40) * 40;
  for (let x = gx0; x < camX + CANVAS_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, camY);
    ctx.lineTo(x, camY + CANVAS_H);
    ctx.stroke();
  }
  for (let y = gy0; y < camY + CANVAS_H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(camX, y);
    ctx.lineTo(camX + CANVAS_W, y);
    ctx.stroke();
  }

  // Map border
  ctx.strokeStyle = "#3a3f4d";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, GAME_W, GAME_H);

  // Walls
  state.walls.forEach((w) => {
    ctx.fillStyle = "#2a2d35";
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "#4a5060";
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  });
  //{ name: "explode", health: 20, speed: 5, size: 1.12, color: '#e93351',secondaryColor: '#56f9ff' },
  // Zombies
  state.gameState.zombies.forEach((z) => {
    ctx.fillStyle = z.color;
    ctx.fillRect(z.x, z.y, z.size, z.size);
    ctx.fillStyle = z.secondaryColor;
    ctx.fillRect(z.x + 4, z.y + 5, 4, 4);
    ctx.fillRect(z.x + 12, z.y + 5, 4, 4);
  });

  // Bullets
  state.gameState.bullets.forEach((b) => {
    ctx.fillStyle = "#c8f135";
    ctx.shadowColor = "#f18a35";
    ctx.shadowBlur = 6;
    ctx.fillRect(b.x - 2, b.y - 2, 5, 5);
    ctx.shadowBlur = 0;
  });

  // Players
  Object.values(state.gameState.players).forEach((p) => {
    if (!p.alive) return;
    const colorIdx = state.playerColorMap[p.id] ?? 0;
    const color = PLAYER_COLORS[colorIdx];
    const isMe = p.id == state.playerId;

    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, 20, 20);

    if (isMe) {
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x, p.y, 20, 20);
    }

    // Health bar
    ctx.fillStyle = "#1a1d24";
    ctx.fillRect(p.x - 5, p.y - 12, 30, 5);
    ctx.fillStyle =
      p.health > 50 ? "#81c784" : p.health > 25 ? "#ffb74d" : "#ef5350";
    ctx.fillRect(p.x - 5, p.y - 12, (p.health / 100) * 30, 5);

    // Name
    ctx.font = '11px "Share Tech Mono"';
    ctx.textAlign = "center";
    ctx.fillStyle = isMe ? "white" : color;
    ctx.fillText(p.name, p.x + 10, p.y - 16);
    ctx.textAlign = "left";
  });

  ctx.restore();

  requestAnimationFrame(draw);
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

draw();
