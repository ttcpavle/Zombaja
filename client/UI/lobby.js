import { showScreen } from './screenManager.js';
import { state } from '../connection/gameState.js';
import {
    PLAYER_COLORS
} from '../constants.js';
import { unmountRoulette } from '../UI/roulette.js';

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function updateLobbyPlayers(players, ownerId, roomType = 'private') {
    const list = document.getElementById('playerList');
    list.innerHTML = '';

    players.forEach(p => {
        if (state.playerColorMap[p.id] === undefined) {
            state.playerColorMap[p.id] = state.colorCounter++ % PLAYER_COLORS.length;
        }
        if (p.id == state.playerId) state.myReady = !!p.ready;
    });

    const MAX = 4;
    for (let i = 0; i < MAX; i++) {
        const p = players[i];
        const slot = document.createElement('div');
        if (p) {
            slot.className = 'player-slot';
            const colorIdx = state.playerColorMap[p.id] ?? 0;
            const isMe = p.id == state.playerId;
            const isOwner = ownerId != null && p.id == ownerId;
            slot.innerHTML = `
                <div class="player-icon" style="border-color:${PLAYER_COLORS[colorIdx]};color:${PLAYER_COLORS[colorIdx]}">
                    ${p.name.charAt(0).toUpperCase()}
                </div>
                <div class="player-name-lobby">${escHtml(p.name)}</div>
                ${isMe ? '<div class="you-tag">YOU</div>' : ''}
                ${roomType === 'private' && isMe ? `<button class="ready-toggle-btn${p.ready ? ' is-ready' : ''}" onclick="toggleReady()">${p.ready ? 'Ready' : 'Not Ready'}</button>` : ''}
                ${isOwner ? '<div class="owner-tag">Host</div>' : ''}
            `;
        } else {
            slot.className = 'slot-empty';
            slot.textContent = `[ Player ${i+1} ]`;
        }
        list.appendChild(slot);
    }
    const startBtn = document.getElementById('startBtn');
    const amOwner = state.playerId && ownerId && state.playerId == ownerId;
    if (roomType === 'public') {
        startBtn.style.display = 'none';
    } else if (amOwner) {
        startBtn.style.display = 'inline-block';
        const allReady = players.length > 0 && players.every(p => p.ready);
        startBtn.disabled = !allReady;
    } else {
        startBtn.style.display = 'none';
    }
}

export function renderGameOverResults(results, wave) {
    const list = document.getElementById('gameOverList');
    const waveEl = document.getElementById('goWave');
    if (waveEl) waveEl.textContent = wave ?? '--';
    if (!list) return;
    list.innerHTML = '';
    results.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'go-row';
        const isMe = r.id == state.playerId;
        row.innerHTML = `
            <div class="go-rank">#${i + 1}</div>
            <div class="go-name">${escHtml(r.name)}${isMe ? ' <span class="you-tag">YOU</span>' : ''}</div>
            <div class="go-score">${r.score}</div>
        `;
        list.appendChild(row);
    });
}

function toggleReady() {
    if (!state.ws || state.ws.readyState !== 1) return;
    state.ws.send(JSON.stringify({ type: 'set_ready', ready: !state.myReady }));
}

function startGame() {
    if (state.ws && state.ws.readyState === 1) {
        state.ws.send(JSON.stringify({ type: 'start_game' }));
    }
}

function leaveRoom() {
    unmountRoulette();
    state.intentionalClose = true;
    sessionStorage.removeItem('zombajaResumeToken');
    if (state.ws && state.ws.readyState === 1) {
        state.ws.send(JSON.stringify({ type: 'leave' }));
    }
    if (state.ws) state.ws.close();
    showScreen('menuScreen');
}

function updatePingDisplay() {
    const hudPing = document.getElementById('hudPing');
    if (!hudPing) return;
    const span = hudPing.querySelector('span');
    if (state.currentPing === null) {
        hudPing.className = 'hud-box hud-ping';
        span.textContent = '--';
        return;
    }
    span.textContent = `${state.currentPing}ms`;
    hudPing.className = 'hud-box hud-ping';
    if (state.currentPing < 50) {
        hudPing.classList.add('ping-good');
    } else if (state.currentPing <= 150) {
        hudPing.classList.add('ping-medium');
    } else {
        hudPing.classList.add('ping-bad');
    }
}

window.toggleReady = toggleReady;
window.startGame = startGame;
window.leaveRoom = leaveRoom;
export { updatePingDisplay };