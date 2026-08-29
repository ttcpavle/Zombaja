import { updateZombies, spawnZombie, zombieTypes, updateFireZones } from "./zombies.js";
import { updateBullets, checkCollisions } from "./bullets.js";
import { updateConsumables } from "./consumables.js";
import { respawnPlayer } from "./playerLifecycle.js";
import { broadcastRoomState, broadcastToRoom } from "./broadcast.js";
import { processShooting } from "./guns.js";

const GAMBLING_COOLDOWN_WAVES = 4; // tunable 3-5   <-- PREMESTI OVDE

function logBase(value, base) {
  return Math.log(value) / Math.log(base);
}

function getWaveConfig(waveNum) {
  const baseDefaults = Math.max(5, logBase(waveNum + 2, 1.06) + waveNum / 5);
  const baseRunners = Math.max(0, logBase(waveNum - 1, 1.04) + waveNum / 5);
  const baseTanks = Math.max(0, logBase(waveNum - 8, 1.02) + waveNum / 10);//8 umesto 2 je bilo
  const baseExplodes = Math.max(0, logBase(waveNum - 19, 1.05) + waveNum / 2);//ovde 19
  return {
    zombies: {
      default: Math.max(1, baseDefaults),
      runner: baseRunners,
      tank: baseTanks,
      explode: baseExplodes,
    },
    spawnInterval: Math.max(200, 400 - (waveNum - 1) * 20),
  };
}

function buildWaveSpawnQueue(waveNum) {
  const config = getWaveConfig(waveNum);
  const queue = [];

  for (const [typeName, count] of Object.entries(config.zombies)) {
    for (let i = 0; i < count; i++) {
      const zombieType = zombieTypes.find((z) => z.name === typeName);
      if (zombieType) {
        queue.push(zombieType);
      }
    }
  }

  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  return queue;
}

function clearWaveTimers(room) {
  if (room.waveSpawnTimer) {
    clearTimeout(room.waveSpawnTimer);
    room.waveSpawnTimer = null;
  }
  if (room.waveTransitionTimer) {
    clearTimeout(room.waveTransitionTimer);
    room.waveTransitionTimer = null;
  }
  if (room.waveCompletionTimer) {
    clearTimeout(room.waveCompletionTimer);
    room.waveCompletionTimer = null;
  }
}

function spawnNextZombie(room) {
  if (!room || room.state !== "playing" || !room.waveActive) return;
  if (!room.waveSpawnQueue || room.waveSpawnQueue.length === 0) {
    room.waveSpawningComplete = true;
    room.waveSpawningEndedAt = Date.now();
    return;
  }

  const zombieType = room.waveSpawnQueue.shift();
  spawnZombie(room, zombieType);
  room.waveSpawned += 1;

  const config = getWaveConfig(room.wave);
  room.waveSpawnTimer = setTimeout(() => {
    spawnNextZombie(room);
  }, config.spawnInterval);
}

function startWave(room) {
  if (!room || room.state !== "playing") return;

  clearWaveTimers(room);
  room.waveActive = true;
  room.waveSpawningComplete = false;
  room.waveSpawned = 0;
  room.waveSpawnQueue = buildWaveSpawnQueue(room.wave);
  room.waveTotal = room.waveSpawnQueue.length;
  room.waveSpawningEndedAt = null;

  spawnNextZombie(room);
}

