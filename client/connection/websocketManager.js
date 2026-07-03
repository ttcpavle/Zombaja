import { showScreen } from '../UI/screenManager.js';
import { state, syncGameState } from './gameState.js';
import { updateLobbyPlayers, updatePingDisplay } from '../UI/lobby.js';

export function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    state.ws = new WebSocket(`${proto}://${location.host}`);

    state.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);

        if (data.type === 'notJoined') {
            document.getElementById('codeInput').value = 'ne valja kod!!';
            return;
        }

        if (data.type === 'joined') {
            state.playerId = data.playerId;
            state.roomId = data.roomId;
            state.roomOwnerId = data.ownerId ?? null;
            state.walls = data.walls;
            document.getElementById('roomBadge').textContent = `ROOM #${state.roomId}`;
            document.getElementById('roomCode').textContent = data.roomType === 'private' ? `Code: ${data.roomCode}` : '';
            updateLobbyPlayers(data.players, data.ownerId, data.roomType);
            showScreen('lobbyScreen');
            return;
        }

        if (data.type === 'lobby_update') {
            state.roomOwnerId = data.ownerId ?? state.roomOwnerId;
            updateLobbyPlayers(data.players, data.ownerId, data.roomType);
            return;
        }

        if (data.type === 'pong') {
            const now = Date.now();
            state.currentPing = Math.max(0, now - (data.sentAt || now));
            updatePingDisplay();
            return;
        }

        if (data.type === 'game_started') {
            showScreen('gameScreen');
            return;
        }

        if (data.type === 'state') {
            syncGameState(data);
            return;
        }
    };

    state.ws.onclose = () => {
        showScreen('menuScreen');
        state.playerId = null;
        state.roomId = null;
        state.walls = [];
        state.gameState = { players: {}, zombies: [], bullets: [] };
        document.getElementById('roomCode').textContent = '';
        clearInterval(state.pingInterval);
        state.pingInterval = null;
        state.currentPing = null;
        updatePingDisplay();
    };
}

export function sendPing() {
    if (!state.ws || state.ws.readyState !== 1) return;
    state.ws.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
}
