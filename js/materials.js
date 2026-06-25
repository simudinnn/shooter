export const MATERIAL_STACK_MAX = 50;

export const MATERIAL_KEYS = [
  'adhesive', 'battery', 'blueprint', 'blueprint_old', 'chemicals', 'cloth',
  'copper_coil', 'electrical_comp', 'electrical_trans', 'fabric', 'fuel', 'glass',
  'glass_bottle', 'gun_parts', 'mechanical_comp', 'metal', 'metal_pipe', 'metal_sheet',
  'microchip', 'military_comp', 'nails', 'plank', 'plastic', 'repair_kit', 'rope',
  'rubber', 'sewing_kit', 'splint_kit', 'spring', 'stick', 'tape', 'upgrade_kit',
  'wires', 'wood',
];

const DISPLAY_NAMES = {
  adhesive: 'Adhesive',
  battery: 'Battery',
  blueprint: 'Blueprint',
  blueprint_old: 'Old Blueprint',
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
  return `assets/items/materials/${key}.png`;
}

export function getMaterialDisplayName(key, amount = 1) {
  const name = DISPLAY_NAMES[key] ?? key;
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
