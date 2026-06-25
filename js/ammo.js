/** Typed ammo items, weapon mapping, and stack helpers. */

export const AMMO_STACK_MAX = 9999;

export const AMMO_TYPES = {
  pistol: { name: 'Pistol ammo', sprite: 'pistol_ammo' },
  rifle: { name: 'Rifle ammo', sprite: 'rifle_ammo' },
  shotgun: { name: 'Shotgun ammo', sprite: 'shotgun_ammo' },
  sniper: { name: 'Sniper ammo', sprite: 'sniper_ammo' },
};

export const AMMO_TYPE_KEYS = Object.keys(AMMO_TYPES);

/** Which inventory ammo each gun draws from when reloading. */
export const WEAPON_AMMO_TYPE = {
  glock: 'pistol',
  uzi: 'pistol',
  revolver: 'rifle',
  famas: 'rifle',
  fal: 'rifle',
  m16: 'rifle',
  m870: 'shotgun',
  m24: 'sniper',
};

export function getWeaponAmmoType(weaponKey) {
  return WEAPON_AMMO_TYPE[weaponKey] ?? 'pistol';
}

export function ammoSpritePath(ammoType) {
  const sprite = AMMO_TYPES[ammoType]?.sprite ?? 'pistol_ammo';
  return `assets/items/weapons/${sprite}.png`;
}

export function getAmmoDisplayName(ammoType, amount) {
  const label = AMMO_TYPES[ammoType]?.name ?? 'Ammo';
  return `${label} x${amount ?? 0}`;
}

export function isAmmoItem(item) {
  return item?.kind === 'ammo';
}

export function ammoItemsMatch(a, b) {
  return a?.kind === 'ammo' && b?.kind === 'ammo' && a.ammoType === b.ammoType;
}

export function normalizeAmmoItem(item) {
  if (!item || item.kind !== 'ammo') return item;
  const ammoType = item.ammoType ?? AMMO_TYPE_KEYS[0];
  return {
    kind: 'ammo',
    ammoType,
    amount: Math.min(AMMO_STACK_MAX, Math.max(1, Math.floor(item.amount ?? 15))),
  };
}

export function mergeAmmoStacks(a, b) {
  if (!ammoItemsMatch(a, b)) return null;
  const total = (a.amount ?? 0) + (b.amount ?? 0);
  if (total <= AMMO_STACK_MAX) {
    return { kind: 'ammo', ammoType: a.ammoType, amount: total };
  }
  return {
    merged: { kind: 'ammo', ammoType: a.ammoType, amount: AMMO_STACK_MAX },
    overflow: { kind: 'ammo', ammoType: a.ammoType, amount: total - AMMO_STACK_MAX },
  };
}

export const BANDAGE_STACK_MAX = 16;

export function bandageItemsMatch(a, b) {
  return a?.kind === 'bandage' && b?.kind === 'bandage';
}

export function normalizeBandageItem(item) {
  if (!item || item.kind !== 'bandage') return item;
  return {
    kind: 'bandage',
    amount: Math.min(BANDAGE_STACK_MAX, Math.max(1, Math.floor(item.amount ?? 1))),
  };
}

export function mergeBandageStacks(a, b) {
  if (!bandageItemsMatch(a, b)) return null;
  const total = (a.amount ?? 1) + (b.amount ?? 1);
  if (total <= BANDAGE_STACK_MAX) {
    return { kind: 'bandage', amount: total };
  }
  return {
    merged: { kind: 'bandage', amount: BANDAGE_STACK_MAX },
    overflow: { kind: 'bandage', amount: total - BANDAGE_STACK_MAX },
  };
}
