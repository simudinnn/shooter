export const THROWABLE_KEYS = ['grenade', 'molotov', 'flare'];

const DISPLAY_NAMES = {
  grenade: 'Grenade',
  molotov: 'Molotov',
  flare: 'Flare',
};

const DESCRIPTIONS = {
  grenade: 'Throwable explosive. (Throwing coming soon.)',
  molotov: 'Throwable fire bomb. (Throwing coming soon.)',
  flare: 'Throwable signal flare. (Throwing coming soon.)',
};

export function throwableSpritePath(key) {
  return `assets/items/weapons/${key}.png`;
}

export function getThrowableDisplayName(key) {
  return DISPLAY_NAMES[key] ?? key;
}

export function getThrowableDescription(key) {
  return DESCRIPTIONS[key] ?? 'Throwable item.';
}

/** @param {object | null | undefined} item */
export function normalizeThrowableItem(item) {
  if (!item || item.kind !== 'throwable' || !THROWABLE_KEYS.includes(item.key)) return null;
  return { kind: 'throwable', key: item.key, amount: Math.max(1, Math.floor(item.amount ?? 1)) };
}

export function isThrowableItem(item) {
  return !!normalizeThrowableItem(item);
}
