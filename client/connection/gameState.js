import { mountRoulette, unmountRoulette } from "../UI/roulette.js";
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
  shopZone: null,
  weaponConfig: {},
  consumableConfig: {},
  gameState: { players: {}, zombies: [], bullets: [], fireZones: [] },
  playerColorMap: {},
  colorCounter: 0,
  currentPing: null,
  pingInterval: null,
  currentWave: 1,
  waveOverlayTimeout: null,
  hitIndicators: [],
  audioContext: null,
  audioBuffers: {},
  audioLoaded: false,
  sfxVolume: 0.8,
  musicVolume: 0.6,
  musicAudio: null,
  gameStartedAt: null,
  spectateTargetId: null,
  wasAlive: true,
  deathOverlayTimeout: null,
  wasGambling: false,
};

const audioAssetPaths = {
  pistol: "./resources/audio/pistol.wav",
  shotgun: "./resources/audio/shotgun.ogg",
  rifle: "./resources/audio/rifle.ogg",
  granata: "./resources/audio/granata.ogg",
  explosion: "./resources/audio/explosion.ogg",
  zombieHit: "./resources/audio/zombieHit.ogg",
  zombieDeath: "./resources/audio/zombieDeath.ogg",
  playerDamage: "./resources/audio/playerDamage.ogg",
  waveSound: "./resources/audio/waveSound.mp3",
  music1: "./resources/audio/music1.mp3",
};

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!state.audioContext) state.audioContext = new AudioContextClass();
  return state.audioContext;
}

export async function preloadAudioAssets() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const entries = Object.entries(audioAssetPaths);
  await Promise.all(
    entries.map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        state.audioBuffers[key] = await ctx.decodeAudioData(arrayBuffer);
      } catch (err) {
        console.warn(`Failed to load audio asset ${url}:`, err);
      }
    }),
  );
  state.audioLoaded = true;
}

export function resumeAudioContext() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  startBackgroundMusic();
}

export function setSfxVolume(value) {
  state.sfxVolume = Math.max(0, Math.min(1, value));
}

export function setMusicVolume(value) {
  state.musicVolume = Math.max(0, Math.min(1, value));
  if (state.musicAudio) state.musicAudio.volume = state.musicVolume;
}

export function startBackgroundMusic() {
  if (!state.musicAudio) {
    state.musicAudio = new Audio("./resources/audio/music1.mp3");
    state.musicAudio.loop = true;
    state.musicAudio.volume = state.musicVolume;
    state.musicAudio.preload = "auto";
  }
  if (state.musicAudio.paused) {
    const playPromise = state.musicAudio.play();
    if (playPromise) playPromise.catch(() => {});
  }
}

function setupAudioControls() {
  const sfxInput = document.getElementById("sfxVolume");
  const musicInput = document.getElementById("musicVolume");

  if (sfxInput) {
    sfxInput.value = state.sfxVolume;
    sfxInput.addEventListener("input", (e) =>
      setSfxVolume(parseFloat(e.target.value)),
    );
  }

  if (musicInput) {
    musicInput.value = state.musicVolume;
    musicInput.addEventListener("input", (e) =>
      setMusicVolume(parseFloat(e.target.value)),
    );
  }
}

function playGunshotSound(data) {
  playSound(data, data.weapon || "pistol", 0.4);
}

function playExplosionSound(data) {
  playSound(data, "explosion", 0.5);
}

function playZombieHitSound(data) {
  playSound(data, "zombieHit", 0.4);
}

function playZombieDeathSound(data) {
  playSound(data, "zombieDeath", 0.45);
}

function playPlayerDamageSound() {
  playGlobalSound("playerDamage", 0.35);
}

function playWaveSound() {
  playGlobalSound("waveSound", 0.6);
}

function playGlobalSound(soundKey, baseVolume = 1, pitch = 1) {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state === "suspended") return;

  const buffer = state.audioBuffers[soundKey];
  if (!buffer) return;

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();

  source.buffer = buffer;
  source.playbackRate.value = pitch;
  gain.gain.value =
    state.sfxVolume * baseVolume * (0.85 + Math.random() * 0.15);

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

