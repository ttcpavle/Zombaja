const canvas = document.getElementById('game');
const gameWrapper = document.getElementById('gameWrapper');

function fitGameWrapper() {
    if (!gameWrapper) return;
    const scale = Math.min(1, window.innerWidth / 1280, window.innerHeight / 720);
    gameWrapper.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitGameWrapper);
fitGameWrapper();

export function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'gameScreen' && canvas) {
        setTimeout(() => canvas.focus(), 50);
        fitGameWrapper();
    }
}