import { isBlueprint, resolveBlueprint } from './blueprints.js';
import { isPack, isTieredItem, packTier, rollPackTier } from './containers.js';
import { content, contentKey, customWeapons } from './customContent.js';
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
  MATERIAL_KEYS,
  BASIC_MATERIAL_KEYS,
  getMaterialDisplayName,
  materialSpritePath,
  normalizeMaterialItem,
} from './materials.js';
import {
  consumableSpritePath,
  getConsumableDescription,
  getConsumableDisplayName,
  normalizeConsumableItem,
} from './consumables.js';
import {
  equipmentSpritePath,
  getEquipmentDescription,
  getEquipmentDisplayName,
  itemDurability,
  normalizeEquipmentItem,
} from './equipment.js';
import {
  getThrowableDescription,
  getThrowableDisplayName,
  normalizeThrowableItem,
  throwableSpritePath,
} from './throwables.js';

export const CHEST_SLOT_COUNT = 4;
export const CHEST_COLS = 4;
export const CHEST_ROWS = 2;

export const CHEST_VARIANTS = ['chest_wood', 'chest_metal', 'chest_rust', 'chest_moss'];

/** Crafting materials that chests can roll. */
export const CHEST_MATERIAL_KEYS = MATERIAL_KEYS.filter((key) => !key.endsWith('_kit'));

export const CHEST_KIT_KEYS = ['repair_kit', 'sewing_kit', 'upgrade_kit'];

const CHEST_LOOT_KEYS = [...CHEST_MATERIAL_KEYS, ...CHEST_KIT_KEYS];

export const LOOT_EMPTY_WEIGHT = 1600;

const RARITY_WEIGHT = {
  common: 35,
  uncommon: 14,
  rare: 4,
  epic: 1,
};

const materialLootWeight=entry=>(RARITY_WEIGHT[entry.rarity]??1)*(BASIC_MATERIAL_KEYS.includes(entry.key)?0.45:1)*({phone:2,jewlery:4,laptop:6,electrical_comp:1.5,military_comp:1.5}[entry.key]??1);

/** Min/max stack per slot and rarity tier for weighted rolls. */
const LOOT_ENTRIES = [
  { key: 'battery', rarity: 'uncommon', min: 1, max: 1 },
  { key: 'book', rarity: 'common', min: 1, max: 1 },
  { key: 'keycard', rarity: 'rare', min: 1, max: 1 },
  { key: 'key', rarity: 'epic', min: 1, max: 1 },
  { key: 'laptop', rarity: 'epic', min: 1, max: 1 },
  { key: 'phone', rarity: 'uncommon', min: 1, max: 1 },
  { key: 'barbed_wire', rarity: 'uncommon', min: 1, max: 1 },
  { key: 'gas_bottle', rarity: 'uncommon', min: 1, max: 1 },
  { key: 'generator', rarity: 'rare', min: 1, max: 1 },
  { key: 'radar', rarity: 'rare', min: 1, max: 1 },
  { key: 'jewlery', rarity: 'rare', min: 1, max: 1 },
  {
    "key": "blueprint",
    "rarity": "epic",
    "min": 1,
    "max": 1
  },
  {
    "key": "blueprint_old",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "fuel",
    "rarity": "uncommon",
    "min": 1,
    "max": 1
  },
  {
    "key": "military_comp",
    "rarity": "epic",
    "min": 1,
    "max": 1
  },
  {
    "key": "electrical_trans",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "electrical_comp",
    "rarity": "uncommon",
    "min": 1,
    "max": 1
  },
  {
    "key": "repair_kit",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "sewing_kit",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "splint_kit",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "upgrade_kit",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "equipment_pack",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "military_pack",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "archive_pack",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "industrial_pack",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "pistol_box",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "rifle_box",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "shotgun_box",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "sniper_box",
    "rarity": "rare",
    "min": 1,
    "max": 1
  },
  {
    "key": "cash",
    "rarity": "epic",
    "min": 1,
    "max": 8
  }
];

const LOOT_ENTRY_BY_KEY = Object.fromEntries(LOOT_ENTRIES.map((e) => [e.key, e]));

const GUN_KEYS = Object.keys(WEAPONS).filter((key) => !customWeapons[key]);
const MELEE_KEYS = Object.keys(MELEE_WEAPONS);

/** Chest gear category weights (compete with materials + empty). */
const CHEST_GEAR_WEIGHT = {
  ammo: 22,
  bandage: 22,
  melee: 2,
  weapon: 1,
};

const EQUIPMENT_LOOT_WEIGHTS = {
  backpack_1: 2, backpack2: 0.7, backpack3: 0.2,
  vest: 1.5, hunting_vest: 1, police_vest: 0.5, military_vest: 0.3,
};