function playSound(data, soundKey, baseVolume = 1) {
  const me = state.gameState.players[state.playerId];
  if (!me) return;

  const shooter = state.gameState.players[data.ownerId];
  const shooterX = shooter ? shooter.x : data.x;
  const shooterY = shooter ? shooter.y : data.y;
  const dx = shooterX - me.x;
  const dy = shooterY - me.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const volume = Math.max(0.05, Math.min(1, 1 - distance / 800)) * baseVolume;
  const pitch = 1 + (Math.random() - 0.5) * 0.14;

  const ctx = ensureAudioContext();
  if (!ctx || ctx.state === "suspended") return;

  const buffer = state.audioBuffers[soundKey];
  if (!buffer) return;

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();

  source.buffer = buffer;
  source.playbackRate.value = pitch;
  gain.gain.value = volume * state.sfxVolume * (0.85 + Math.random() * 0.15);

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

setupAudioControls();
preloadAudioAssets().catch(() => {});

function showWaveOverlay(waveNumber, subtitle = "survive") {
  const overlay = document.getElementById("waveOverlay");
  if (!overlay) return;

  const title = overlay.querySelector(".death-title");
  const sub = overlay.querySelector(".death-sub");
  if (title) title.textContent = `wave ${waveNumber}`;
  if (sub) sub.innerHTML = `${subtitle}<span class="waiting-dots"></span>`;

  overlay.classList.add("visible");
  if (state.waveOverlayTimeout) clearTimeout(state.waveOverlayTimeout);
  state.waveOverlayTimeout = setTimeout(() => {
    overlay.classList.remove("visible");
  }, 2200);
}

export function addHitIndicator(data) {
  state.hitIndicators.push({
    text: data.text,
    x: data.x,
    y: data.y,
    createdAt: Date.now(),
    duration: 1200,
    killed: data.killed,
  });
}

export function handleWaveComplete(data) {
  showWaveOverlay(data.wave, `+${data.bonus}`);
}

export function handleGunshot(data) {
  playGunshotSound(data);
}

export function handleZombieHit(data) {
  playZombieHitSound(data);
}

export function handleZombieDeath(data) {
  playZombieDeathSound(data);
}

export function handleExplosion(data) {
  playExplosionSound(data);
}

export function handlePlayerDamage() {
  playPlayerDamageSound();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderLeaderboard(players) {
  const el = document.getElementById("leaderboard");
  if (!el) return;
  const sorted = Object.values(players).sort((a, b) => b.score - a.score);
  el.innerHTML =
    '<div class="lb-title">Leaderboard</div>' +
    sorted
      .map((p) => {
        const isMe = p.id == state.playerId;
        return `<div class="lb-row${isMe ? " me" : ""}"><span>${escapeHtml(p.name)}</span><span>${p.score}</span></div>`;
      })
      .join("");
}

export function syncGameState(data) {
  state.gameState.zombies = data.zombies;
  state.gameState.bullets = data.bullets;
  state.gameState.fireZones = data.fireZones || [];
  if (typeof data.startedAt === "number") state.gameStartedAt = data.startedAt;
  if (typeof data.wave === "number" && data.wave !== state.currentWave) {
    state.currentWave = data.wave;
    showWaveOverlay(data.wave);
    playWaveSound();
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
        state.gameState.players[id].currency = serverSelf.currency;
        state.gameState.players[id].weapons = serverSelf.weapons;
        state.gameState.players[id].gunIndex = serverSelf.gunIndex;
        state.gameState.players[id].channeling = serverSelf.channeling;
        state.gameState.players[id].adrenalineBar = serverSelf.adrenalineBar;
        state.gameState.players[id].consumables = serverSelf.consumables;

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

  renderLeaderboard(data.players);

  const me = state.gameState.players[state.playerId];
  if (me) {
    document.getElementById("hudScore").textContent = me.score;
    document.getElementById("hudCurrency").textContent = me.currency;
    document.getElementById("hudHp").textContent = Math.max(
      0,
      Math.ceil(me.health),
    );

    const gEl = document.getElementById('hudGamblingText');
    if (gEl) {
      if (data.gamblingMode) {
        gEl.textContent = `IZLAZAK ${(data.gamblingVoterIds || []).length}/${data.gamblingEligible}`;
      } else if (data.gamblingCooldownWaves > 0) {
        gEl.textContent = `CD ${data.gamblingCooldownWaves}`;
      } else {
        gEl.textContent = `${(data.gamblingVoterIds || []).length}/${data.gamblingEligible}`;
      }
    }

    if (data.gamblingMode && !state.wasGambling) {
      mountRoulette(me ? me.currency : 0, () => {});
    }
    if (!data.gamblingMode && state.wasGambling) {
      unmountRoulette();
    }
    state.wasGambling = !!data.gamblingMode;

    if (!me.alive && state.wasAlive) {
      // bas sad umro - kratak "You Died" flash, pa spectate preuzima
      const overlay = document.getElementById("deathOverlay");
      overlay.classList.add("visible");
      clearTimeout(state.deathOverlayTimeout);
      state.deathOverlayTimeout = setTimeout(() => overlay.classList.remove("visible"), 2000);
    }
    if (me.alive && !state.wasAlive) {
      state.spectateTargetId = null; // respawn - vrati se na sopstvenu kameru
    }
    state.wasAlive = me.alive;
  }
}