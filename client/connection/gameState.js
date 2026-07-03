import {
  CANVAS_W,
  CANVAS_H,
  GAME_W,
  GAME_H,
  PLAYER_COLORS,
} from "../constants.js";

export const state = {
  ws: null,
  playerId: null,
  roomId: null,
  roomOwnerId: null,
  playerName: "",

  walls: [],
  gameState: { players: {}, zombies: [], bullets: [] },
  playerColorMap: {},
  colorCounter: 0,
  currentPing: null,
  pingInterval: null,
  currentWave: 1,
  waveOverlayTimeout: null,
};

function showWaveOverlay(waveNumber) {
  const overlay = document.getElementById("waveOverlay");
  if (!overlay) return;

  const title = overlay.querySelector(".death-title");
  const sub = overlay.querySelector(".death-sub");
  if (title) title.textContent = `wave ${waveNumber}`;
  if (sub) sub.innerHTML = `survive<span class="waiting-dots"></span>`;

  overlay.classList.add("visible");
  if (state.waveOverlayTimeout) clearTimeout(state.waveOverlayTimeout);
  state.waveOverlayTimeout = setTimeout(() => {
    overlay.classList.remove("visible");
  }, 2200);
}

export function syncGameState(data) {
  state.gameState.zombies = data.zombies;
  state.gameState.bullets = data.bullets;
  if (typeof data.wave === "number" && data.wave !== state.currentWave) {
    state.currentWave = data.wave;
    showWaveOverlay(data.wave);
  } else if (typeof data.wave === "number") {
    state.currentWave = data.wave;
  }

  for (let id in data.players) {
    if (state.playerColorMap[id] === undefined) {
      state.playerColorMap[id] = state.colorCounter++ % PLAYER_COLORS.length;
    }
  }

  for (let id in data.players) {
    if (id != state.playerId) {
      state.gameState.players[id] = data.players[id];
    } else {
      const serverSelf = data.players[id];
      if (!state.gameState.players[id]) {
        state.gameState.players[id] = serverSelf;
      } else {
        state.gameState.players[id].health = serverSelf.health;
        state.gameState.players[id].score = serverSelf.score;
        state.gameState.players[id].alive = serverSelf.alive;
        state.gameState.players[id].name = serverSelf.name;
        /*if (state.gameState.players[id].name !== serverSelf.name) {
          document
            .getElementById("waveOverlay")
            .classList.toggle("visible", true);
            /////dodaj ovde da nestane isto posle 2 sekunde
        }*/
        //state.gameState.players[id].wave = serverSelf.wave;

        const dist = Math.hypot(
          state.gameState.players[id].x - serverSelf.x,
          state.gameState.players[id].y - serverSelf.y,
        );
        if (dist > 60) {
          state.gameState.players[id].x = serverSelf.x;
          state.gameState.players[id].y = serverSelf.y;
        }
      }
    }
  }

  for (let id in state.gameState.players) {
    if (!data.players[id]) delete state.gameState.players[id];
  }

  const me = state.gameState.players[state.playerId];
  if (me) {
    document.getElementById("hudScore").textContent = me.score;
    document.getElementById("hudHp").textContent = Math.max(
      0,
      Math.ceil(me.health),
    );
    document
      .getElementById("deathOverlay")
      .classList.toggle("visible", !me.alive);
  }
}
