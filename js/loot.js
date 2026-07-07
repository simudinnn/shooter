import { WEAPONS, MELEE_WEAPONS } from './player.js';
import { weaponItemSpritePath } from './sprites.js';
import {
  AMMO_TYPES,
  AMMO_TYPE_KEYS,
  ammoSpritePath,
  getAmmoDisplayName,
  normalizeAmmoItem,
} from './ammo.js';
import {
  getMaterialDisplayName,
  materialSpritePath,
  normalizeMaterialItem,
} from './materials.js';

export const CHEST_SLOT_COUNT = 8;
export const CHEST_COLS = 4;
export const CHEST_ROWS = 2;

export const CHEST_VARIANTS = ['chest_wood', 'chest_metal', 'chest_rust', 'chest_moss'];

/** Crafting materials that chests can roll. */
export const CHEST_MATERIAL_KEYS = [
  'adhesive', 'chemicals', 'cloth', 'fabric', 'fuel', 'glass',
  'nails', 'plank', 'plastic', 'rope', 'rubber', 'tape', 'wood',
];

export const CHEST_KIT_KEYS = ['repair_kit', 'sewing_kit', 'splint_kit', 'upgrade_kit'];

const CHEST_LOOT_KEYS = [...CHEST_MATERIAL_KEYS, ...CHEST_KIT_KEYS];

export const LOOT_EMPTY_WEIGHT = 1000;

const RARITY_WEIGHT = {
  common: 50,
  uncommon: 40,
  rare: 30,
  epic: 20,
};

/** Min/max stack per slot and rarity tier for weighted rolls. */
const LOOT_ENTRIES = [
  { key: 'metal', rarity: 'common', min: 1, max: 2 },
  { key: 'plastic', rarity: 'common', min: 1, max: 2 },
  { key: 'fabric', rarity: 'common', min: 1, max: 2 },
  { key: 'glass', rarity: 'common', min: 1, max: 2 },
  { key: 'nails', rarity: 'common', min: 1, max: 2 },
  { key: 'wires', rarity: 'common', min: 1, max: 2 },
  { key: 'chemicals', rarity: 'common', min: 1, max: 2 },
  { key: 'cloth', rarity: 'common', min: 1, max: 1 },
  { key: 'wood', rarity: 'uncommon', min: 1, max: 2 },
  { key: 'adhesive', rarity: 'uncommon', min: 1, max: 2 },
  { key: 'plank', rarity: 'uncommon', min: 1, max: 2 },
  { key: 'rope', rarity: 'uncommon', min: 1, max: 2 },
  { key: 'rubber', rarity: 'uncommon', min: 1, max: 2 },
  { key: 'tape', rarity: 'uncommon', min: 1, max: 2 },
  { key: 'electrical_comp', rarity: 'uncommon', min: 1, max: 1 },
  { key: 'spring', rarity: 'uncommon', min: 1, max: 2 },
  { key: 'battery', rarity: 'uncommon', min: 1, max: 2 },
  { key: 'fuel', rarity: 'rare', min: 1, max: 1 },
  { key: 'copper_coil', rarity: 'rare', min: 1, max: 1 },
  { key: 'mechanical_comp', rarity: 'rare', min: 1, max: 1 },
  { key: 'microchip', rarity: 'rare', min: 1, max: 2 },
  { key: 'electrical_trans', rarity: 'rare', min: 1, max: 1 },
  { key: 'repair_kit', rarity: 'epic', min: 1, max: 1 },
  { key: 'sewing_kit', rarity: 'epic', min: 1, max: 1 },
  { key: 'splint_kit', rarity: 'epic', min: 1, max: 1 },
  { key: 'upgrade_kit', rarity: 'epic', min: 1, max: 1 },
  { key: 'military_comp', rarity: 'epic', min: 1, max: 1 },
];

const LOOT_ENTRY_BY_KEY = Object.fromEntries(LOOT_ENTRIES.map((e) => [e.key, e]));

const GUN_KEYS = Object.keys(WEAPONS);
const MELEE_KEYS = Object.keys(MELEE_WEAPONS);

/** Chest gear category weights (compete with materials + empty). */
const CHEST_GEAR_WEIGHT = {
  ammo: 22,
  bandage: 22,
  melee: 12,
  weapon: 8,
};

function rollMaterialAmount(entry) {
  return entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
}

function rollChestAmmoItem() {
  const ammoType = AMMO_TYPE_KEYS[Math.floor(Math.random() * AMMO_TYPE_KEYS.length)];
  const amount = 3 + Math.floor(Math.random() * 5);
  return normalizeAmmoItem({ kind: 'ammo', ammoType, amount });
}

function rollChestBandageItem() {
  return { kind: 'bandage', amount: 1 + Math.floor(Math.random() * 2) };
}

function rollChestMeleeItem() {
  const key = MELEE_KEYS[Math.floor(Math.random() * MELEE_KEYS.length)];
  return { kind: 'melee', key };
}

