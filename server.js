import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer((req, res) => {
    const filePath = path.join(__dirname, 'client', 'index.html');
    fs.readFile(filePath, (err, content) => {
        if (err) { res.writeHead(500); res.end('Error loading index.html'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
    });
});

const wss = new WebSocketServer({ server });

// ============================
// CONSTANTS
// ============================
const MAX_PLAYERS_PER_ROOM = 4;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const walls = [
    { x: 150, y: 150, w: 100, h: 20 },
    { x: 400, y: 100, w: 20, h: 150 },
    { x: 500, y: 400, w: 200, h: 20 },
    { x: 200, y: 400, w: 20, h: 100 }
];

const SPAWN_POINTS = [
    { x: 50, y: 50 },
    { x: 730, y: 50 },
    { x: 50, y: 530 },
    { x: 730, y: 530 }
];

// ============================
// ROOM MANAGEMENT
// ============================
let rooms = {};       // roomId -> room object
let playerRoom = {};  // playerId -> roomId
let playerWs = {};    // playerId -> ws

let roomIdCounter = 1;
let playerIdCounter = 1;
let bulletIdCounter = 1;

function createRoom() {
    const roomId = roomIdCounter++;
    rooms[roomId] = {
        id: roomId,
        state: 'lobby',   // 'lobby' | 'playing'
        players: {},
        zombies: [],
        bullets: [],
        zombieSpawnInterval: null,
        gameLoopInterval: null
    };
    console.log(`Room ${roomId} created`);
    return rooms[roomId];
}

function findAvailableRoom() {
    // Find a lobby room with space
    for (const room of Object.values(rooms)) {
        if (room.state === 'lobby' && Object.keys(room.players).length < MAX_PLAYERS_PER_ROOM) {
            return room;
        }
    }
    // No available room — create one
    return createRoom();
}

function getRoomPlayerCount(room) {
    return Object.keys(room.players).length;
}

// ============================
// COLLISION HELPERS
// ============================
function isColliding(rect1, rect2) {
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

function checkWallCollision(x, y, size) {
    return walls.some(wall => isColliding({ x, y, w: size, h: size }, wall));
}

// ============================
// GAME LOOP PER ROOM
// ============================
function startGameLoop(room) {
    if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
    if (room.zombieSpawnInterval) clearInterval(room.zombieSpawnInterval);

    room.gameLoopInterval = setInterval(() => {
        if (Object.keys(room.players).length === 0) return;
        updateZombies(room);
        updateBullets(room);
        checkCollisions(room);
        broadcastRoomState(room);
    }, 30);

    room.zombieSpawnInterval = setInterval(() => {
        if (Object.keys(room.players).length > 0) {
            spawnZombie(room);
        } else {
            room.zombies = [];
        }
    }, 3000);
}

function stopGameLoop(room) {
    if (room.gameLoopInterval) { clearInterval(room.gameLoopInterval); room.gameLoopInterval = null; }
    if (room.zombieSpawnInterval) { clearInterval(room.zombieSpawnInterval); room.zombieSpawnInterval = null; }
}

// ============================
// GAME LOGIC
// ============================
function spawnZombie(room) {
    const edges = [
        { x: Math.random() * GAME_WIDTH, y: 0 },
        { x: Math.random() * GAME_WIDTH, y: GAME_HEIGHT - 20 },
        { x: 0, y: Math.random() * GAME_HEIGHT },
        { x: GAME_WIDTH - 20, y: Math.random() * GAME_HEIGHT },
    ];
    const pos = edges[Math.floor(Math.random() * edges.length)];
    room.zombies.push({ x: pos.x, y: pos.y, speed: 1.2, health: 2 });
}

function updateZombies(room) {
    const alivePlayers = Object.values(room.players).filter(p => p.alive);
    if (alivePlayers.length === 0) return;

    room.zombies.forEach(z => {
        // Target nearest player
        let nearest = alivePlayers[0];
        let nearestDist = Infinity;
        alivePlayers.forEach(p => {
            const d = Math.hypot(p.x - z.x, p.y - z.y);
            if (d < nearestDist) { nearestDist = d; nearest = p; }
        });

        const dx = nearest.x - z.x;
        const dy = nearest.y - z.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const moveX = (dx / dist) * z.speed;
            const moveY = (dy / dist) * z.speed;
            if (!checkWallCollision(z.x + moveX, z.y, 20)) z.x += moveX;
            if (!checkWallCollision(z.x, z.y + moveY, 20)) z.y += moveY;
        }

        if (dist < 20) {
            nearest.health -= 0.5;
            if (nearest.health <= 0 && nearest.alive) {
                nearest.alive = false;
                setTimeout(() => {
                    nearest.x = SPAWN_POINTS[0].x;
                    nearest.y = SPAWN_POINTS[0].y;
                    nearest.health = 100;
                    nearest.alive = true;
                }, 3000);
            }
        }
    });
}

function updateBullets(room) {
    room.bullets.forEach(b => {
        b.x += b.dx * b.speed;
        b.y += b.dy * b.speed;
        if (checkWallCollision(b.x, b.y, 5)) b.dead = true;
    });
    room.bullets = room.bullets.filter(b => !b.dead && b.x > 0 && b.x < GAME_WIDTH && b.y > 0 && b.y < GAME_HEIGHT);
}

function checkCollisions(room) {
    room.bullets.forEach(b => {
        room.zombies.forEach((z, zi) => {
            const dist = Math.hypot(b.x - z.x, b.y - z.y);
            if (dist < 20) {
                z.health -= 1;
                b.dead = true;
                if (z.health <= 0) {
                    room.zombies.splice(zi, 1);
                    if (room.players[b.owner]) room.players[b.owner].score++;
                }
            }
        });
    });
}

// ============================
// BROADCAST HELPERS
// ============================
function broadcastToRoom(room, message) {
    const str = JSON.stringify(message);
    Object.keys(room.players).forEach(pid => {
        const ws = playerWs[pid];
        if (ws && ws.readyState === 1) ws.send(str);
    });
}

function broadcastRoomState(room) {
    broadcastToRoom(room, {
        type: 'state',
        players: room.players,
        zombies: room.zombies,
        bullets: room.bullets
    });
}

function broadcastLobbyUpdate(room) {
    broadcastToRoom(room, {
        type: 'lobby_update',
        roomId: room.id,
        players: Object.values(room.players).map(p => ({ id: p.id, name: p.name }))
    });
}

// ============================
// WEBSOCKET CONNECTIONS
// ============================
wss.on('connection', (ws) => {
    let playerId = null;

    ws.on('message', (msg) => {
        const data = JSON.parse(msg);

        // ---- JOIN: assign player to a room ----
        if (data.type === 'join') {
            playerId = playerIdCounter++;
            playerWs[playerId] = ws;

            const room = findAvailableRoom();
            const spawnIdx = getRoomPlayerCount(room) % SPAWN_POINTS.length;
            const spawn = SPAWN_POINTS[spawnIdx];

            room.players[playerId] = {
                id: playerId,
                name: data.name || `Player${playerId}`,
                x: spawn.x, y: spawn.y,
                health: 100,
                alive: true,
                score: 0
            };
            playerRoom[playerId] = room.id;

            // Confirm join to this player
            ws.send(JSON.stringify({
                type: 'joined',
                playerId,
                roomId: room.id,
                walls,
                roomState: room.state,
                players: Object.values(room.players).map(p => ({ id: p.id, name: p.name }))
            }));

            // Notify everyone in lobby
            broadcastLobbyUpdate(room);
            console.log(`Player ${playerId} (${data.name}) joined room ${room.id}`);
            return;
        }

        // All subsequent messages require playerId to be set
        if (!playerId) return;

        const room = rooms[playerRoom[playerId]];
        if (!room) return;
        const p = room.players[playerId];

        // ---- START GAME ----
        if (data.type === 'start_game') {
            if (room.state === 'lobby') {
                room.state = 'playing';
                startGameLoop(room);
                broadcastToRoom(room, { type: 'game_started' });
                console.log(`Room ${room.id} game started`);
            }
            return;
        }

        // ---- IN-GAME ACTIONS ----
        if (room.state !== 'playing') return;
        if (!p || !p.alive) return;

        if (data.type === 'move') {
            const nextX = p.x + data.dx;
            const nextY = p.y + data.dy;
            if (!checkWallCollision(nextX, p.y, 20)) p.x = Math.max(0, Math.min(GAME_WIDTH - 20, nextX));
            if (!checkWallCollision(p.x, nextY, 20)) p.y = Math.max(0, Math.min(GAME_HEIGHT - 20, nextY));
        }

        if (data.type === 'shoot') {
            room.bullets.push({
                id: bulletIdCounter++,
                x: data.x, y: data.y,
                dx: data.dx, dy: data.dy,
                speed: 8,
                owner: playerId
            });
        }
    });

    ws.on('close', () => {
        if (!playerId) return;
        const roomId = playerRoom[playerId];
        const room = rooms[roomId];
        if (room) {
            delete room.players[playerId];
            console.log(`Player ${playerId} left room ${roomId}`);

            if (room.state === 'lobby') {
                broadcastLobbyUpdate(room);
            }

            // Clean up empty rooms
            if (Object.keys(room.players).length === 0) {
                stopGameLoop(room);
                delete rooms[roomId];
                console.log(`Room ${roomId} removed (empty)`);
            }
        }
        delete playerRoom[playerId];
        delete playerWs[playerId];
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));