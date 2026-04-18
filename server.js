import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer((req, res) => {
    // Basic routing for the index.html
    const filePath = path.join(__dirname, 'client', 'index.html');
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(500);
            res.end('Error loading index.html');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
    });
});

const wss = new WebSocketServer({ server });

// ============================
// GAME DATA & OBSTACLES
// ============================
let players = {};
let zombies = [];
let bullets = [];
const walls = [
    { x: 150, y: 150, w: 100, h: 20 },
    { x: 400, y: 100, w: 20, h: 150 },
    { x: 500, y: 400, w: 200, h: 20 },
    { x: 200, y: 400, w: 20, h: 100 }
];

let playerIdCounter = 1;
let bulletIdCounter = 1;

// Collision Helper
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
// GAME LOOP (Lowered to 30ms for smoother sync)
// ============================
setInterval(() => {
    updateZombies();
    updateBullets();
    checkCollisions();
    broadcastGameState();
}, 30);

// ============================
// SPAWN ZOMBIES (ONLY IF PLAYERS EXIST)
// ============================
setInterval(() => {
  // Object.keys(players).length checks if the players object is empty
  if (Object.keys(players).length > 0) {
    spawnZombie();
  } else {
    // If no one is online, clear the zombies so the next player 
    // doesn't walk into a room with 5,000 zombies.
    zombies = []; 
  }
}, 3000);

wss.on('connection', (ws) => {
    const playerId = playerIdCounter++;
    players[playerId] = {
        id: playerId,
        x: 50, y: 50,
        health: 100,
        alive: true,
        score: 0
    };

    // Send initial config including walls
    ws.send(JSON.stringify({ type: 'init', playerId, walls }));

    ws.on('message', (msg) => {
        const data = JSON.parse(msg);
        const p = players[playerId];
        if (!p || !p.alive) return;

        if (data.type === 'move') {
            const nextX = p.x + data.dx;
            const nextY = p.y + data.dy;

            // Check boundaries & walls
            if (!checkWallCollision(nextX, p.y, 20)) {
                p.x = Math.max(0, Math.min(780, nextX));
            }
            if (!checkWallCollision(p.x, nextY, 20)) {
                p.y = Math.max(0, Math.min(580, nextY));
            }
        }

        if (data.type === 'shoot') {
            bullets.push({
                id: bulletIdCounter++,
                x: data.x, y: data.y,
                dx: data.dx, dy: data.dy,
                speed: 8,
                owner: playerId
            });
        }
    });

    ws.on('close', () => { delete players[playerId]; });
});

// ============================
// LOGIC (Zombies now respect walls)
// ============================
function spawnZombie() {
    zombies.push({ x: 750, y: Math.random() * 550, speed: 1.2, health: 2 });
}

function updateZombies() {
    zombies.forEach(z => {
        const alivePlayers = Object.values(players).filter(p => p.alive);
        if (alivePlayers.length === 0) return;

        const target = alivePlayers[0]; 
        const dx = target.x - z.x;
        const dy = target.y - z.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const moveX = (dx / dist) * z.speed;
            const moveY = (dy / dist) * z.speed;
            
            // Zombie wall avoidance (simple)
            if (!checkWallCollision(z.x + moveX, z.y, 20)) z.x += moveX;
            if (!checkWallCollision(z.x, z.y + moveY, 20)) z.y += moveY;
        }

        if (dist < 20) {
            target.health -= 0.5;
            if (target.health <= 0 && target.alive) {
                target.alive = false;
                setTimeout(() => {
                    target.x = 50; target.y = 50;
                    target.health = 100; target.alive = true;
                }, 3000);
            }
        }
    });
}

function updateBullets() {
    bullets.forEach(b => {
        b.x += b.dx * b.speed;
        b.y += b.dy * b.speed;
        // Kill bullet if it hits a wall
        if (checkWallCollision(b.x, b.y, 5)) b.dead = true;
    });
    bullets = bullets.filter(b => !b.dead && b.x > 0 && b.x < 800 && b.y > 0 && b.y < 600);
}

function checkCollisions() {
    bullets.forEach(b => {
        zombies.forEach((z, zi) => {
            const dist = Math.sqrt((b.x - z.x)**2 + (b.y - z.y)**2);
            if (dist < 20) {
                z.health -= 1;
                b.dead = true;
                if (z.health <= 0) {
                    zombies.splice(zi, 1);
                    if (players[b.owner]) players[b.owner].score++;
                }
            }
        });
    });
}

function broadcastGameState() {
    const state = JSON.stringify({ type: 'state', players, zombies, bullets });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(state);
    });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});