function rollChestWeaponItem() {
  const key = GUN_KEYS[Math.floor(Math.random() * GUN_KEYS.length)];
  const cfg = WEAPONS[key];
  return { kind: 'weapon', key, ammo: cfg?.magSize ?? 0 };
}

function buildChestLootOptions() {
  const options = [];
  for (const key of CHEST_LOOT_KEYS) {
    const entry = LOOT_ENTRY_BY_KEY[key];
    if (!entry) continue;
    options.push({
      weight: RARITY_WEIGHT[entry.rarity],
      roll: () => ({ kind: 'material', key: entry.key, amount: rollMaterialAmount(entry) }),
    });
  }
  options.push({ weight: CHEST_GEAR_WEIGHT.ammo, roll: rollChestAmmoItem });
  options.push({ weight: CHEST_GEAR_WEIGHT.bandage, roll: rollChestBandageItem });
  options.push({ weight: CHEST_GEAR_WEIGHT.melee, roll: rollChestMeleeItem });
  options.push({ weight: CHEST_GEAR_WEIGHT.weapon, roll: rollChestWeaponItem });
  return options;
}

let _chestLootOptions = null;

function getChestLootOptions() {
  if (!_chestLootOptions) _chestLootOptions = buildChestLootOptions();
  return _chestLootOptions;
}

/** One chest slot — empty, material, ammo, bandage, melee, or gun. */
export function rollChestLootSlot() {
  const options = getChestLootOptions();
  let total = LOOT_EMPTY_WEIGHT;
  for (const opt of options) total += opt.weight;

  let roll = Math.random() * total;
  roll -= LOOT_EMPTY_WEIGHT;
  if (roll <= 0) return null;

  for (const opt of options) {
    roll -= opt.weight;
    if (roll <= 0) return opt.roll();
  }
  return options[options.length - 1].roll();
}

/**
 * One slot roll for corpse pools — empty competes with each allowed material by rarity.
 * Returns null for an empty slot.
 */
export function rollWeightedLootSlot(allowedKeys) {
  const pool = allowedKeys
    .map((key) => LOOT_ENTRY_BY_KEY[key])
    .filter(Boolean);
  if (!pool.length) return null;

  let total = LOOT_EMPTY_WEIGHT;
  for (const entry of pool) {
    total += RARITY_WEIGHT[entry.rarity] ?? 1;
  }

  let roll = Math.random() * total;
  roll -= LOOT_EMPTY_WEIGHT;
  if (roll <= 0) return null;

  for (const entry of pool) {
    roll -= RARITY_WEIGHT[entry.rarity] ?? 1;
    if (roll <= 0) {
      return { kind: 'material', key: entry.key, amount: rollMaterialAmount(entry) };
    }
  }

  const fallback = pool[pool.length - 1];
  return { kind: 'material', key: fallback.key, amount: rollMaterialAmount(fallback) };
}

/** @deprecated alias */
export function rollWeightedMaterial(allowedKeys) {
  return rollWeightedLootSlot(allowedKeys);
}

export function rollChestVariant() {
  return CHEST_VARIANTS[Math.floor(Math.random() * CHEST_VARIANTS.length)];
}

/** Roll loot for one chest — uses Math.random so each deploy differs. */
export function rollChestLoot() {
  const slots = Array(CHEST_SLOT_COUNT).fill(null);
  for (let i = 0; i < CHEST_SLOT_COUNT; i++) {
    slots[i] = rollChestLootSlot();
  }
  return slots;
}

export function rollRandomChestItem() {
  return rollChestLootSlot();
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
  if (item.kind === 'material') {
    const normalized = normalizeMaterialItem(item);
    return getMaterialDisplayName(normalized.key, normalized.amount);
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
  if (item.kind === 'material') {
    const normalized = normalizeMaterialItem(item);
    return `${getMaterialDisplayName(normalized.key, 1)} — crafting material.`;
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
  if (item.kind === 'bandage') return 'assets/items/consumable/bandage.png';
  if (item.kind === 'material') return materialSpritePath(item.key);
  return '';
}

/** Sprite-bank key for drawing a dropped item in the world. */
export function getItemSpriteName(item) {
  if (!item) return null;
  if (item.kind === 'weapon') {
    const sprite = WEAPONS[item.key]?.sprite ?? item.key;
    return `item_${sprite}`;
  }
  if (item.kind === 'melee') {
    const sprite = MELEE_WEAPONS[item.key]?.sprite ?? item.key;
    return `item_${sprite}`;
  }
  if (item.kind === 'ammo') {
    const normalized = normalizeAmmoItem(item);
    return AMMO_TYPES[normalized.ammoType]?.sprite ?? 'pistol_ammo';
  }
  if (item.kind === 'bandage') return 'bandage';
  if (item.kind === 'material') return item.key;
  return null;
}

export function chestSpriteName(variant) {
  return CHEST_VARIANTS.includes(variant) ? variant : CHEST_VARIANTS[0];
}
