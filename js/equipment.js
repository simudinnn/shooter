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
  return { kind: 'equipment', key: item.key };
}

export function isEquipmentItem(item) {
  return !!normalizeEquipmentItem(item);
}
