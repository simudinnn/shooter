import economy from './economy-data.js';
import { MATERIAL_STACK_MAX, getMaterialDisplayName } from './materials.js';
import { getItemDisplayName } from './loot.js';
import { AMMO_STACK_MAX } from './ammo.js';
import { CONSUMABLE_STACK_MAX, normalizeConsumableItem } from './consumables.js';
import { normalizeEquipmentItem } from './equipment.js';
import { normalizeThrowableItem } from './throwables.js';

export const CRAFT_MAX_MATERIALS = 4;

const RECYCLE_TABLE = economy.recycling;
export const CRAFT_RECIPES = economy.crafting;

export function getCraftableRecipes(player) {
  return CRAFT_RECIPES.filter((recipe) => isRecipeUnlocked(player, recipe));
}

export function isRecipeUnlocked(player, recipe) {
  if ((player?.raidLevel ?? 1) < (recipe.level ?? 1)) return false;
  const blueprintId = recipe.blueprint;
  if (!blueprintId) return true;
  const learned = player?.learnedBlueprints;
  if (!learned) return false;
  if (learned instanceof Set) return learned.has(blueprintId);
  if (Array.isArray(learned)) return learned.includes(blueprintId);
  return false;
}

export function recipeMaterialCosts(recipe, limit = CRAFT_MAX_MATERIALS) {
  return Object.entries(recipe.costs ?? {})
    .slice(0, limit)
    .map(([key, amount]) => ({
    kind: 'material',
    key,
    amount,
  }));
}

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
  if (item.kind === 'bandage' || item.kind === 'consumable') {
    const normalized = normalizeConsumableItem(item);
    if (!normalized) return false;
    let left = normalized.amount ?? 1;
    for (let i = 0; i < player.itemSlots.length; i++) {
      if (!player.isItemSlotUnlocked(i)) continue;
      const slot = player.itemSlots[i];
      const slotItem = normalizeConsumableItem(slot);
      if (slotItem?.key === normalized.key) {
        left -= Math.max(0, CONSUMABLE_STACK_MAX - slotItem.amount);
      }
    }
    for (let i = 0; i < player.itemSlots.length && left > 0; i++) {
      if (!player.isItemSlotUnlocked(i)) continue;
      if (player.itemSlots[i] == null) left -= CONSUMABLE_STACK_MAX;
    }
    return left <= 0;
  }
  if (item.kind === 'equipment') {
    return !!normalizeEquipmentItem(item)
      && player.itemSlots.some((s, i) => s == null && player.isItemSlotUnlocked(i));
  }
  if (item.kind === 'throwable') {
    return !!normalizeThrowableItem(item)
      && player.itemSlots.some((s, i) => s == null && player.isItemSlotUnlocked(i));
  }
  if (item.kind === 'weapon' || item.kind === 'melee') {
    return player.itemSlots.some((s, i) => s == null && player.isItemSlotUnlocked(i));
  }
  if (item.kind === 'material') {
    return materialRoom(player, item.key, item.amount ?? 1);
  }
  return player.itemSlots.some((s, i) => s == null && player.isItemSlotUnlocked(i));
}

export function canCraftRecipe(player, recipe) {
  return !!stageCraft(player, recipe);
}

function stageCraft(player, recipe) {
  if (!player || !recipe || !isRecipeUnlocked(player, recipe) || !player.hasMaterials(recipe.costs)) return null;
  const staged = Object.create(player);
  staged.itemSlots = player.itemSlots.map((slot) => slot && { ...slot });
  if (!staged.consumeMaterials(recipe.costs)) return null;
  const stored = staged.tryStoreItem({ ...recipe.output });
  return stored.ok && !stored.remainder ? staged.itemSlots : null;
}

export function craftRecipe(player, recipe) {
  const slots = stageCraft(player, recipe);
  if (!slots) return false;
  player.itemSlots = slots;
  return true;
}

export const recycleBatchSize = (item) => item?.kind === 'ammo' ? economy.economy.ammoRecycleBatch : 1;

export function getRecycleYields(item, count = 1, level = Infinity) {
  if (!item) return null;
  const id = item.kind + '.' + (item.key ?? item.ammoType);
  if (level < (economy.recycleLevels[id] ?? economy.recycleLevels[item.kind] ?? 1)) return null;
  const scale = item.kind === 'ammo' ? Math.floor(count / recycleBatchSize(item)) : Math.max(1, Math.floor(count));
  if (!scale) return [];
  const custom = RECYCLE_TABLE.items[id];
  if (custom) return custom.map(({ key, amount }) => ({ key, amount: amount * scale }));
  if (item.kind === 'weapon') return RECYCLE_TABLE.weapon;
  if (item.kind === 'melee') return RECYCLE_TABLE.melee;
  if (item.kind === 'bandage' || item.kind === 'ammo' || (item.kind === 'consumable' && item.key === 'bandage')) {
    const table = item.kind === 'ammo' ? RECYCLE_TABLE.ammo : RECYCLE_TABLE.bandage;
    return table.map((entry) => ({
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

export function canRecycleItem(item, level = Infinity) {
  return Boolean(getRecycleYields(item, item?.amount ?? 1, level)?.length);
}

export function applyRecycleYields(player, yields) {
  const overflow = [];
  for (const entry of yields) {
    let remaining = entry.amount - player.addMaterialToInventory(entry.key, entry.amount);
    while (remaining > 0) {
      const amount = Math.min(remaining, MATERIAL_STACK_MAX);
      overflow.push({ kind: 'material', key: entry.key, amount });
      remaining -= amount;
    }
  }
  return overflow;
}

export function countMaterialsInSlots(slots) {
  const counts = {};
  for (const item of slots ?? []) {
    if (item?.kind !== 'material') continue;
    counts[item.key] = (counts[item.key] ?? 0) + (item.amount ?? 1);
  }
  return counts;
}

export function findRecipeForCombineSlots(slots, player) {
  const counts = countMaterialsInSlots(slots);
  let best = null;
  let bestCost = -1;
  for (const recipe of getCraftableRecipes(player)) {
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
  const recipe = findRecipeForCombineSlots(slots, player);
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