function checkWaveProgress(room) {
  if (!room || room.state !== "playing") return;
  if (!room.waveActive) return;

  if (!room.waveSpawningComplete) return;

  // Racunaj glasove PRE respawn-a, da respawn ne pokvari/nasumicno napravi jednoglasnost
  const aliveBeforeRespawn = Object.values(room.players).filter((p) => p.alive);
  const wantsGambling =
    !room.gamblingMode &&
    room.gamblingCooldownWaves <= 0 &&
    aliveBeforeRespawn.length > 0 &&
    aliveBeforeRespawn.every((p) => room.gamblingVotes.has(p.id));

  const timeSinceSpawningEnded =
    Date.now() - (room.waveSpawningEndedAt || Date.now());
  // Ako svi hoce gambling, iskljuci 20s "spasilacki" tajmer - runda mora STVARNO
  // da se zavrsi (svi zombiji mrtvi) pre nego sto krene kockanje.
  const canEndWave =
    room.zombies.length === 0 || (!wantsGambling && timeSinceSpawningEnded >= 20000);

  if (!canEndWave) return;

  room.waveActive = false;
  room.waveSpawningComplete = false;
  clearWaveTimers(room);

  const bonus = 2000 * room.wave;
  Object.values(room.players).forEach((player) => {
    if (player.alive) {
      player.score += bonus;
      player.currency += bonus;
    } else {
      respawnPlayer(player);
    }
  });

  broadcastToRoom(room, { type: "wave_complete", wave: room.wave, bonus });

  if (room.gamblingCooldownWaves > 0) room.gamblingCooldownWaves -= 1;

  if (wantsGambling) {
    room.gamblingMode = true;
    room.gamblingVotes.clear(); // isti glasovi se sad koriste za "zelim da IZADJEM"
    broadcastToRoom(room, { type: "gambling_started" });
    return; // nema waveTransitionTimer dok traje gambling
  }

  room.waveTransitionTimer = setTimeout(() => {
    if (!room || room.state !== "playing") return;
    room.wave += 1;
    startWave(room);
  }, 8000);
}

export function evaluateGamblingVote(room) {
  if (!room.gamblingMode) return;
  const alivePlayers = Object.values(room.players).filter((p) => p.alive);
  const allWantOut = alivePlayers.length > 0 && alivePlayers.every((p) => room.gamblingVotes.has(p.id));
  if (!allWantOut) return;

  room.gamblingMode = false;
  room.gamblingVotes.clear();
  room.gamblingCooldownWaves = GAMBLING_COOLDOWN_WAVES;
  broadcastToRoom(room, { type: "gambling_ended" });

  room.wave += 1;
  startWave(room);
}

function isRoomWiped(room) {
  const players = Object.values(room.players);
  return players.length > 0 && players.every((p) => !p.alive);
}

function triggerGameOver(room) {
  room.state = "gameover";
  stopGameLoop(room);
  room.zombies = [];
  room.bullets = [];
  room.fireZones = [];

  const results = Object.values(room.players)
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);

  broadcastToRoom(room, {
    type: "game_over",
    results,
    wave: room.wave,
    roomId: room.id,
  });

  console.log(`Room ${room.id} game over (wave ${room.wave})`);
}

export function startGameLoop(room) {
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
  clearWaveTimers(room);

  let lastTime = Date.now();

  room.gameLoopInterval = setInterval(() => {
    const now = Date.now();
    const dt = now - lastTime;
    lastTime = now;

    if (Object.keys(room.players).length === 0) return;
    processShooting(room);
    updateConsumables(room, dt);
    updateZombies(room, dt);
    updateFireZones(room);
    updateBullets(room, dt);
    checkCollisions(room);

    if (isRoomWiped(room)) {
      triggerGameOver(room);
      return;
    }

    checkWaveProgress(room);
    broadcastRoomState(room);
  }, 30);

  room.spawnCount = 0;
  room.spawnDelay = 3000;
  room.gamblingMode = false;
  room.gamblingVotes = new Set();
  room.gamblingCooldownWaves = 0;
  room.wave = 1;
  room.waveActive = false;
  room.waveSpawningComplete = false;
  room.waveSpawned = 0;
  room.waveTotal = 0;
  startWave(room);
}

export function stopGameLoop(room) {
  if (room.gameLoopInterval) {
    clearInterval(room.gameLoopInterval);
    room.gameLoopInterval = null;
  }
  clearWaveTimers(room);
}