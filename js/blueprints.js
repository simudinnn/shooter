import economy from './economy-data.js';

export const blueprintOnlyWeapon = key => !['glock', 'revolver'].includes(key);

export const DISPLAY_ONLY_GUNS = {
  ak47: { name: 'AK-47', price: 830 },
  sig: { name: 'SIG', price: 350 },
  mp5: { name: 'MP5', price: 480 },
  kar98: { name: 'Kar98', price: 700 },
  machete: { name: 'Machete', price: 210 },
  ar15: { name: 'AR-15', price: 760 },
};

export const BLUEPRINT_SUPPLIES = {
  grenade: { kind: 'throwable', name: 'Grenade' },
  molotov: { kind: 'throwable', name: 'Molotov' },
  barbed_wire: { kind: 'material', name: 'Barbed Wire' },
};

export function blueprintUnlockId(key) {
  return (BLUEPRINT_SUPPLIES[key]?.kind ?? 'weapon') + ':' + key;
}

const weaponKeys = [...new Set([...Object.keys(DISPLAY_ONLY_GUNS), ...Object.keys(BLUEPRINT_SUPPLIES), ...economy.shop
  .filter(offer => offer.item.kind === 'weapon' && offer.level > 1)
  .map(offer => offer.item.key)])];

export function isBlueprint(item) {
  return item?.kind === 'material' && (item.key === 'blueprint' || item.key === 'blueprint_old');
}

export function resolveBlueprint(item, studied = []) {
  if (!isBlueprint(item)) return item;
  const blueprintWeapon = weaponKeys.includes(item.blueprintWeapon)
    ? item.blueprintWeapon : weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
  const key = item.key === 'blueprint_old' || studied.includes(blueprintUnlockId(blueprintWeapon))
    ? 'blueprint_old' : 'blueprint';
  return { ...item, key, blueprintWeapon };
}
