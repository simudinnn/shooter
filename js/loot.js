import { WEAPONS, MELEE_WEAPONS } from './player.js';
import { weaponItemSpritePath } from './sprites.js';
import {
  AMMO_TYPE_KEYS,
  ammoSpritePath,
  getAmmoDisplayName,
  normalizeAmmoItem,
} from './ammo.js';

export const CHEST_SLOT_COUNT = 8;
export const CHEST_COLS = 4;
export const CHEST_ROWS = 2;

export const CHEST_VARIANTS = ['chest_wood', 'chest_metal', 'chest_rust', 'chest_moss'];

const GUN_KEYS = Object.keys(WEAPONS);
const MELEE_KEYS = Object.keys(MELEE_WEAPONS);

export function rollChestVariant() {
  return CHEST_VARIANTS[Math.floor(Math.random() * CHEST_VARIANTS.length)];
}

/** Roll loot for one chest — uses Math.random so each deploy differs. */
export function rollChestLoot() {
  const slots = Array(CHEST_SLOT_COUNT).fill(null);
  for (let i = 0; i < CHEST_SLOT_COUNT; i++) {
    slots[i] = rollRandomChestItem();
  }
  return slots;
}

export function rollRandomChestItem() {
  const roll = Math.random();
  if (roll < 0.10) {
    const ammoType = AMMO_TYPE_KEYS[Math.floor(Math.random() * AMMO_TYPE_KEYS.length)];
    const amount = 12 + Math.floor(Math.random() * 37);
    return normalizeAmmoItem({ kind: 'ammo', ammoType, amount });
  }
  if (roll < 0.20) {
    return { kind: 'bandage', amount: 1 + Math.floor(Math.random() * 3) };
  }
  if (roll < 0.25) {
    const key = GUN_KEYS[Math.floor(Math.random() * GUN_KEYS.length)];
    const cfg = WEAPONS[key];
    return { kind: 'weapon', key, ammo: cfg?.magSize ?? 0 };
  }
  if (roll < 0.32) {
    const key = MELEE_KEYS[Math.floor(Math.random() * MELEE_KEYS.length)];
    return { kind: 'melee', key };
  }
  return null;
}

export function getItemDisplayName(item) {
  if (!item) return '';
  if (item.kind === 'weapon') return WEAPONS[item.key]?.name ?? item.key;
  if (item.kind === 'melee') return MELEE_WEAPONS[item.key]?.name ?? item.key;
  if (item.kind === 'ammo') {
    const normalized = normalizeAmmoItem(item);
    return getAmmoDisplayName(normalized.ammoType, normalized.amount);
  }
  if (item.kind === 'bandage') {
    const n = item.amount ?? 1;
    return n > 1 ? `Bandage x${n}` : 'Bandage';
  }
  return '';
}

export function getItemDescription(item) {
  if (!item) return '';
  if (item.kind === 'weapon') {
    const w = WEAPONS[item.key];
    if (!w) return item.key;
    const mode = w.automatic ? 'Automatic' : 'Semi-auto';
    const ammo = item.ammo ?? w.magSize;
    return `${w.name} — ${mode}, ${w.damage} damage, ${ammo}/${w.magSize} in mag.`;
  }
  if (item.kind === 'melee') {
    const m = MELEE_WEAPONS[item.key];
    if (!m) return item.key;
    return `${m.name} — melee weapon, ${m.damage ?? '?'} damage.`;
  }
  if (item.kind === 'ammo') {
    const normalized = normalizeAmmoItem(item);
    return `${getAmmoDisplayName(normalized.ammoType, normalized.amount)} for reloading.`;
  }
  if (item.kind === 'bandage') {
    const n = item.amount ?? 1;
    return n > 1
      ? `${n} bandages. Each restores 30 HP.`
      : 'Bandage. Restores 30 HP when used.';
  }
  return '';
}

export function getItemIconSrc(item) {
  if (!item) return '';
  if (item.kind === 'weapon') return weaponItemSpritePath(WEAPONS[item.key]?.sprite ?? item.key);
  if (item.kind === 'melee') return weaponItemSpritePath(MELEE_WEAPONS[item.key]?.sprite ?? item.key);
  if (item.kind === 'ammo') {
    const normalized = normalizeAmmoItem(item);
    return ammoSpritePath(normalized.ammoType);
  }
  if (item.kind === 'bandage') return 'assets/items/bandage.png';
  return '';
}

export function chestSpriteName(variant) {
  return CHEST_VARIANTS.includes(variant) ? variant : CHEST_VARIANTS[0];
}