function rollMaterialAmount(entry) {
  return entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
}

function rollChestAmmoItem() {
  const ammoType = AMMO_TYPE_KEYS[Math.floor(Math.random() * AMMO_TYPE_KEYS.length)];
  const amount = 5 + Math.floor(Math.random() * 8);
  return normalizeAmmoItem({ kind: 'ammo', ammoType, amount });
}

function rollChestBandageItem() {
  const pool = ['bandage', 'bandage', 'apple', 'apple', 'medkit', 'vaccine'];
  const key = pool[Math.floor(Math.random() * pool.length)];
  return { kind: 'consumable', key, amount: key === 'bandage' ? 1 + Math.floor(Math.random() * 2) : 1 };
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
      weight: materialLootWeight(entry),
      roll: () => resolveBlueprint({ kind: 'material', key: entry.key, amount: rollMaterialAmount(entry), ...((entry.key.endsWith('_pack')||entry.key==='keycard')?{tier:rollPackTier()}:{}) }),
    });
  }
  options.push({ weight: CHEST_GEAR_WEIGHT.ammo, roll: rollChestAmmoItem });
  options.push({ weight: CHEST_GEAR_WEIGHT.bandage, roll: rollChestBandageItem });
  options.push({ weight: CHEST_GEAR_WEIGHT.melee, roll: rollChestMeleeItem });
  options.push({ weight: CHEST_GEAR_WEIGHT.weapon, roll: rollChestWeaponItem });
  for (const [key, weight] of Object.entries(EQUIPMENT_LOOT_WEIGHTS)) {
    options.push({ weight, roll: () => ({ kind: 'equipment', key }) });
  }
  for (const entry of content.loot) {
    const key = contentKey(entry.group, entry.target);
    options.push({
      weight: entry.weight,
      roll: () => entry.group === 'weapons'
        ? { kind: 'weapon', key, ammo: WEAPONS[key].magSize }
        : { kind: 'material', key, amount: entry.amount },
    });
  }
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
    .filter((key) => MATERIAL_KEYS.includes(key))
    .map((key) => LOOT_ENTRY_BY_KEY[key])
    .filter(Boolean);
  if (!pool.length) return null;

  let total = LOOT_EMPTY_WEIGHT;
  for (const entry of pool) {
    total += materialLootWeight(entry);
  }

  let roll = Math.random() * total;
  roll -= LOOT_EMPTY_WEIGHT;
  if (roll <= 0) return null;

  for (const entry of pool) {
    roll -= materialLootWeight(entry);
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
export function rollChestLoot(variant = 'chest_wood') {
  const slots = Array(CHEST_SLOT_COUNT).fill(null);
  for (let i = 0; i < CHEST_SLOT_COUNT; i++) {
    slots[i] = rollChestLootSlot();
  }
  if (variant==='chest_crate') {
    const valuable=()=>({kind:'material',key:['repair_kit','sewing_kit','electrical_comp','fuel','industrial_pack'][Math.floor(Math.random()*5)],amount:1});
    slots[0]=valuable();slots[1]=rollChestBandageItem();slots[2]=Math.random()<0.5?rollChestAmmoItem():valuable();
  }
  if (['chest_military','chest_millitary'].includes(variant)) {
    const key=['m16','famas','fal','m24'][Math.floor(Math.random()*4)];
    slots[0]={kind:'weapon',key,ammo:WEAPONS[key].magSize,durability:90+Math.floor(Math.random()*11)};
    slots[1]={kind:'ammo',ammoType:WEAPONS[key].ammoType??(key==='m24'?'sniper':'rifle'),amount:30};
    slots[2]={kind:'material',key:'military_pack',tier:Math.random()<0.3?3:2,amount:1};
    slots[3]=Math.random()<0.5?{kind:'consumable',key:'medkit',amount:1}:{kind:'material',key:'military_comp',amount:1};
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
    const normalized = normalizeConsumableItem(item);
    return getConsumableDisplayName(normalized.key, normalized.amount);
  }
  if (item.kind === 'consumable') {
    const normalized = normalizeConsumableItem(item);
    return getConsumableDisplayName(normalized.key, normalized.amount);
  }
  if (item.kind === 'equipment') {
    const normalized = normalizeEquipmentItem(item);
    return getEquipmentDisplayName(normalized.key);
  }
  if (item.kind === 'throwable') {
    const normalized = normalizeThrowableItem(item);
    const n = normalized.amount ?? 1;
    const name = getThrowableDisplayName(normalized.key);
    return n > 1 ? `${name} x${n}` : name;
  }
  if (item.kind === 'material') {
    const normalized = normalizeMaterialItem(item);
    if (isBlueprint(item) && WEAPONS[item.blueprintWeapon]) {
      const name = WEAPONS[item.blueprintWeapon].name + ' Blueprint';
      return (item.key === 'blueprint_old' ? 'Studied ' : '') + name + (normalized.amount > 1 ? ' x' + normalized.amount : '');
    }
    return (isTieredItem(normalized)?'Tier '+packTier(normalized)+' ':'')+getMaterialDisplayName(normalized.key, normalized.amount);
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
    return `${w.name} — ${mode}, ${w.damage} damage, ${ammo}/${w.magSize} in mag. Durability ${Math.ceil(itemDurability(item))}%.`;
  }
  if (item.kind === 'melee') {
    const m = MELEE_WEAPONS[item.key];
    if (!m) return item.key;
    return `${m.name} — melee weapon, ${m.damage ?? '?'} damage. Durability ${Math.ceil(itemDurability(item))}%.`;
  }
  if (item.kind === 'ammo') {
    const normalized = normalizeAmmoItem(item);
    return `${getAmmoDisplayName(normalized.ammoType, normalized.amount)} for reloading.`;
  }
  if (item.kind === 'bandage' || item.kind === 'consumable') {
    const normalized = normalizeConsumableItem(item);
    if (!normalized) return '';
    return getConsumableDescription(normalized.key);
  }
  if (item.kind === 'equipment') {
    const normalized = normalizeEquipmentItem(item);
    if (!normalized) return item.key;
    return `${getEquipmentDescription(normalized.key)} Durability ${Math.ceil(itemDurability(normalized))}%.`;
  }
  if (item.kind === 'throwable') {
    const normalized = normalizeThrowableItem(item);
    if (!normalized) return '';
    return getThrowableDescription(normalized.key);
  }
  if (item.kind === 'material') {
    const tools={barbed_wire:'Place on the ground. Slows moving characters and damages them as they cross.',gas_bottle:'Place on the ground. Explodes when shot.',radar:'Carry to detect packs inside chests within 30 metres.',generator:'Portable generator. Its purpose is not assigned yet.',keycard:'Tier '+packTier(item)+' keycard. Use, then click a locked door of this tier or lower. Consumed on unlocking.',key:'Use, then click a locked wooden door. Consumed on unlocking.',laptop:'Valuable laptop. Sell to the trader.',phone:'Valuable phone. Sell to the trader.'};
    if(tools[item.key])return tools[item.key];
    if (isPack(item)) return 'Tier '+packTier(item)+' sealed pack. Open for random loot or sell. Rare weapons and blueprints are not guaranteed.';
    if (item.key.endsWith('_box')) return 'Sealed ammunition box. Open for ammunition.';
    if (item.key === 'blueprint') return 'Study at base to permanently unlock this weapon in the shop.';
    if (item.key === 'blueprint_old') return 'Already studied blueprint. Valuable to traders.';
    if (item.key.endsWith('_kit')) return 'Repair kit. No additional materials required.';
    if (item.key === 'fuel') return 'Fuel for machinery. Can also be sold.';
    return 'Valuable. Sell in the safe zone.';
  }
  if (item.kind === 'throwable') {
    return 'Throwable item.';
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
  if (item.kind === 'bandage' || item.kind === 'consumable') {
    const normalized = normalizeConsumableItem(item);
    return consumableSpritePath(normalized?.key ?? 'bandage');
  }
  if (item.kind === 'equipment') {
    const normalized = normalizeEquipmentItem(item);
    return equipmentSpritePath(normalized?.key ?? item.key);
  }
  if (item.kind === 'throwable') {
    const normalized = normalizeThrowableItem(item);
    return throwableSpritePath(normalized?.key ?? item.key);
  }
  if (item.kind === 'material') return item.key==='radar'&&item.radarOn?'assets/items/materials/radar_on.png':materialSpritePath(item.key);
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
  if (item.kind === 'bandage' || item.kind === 'consumable') {
    const normalized = normalizeConsumableItem(item);
    return normalized?.key ?? 'bandage';
  }
  if (item.kind === 'equipment') {
    const normalized = normalizeEquipmentItem(item);
    return normalized ? `equip_${normalized.key}` : null;
  }
  if (item.kind === 'throwable') {
    const normalized = normalizeThrowableItem(item);
    return normalized?.key ?? null;
  }
  if (item.kind === 'material') return item.key==='radar'&&item.radarOn?'radar_on':item.key;
  return null;
}

export function chestSpriteName(variant) {
  return [...CHEST_VARIANTS,'chest_crate','chest_military','chest_millitary'].includes(variant) ? variant : CHEST_VARIANTS[0];
}

