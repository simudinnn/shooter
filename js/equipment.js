export const EQUIPMENT_ITEM_KEYS = [
  'backpack_1',
  'backpack2',
  'backpack3',
  'hunting_vest',
  'military_vest',
  'police_vest',
  'tool_belt',
  'vest',
];

export const EQUIPMENT_SLOTS = ['vest', 'backpack'];
export const BACKPACK_CAPACITY = { backpack_1: 5, backpack2: 10, backpack3: 15 };
export const VEST_RESISTANCE = { vest: 0.15, hunting_vest: 0.2, police_vest: 0.3, military_vest: 0.4 };
export const MAX_DURABILITY = 100;

export function itemDurability(item) {
  return Number.isFinite(item?.durability)
    ? Math.max(0, Math.min(MAX_DURABILITY, item.durability))
    : MAX_DURABILITY;
}

export function equipmentSlotFor(item) {
  if (item?.kind !== 'equipment' || itemDurability(item) <= 0) return -1;
  if (Object.hasOwn(VEST_RESISTANCE, item.key)) return 0;
  if (Object.hasOwn(BACKPACK_CAPACITY, item.key)) return 1;
  return -1;
}

const DISPLAY_NAMES = {
  backpack_1: 'Backpack',
  backpack2: 'Backpack Mk.2',
  backpack3: 'Backpack Mk.3',
  hunting_vest: 'Hunting Vest',
  military_vest: 'Military Vest',
  police_vest: 'Police Vest',
  tool_belt: 'Tool Belt',
  vest: 'Vest',
};

const DESCRIPTIONS = {
  backpack_1: 'Carry gear on your back.',
  backpack2: 'Roomier backpack.',
  backpack3: 'Large backpack.',
  hunting_vest: 'Light chest protection.',
  military_vest: 'Heavy ballistic vest.',
  police_vest: 'Standard issue vest.',
  tool_belt: 'Keeps tools within reach.',
  vest: 'Basic protective vest.',
};

export function equipmentSpritePath(key) {
  return `assets/items/clothes/${key}.png`;
}

export function getEquipmentDisplayName(key) {
  return DISPLAY_NAMES[key] ?? key;
}

export function getEquipmentDescription(key) {
  return DESCRIPTIONS[key] ?? 'Wearable equipment.';
}

/** @param {object | null | undefined} item */
export function normalizeEquipmentItem(item) {
  if (!item || item.kind !== 'equipment' || !EQUIPMENT_ITEM_KEYS.includes(item.key)) return null;
  return { kind: 'equipment', key: item.key, durability: itemDurability(item) };
}

export function isEquipmentItem(item) {
  return !!normalizeEquipmentItem(item);
}
