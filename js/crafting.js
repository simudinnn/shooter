import { MATERIAL_STACK_MAX, getMaterialDisplayName } from './materials.js';
import { getItemDisplayName } from './loot.js';
import { AMMO_STACK_MAX, BANDAGE_STACK_MAX } from './ammo.js';

export const CRAFT_RECIPES = [
  {
    id: 'bandage',
    output: { kind: 'bandage', amount: 1 },
    costs: { cloth: 2, adhesive: 1 },
  },
  {
    id: 'pistol_ammo',
    output: { kind: 'ammo', ammoType: 'pistol', amount: 12 },
    costs: { metal: 2, chemicals: 1, plastic: 1 },
  },
  {
    id: 'shotgun_ammo',
    output: { kind: 'ammo', ammoType: 'shotgun', amount: 6 },
    costs: { metal: 2, chemicals: 1, plastic: 1 },
  },
];

const RECYCLE_TABLE = {
  weapon: [{ key: 'metal', amount: 2 }, { key: 'gun_parts', amount: 1 }, { key: 'spring', amount: 1 }],
  melee: [{ key: 'metal', amount: 1 }, { key: 'wood', amount: 2 }],
  bandage: [{ key: 'cloth', amount: 1 }],
  ammo: [{ key: 'metal', amount: 1 }],
  material: {
    repair_kit: [{ key: 'metal', amount: 2 }, { key: 'tape', amount: 1 }],
    sewing_kit: [{ key: 'cloth', amount: 2 }, { key: 'rope', amount: 1 }],
    splint_kit: [{ key: 'plank', amount: 1 }, { key: 'cloth', amount: 1 }],
    upgrade_kit: [{ key: 'metal', amount: 2 }, { key: 'mechanical_comp', amount: 1 }],
    mechanical_comp: [{ key: 'metal', amount: 3 }, { key: 'spring', amount: 2 }],
    electrical_comp: [{ key: 'plastic', amount: 2 }, { key: 'microchip', amount: 1 }],
    electrical_trans: [{ key: 'electrical_comp', amount: 1 }, { key: 'wires', amount: 1 }, { key: 'metal', amount: 2 }],
    fabric: [{ key: 'cloth', amount: 1 }],
    fuel: [{ key: 'plastic', amount: 2 }, { key: 'chemicals', amount: 2 }],
    glass_bottle: [{ key: 'glass', amount: 2 }],
    gun_parts: [{ key: 'metal', amount: 2 }, { key: 'spring', amount: 1 }],
    military_comp: [{ key: 'electrical_comp', amount: 2 }, { key: 'wires', amount: 2 }, { key: 'metal', amount: 3 }],
    nails: [{ key: 'metal', amount: 2 }],
    rope: [{ key: 'cloth', amount: 1 }],
    wires: [{ key: 'metal', amount: 1 }],
  },
};

export function getRecipeLabel(recipe) {
  return getItemDisplayName(recipe.output);
}

export function formatRecipeCosts(costs) {
  return Object.entries(costs)
    .map(([key, amount]) => getMaterialDisplayName(key, amount))
    .join(', ');
}

function materialRoom(player, key, amount) {
  let left = amount;
  for (let i = 0; i < player.itemSlots.length; i++) {
    if (!player.isItemSlotUnlocked(i)) continue;
    const slot = player.itemSlots[i];
    if (slot?.kind === 'material' && slot.key === key) {
      left -= Math.max(0, MATERIAL_STACK_MAX - (slot.amount ?? 1));
    }
  }
  for (let i = 0; i < player.itemSlots.length && left > 0; i++) {
    if (!player.isItemSlotUnlocked(i)) continue;
    if (player.itemSlots[i] == null) left -= MATERIAL_STACK_MAX;
  }
  return left <= 0;
}

export function canStoreItem(player, item) {
  if (!player || !item) return false;
  if (item.kind === 'ammo') {
    let left = item.amount ?? 0;
    for (let i = 0; i < player.itemSlots.length; i++) {
      if (!player.isItemSlotUnlocked(i)) continue;
      const slot = player.itemSlots[i];
      if (slot?.kind === 'ammo' && slot.ammoType === item.ammoType) {
        left -= Math.max(0, AMMO_STACK_MAX - (slot.amount ?? 0));
      }
    }
    for (let i = 0; i < player.itemSlots.length && left > 0; i++) {
      if (!player.isItemSlotUnlocked(i)) continue;
      if (player.itemSlots[i] == null) left -= AMMO_STACK_MAX;
    }
    return left <= 0;
  }
  if (item.kind === 'bandage') {
    let left = item.amount ?? 1;
    for (let i = 0; i < player.itemSlots.length; i++) {
      if (!player.isItemSlotUnlocked(i)) continue;
      const slot = player.itemSlots[i];
      if (slot?.kind === 'bandage') {
        left -= Math.max(0, BANDAGE_STACK_MAX - (slot.amount ?? 1));
      }
    }
    for (let i = 0; i < player.itemSlots.length && left > 0; i++) {
      if (!player.isItemSlotUnlocked(i)) continue;
      if (player.itemSlots[i] == null) left -= BANDAGE_STACK_MAX;
    }
    return left <= 0;
  }
  if (item.kind === 'material') {
    return materialRoom(player, item.key, item.amount ?? 1);
  }
  return player.itemSlots.some((s, i) => s == null && player.isItemSlotUnlocked(i));
}

