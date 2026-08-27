import { state } from '../connection/gameState.js';
import { connect, sendPing } from '../connection/websocketManager.js';

export function createPrivateLobby() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) {
        document.getElementById('nameInput').focus();
        document.getElementById('nameInput').style.borderBottomColor = '#ff3c3c';
        setTimeout(() => document.getElementById('nameInput').style.borderBottomColor = 'var(--accent)', 800);
        return;
    }
    state.playerName = name;
    document.getElementById('createBtn').disabled = true;
    document.getElementById('createBtn').textContent = 'Connecting...';

    sessionStorage.removeItem('zombajaResumeToken');
    connect((ws) => {
        ws.send(JSON.stringify({ type: 'create_lobby', name: state.playerName }));
        document.getElementById('createBtn').disabled = false;
        document.getElementById('createBtn').textContent = 'Create private lobby';
        if (!state.pingInterval) {
            sendPing();
            state.pingInterval = setInterval(sendPing, 1000);
        }
    });
}

export function joinRandomGame() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) {
        document.getElementById('nameInput').focus();
        document.getElementById('nameInput').style.borderBottomColor = '#ff3c3c';
        setTimeout(() => document.getElementById('nameInput').style.borderBottomColor = 'var(--accent)', 800);
        return;
    }
    state.playerName = name;
    document.getElementById('randomBtn').disabled = true;
    document.getElementById('randomBtn').textContent = 'Connecting...';

    sessionStorage.removeItem('zombajaResumeToken');
    connect((ws) => {
        ws.send(JSON.stringify({ type: 'join_public', name: state.playerName }));
        document.getElementById('randomBtn').disabled = false;
        document.getElementById('randomBtn').textContent = 'Join random public game';
        if (!state.pingInterval) {
            sendPing();
            state.pingInterval = setInterval(sendPing, 1000);
        }
    });
}

export function joinGame() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) {
        document.getElementById('nameInput').focus();
        document.getElementById('nameInput').style.borderBottomColor = '#ff3c3c';
        setTimeout(() => document.getElementById('nameInput').style.borderBottomColor = 'var(--accent)', 800);
        return;
    }
    const code = document.getElementById('codeInput').value.trim();
    if (!code) {
        document.getElementById('codeInput').focus();
        document.getElementById('codeInput').style.borderBottomColor = '#ff3c3c';
        setTimeout(() => document.getElementById('codeInput').style.borderBottomColor = 'var(--accent)', 800);
        return;
    }
    state.playerName = name;
    document.getElementById('codeBtn').disabled = true;
    document.getElementById('codeBtn').textContent = 'Joining...';

    sessionStorage.removeItem('zombajaResumeToken');
    connect((ws) => {
        ws.send(JSON.stringify({ type: 'join', name: state.playerName, code }));
        document.getElementById('codeBtn').disabled = false;
        document.getElementById('codeBtn').textContent = 'Join existing lobby';
        if (!state.pingInterval) {
            sendPing();
            state.pingInterval = setInterval(sendPing, 1000);
        }
    });
}
/*
document.getElementById('nameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') joinRandomGame();
});*/

window.createPrivateLobby = createPrivateLobby;
window.joinRandomGame = joinRandomGame;
window.joinGame = joinGame;
