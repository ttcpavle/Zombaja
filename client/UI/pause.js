let pauseOpen = false;

export function isPauseOpen() {
  return pauseOpen;
}

export function openPause() {
  pauseOpen = true;
  document.getElementById("pauseOverlay").classList.add("visible");
}

export function closePause() {
  pauseOpen = false;
  document.getElementById("pauseOverlay").classList.remove("visible");
}

document.getElementById("resumeBtn")?.addEventListener("click", closePause);

document.getElementById("leaveGameBtn")?.addEventListener("click", () => {
  closePause();
  window.leaveRoom();
});
