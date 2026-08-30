import { state } from '../connection/gameState.js';
import { connect, sendPing } from '../connection/websocketManager.js';
import { showScreen } from './screenManager.js';
import { unmountRoulette } from '../UI/roulette.js';

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

// Zove se sa game-over ekrana - potpuno nova javna soba, nasumicni saigraci.
// NAPOMENA: gasi staru ws konekciju i odmah otvara novu; postoji teorijska
// trka gde stari onclose handler (koji resetuje state.playerId/roomId/...)
// moze da se izvrsi tek POSLE sto nova konekcija vec dobije "joined" odgovor,
// sto moze izazvati kratak vizuelni "trzaj" nazad ka meniju. Bezopasno, samo kozmeticki.
export function quickGame() {
    unmountRoulette();
    state.intentionalClose = true;
    sessionStorage.removeItem('zombajaResumeToken');
    const name = state.playerName;
    if (state.ws) state.ws.close();
    connect();
    state.ws.onopen = () => {
        state.ws.send(JSON.stringify({ type: 'join_public', name }));
        if (!state.pingInterval) {
            sendPing();
            state.pingInterval = setInterval(sendPing, 1000);
        }
    };
}

// Zove se sa game-over ekrana - vraca te u ISTU sobu (po roomId) da bi
// mogao da sacekas/igras opet sa istim ljudima koji takodje kliknu ovo.
export function playAgainSamePlayers() {
    unmountRoulette();
    const roomId = state.roomId;
    const name = state.playerName;
    const oldWs = state.ws;

    function proceedWithRejoin() {
        connect();
        state.ws.onopen = () => {
            state.ws.send(JSON.stringify({ type: 'rejoin_room', roomId, name }));
            if (!state.pingInterval) {
                sendPing();
                state.pingInterval = setInterval(sendPing, 1000);
            }
        };
    }

    sessionStorage.removeItem('zombajaResumeToken');

    if (!oldWs || oldWs.readyState !== 1) {
        proceedWithRejoin();
        return;
    }

    let settled = false;

    const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        proceedWithRejoin();
    }, 1000);

    oldWs.addEventListener('close', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        proceedWithRejoin();
    });

    // Oznaci kao namerno zatvaranje da websocketManager-ov onclose ne pokusa
    // svoj auto-reconnect za OVU konekciju (mi rucno vodimo rejoin).
    state.intentionalClose = true;
    oldWs.close();
}
export function backToMainMenu() {
    unmountRoulette();
    state.intentionalClose = true;
    sessionStorage.removeItem('zombajaResumeToken');
    if (state.ws) state.ws.close();
    showScreen('menuScreen');
}

window.createPrivateLobby = createPrivateLobby;
window.joinRandomGame = joinRandomGame;
window.joinGame = joinGame;
window.quickGame = quickGame;
window.playAgainSamePlayers = playAgainSamePlayers;
window.backToMainMenu = backToMainMenu;