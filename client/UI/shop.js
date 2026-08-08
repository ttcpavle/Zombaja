import { state } from "../connection/gameState.js";

function upgradeCostAtLevel(cfg, level) {
  return Math.round(cfg.upgradeCostBase * Math.pow(cfg.upgradeCostGrowth, level));
}

let shopOpen = false;
const weaponRowElements = {};   // ime oruzja -> reference na DOM elemente, prave se SAMO JEDNOM

function me() {
  return state.gameState.players[state.playerId];
}

export function isInShopZone() {
  const p = me();
  if (!p || !state.shopZone) return false;
  const z = state.shopZone;
  return (
    p.x < z.x + z.w && p.x + 20 > z.x &&
    p.y < z.y + z.h && p.y + 20 > z.y
  );
}

export function isShopOpen() {
  return shopOpen;
}

export function openShop() {
  shopOpen = true;
  document.getElementById("shopOverlay").classList.add("visible");
  renderShop();
}

export function closeShop() {
  shopOpen = false;
  document.getElementById("shopOverlay").classList.remove("visible");
}

export function updateShopPrompt() {
  const prompt = document.getElementById("shopPrompt");
  if (!prompt) return;
  prompt.classList.toggle("visible", !shopOpen && isInShopZone());
}

function sendShopAction(type, weapon) {
  if (!state.ws || state.ws.readyState !== 1) return;
  state.ws.send(JSON.stringify({ type, weapon }));
}

// Pravi DOM strukturu za jedno oruzje SAMO PRVI PUT - posle toga se element
// nikad ne brise, samo mu se menja tekst/disabled. Zato klik uvek "pogadja"
// isti element, bez obzira koliko cesto zovemo renderShop().
function buildRow(name) {
  const row = document.createElement("div");
  row.className = "weapon-row";
  row.innerHTML = `
    <div class="weapon-top">
      <div class="weapon-name">
        <span class="w-name"></span> <span class="w-level" style="color:var(--muted)"></span>
      </div>
      <div class="weapon-stat">AMMO <b class="w-ammo"></b></div>
    </div>
    <div class="weapon-actions">
      <button class="shop-btn" data-weapon="${name}"></button>
      <button class="shop-btn secondary" data-weapon="${name}"></button>
    </div>
  `;
  document.getElementById("weaponList").appendChild(row);

  const refs = {
    row,
    nameEl: row.querySelector(".w-name"),
    levelEl: row.querySelector(".w-level"),
    ammoEl: row.querySelector(".w-ammo"),
    primaryBtn: row.querySelector(".shop-btn:not(.secondary)"),
    secondaryBtn: row.querySelector(".shop-btn.secondary"),
  };
  weaponRowElements[name] = refs;
  return refs;
}

function updateRow(name, cfg, st, player) {
  const refs = weaponRowElements[name] || buildRow(name);

  refs.nameEl.textContent = name;
  refs.levelEl.textContent = st.owned ? `Lv.${st.level}` : "";
  refs.ammoEl.textContent = cfg.infiniteAmmo ? "∞" : st.owned ? st.ammo : "—";

  if (!st.owned) {
    refs.primaryBtn.dataset.action = "buy_weapon";
    refs.primaryBtn.textContent = `Kupi — ${cfg.unlockCost}`;
    refs.primaryBtn.disabled = player.currency < cfg.unlockCost;
    refs.secondaryBtn.style.display = "none";
  } else {
    const atMax = st.level >= cfg.maxLevel;
    const cost = upgradeCostAtLevel(cfg, st.level);
    refs.primaryBtn.dataset.action = "upgrade_weapon";
    refs.primaryBtn.textContent = atMax ? "MAX LEVEL" : `Upgrade — ${cost}`;
    refs.primaryBtn.disabled = atMax || player.currency < cost;

    if (cfg.infiniteAmmo) {
      refs.secondaryBtn.style.display = "none";
    } else {
      refs.secondaryBtn.style.display = "";
      refs.secondaryBtn.dataset.action = "buy_ammo";
      refs.secondaryBtn.textContent = `+${cfg.ammoPerBuy} met. — ${cfg.ammoCost}`;
      refs.secondaryBtn.disabled = player.currency < cfg.ammoCost;
    }
  }
}

export function renderShop() {
  const player = me();
  const currencyEl = document.getElementById("shopCurrency");
  if (!player || !currencyEl) return;

  currencyEl.textContent = player.currency;

  Object.keys(state.weaponConfig).forEach((name) => {
    updateRow(name, state.weaponConfig[name], player.weapons[name], player);
  });
}

// Event delegation - JEDAN listener, zauvek, na roditelju koji se nikad ne brise.
document.getElementById("weaponList")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  sendShopAction(btn.dataset.action, btn.dataset.weapon);
});

document.getElementById("closeShopBtn")?.addEventListener("click", closeShop);