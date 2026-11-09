import data from './custom-content-data.js';

export const emptyContent = () => ({ enemies: [], items: [], weapons: [], loot: [] });
const idPattern = /^[a-z][a-z0-9_]{0,31}$/;
const assetPattern = /^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.png$/;

const number = (value, min, max, label, integer = false) => {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw Error(`${label}: expected ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`);
  }
  return value;
};
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 64) throw Error(`${label}: enter 1–64 characters`);
  return value.trim();
};
const asset = (value, label) => {
  if (typeof value !== 'string' || !assetPattern.test(value)) throw Error(`${label}: enter a PNG path under assets/`);
  return value;
};

export const contentKey = (group, id) => `custom_${group}_${id}`;

export function validateContent(source) {
  const result = emptyContent();
  for (const group of Object.keys(result)) {
    const entries = source?.[group];
    if (!Array.isArray(entries) || entries.length > 100) throw Error(`${group}: expected a list of up to 100 entries`);
    const ids = new Set();
    result[group] = entries.map((entry) => {
      const id = entry?.id;
      if (typeof id !== 'string' || !idPattern.test(id) || ids.has(id) || /_(walk|dead|shot)$/.test(id)) {
        throw Error(`${group}: invalid or duplicate ID "${id}"`);
      }
      ids.add(id);
      const label = `${group}/${id}`;
      const n = (key, min, max, integer) => number(entry[key], min, max, `${label}/${key}`, integer);
      const png = (key) => asset(entry[key], `${label}/${key}`);
      if (group === 'loot') {
        if (!['items', 'weapons'].includes(entry.group)) throw Error(`${label}: choose items or weapons`);
        return { id, group: entry.group, target: text(entry.target, label), weight: n('weight', 0, 10000), amount: n('amount', 1, 50, true) };
      }
      const name = text(entry.name, label);
      if (group === 'items') return { id, name, icon: png('icon') };
      if (group === 'weapons') {
        const ammoType = entry.ammoType ?? 'pistol';
        if (!['pistol', 'rifle', 'shotgun', 'sniper'].includes(ammoType)) throw Error(`${label}: invalid ammo type`);
        return {
        id, name, icon: png('icon'), sprite: png('sprite'), shot: png('shot'),
        ammoType,
        damage: n('damage', 1, 500), magSize: n('magSize', 1, 100, true),
        reloadTime: n('reloadTime', 0.1, 20), fireRate: n('fireRate', 0, 10),
        bulletSpeed: n('bulletSpeed', 10, 400), spread: n('spread', 0, 2), pellets: n('pellets', 1, 12, true),
        };
      }
      if (!['hostile', 'passive'].includes(entry.behavior)) throw Error(`${label}: choose hostile or passive`);
      if (!['x', 'y'].includes(entry.axis)) throw Error(`${label}: choose animation axis x or y`);
      return {
        id, name, behavior: entry.behavior, idle: png('idle'), walk: png('walk'), dead: png('dead'),
        frameSize: n('frameSize', 8, 128, true), axis: entry.axis, fps: n('fps', 1, 30),
        health: n('health', 1, 5000, true), speed: n('speed', 0, 30),
        damage: n('damage', 0, 500), attackRate: n('attackRate', 0.1, 20),
        attackRange: n('attackRange', 0.5, 5), detectRange: n('detectRange', 1, 35),
        spawnWeight: n('spawnWeight', 0, 100),
      };
    });
  }
  for (const loot of result.loot) {
    if (!result[loot.group].some((entry) => entry.id === loot.target)) {
      throw Error(`loot/${loot.id}: unknown ${loot.group} ID "${loot.target}"`);
    }
  }
  return result;
}

export const content = validateContent(data);
const index = (group) => Object.fromEntries(content[group].map((entry) => [contentKey(group, entry.id), entry]));
export const customEnemies = index('enemies');
export const customItems = index('items');
export const customWeapons = index('weapons');
