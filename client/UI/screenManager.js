const canvas = document.getElementById('game');

export function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'gameScreen' && canvas) {
        setTimeout(() => canvas.focus(), 50);
    }
}