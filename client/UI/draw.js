import { CANVAS_W, CANVAS_H, GAME_W, GAME_H, PLAYER_COLORS } from "../constants.js";
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

function updateTimerDisplay() {
  const el = document.getElementById("hudTimer");
  if (!el || !state.gameStartedAt) return;
  const elapsed = Math.max(0, Date.now() - state.gameStartedAt);
  const totalSec = Math.floor(elapsed / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  el.textContent = `${hh}:${mm}:${ss}`;
}

function drawChannelingRing(p) {
  if (!p.channeling) return;
  const elapsed = Date.now() - p.channeling.startedAt;
  const remaining = Math.max(0, p.channeling.duration - elapsed);
  const progress = Math.min(1, elapsed / p.channeling.duration);

  const cx = p.x + 30;
  const cy = p.y - 2;
  const radius = 11;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = '10px "Share Tech Mono"';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.ceil(remaining / 1000).toString(), cx, cy + 1);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function draw() {
  updateCamera();
  updateTimerDisplay();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.translate(-camX, -camY);

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

  ctx.strokeStyle = "#3a3f4d";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, GAME_W, GAME_H);

  state.walls.forEach((w) => {
    ctx.fillStyle = "#2a2d35";
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "#4a5060";
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  });
  if (state.shopZone) {
    const z = state.shopZone;
    ctx.save();
    ctx.strokeStyle = "#c8f135";
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = "rgba(200,241,53,0.06)";
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.restore();
    ctx.fillStyle = "#c8f135";
    ctx.font = '11px "Share Tech Mono"';
    ctx.textAlign = "center";
    ctx.fillText("SHOP", z.x + z.w / 2, z.y - 8);
    ctx.textAlign = "left";
  }
  state.gameState.zombies.forEach((z) => {
    ctx.fillStyle = z.color;
    ctx.fillRect(z.x, z.y, z.size, z.size);
    ctx.fillStyle = z.secondaryColor;
    ctx.fillRect(z.x + 4, z.y + 5, 4, 4);
    ctx.fillRect(z.x + 12, z.y + 5, 4, 4);
  });

  state.gameState.bullets.forEach((b) => {
    ctx.fillStyle = "#c8f135";
    ctx.shadowColor = "#f18a35";
    ctx.shadowBlur = 6;
    ctx.fillRect(b.x - 2, b.y - 2, 5, 5);
    ctx.shadowBlur = 0;
  });

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

    ctx.fillStyle = "#1a1d24";
    ctx.fillRect(p.x - 5, p.y - 12, 30, 5);
    ctx.fillStyle =
      p.health > 50 ? "#81c784" : p.health > 25 ? "#ffb74d" : "#ef5350";
    ctx.fillRect(p.x - 5, p.y - 12, (p.health / 100) * 30, 5);

    ctx.font = '11px "Share Tech Mono"';
    ctx.textAlign = "center";
    ctx.fillStyle = isMe ? "white" : color;
    ctx.fillText(p.name, p.x + 10, p.y - 16);
    ctx.textAlign = "left";

    drawChannelingRing(p);
  });

  const now = Date.now();
  state.hitIndicators = state.hitIndicators.filter((indicator) => {
    const elapsed = now - indicator.createdAt;
    if (elapsed > indicator.duration) return false;

    const alpha = 1 - elapsed / indicator.duration;
    const floatY = indicator.y - elapsed * 0.05;
    const color = indicator.killed
      ? `rgba(255,205,0,${alpha})`
      : `rgba(255,255,255,${alpha})`;
    ctx.font = '18px "Share Tech Mono"';
    ctx.textAlign = "center";
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillStyle = color;
    ctx.strokeText(indicator.text, indicator.x, floatY);
    ctx.fillText(indicator.text, indicator.x, floatY);
    return true;
  });

  ctx.restore();

  requestAnimationFrame(draw);
}

draw();