export function canCraftRecipe(player, recipe) {
  if (!player || !recipe) return false;
  return player.hasMaterials(recipe.costs) && canStoreItem(player, recipe.output);
}

export function craftRecipe(player, recipe) {
  if (!canCraftRecipe(player, recipe)) return false;
  if (!player.consumeMaterials(recipe.costs)) return false;
  const stored = player.tryStoreItem({ ...recipe.output });
  if (!stored.ok || stored.remainder) {
    for (const [key, amount] of Object.entries(recipe.costs)) {
      player.addMaterialToInventory(key, amount);
    }
    return false;
  }
  return true;
}

export function getRecycleYields(item, count = 1) {
  if (!item) return null;
  const scale = Math.max(1, Math.floor(count));
  if (item.kind === 'weapon') return RECYCLE_TABLE.weapon;
  if (item.kind === 'melee') return RECYCLE_TABLE.melee;
  if (item.kind === 'bandage') return RECYCLE_TABLE.bandage;
  if (item.kind === 'ammo') {
    return RECYCLE_TABLE.ammo.map((entry) => ({
      key: entry.key,
      amount: entry.amount * scale,
    }));
  }
  if (item.kind === 'material') {
    const table = RECYCLE_TABLE.material[item.key];
    if (!table) return null;
    return table.map((entry) => ({
      key: entry.key,
      amount: entry.amount * scale,
    }));
  }
  return null;
}

export function canRecycleItem(item) {
  return getRecycleYields(item) != null;
}

export function canStoreRecycleYields(player, yields) {
  if (!player || !yields?.length) return false;
  const totals = new Map();
  for (const entry of yields) {
    totals.set(entry.key, (totals.get(entry.key) ?? 0) + entry.amount);
  }
  for (const [key, amount] of totals) {
    if (!materialRoom(player, key, amount)) return false;
  }
  return true;
}

export function applyRecycleYields(player, yields) {
  if (!canStoreRecycleYields(player, yields)) return false;
  for (const entry of yields) {
    player.addMaterialToInventory(entry.key, entry.amount);
  }
  return true;
}

export function countMaterialsInSlots(slots) {
  const counts = {};
  for (const item of slots ?? []) {
    if (item?.kind !== 'material') continue;
    counts[item.key] = (counts[item.key] ?? 0) + (item.amount ?? 1);
  }
  return counts;
}

export function findRecipeForCombineSlots(slots) {
  const counts = countMaterialsInSlots(slots);
  let best = null;
  let bestCost = -1;
  for (const recipe of CRAFT_RECIPES) {
    let ok = true;
    let total = 0;
    for (const [key, amt] of Object.entries(recipe.costs)) {
      if ((counts[key] ?? 0) < amt) {
        ok = false;
        break;
      }
      total += amt;
    }
    if (ok && total > bestCost) {
      best = recipe;
      bestCost = total;
    }
  }
  return best;
}

function consumeFromCombineSlots(slots, costs) {
  const remaining = { ...costs };
  for (let i = 0; i < slots.length; i++) {
    const item = slots[i];
    if (!item || item.kind !== 'material') continue;
    const need = remaining[item.key];
    if (!need || need <= 0) continue;
    const take = Math.min(need, item.amount ?? 1);
    remaining[item.key] -= take;
    const left = (item.amount ?? 1) - take;
    if (left <= 0) slots[i] = null;
    else slots[i] = { ...item, amount: left };
  }
  return Object.values(remaining).every((v) => v <= 0);
}

export function craftFromCombineSlots(slots, player) {
  const recipe = findRecipeForCombineSlots(slots);
  if (!recipe || !canStoreItem(player, recipe.output)) return null;
  const snapshot = slots.map((s) => (s ? { ...s } : null));
  if (!consumeFromCombineSlots(slots, recipe.costs)) {
    for (let i = 0; i < slots.length; i++) slots[i] = snapshot[i];
    return null;
  }
  const stored = player.tryStoreItem({ ...recipe.output });
  if (!stored.ok || stored.remainder) {
    for (let i = 0; i < slots.length; i++) slots[i] = snapshot[i];
    return null;
  }
  return recipe;
}
