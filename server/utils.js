import { walls } from "./world/map.js";

export function isColliding(rect1, rect2) {
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

export function checkWallCollision(x, y, size) {
    return walls.some(wall => isColliding({ x, y, w: size, h: size }, wall));
}