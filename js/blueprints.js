import economy from './economy-data.js';

const weaponKeys = [...new Set(economy.shop
  .filter(offer => offer.item.kind === 'weapon' && offer.level > 1)
  .map(offer => offer.item.key))];

export function isBlueprint(item) {
  return item?.kind === 'material' && (item.key === 'blueprint' || item.key === 'blueprint_old');
}

export function resolveBlueprint(item, studied = []) {
  if (!isBlueprint(item)) return item;
  const blueprintWeapon = weaponKeys.includes(item.blueprintWeapon)
    ? item.blueprintWeapon : weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
  const key = item.key === 'blueprint_old' || studied.includes('weapon:' + blueprintWeapon)
    ? 'blueprint_old' : 'blueprint';
  return { ...item, key, blueprintWeapon };
}
