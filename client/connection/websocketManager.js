import { showScreen } from "../UI/screenManager.js";
import {
  state,
  syncGameState,
  addHitIndicator,
  handleWaveComplete,
  handleGunshot,
  handleExplosion,
  handleZombieHit,
  handleZombieDeath,
  handlePlayerDamage,
  startBackgroundMusic,
} from "./gameState.js";
import { updateLobbyPlayers, updatePingDisplay, renderGameOverResults } from "../UI/lobby.js";
import { isShopOpen, renderShop } from "../UI/shop.js";
import { renderActionBar, showToast } from "../UI/hud.js";
import { unmountRoulette } from '../UI/roulette.js';

function buildSpasMessage(data) {
  if (!data.victimId) {
    return `${data.userName} je aktivirao/la SPAS pilulu.`;
  }
  if (data.victimId === data.userId) {
    return `${data.userName} nije prezivela/o sopstvenu SPAS pilulu.`;
  }
  return `${data.victimName} je nastradao/la umesto ${data.userName}!`;
}

export function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  state.ws = new WebSocket(`${proto}://${location.host}`);

  state.ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);

    if (data.type === "notJoined") {
      document.getElementById("codeInput").value = "ne valja kod!!";
      showScreen("menuScreen");
      return;
    }

    if (data.type === "joined") {
      state.playerId = data.playerId;
      state.roomId = data.roomId;
      state.roomOwnerId = data.ownerId ?? null;
      state.walls = data.walls;
      state.shopZone = data.shopZone;
      state.weaponConfig = data.weaponConfig;
      state.consumableConfig = data.consumableConfig || {};
      document.getElementById("roomBadge").textContent =
        `ROOM #${state.roomId}`;
      document.getElementById("roomCode").textContent =
        data.roomType === "private" ? `Code: ${data.roomCode}` : "";
      updateLobbyPlayers(data.players, data.ownerId, data.roomType);
      showScreen("lobbyScreen");
      return;
    }

    if (data.type === "lobby_update") {
      state.roomOwnerId = data.ownerId ?? state.roomOwnerId;
      updateLobbyPlayers(data.players, data.ownerId, data.roomType);
      return;
    }

    if (data.type === "pong") {
      const now = Date.now();
      state.currentPing = Math.max(0, now - (data.sentAt || now));
      updatePingDisplay();
      return;
    }

    if (data.type === "game_started") {
      showScreen("gameScreen");
      startBackgroundMusic();
      state.gameStartedAt = data.startedAt || Date.now();
      return;
    }

    if (data.type === "game_over") {
      showScreen("gameOverScreen");
      renderGameOverResults(data.results, data.wave);
      return;
    }

    if (data.type === "hit_feedback") {
      addHitIndicator(data);
      return;
    }

    if (data.type === "wave_complete") {
      handleWaveComplete(data);
      return;
    }

    if (data.type === "gunshot") {
      handleGunshot(data);
      return;
    }

    if (data.type === "explosion") {
      handleExplosion(data);
      return;
    }

    if (data.type === "player_damage") {
      handlePlayerDamage(data);
      return;
    }

    if (data.type === "zombie_hit") {
      handleZombieHit(data);
      return;
    }

    if (data.type === "zombie_death") {
      handleZombieDeath(data);
      return;
    }

    if (data.type === "spas_used") {
      showToast(buildSpasMessage(data));
      return;
    }

    if (data.type === "state") {
      syncGameState(data);
      renderActionBar(state.gameState.players[state.playerId]);
      if (isShopOpen()) renderShop();
      return;
    }
  };

  state.ws.onclose = () => {
    unmountRoulette();
    showScreen("menuScreen");
    state.playerId = null;
    state.roomId = null;
    state.walls = [];
    state.gameState = { players: {}, zombies: [], bullets: [], fireZones: [] };
    state.gameStartedAt = null;
    state.wasGambling = false;
    document.getElementById("roomCode").textContent = "";
    clearInterval(state.pingInterval);
    state.pingInterval = null;
    state.currentPing = null;
    updatePingDisplay();
  };
}

export function sendPing() {
  if (!state.ws || state.ws.readyState !== 1) return;
  state.ws.send(JSON.stringify({ type: "ping", sentAt: Date.now() }));
}