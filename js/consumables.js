export const CONSUMABLE_STACK_MAX = 10;

export const CONSUMABLE_KEYS = ['bandage', 'apple', 'medkit', 'vaccine'];

const DISPLAY_NAMES = {
  bandage: 'Bandage',
  apple: 'Apple',
  medkit: 'Medkit',
  vaccine: 'Vaccine',
};

const DESCRIPTIONS = {
  bandage: 'Restores 30 HP when used.',
  apple: 'Restores 15 HP when used.',
  medkit: 'Restores 60 HP when used.',
  vaccine: 'Boosts recovery. (Effect coming soon.)',
};

const HEAL_AMOUNT = {
  bandage: 30,
  apple: 15,
  medkit: 60,
  vaccine: 0,
};

export function consumableSpritePath(key) {
  return `assets/items/consumable/${key}.png`;
}

export function getConsumableDisplayName(key, amount = 1) {
  const name = DISPLAY_NAMES[key] ?? key;
  return amount > 1 ? `${name} x${amount}` : name;
}

export function getConsumableDescription(key) {
  return DESCRIPTIONS[key] ?? 'Consumable item.';
}

export function getConsumableHealAmount(key) {
  return HEAL_AMOUNT[key] ?? 0;
}

/** @param {object | null | undefined} item */
export function normalizeConsumableItem(item) {
  if (!item) return null;
  if (item.kind === 'bandage') {
    return { kind: 'consumable', key: 'bandage', amount: Math.max(1, Math.floor(item.amount ?? 1)) };
  }
  if (item.kind !== 'consumable' || !CONSUMABLE_KEYS.includes(item.key)) return null;
  return {
    kind: 'consumable',
    key: item.key,
    amount: Math.max(1, Math.floor(item.amount ?? 1)),
  };
}

export function isConsumableItem(item) {
  return !!normalizeConsumableItem(item);
}

export function isQuickEquipItem(item) {
  return isConsumableItem(item);
}

export function consumableItemsMatch(a, b) {
  const left = normalizeConsumableItem(a);
  const right = normalizeConsumableItem(b);
  return !!left && !!right && left.key === right.key;
}

export function mergeConsumableStacks(a, b) {
  const left = normalizeConsumableItem(a);
  const right = normalizeConsumableItem(b);
  if (!left || !right || left.key !== right.key) return null;
  const total = (left.amount ?? 1) + (right.amount ?? 1);
  if (total <= CONSUMABLE_STACK_MAX) {
    return { kind: 'consumable', key: left.key, amount: total };
  }
  return {
    merged: { kind: 'consumable', key: left.key, amount: CONSUMABLE_STACK_MAX },
    overflow: { kind: 'consumable', key: left.key, amount: total - CONSUMABLE_STACK_MAX },
  };
}
