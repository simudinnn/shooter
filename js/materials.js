import { customItems } from './customContent.js';
export const BASIC_MATERIAL_KEYS = ['battery','nails','plank','spring','tape','wires'];
export const REMOVED_MATERIAL_KEYS = ["plastic","metal_scrap","fabric","cloth","glass_bottle","adhesive","chemicals","metal_sheet","rope"];
export const MATERIAL_STACK_MAX = 50;
export const materialStackMax = item => item?.key === 'cash' ? Number.MAX_SAFE_INTEGER : item?.key?.endsWith('_pack') ? 5 : MATERIAL_STACK_MAX;

export const MATERIAL_KEYS = [
  "battery",
  "book",
  "nails",
  "plank",
  "spring",
  "tape",
  "wires",
  "keycard",
  "key",
  "laptop",
  "phone",
  "barbed_wire",
  "gas_bottle",
  "generator",
  "matches",
  "radar",
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
  keycard:'Keycard',key:'Key',laptop:'Laptop',phone:'Phone',barbed_wire:'Barbed Wire',gas_bottle:'Gas Bottle',generator:'Generator',matches:'Matches',radar:'Pack Radar',
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
  book: 'Book',
  metal_scrap: 'Metal Scrap',
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
  if (['barbed_wire','gas_bottle','generator','matches','radar'].includes(key)) return 'assets/items/tools/'+key+'.png';
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
    ...item,
    kind: 'material',
    key: item.key,
    ...((item.key.endsWith('_pack')||item.key==='keycard') ? {tier: Math.max(1,Math.min(3,Math.floor(item.tier??1)))} : {}),
    amount: Math.max(1, Math.floor(item.amount ?? 1)),
  };
}

export function materialItemsMatch(a, b) {
  return a?.kind === 'material' && b?.kind === 'material' && a.key === b.key && (!(a.key.endsWith('_pack')||a.key==='keycard') || (a.tier??1)===(b.tier??1));
}

export function mergeMaterialStacks(a, b) {
  const left = normalizeMaterialItem(a);
  const right = normalizeMaterialItem(b);
  if (!left || !right || !materialItemsMatch(left,right)) return null;
  const limit=materialStackMax(left);
  const total = (left.amount ?? 1) + (right.amount ?? 1);
  if (total <= limit) {
    return { ...left, amount: total };
  }
  return {
    merged: { kind: 'material', key: left.key, amount: limit },
    overflow: { kind: 'material', key: left.key, amount: total - limit },
  };
}


