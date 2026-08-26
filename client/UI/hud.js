import { state } from "../connection/gameState.js";

const WEAPON_ORDER = ["pistol", "shotgun", "rifle", "granata"];
const WEAPON_HOTKEYS = ["1", "2", "3", "4"];
const CONSUMABLE_ORDER = ["medkit", "adrenalin", "spas"];
const CONSUMABLE_HOTKEYS = { medkit: "Q", adrenalin: "R", spas: "T" };
const CONSUMABLE_LABELS = { medkit: "Medkit", adrenalin: "Adrenalin", spas: "SPAS Pilula" };

const ICONS = {
  pistol: `<rect x="6" y="14" width="16" height="6" rx="1" fill="currentColor"></rect><rect x="20" y="10" width="6" height="4" rx="1" fill="currentColor"></rect><rect x="9" y="20" width="5" height="8" rx="1" fill="currentColor"></rect>`,
  shotgun: `<rect x="3" y="15" width="24" height="4" rx="1" fill="currentColor"></rect><rect x="25" y="13" width="5" height="8" rx="1" fill="currentColor"></rect><rect x="6" y="19" width="4" height="7" rx="1" fill="currentColor"></rect>`,
  rifle: `<rect x="3" y="16" width="26" height="3" rx="1" fill="currentColor"></rect><rect x="6" y="19" width="12" height="3" rx="1" fill="currentColor"></rect><rect x="10" y="22" width="4" height="6" rx="1" fill="currentColor"></rect>`,
  granata: `<circle cx="16" cy="19" r="9" fill="currentColor"></circle><rect x="13" y="6" width="6" height="6" rx="1" fill="currentColor"></rect><rect x="19" y="4" width="6" height="2" rx="1" fill="currentColor" transform="rotate(-30 19 4)"></rect>`,
  medkit: `<rect x="4" y="9" width="24" height="18" rx="2" fill="currentColor"></rect><rect x="13" y="13" width="6" height="10" fill="#0a0a0a"></rect><rect x="9" y="17" width="14" height="6" fill="#0a0a0a"></rect>`,
  adrenalin: `<rect x="12" y="6" width="8" height="14" rx="1" fill="currentColor"></rect><rect x="14" y="2" width="4" height="5" fill="currentColor"></rect><rect x="15" y="20" width="2" height="8" fill="currentColor"></rect><rect x="12" y="24" width="8" height="2" fill="currentColor"></rect>`,
  spas: `<ellipse cx="16" cy="16" rx="12" ry="7.5" transform="rotate(45 16 16)" fill="currentColor"></ellipse><circle cx="12" cy="13" r="1.6" fill="#0a0a0a"></circle><circle cx="20" cy="19" r="1.6" fill="#0a0a0a"></circle>`,
};

function iconSvg(name) {
  return `<svg viewBox="0 0 32 32" class="icon-glyph">${ICONS[name] || ""}</svg>`;
}

function buildWeaponSlot(name, index) {
  const slot = document.createElement("div");
  slot.className = "action-slot weapon-slot";
  slot.title = name;
  slot.innerHTML = `
    <div class="slot-key">${WEAPON_HOTKEYS[index]}</div>
    ${iconSvg(name)}
    <div class="slot-count w-ammo-count"></div>
  `;
  slot.addEventListener("click", () => {
    if (window.setWeaponFromHud) window.setWeaponFromHud(index);
  });
  return slot;
}

function buildConsumableSlot(name) {
  const slot = document.createElement("div");
  slot.className = "action-slot consumable-slot";
  slot.title = `${CONSUMABLE_LABELS[name]} [${CONSUMABLE_HOTKEYS[name]}]`;
  slot.innerHTML = `
    <div class="slot-key">${CONSUMABLE_HOTKEYS[name]}</div>
    ${iconSvg(name)}
    <div class="slot-count"></div>
  `;
  slot.addEventListener("click", () => {
    if (window.useConsumableFromHud) window.useConsumableFromHud(name);
  });
  return slot;
}

let built = false;
const weaponSlotEls = {};
const consumableSlotEls = {};

function ensureBuilt() {
  if (built) return;
  const weaponContainer = document.getElementById("weaponIcons");
  const consumableContainer = document.getElementById("consumableIcons");
  if (!weaponContainer || !consumableContainer) return;

  WEAPON_ORDER.forEach((name, i) => {
    const el = buildWeaponSlot(name, i);
    weaponContainer.appendChild(el);
    weaponSlotEls[name] = el;
  });
  CONSUMABLE_ORDER.forEach((name) => {
    const el = buildConsumableSlot(name);
    consumableContainer.appendChild(el);
    consumableSlotEls[name] = el;
  });
  built = true;
}

export function renderActionBar(me) {
  ensureBuilt();
  if (!me) return;

  WEAPON_ORDER.forEach((name, i) => {
    const el = weaponSlotEls[name];
    if (!el) return;
    const st = me.weapons ? me.weapons[name] : null;
    const owned = !!(st && st.owned);
    el.classList.toggle("owned", owned);
    el.classList.toggle("selected", me.gunIndex === i);
    const countEl = el.querySelector(".slot-count");
    if (!owned) countEl.textContent = "";
    else countEl.textContent = st.ammo === Infinity ? "∞" : Math.max(0, Math.floor(st.ammo));
  });

  CONSUMABLE_ORDER.forEach((name) => {
    const el = consumableSlotEls[name];
    if (!el) return;
    const inv = me.consumables ? me.consumables[name] : null;
    const count = inv ? inv.count : 0;
    el.classList.toggle("available", count > 0);
    el.classList.toggle("channeling", !!(me.channeling && me.channeling.type === name));
    const countEl = el.querySelector(".slot-count");
    countEl.textContent = count;
  });

  const barFill = document.getElementById("adrenalineBarFill");
  if (barFill) {
    const pct = Math.round((me.adrenalineBar || 0) * 100);
    barFill.style.width = `${pct}%`;
  }
}

let toastTimeout = null;
export function showToast(text) {
  const el = document.getElementById("toastBanner");
  if (!el) return;
  el.textContent = text;
  el.classList.add("visible");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("visible"), 3500);
}