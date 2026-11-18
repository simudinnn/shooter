import { customItems } from './customContent.js';
export const MATERIAL_STACK_MAX = 50;

export const MATERIAL_KEYS = [
  "blueprint",
  "blueprint_old",
  "fuel",
  "military_comp",
  "electrical_trans",
  "electrical_comp",
  "repair_kit",
  "sewing_kit",
  "upgrade_kit",
  "equipment_pack",
  "military_pack",
  "archive_pack",
  "industrial_pack",
  "pistol_box",
  "rifle_box",
  "shotgun_box",
  "sniper_box",
  "jewlery",
  "cash"
];

const DISPLAY_NAMES = {
  equipment_pack: 'Equipment Pack',
  military_pack: 'Military Pack',
  archive_pack: 'Archive Pack',
  industrial_pack: 'Industrial Pack',
  pistol_box: 'Pistol Ammo Box',
  rifle_box: 'Rifle Ammo Box',
  shotgun_box: 'Shotgun Ammo Box',
  sniper_box: 'Sniper Ammo Box',
  cash: 'Cash',
  jewlery: 'Jewelry',
  adhesive: 'Adhesive',
  battery: 'Battery',
  blueprint: 'Blueprint',
  blueprint_old: 'Studied Blueprint',
  chemicals: 'Chemicals',
  cloth: 'Cloth',
  copper_coil: 'Copper Coil',
  electrical_comp: 'Electrical Component',
  electrical_trans: 'Electrical Transformer',
  fabric: 'Fabric',
  fuel: 'Fuel',
  glass: 'Glass',
  glass_bottle: 'Glass Bottle',
  gun_parts: 'Gun Parts',
  mechanical_comp: 'Mechanical Component',
  metal: 'Metal',
  metal_pipe: 'Metal Pipe',
  metal_sheet: 'Metal Sheet',
  microchip: 'Microchip',
  military_comp: 'Military Component',
  nails: 'Nails',
  plank: 'Plank',
  plastic: 'Plastic',
  repair_kit: 'Repair Kit',
  rope: 'Rope',
  rubber: 'Rubber',
  sewing_kit: 'Sewing Kit',
  splint_kit: 'Splint Kit',
  spring: 'Spring',
  stick: 'Stick',
  tape: 'Tape',
  upgrade_kit: 'Upgrade Kit',
  wires: 'Wires',
  wood: 'Wood',
};

export function materialSpritePath(key) {
  if (key === 'cash') return 'assets/items/misc/cash.png';
  if (key.endsWith('_box')) return 'assets/items/weapons/' + key + '.png';
  return customItems[key]?.icon ?? `assets/items/materials/${key}.png`;
}

export function getMaterialDisplayName(key, amount = 1) {
  const name = customItems[key]?.name ?? DISPLAY_NAMES[key] ?? key;
  return amount > 1 ? `${name} x${amount}` : name;
}

export function normalizeMaterialItem(item) {
  if (!item || item.kind !== 'material') return item;
  return {
    kind: 'material',
    key: item.key,
    amount: Math.max(1, Math.floor(item.amount ?? 1)),
  };
}

export function materialItemsMatch(a, b) {
  return a?.kind === 'material' && b?.kind === 'material' && a.key === b.key;
}

export function mergeMaterialStacks(a, b) {
  const left = normalizeMaterialItem(a);
  const right = normalizeMaterialItem(b);
  if (!left || !right || left.key !== right.key) return null;
  const total = (left.amount ?? 1) + (right.amount ?? 1);
  if (total <= MATERIAL_STACK_MAX) {
    return { kind: 'material', key: left.key, amount: total };
  }
  return {
    merged: { kind: 'material', key: left.key, amount: MATERIAL_STACK_MAX },
    overflow: { kind: 'material', key: left.key, amount: total - MATERIAL_STACK_MAX },
  };
}


