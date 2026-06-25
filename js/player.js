import { PLAYER_RADIUS, BULLET_RADIUS } from './world.js';
import { bulletOwnerFeetZ } from './bulletCollision.js';
import { getSheetPlayDuration, gunAimTransform, gunPivotHoldOffset, getIncrementalReloadSpec, getIncrementalReloadFrame, getReloadAnimFrame, REVOLVER_RELOAD_CASING_EJECT_FRAME } from './sprites.js';
import { AMMO_STACK_MAX, getWeaponAmmoType, BANDAGE_STACK_MAX } from './ammo.js';
import { MATERIAL_STACK_MAX, mergeMaterialStacks, normalizeMaterialItem } from './materials.js';

export const GUN_HOLD_OFFSET = 1.1;
/** Extra distance from gun hold point to barrel tip (world units). */
export const BARREL_TIP_OFFSET = 0.55;
/** Screen-up lift for player bullet spawn (pixels at PPU 8). */
export const BULLET_SPAWN_RAISE_PX = 6;

/** 24px diameter damage / melee hit circle at PPU 8. */
export const PLAYER_HIT_RADIUS = 1.5;
/** Movement collision around the legs (screen pixels). */
export const PLAYER_MOVE_W_PX = 16;
export const PLAYER_MOVE_H_PX = 10;
export const PLAYER_SPRITE_SCALE = 1.5;

const SCREEN_PPU = 5.5;

export const ITEM_STORAGE_SIZE = 20;
export const UNLOCKED_ITEM_SLOTS = 20;
export const EQUIPMENT_SLOT_COUNT = 4;

export const WEAPONS = {
  glock: {
    name: 'Glock',
    magSize: 12,
    damage: 10,
    fireRate: 0,
    reloadTime: 1.6,
    bulletSpeed: 150,
    spread: 0.04,
    pellets: 1,
    sprite: 'glock',
    shotSprite: 'glock_shot',
    sound: 'glock',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
  m16: {
    name: 'M16',
    magSize: 30,
    damage: 12,
    fireRate: 0.09,
    automatic: true,
    reloadTime: 2.0,
    bulletSpeed: 150,
    spread: 0.015,
    pellets: 1,
    sprite: 'm16',
    shotSprite: 'm16_shot',
    sound: 'm16',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
  m870: {
    name: '870',
    magSize: 6,
    damage: 12,
    fireRate: 0.9,
    reloadTime: 2.6,
    reloadStyle: 'incremental',
    bulletSpeed: 100,
    spread: 0.5,
    pellets: 8,
    sprite: 'm870',
    shotSprite: 'm870_shot',
    sound: 'm870',
    casingMode: 'mid_cooldown',
    casingColor: 'red',
  },
  m24: {
    name: 'M24',
    magSize: 5,
    damage: 85,
    fireRate: 1.15,
    reloadTime: 2.8,
    reloadStyle: 'incremental',
    bulletSpeed: 150,
    spread: 0.005,
    pellets: 1,
    sprite: 'm24',
    shotSprite: 'm24_shot',
    sound: 'm24',
    casingMode: 'mid_cooldown',
    casingColor: 'yellow',
  },
  uzi: {
    name: 'Uzi',
    magSize: 32,
    damage: 8,
    fireRate: 0.06,
    automatic: true,
    reloadTime: 1.8,
    bulletSpeed: 150,
    spread: 0.09,
    pellets: 1,
    sprite: 'uzi',
    shotSprite: 'uzi_shot',
    sound: 'uzi',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
  revolver: {
    name: 'Revolver',
    magSize: 6,
    damage: 30,
    fireRate: 0.48,
    reloadTime: 2,
    bulletSpeed: 150,
    spread: 0.03,
    pellets: 1,
    sprite: 'revolver',
    shotSprite: 'revolver_shot',
    sound: 'revolver',
    casingColor: 'yellow',
  },
  famas: {
    name: 'Famas',
    magSize: 25,
    damage: 10,
    fireRate: 0.07,
    automatic: true,
    reloadTime: 2.1,
    bulletSpeed: 150,
    spread: 0.028,
    pellets: 1,
    sprite: 'famas',
    shotSprite: 'famas_shot',
    sound: 'famas',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
  fal: {
    name: 'FAL',
    magSize: 20,
    damage: 18,
    fireRate: 0.14,
    automatic: true,
    reloadTime: 2.3,
    bulletSpeed: 150,
    spread: 0.02,
    pellets: 1,
    sprite: 'fal',
    shotSprite: 'fal_shot',
    sound: 'fal',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

export const MELEE_WEAPONS = {
  knife: {
    name: 'Knife',
    damage: 35,
    range: 2.2,
    arc: Math.PI * 0.65,
    swingDuration: 0.22,
    swingDownRatio: 0.34,
    swingAngle: Math.PI / 2.4,
    maxChargeTime: 0.75,
    minDamageMult: 0.1,
    maxDamageMult: 1.5,
    maxRaiseAngle: Math.PI / 2.8,
    sprite: 'knife',
  },
  fire_axe: {
    name: 'Fire axe',
    damage: 55,
    range: 3.5,
    arc: Math.PI * 0.72,
    swingDuration: 0.38,
    swingDownRatio: 0.36,
    swingAngle: Math.PI / 2.0,
    maxChargeTime: 1.5,
    minDamageMult: 0.1,
    maxDamageMult: 1.5,
    maxRaiseAngle: Math.PI / 2.2,
    sprite: 'fire_axe',
  },
  wooden_bat: {
    name: 'Bat',
    damage: 25,
    range: 3,
    arc: Math.PI * 0.78,
    swingDuration: 0.26,
    swingDownRatio: 0.34,
    swingAngle: Math.PI / 2.5,
    maxChargeTime: 0.85,
    minDamageMult: 0.1,
    maxDamageMult: 1.5,
    maxRaiseAngle: Math.PI / 2.6,
    sprite: 'wooden_bat',
  },
  crowbar: {
    name: 'Crowbar',
    damage: 32,
    range: 2.2,
    arc: Math.PI * 0.68,
    swingDuration: 0.24,
    swingDownRatio: 0.32,
    swingAngle: Math.PI / 2.35,
    maxChargeTime: 0.7,
    minDamageMult: 0.1,
    maxDamageMult: 1.5,
    maxRaiseAngle: Math.PI / 2.7,
    sprite: 'crowbar',
  },
};

export const MELEE_KEYS = Object.keys(MELEE_WEAPONS);

/** Default when main hand has no gun — not storable in inventory. */
export const HAND_MELEE = {
  name: 'Hand',
  damage: 5,
  range: 1.9,
  arc: Math.PI * 0.55,
  swingDuration: 0.2,
  swingDownRatio: 0.42,
  swingAngle: Math.PI / 3.2,
  maxChargeTime: 0,
  noCharge: true,
  minDamageMult: 1,
  maxDamageMult: 1,
  maxRaiseAngle: 0,
  sprite: 'hand',
};

/** @deprecated use getActiveMelee() */
export const MELEE_WEAPON = MELEE_WEAPONS.knife;

export const SHOT_FLASH_DURATION = 1 / 30;

const RECOIL_PUSH = {
  glock: 0.14,
  m16: 0.22,
  m870: 0.5,
  m24: 0.75,
  uzi: 0.12,
  revolver: 0.28,
  famas: 0.2,
  fal: 0.3,
};

export class Player {
  constructor() {
    this.x = 0;
    this.z = 0;
    this.angle = 0;
    this.speed = 10.5;
    this.sprintMult = 1.5;
    this.maxHealth = 100;
    this.health = 100;
    this.alive = true;
    this.radius = PLAYER_HIT_RADIUS;
    this.isMoving = false;
    this.isSprinting = false;
    this.moveSpeed = 0;
    this.walkPhase = 0;
    this.moveDirX = 0;
    this.moveDirZ = 0;
    this.knockVX = 0;
    this.knockVZ = 0;
    this.weaponSlot = 'gun';
    this.melee = {
      charging: false,
      chargeStart: 0,
      swingStart: 0,
      swingUntil: 0,
      swingCharge: 0,
      hitApplied: false,
    };
    this.meleeKey = 'wooden_bat';
    this.shotFlashUntil = 0;
    this.casingMidEmitted = false;
    this.casingCooldownWeaponKey = null;
    this.reloadAim = {
      phase: 'idle',
      fromAngle: 0,
      lowerStart: 0,
    };
    this.gunKick = 0;
    this.invulnTimer = 0;
    this.shield = 0;
    this.powerUps = { speed: { until: 0 }, damage: { mult: 1.5, until: 0 } };
    this.itemSlots = Array(ITEM_STORAGE_SIZE).fill(null);
    this.equipmentSlots = Array(EQUIPMENT_SLOT_COUNT).fill(null);
    this.weaponKey = 'glock';
    this.weapon = this._buildWeaponRuntime('glock', WEAPONS.glock.magSize);
    this.itemSlots[0] = { kind: 'ammo', ammoType: 'pistol', amount: 30 };
    this.itemSlots[1] = { kind: 'bandage', amount: 1 };
  }

  /** Hydrate player from a save snapshot. */
  applySaveData(data) {
    this.x = data.x;
    this.z = data.z;
    this.angle = data.angle ?? 0;
    this.health = data.health;
    this.maxHealth = data.maxHealth ?? 100;
    this.shield = data.shield ?? 0;
    this.alive = data.alive !== false;
    this.weaponSlot = data.weaponSlot ?? 'gun';
    this.meleeKey = data.meleeKey ?? 'wooden_bat';
    this.itemSlots = data.itemSlots.map((s) => (s ? { ...s } : null));
    this.equipmentSlots = data.equipmentSlots.map((s) => (s ? { ...s } : null));
    this.powerUps = {
      speed: { until: data.powerUps?.speed?.until ?? 0 },
      damage: {
        mult: data.powerUps?.damage?.mult ?? 1.5,
        until: data.powerUps?.damage?.until ?? 0,
      },
    };
    this.invulnTimer = 0;
    this.melee = {
      charging: false,
      chargeStart: 0,
      swingStart: 0,
      swingUntil: 0,
      swingCharge: 0,
      hitApplied: false,
    };
    this.reloadAim = { phase: 'idle', fromAngle: 0, lowerStart: 0 };

    if (data.weaponKey && WEAPONS[data.weaponKey]) {
      this.weaponKey = data.weaponKey;
      const ammo = data.weaponAmmo ?? WEAPONS[data.weaponKey].magSize;
      this.weapon = this._buildWeaponRuntime(data.weaponKey, ammo);
    } else {
      this.weaponKey = null;
      this.weapon = null;
    }
  }

  _normalizeWeaponItem(item) {
    if (!item || item.kind !== 'weapon') return item;
    const cfg = WEAPONS[item.key];
    if (!cfg) return item;
    const ammo = item.ammo ?? cfg.magSize;
    return { kind: 'weapon', key: item.key, ammo: Math.min(cfg.magSize, Math.max(0, ammo)) };
  }

  _weaponItemFromEquipped() {
    if (!this.weaponKey || !this.weapon) return null;
    return { kind: 'weapon', key: this.weaponKey, ammo: this.weapon.ammo };
  }

  /** @deprecated equipped gun ammo is kept on this.weapon until slot swap */
  _saveWeaponState() {}

  _now() {
    return performance.now() / 1000;
  }

  /** Legs AABB for movement — doorway overlap uses getPlayerFeetStripBounds separately. */
  getMoveCollider(ppu = 8) {
    const zOffPx = 6 * PLAYER_SPRITE_SCALE;
    return {
      kind: 'aabb',
      zOff: zOffPx / ppu,
      halfW: (PLAYER_MOVE_W_PX * 0.5) / ppu,
      halfH: (PLAYER_MOVE_H_PX * 0.5) / ppu,
    };
  }

  getHitCollider() {
    return { kind: 'circle', radius: this.radius };
  }

  _cancelActiveReload() {
    if (!this.weapon?.reloading) return false;
    return this.cancelReload(this._now());
  }

  _abortReloadForMeleeSwitch() {
    this._cancelActiveReload();
  }

  _meleeItemFromEquipped() {
    if (!this.meleeKey) return null;
    return { kind: 'melee', key: this.meleeKey };
  }

  _buildWeaponRuntime(key, ammo = null) {
    const cfg = WEAPONS[key];
    if (!cfg) return null;
    return {
      ...cfg,
      ammo: ammo != null ? ammo : cfg.magSize,
      lastShot: this.weapon?.lastShot ?? 0,
      reloading: false,
      reloadStart: 0,
      reloadIncremental: null,
      casingsToEject: 0,
      casingsEjected: false,
    };
  }

  isIncrementalReloadWeapon(key = this.weaponKey) {
    return WEAPONS[key]?.reloadStyle === 'incremental';
  }

  /** Swap the equipped main weapon with a gun in an inventory slot (slot-to-slot). */
  swapItemSlotWithMain(slotIndex) {
    if (!this.isItemSlotUnlocked(slotIndex)) return false;
    const incoming = this.itemSlots[slotIndex];
    if (!incoming || incoming.kind !== 'weapon') return false;
    return this.equipWeaponIntoSlot(slotIndex, incoming);
  }

  /** Equip a gun into the main hand; previous main weapon goes into slotIndex. */
  equipWeaponIntoSlot(slotIndex, incomingItem) {
    if (!this.isItemSlotUnlocked(slotIndex)) return false;
    const incoming = this._normalizeWeaponItem(incomingItem);
    if (!incoming || incoming.kind !== 'weapon' || !WEAPONS[incoming.key]) return false;
    this._cancelActiveReload();
    const outgoing = this._weaponItemFromEquipped();
    this.weaponKey = incoming.key;
    this.weapon = this._buildWeaponRuntime(incoming.key, incoming.ammo);
    this.weaponSlot = 'gun';
    if (incoming.key !== this.casingCooldownWeaponKey) {
      this.casingMidEmitted = true;
      this.casingCooldownWeaponKey = null;
    }
    this.itemSlots[slotIndex] = outgoing;
    return true;
  }

  /** Equip a gun from a chest slot; previous main weapon goes into that chest slot. */
  equipWeaponFromChest(chestSlots, chestIndex, item) {
    const incoming = this._normalizeWeaponItem(item);
    if (!WEAPONS[incoming.key]) return false;
    this._cancelActiveReload();
    chestSlots[chestIndex] = this._weaponItemFromEquipped();
    this.weaponKey = incoming.key;
    this.weapon = this._buildWeaponRuntime(incoming.key, incoming.ammo);
    this.weaponSlot = 'gun';
    this.casingMidEmitted = true;
    this.casingCooldownWeaponKey = null;
    return true;
  }

  isItemSlotUnlocked(index) {
    return index < UNLOCKED_ITEM_SLOTS;
  }

  /** Swap equipped melee with a melee item in an inventory slot. */
  equipMeleeFromSlot(slotIndex, incomingItem = null) {
    if (!this.isItemSlotUnlocked(slotIndex)) return false;
    const incoming = incomingItem ?? this.itemSlots[slotIndex];
    if (!incoming || incoming.kind !== 'melee' || !MELEE_WEAPONS[incoming.key]) return false;
    if (incoming.key === this.meleeKey && this.weaponSlot === 'melee') return false;
    this._abortReloadForMeleeSwitch();
    const outgoing = this._meleeItemFromEquipped();
    this.meleeKey = incoming.key;
    this.weaponSlot = 'melee';
    this.melee.charging = false;
    this.itemSlots[slotIndex] = outgoing;
    return true;
  }

  equipMeleeFromChest(chestSlots, chestIndex, item) {
    if (!item || item.kind !== 'melee' || !MELEE_WEAPONS[item.key]) return false;
    this._abortReloadForMeleeSwitch();
    chestSlots[chestIndex] = this._meleeItemFromEquipped();
    this.meleeKey = item.key;
    this.weaponSlot = 'melee';
    this.melee.charging = false;
    return true;
  }

  suspendMainWeaponForDrag() {
    const item = this._weaponItemFromEquipped();
    if (!item) return null;
    this._cancelActiveReload();
    this.weaponKey = null;
    this.weapon = null;
    return item;
  }

  restoreMainWeapon(item) {
    if (!item || item.kind !== 'weapon' || !WEAPONS[item.key]) return;
    this.weaponKey = item.key;
    this.weapon = this._buildWeaponRuntime(item.key, item.ammo ?? 0);
    this.weaponSlot = 'gun';
  }

  suspendMeleeForDrag() {
    const item = this._meleeItemFromEquipped();
    if (!item) return null;
    this._abortReloadForMeleeSwitch();
    if (this.weaponSlot === 'melee') this.weaponSlot = 'gun';
    this.meleeKey = null;
    return item;
  }

  restoreMeleeWeapon(item) {
    if (!item || item.kind !== 'melee' || !MELEE_WEAPONS[item.key]) return;
    this.meleeKey = item.key;
    this.weaponSlot = 'melee';
    this.melee.charging = false;
  }

  hasEquippedMelee() {
    return !!this.meleeKey;
  }

  /** Unload the equipped gun's magazine into inventory ammo stacks. */
  takeAmmoFromEquippedGun() {
    const item = this._weaponItemFromEquipped();
    if (!item) return { ok: false, taken: 0 };
    const result = this.takeLoadedAmmoFromWeapon(item);
    if (result.ok && this.weapon) this.weapon.ammo = item.ammo;
    return result;
  }

  /** Unload a stored gun's magazine into inventory ammo stacks. */
  takeLoadedAmmoFromWeapon(item) {
    if (!item || item.kind !== 'weapon' || !WEAPONS[item.key]) {
      return { ok: false, taken: 0 };
    }
    const inMag = Math.max(0, Math.floor(item.ammo ?? 0));
    if (inMag <= 0) return { ok: false, taken: 0 };
    const ammoType = getWeaponAmmoType(item.key);
    const stored = this.addAmmoToInventory(ammoType, inMag);
    if (stored <= 0) return { ok: false, taken: 0 };
    item.ammo = inMag - stored;
    return { ok: true, taken: stored };
  }

  grantRandomWeapon() {
    const key = WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
    const idx = this.itemSlots.findIndex((s, i) => s == null && this.isItemSlotUnlocked(i));
    if (idx < 0) return null;
    const cfg = WEAPONS[key];
    this.itemSlots[idx] = { kind: 'weapon', key, ammo: cfg.magSize };
    return key;
  }

  grantRandomMelee() {
    const key = MELEE_KEYS[Math.floor(Math.random() * MELEE_KEYS.length)];
    const idx = this.itemSlots.findIndex((s, i) => s == null && this.isItemSlotUnlocked(i));
    if (idx < 0) return null;
    this.itemSlots[idx] = { kind: 'melee', key };
    return key;
  }

  getWeapon() {
    return this.weapon;
  }

  getCurrentAmmoType() {
    return getWeaponAmmoType(this.weaponKey);
  }

  countInventoryAmmo(ammoType) {
    let total = 0;
    for (let i = 0; i < this.itemSlots.length; i++) {
      const slot = this.itemSlots[i];
      if (!this.isItemSlotUnlocked(i)) continue;
      if (slot?.kind === 'ammo' && slot.ammoType === ammoType) {
        total += slot.amount ?? 0;
      }
    }
    return total;
  }

  getReserveAmmo() {
    if (!this.weaponKey) return 0;
    return this.countInventoryAmmo(this.getCurrentAmmoType());
  }

  consumeAmmo(ammoType, amount) {
    let left = amount;
    for (let i = 0; i < this.itemSlots.length && left > 0; i++) {
      if (!this.isItemSlotUnlocked(i)) continue;
      const slot = this.itemSlots[i];
      if (slot?.kind !== 'ammo' || slot.ammoType !== ammoType) continue;
      const take = Math.min(left, slot.amount ?? 0);
      slot.amount -= take;
      left -= take;
      if (slot.amount <= 0) this.itemSlots[i] = null;
    }
    return amount - left;
  }

  addAmmoToInventory(ammoType, amount) {
    let left = Math.max(0, Math.floor(amount));
    if (left <= 0) return 0;

    for (let i = 0; i < this.itemSlots.length && left > 0; i++) {
      if (!this.isItemSlotUnlocked(i)) continue;
      const slot = this.itemSlots[i];
      if (slot?.kind !== 'ammo' || slot.ammoType !== ammoType) continue;
      const room = AMMO_STACK_MAX - (slot.amount ?? 0);
      if (room <= 0) continue;
      const add = Math.min(room, left);
      slot.amount += add;
      left -= add;
    }

    while (left > 0) {
      const idx = this.itemSlots.findIndex((s, i) => s == null && this.isItemSlotUnlocked(i));
      if (idx < 0) break;
      const add = Math.min(left, AMMO_STACK_MAX);
      this.itemSlots[idx] = { kind: 'ammo', ammoType, amount: add };
      left -= add;
    }

    return amount - left;
  }

  addBandageToInventory(amount = 1) {
    let left = Math.max(1, Math.floor(amount));
    for (let i = 0; i < this.itemSlots.length && left > 0; i++) {
      if (!this.isItemSlotUnlocked(i)) continue;
      const slot = this.itemSlots[i];
      if (slot?.kind !== 'bandage') continue;
      const room = BANDAGE_STACK_MAX - (slot.amount ?? 1);
      if (room <= 0) continue;
      const add = Math.min(room, left);
      slot.amount = (slot.amount ?? 1) + add;
      left -= add;
    }
    while (left > 0) {
      const idx = this.itemSlots.findIndex((s, i) => s == null && this.isItemSlotUnlocked(i));
      if (idx < 0) break;
      const add = Math.min(left, BANDAGE_STACK_MAX);
      this.itemSlots[idx] = { kind: 'bandage', amount: add };
      left -= add;
    }
    return amount - left;
  }

  addMaterialToInventory(key, amount = 1) {
    let left = Math.max(1, Math.floor(amount));
    for (let i = 0; i < this.itemSlots.length && left > 0; i++) {
      if (!this.isItemSlotUnlocked(i)) continue;
      const slot = this.itemSlots[i];
      if (slot?.kind !== 'material' || slot.key !== key) continue;
      const room = MATERIAL_STACK_MAX - (slot.amount ?? 1);
      if (room <= 0) continue;
      const add = Math.min(room, left);
      slot.amount = (slot.amount ?? 1) + add;
      left -= add;
    }
    while (left > 0) {
      const idx = this.itemSlots.findIndex((s, i) => s == null && this.isItemSlotUnlocked(i));
      if (idx < 0) break;
      const add = Math.min(left, MATERIAL_STACK_MAX);
      this.itemSlots[idx] = { kind: 'material', key, amount: add };
      left -= add;
    }
    return amount - left;
  }

  /** Move an item into inventory, merging stacks when possible. */
  tryStoreItem(item) {
    if (!item) return { ok: false, remainder: null };
    if (item.kind === 'ammo') {
      const ammoType = item.ammoType ?? 'pistol';
      const amount = item.amount ?? 0;
      const stored = this.addAmmoToInventory(ammoType, amount);
      if (stored >= amount) return { ok: true, remainder: null };
      if (stored > 0) {
        return { ok: true, remainder: { kind: 'ammo', ammoType, amount: amount - stored } };
      }
      return { ok: false, remainder: item };
    }
    if (item.kind === 'bandage') {
      const amount = item.amount ?? 1;
      const stored = this.addBandageToInventory(amount);
      if (stored >= amount) return { ok: true, remainder: null };
      if (stored > 0) {
        return { ok: true, remainder: { kind: 'bandage', amount: amount - stored } };
      }
      return { ok: false, remainder: item };
    }
    if (item.kind === 'material') {
      const normalized = normalizeMaterialItem(item);
      const stored = this.addMaterialToInventory(normalized.key, normalized.amount);
      if (stored >= normalized.amount) return { ok: true, remainder: null };
      if (stored > 0) {
        return {
          ok: true,
          remainder: { kind: 'material', key: normalized.key, amount: normalized.amount - stored },
        };
      }
      return { ok: false, remainder: item };
    }
    if (item.kind === 'weapon') {
      if (!WEAPONS[item.key]) return { ok: false, remainder: item };
      const idx = this.itemSlots.findIndex((s, i) => s == null && this.isItemSlotUnlocked(i));
      if (idx < 0) return { ok: false, remainder: item };
      this.itemSlots[idx] = this._normalizeWeaponItem(item);
      return { ok: true, remainder: null };
    }
    if (item.kind === 'melee') {
      if (!MELEE_WEAPONS[item.key]) return { ok: false, remainder: item };
      const idx = this.itemSlots.findIndex((s, i) => s == null && this.isItemSlotUnlocked(i));
      if (idx < 0) return { ok: false, remainder: item };
      this.itemSlots[idx] = { kind: 'melee', key: item.key };
      return { ok: true, remainder: null };
    }
    const idx = this.itemSlots.findIndex((s, i) => s == null && this.isItemSlotUnlocked(i));
    if (idx < 0) return { ok: false, remainder: item };
    this.itemSlots[idx] = item;
    return { ok: true, remainder: null };
  }

  getActiveMelee() {
    if (this.isMeleeActive() && this.meleeKey) {
      return MELEE_WEAPONS[this.meleeKey] ?? null;
    }
    if (this.isUnarmed()) return HAND_MELEE;
    return null;
  }

  isUnarmed() {
    return (this.weaponSlot === 'gun' && !this.weaponKey)
      || (this.weaponSlot === 'melee' && !this.meleeKey);
  }

  usesMeleeCombat() {
    return this.isMeleeActive() || this.isUnarmed();
  }

  equipMelee(key) {
    if (!MELEE_WEAPONS[key]) return false;
    this._abortReloadForMeleeSwitch();
    this.meleeKey = key;
    this.weaponSlot = 'melee';
    this.melee.charging = false;
    return true;
  }

  getWeaponDraw(time = 0) {
    if (this.isMeleeActive() && this.meleeKey) {
      const melee = MELEE_WEAPONS[this.meleeKey];
      if (melee) return { sheet: melee.sprite };
    }
    if (this.isUnarmed()) return { sheet: HAND_MELEE.sprite };
    const cfg = WEAPONS[this.weaponKey];
    if (!cfg) return { sheet: HAND_MELEE.sprite };

    if (this.weapon?.reloading) {
      const sprite = cfg.sprite;
      if (this.isIncrementalReloadWeapon()) {
        return {
          sheet: `${sprite}_reload`,
          frame: getIncrementalReloadFrame(sprite, this.weapon.reloadIncremental, time),
        };
      }
      return {
        sheet: `${sprite}_reload`,
        elapsed: time - this.weapon.reloadStart,
      };
    }

    if (time && time < this.shotFlashUntil && cfg.shotSprite) {
      return { sheet: cfg.shotSprite };
    }

    if (cfg.casingMode === 'mid_cooldown' && this.weapon?.lastShot != null) {
      const elapsed = time - this.weapon.lastShot;
      const cycleSheet = `${cfg.sprite}_cycle`;
      const cycleStart = SHOT_FLASH_DURATION;
      if (elapsed >= cycleStart && elapsed < cycleStart + getSheetPlayDuration(cycleSheet)) {
        return { sheet: cycleSheet, elapsed: elapsed - cycleStart };
      }
    }
    return { sheet: cfg.sprite || 'm16' };
  }

  /** @deprecated use getWeaponDraw */
  getWeaponSprite(time = 0) {
    return this.getWeaponDraw(time).sheet;
  }

  toggleWeaponSlot() {
    if (this.isMeleeActive()) return this.setWeaponSlot('gun');
    if (this.meleeKey) return this.equipMelee(this.meleeKey);
    return this.setWeaponSlot('melee');
  }

  swapItemSlots(a, b) {
    if (a === b) return false;
    if (!this.isItemSlotUnlocked(a) || !this.isItemSlotUnlocked(b)) return false;
    const tmp = this.itemSlots[a];
    this.itemSlots[a] = this.itemSlots[b];
    this.itemSlots[b] = tmp;
    return true;
  }

  /** @deprecated use swapItemSlotWithMain */
  swapItemSlotWithMelee(slotIndex) {
    return this.equipMeleeFromSlot(slotIndex);
  }

  getStealthMult() {
    return 1;
  }

  setWeaponSlot(slot) {
    if (slot !== 'gun' && slot !== 'melee') return false;
    if (slot === 'melee') {
      this._abortReloadForMeleeSwitch();
      if (this.weaponSlot === 'gun') {
        this.casingMidEmitted = true;
        this.casingCooldownWeaponKey = null;
      }
    }
    this.melee.charging = false;
    this.weaponSlot = slot;
    return true;
  }

  isMeleeActive() {
    return this.weaponSlot === 'melee';
  }

  /** Charging or mid-swing — skip idle breath on the held weapon. */
  isMeleeAnimating(time = 0) {
    if (!this.usesMeleeCombat()) return false;
    return this.melee.charging || time < this.melee.swingUntil;
  }

  isAutomaticWeapon() {
    if (this.isMeleeActive() || !this.weaponKey) return false;
    return !!WEAPONS[this.weaponKey]?.automatic;
  }

  getWeaponCycleList() {
    const list = [];
    if (this.weaponKey) {
      list.push({ type: 'gun', key: this.weaponKey, slot: null });
    }
    for (let i = 0; i < this.itemSlots.length; i++) {
      if (!this.isItemSlotUnlocked(i)) continue;
      const s = this.itemSlots[i];
      if (s?.kind === 'weapon') list.push({ type: 'gun', key: s.key, slot: i });
      if (s?.kind === 'melee') list.push({ type: 'melee', key: s.key, slot: i });
    }
    if (this.meleeKey) {
      list.push({ type: 'melee', key: this.meleeKey, slot: null });
    }
    return list;
  }

  cycleWeapon(delta) {
    const list = this.getWeaponCycleList();
    if (list.length <= 1) return false;

    let idx = list.findIndex((s) => (
      s.type === 'melee'
        ? this.isMeleeActive() && s.key === this.meleeKey && s.slot == null
        : !this.isMeleeActive() && s.key === this.weaponKey && s.slot == null
    ));
    if (idx < 0) idx = 0;

    const next = list[(idx + delta + list.length) % list.length];
    if (next.type === 'melee') {
      if (next.slot != null) return this.equipMeleeFromSlot(next.slot);
      if (this.isMeleeActive() && next.key === this.meleeKey) return false;
      return this.equipMelee(next.key);
    }
    if (next.slot != null) return this.swapItemSlotWithMain(next.slot);
    if (!this.isMeleeActive() && next.key === this.weaponKey) return false;
    this.setWeaponSlot('gun');
    return true;
  }

  getDisplayWeapon() {
    if (this.isMeleeActive()) {
      return this.getActiveMelee() ?? HAND_MELEE;
    }
    if (this.weapon) return this.weapon;
    return HAND_MELEE;
  }

  canMeleeCharge(time) {
    if (this.isMeleeSwinging(time)) return false;
    if (this.melee.charging) return false;
    return true;
  }

  isMeleeCharging() {
    return this.melee.charging;
  }

  startMeleeCharge(time) {
    const melee = this.getActiveMelee();
    if (!melee || melee.noCharge) return false;
    if (!this.canMeleeCharge(time)) return false;
    this.melee.charging = true;
    this.melee.chargeStart = time;
    this.melee.swingCharge = 0;
    return true;
  }

  startInstantMeleeSwing(time) {
    const melee = this.getActiveMelee();
    if (!melee || !this.canMeleeCharge(time)) return false;
    this.melee.charging = false;
    this.melee.swingCharge = 1;
    this.melee.swingStart = time;
    this.melee.swingUntil = time + melee.swingDuration;
    this.melee.hitApplied = false;
    return true;
  }

  releaseMeleeCharge(time) {
    if (!this.melee.charging) return false;
    this.melee.charging = false;
    const melee = this.getActiveMelee();
    if (!melee) return false;
    const maxT = melee.maxChargeTime ?? 0.85;
    const raw = Math.min(1, (time - this.melee.chargeStart) / maxT);
    this.melee.swingCharge = Math.max(0.06, raw);
    this.melee.swingStart = time;
    const charge = this.melee.swingCharge;
    const duration = melee.swingDuration * (0.7 + 0.55 * charge);
    this.melee.swingUntil = time + duration;
    this.melee.hitApplied = false;
    return true;
  }

  getMeleeChargeProgress(time) {
    const melee = this.getActiveMelee();
    if (!melee || melee.noCharge) return 0;
    if (this.melee.charging) {
      const maxT = melee.maxChargeTime ?? 0.85;
      return Math.min(1, (time - this.melee.chargeStart) / maxT);
    }
    return this.melee.swingCharge;
  }

  getMeleeDamageMult(charge = this.melee.swingCharge) {
    const melee = this.getActiveMelee();
    if (!melee || melee.noCharge) return 1;
    const minM = melee.minDamageMult ?? 0.35;
    const maxM = melee.maxDamageMult ?? 1;
    const c = Math.max(0, Math.min(1, charge));
    return minM + c * (maxM - minM);
  }

  getMeleeSwingDuration() {
    const melee = this.getActiveMelee();
    if (!melee) return 0;
    const charge = this.melee.swingCharge;
    return melee.swingDuration * (melee.noCharge ? 1 : (0.7 + 0.55 * charge));
  }

  isMeleeSwinging(time) {
    return time < this.melee.swingUntil;
  }

  getMeleeSwingT(time) {
    if (!this.isMeleeSwinging(time)) return 0;
    const dur = this.getMeleeSwingDuration();
    if (dur <= 0) return 0;
    return Math.min(1, (time - this.melee.swingStart) / dur);
  }

  isMeleeStrikeFrame(time) {
    if (!this.isMeleeSwinging(time) || this.melee.hitApplied) return false;
    const melee = this.getActiveMelee();
    if (!melee) return false;
    const t = this.getMeleeSwingT(time);
    const charge = this.melee.swingCharge;
    const downEnd = (melee.swingDownRatio ?? 0.35) * (melee.noCharge ? 1 : (0.88 + 0.2 * (1 - charge)));
    const strikeT = downEnd * (melee.noCharge ? 0.72 : (0.62 + 0.12 * charge));
    return t >= strikeT;
  }

  _meleeDownEnd(charge = this.melee.swingCharge) {
    const melee = this.getActiveMelee();
    if (!melee) return 0.35;
    return (melee.swingDownRatio ?? 0.35) * (melee.noCharge ? 1 : (0.88 + 0.2 * (1 - charge)));
  }

  _meleeAnimCurve(t) {
    const charge = this.melee.swingCharge;
    const downEnd = this._meleeDownEnd(charge);
    if (t <= downEnd) {
      const p = t / downEnd;
      const pow = 2.4 + charge * 2.2;
      const strike = 1 - (1 - p) ** pow;
      return { strike, lift: strike * (0.25 + charge * 0.35) };
    }
    const p = (t - downEnd) / (1 - downEnd);
    const ease = 1 - (1 - p) ** 3;
    const liftBase = 0.25 + charge * 0.35;
    return { strike: 1 - ease, lift: liftBase * (1 - ease) };
  }

  getMeleeBladeTilt(time) {
    const melee = this.getActiveMelee();
    if (!melee) return 0;
    if (melee.noCharge) return 0;
    if (this.melee.charging) {
      const charge = this.getMeleeChargeProgress(time);
      const raise = (melee.maxRaiseAngle ?? Math.PI / 2.4) * charge;
      return -raise;
    }
    const t = this.getMeleeSwingT(time);
    if (t <= 0) return 0;
    const charge = this.melee.swingCharge;
    const max = melee.swingAngle * (0.55 + 0.45 * charge);
    const startRaise = (melee.maxRaiseAngle ?? Math.PI / 2.4) * charge;
    const downEnd = this._meleeDownEnd(charge);

    if (t <= downEnd) {
      const p = t / downEnd;
      const pow = 2.2 + charge * 2;
      const ease = 1 - (1 - p) ** pow;
      return -startRaise + (max + startRaise) * ease;
    }
    const p = (t - downEnd) / (1 - downEnd);
    const ease = 1 - (1 - p) ** 3;
    return max * (1 - ease);
  }

  getMeleeSwingDrop(time) {
    const melee = this.getActiveMelee();
    if (melee?.noCharge) return 0;
    if (this.melee.charging) {
      return -12 * this.getMeleeChargeProgress(time);
    }
    const t = this.getMeleeSwingT(time);
    if (t <= 0) return 0;
    const lift = this._meleeAnimCurve(t).lift;
    return 14 * lift * (0.75 + this.melee.swingCharge * 0.55);
  }

  getMeleeSwingLunge(time) {
    const melee = this.getActiveMelee();
    if (melee?.noCharge) {
      const t = this.getMeleeSwingT(time);
      if (t <= 0) return 0;
      return 0.52 * this._meleeAnimCurve(t).strike;
    }
    const t = this.getMeleeSwingT(time);
    if (t <= 0) return 0;
    const charge = this.melee.swingCharge;
    return 0.14 * this._meleeAnimCurve(t).strike * (0.65 + charge * 0.65);
  }

  applyShootRecoil() {
    const base = RECOIL_PUSH[this.weaponKey] ?? 0.22;
    const pellets = this.weapon.pellets || 1;
    const push = base * (pellets > 1 ? 1.15 : 1);
    this.gunKick = Math.min(0.55, push * 0.4);
    return {
      x: -Math.sin(this.angle) * push,
      z: -Math.cos(this.angle) * push,
    };
  }

  updateGunKick(dt) {
    if (this.gunKick > 0.001) this.gunKick *= Math.exp(-14 * dt);
    else this.gunKick = 0;
  }

  applyRandomPowerUp() {
    const roll = Math.random();
    const time = performance.now() / 1000;
    if (roll < 0.28) {
      this.powerUps.speed.until = time + 12;
      return 'ADRENALINE — SPEED BOOST';
    }
    if (roll < 0.55) {
      this.powerUps.damage.until = time + 12;
      return 'OVERCHARGE — +50% DAMAGE';
    }
    if (roll < 0.78) {
      this.shield = Math.min(60, this.shield + 40);
      return 'COMBAT SHIELD +40';
    }
    this.weapon.ammo = this.weapon.magSize;
    const ammoType = getWeaponAmmoType(this.weaponKey);
    this.addAmmoToInventory(ammoType, this.weapon.magSize * 3);
    this._saveWeaponState();
    return 'Full resupply';
  }

  getSpeedMult(time) {
    return time < this.powerUps.speed.until ? 1.35 : 1;
  }

  getDamageMult(time) {
    return time < this.powerUps.damage.until ? this.powerUps.damage.mult : 1;
  }

  getActivePowerUpLabel(time) {
    const labels = [];
    if (time < this.powerUps.speed.until) labels.push('Speed');
    if (time < this.powerUps.damage.until) labels.push('Damage');
    if (this.shield > 0) labels.push(`SHIELD ${Math.ceil(this.shield)}`);
    return labels.join(' · ');
  }

  addAmmo(amount) {
    return this.addAmmoToInventory(this.getCurrentAmmoType(), amount);
  }

  getMaxReserve() {
    return AMMO_STACK_MAX;
  }

  heal(amount) {
    if (this.health >= this.maxHealth) return false;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return true;
  }

  canShoot(time) {
    if (!this.weapon) return false;
    const w = this.weapon;
    if (w.reloading && !this.isIncrementalReloadWeapon()) return false;
    if (w.ammo <= 0) return false;
    if (w.fireRate <= 0) return true;
    return time - w.lastShot >= w.fireRate;
  }

  wantsAutoReload(time) {
    if (this.isMeleeActive() || !this.weaponKey) return false;
    const w = this.weapon;
    if (!w || w.reloading) return false;
    return w.ammo <= 0 && this.getReserveAmmo() > 0;
  }

  shoot(time) {
    const w = this.weapon;
    if (w.reloading && this.isIncrementalReloadWeapon()) {
      this.cancelReload(time);
    }
    w.lastShot = time;
    w.ammo--;
    this.shotFlashUntil = time + SHOT_FLASH_DURATION;
    this.casingMidEmitted = false;
    this.casingCooldownWeaponKey = this.weaponKey;
    this._saveWeaponState();
    return w;
  }

  cancelReload(time) {
    const w = this.weapon;
    if (!w?.reloading) return false;
    w.reloading = false;
    w.reloadIncremental = null;
    w.casingsToEject = 0;
    w.casingsEjected = false;
    this.reloadAim.phase = 'lower';
    this.reloadAim.lowerStart = time;
    this._saveWeaponState();
    return true;
  }

  startReload(time) {
    if (this.isMeleeActive() || !this.weaponKey) return false;
    if (!this.weapon) return false;
    const w = this.weapon;
    if (w.reloading) {
      if (this.isIncrementalReloadWeapon()) {
        this.cancelReload(time);
        return { ok: true, cancelled: true };
      }
      return false;
    }
    if (w.ammo === w.magSize || this.getReserveAmmo() <= 0) return false;
    const aim = gunAimTransform(this.angle);
    w.reloading = true;
    w.reloadStart = time;
    this.reloadAim.fromAngle = aim.angle;
    this.reloadAim.phase = 'raise';

    if (this.weaponKey === 'revolver') {
      w.casingsToEject = w.magSize - w.ammo;
      w.casingsEjected = false;
    } else {
      w.casingsToEject = 0;
      w.casingsEjected = false;
    }

    if (this.isIncrementalReloadWeapon()) {
      w.reloadIncremental = {
        phase: 'intro',
        phaseStart: time,
        shellStart: time,
        shellsLoaded: 0,
      };
      return { ok: true, incremental: true };
    }

    const casingReload = WEAPONS[this.weaponKey]?.casingMode === 'on_reload';
    return { ok: true, casingReload };
  }

  _finishIncrementalReload(time) {
    const w = this.weapon;
    w.reloading = false;
    w.reloadIncremental = null;
    this.reloadAim.phase = 'lower';
    this.reloadAim.lowerStart = time;
    this._saveWeaponState();
  }

  _updateIncrementalReload(time) {
    const w = this.weapon;
    const inc = w.reloadIncremental;
    if (!inc) return null;

    const sprite = WEAPONS[this.weaponKey]?.sprite;
    const spec = getIncrementalReloadSpec(sprite);
    if (!spec) {
      this._finishIncrementalReload(time);
      return { finished: true };
    }

    if (inc.phase === 'intro') {
      if (!spec.hasIntro) {
        inc.phase = 'loop';
        inc.phaseStart = time;
        inc.shellStart = time;
        return null;
      }
      const introDur = (spec.introEnd + 1) / spec.fps;
      if (time - inc.phaseStart >= introDur) {
        inc.phase = 'loop';
        inc.phaseStart = time;
        inc.shellStart = time;
      }
      return null;
    }

    if (inc.phase === 'loop') {
      if (time - inc.shellStart < spec.shellSec) return null;

      const needed = w.magSize - w.ammo;
      const reserve = this.getReserveAmmo();
      if (needed <= 0 || reserve <= 0) {
        this._finishIncrementalReload(time);
        return { finished: true };
      }

      w.ammo += 1;
      this.consumeAmmo(this.getCurrentAmmoType(), 1);
      inc.shellsLoaded += 1;
      inc.shellStart = time;
      this._saveWeaponState();

      const magFull = w.ammo >= w.magSize;
      const noReserve = this.getReserveAmmo() <= 0;

      if (magFull && spec.hasOutro) {
        inc.phase = 'outro';
        inc.phaseStart = time;
        return { shellLoaded: true };
      }

      if (magFull || noReserve) {
        this._finishIncrementalReload(time);
        return { finished: true, shellLoaded: true };
      }

      return { shellLoaded: true };
    }

    if (inc.phase === 'outro') {
      const outroFrames = spec.outroEnd - spec.outroStart + 1;
      const outroDur = outroFrames / spec.fps;
      if (time - inc.phaseStart >= outroDur) {
        this._finishIncrementalReload(time);
        return { finished: true };
      }
      return null;
    }

    return null;
  }

  _checkRevolverReloadCasingEject(time) {
    if (this.weaponKey !== 'revolver' || !this.weapon?.reloading) return null;
    const w = this.weapon;
    if (w.casingsEjected || w.casingsToEject <= 0) return null;
    const frame = getReloadAnimFrame('revolver', time - w.reloadStart);
    if (frame < REVOLVER_RELOAD_CASING_EJECT_FRAME) return null;
    w.casingsEjected = true;
    return { ejectCasings: w.casingsToEject };
  }

  updateReload(time) {
    if (this.isMeleeActive()) return null;
    const w = this.weapon;
    if (!w?.reloading) return null;

    if (this.isIncrementalReloadWeapon()) {
      return this._updateIncrementalReload(time);
    }

    const casingResult = this._checkRevolverReloadCasingEject(time);

    if (time - w.reloadStart >= w.reloadTime) {
      const needed = w.magSize - w.ammo;
      const reserve = this.getReserveAmmo();
      const taken = Math.min(needed, reserve);
      w.ammo += taken;
      if (taken > 0) this.consumeAmmo(this.getCurrentAmmoType(), taken);
      w.reloading = false;
      w.casingsToEject = 0;
      w.casingsEjected = false;
      this.reloadAim.phase = 'lower';
      this.reloadAim.lowerStart = time;
      this._saveWeaponState();
      return { finished: true, ...casingResult };
    }
    return casingResult;
  }

  getFireCooldownT(time) {
    if (this.isMeleeActive() || !this.weapon || this.weapon.fireRate <= 0) return 0;
    const left = this.weapon.fireRate - (time - this.weapon.lastShot);
    if (left <= 0) return 0;
    return left / this.weapon.fireRate;
  }

  hasFireCooldown() {
    return !!WEAPONS[this.weaponKey]?.fireRate;
  }

  getReloadProgress(time) {
    if (!this.weapon?.reloading) return 0;
    if (this.isIncrementalReloadWeapon()) {
      const inc = this.weapon.reloadIncremental;
      const sprite = WEAPONS[this.weaponKey]?.sprite;
      const spec = getIncrementalReloadSpec(sprite);
      if (!inc || !spec) return 0;
      if (inc.phase === 'intro' && spec.hasIntro) {
        const introDur = (spec.introEnd + 1) / spec.fps;
        return Math.min(1, (time - inc.phaseStart) / introDur);
      }
      if (inc.phase === 'outro' && spec.hasOutro) {
        const outroFrames = spec.outroEnd - spec.outroStart + 1;
        const outroDur = outroFrames / spec.fps;
        return Math.min(1, (time - inc.phaseStart) / outroDur);
      }
      return Math.min(1, (time - inc.shellStart) / spec.shellSec);
    }
    return Math.min(1, (time - this.weapon.reloadStart) / this.weapon.reloadTime);
  }

  takeDamage(amount, time, opts = {}) {
    if (!this.alive) return false;
    if (!opts.perBullet && time < this.invulnTimer) return false;
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining <= 0) {
      if (!opts.perBullet) this.invulnTimer = time + 0.25;
      return true;
    }
    this.health = Math.max(0, this.health - remaining);
    if (!opts.perBullet) this.invulnTimer = time + 0.4;
    if (this.health <= 0) this.alive = false;
    return true;
  }

  applyMeleeKnockback(fromX, fromZ, force = 2.4) {
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.knockVX += (dx / len) * force;
    this.knockVZ += (dz / len) * force;
  }
}

export function findBulletSpawn(world, px, pz, angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const raiseZ = BULLET_SPAWN_RAISE_PX / 8;
  const ownerFeetZ = bulletOwnerFeetZ(px, pz);
  const spawnOpts = { ownerFeetZ };
  for (const dist of [0.16, 0.22, 0.28]) {
    const x = px + sin * dist;
    const z = pz + cos * dist - raiseZ;
    if (!world.checkBulletSpawnCollision(px, pz, x, z, BULLET_RADIUS, angle, spawnOpts)) {
      return { x, z };
    }
  }
  return {
    x: px + sin * 0.16,
    z: pz + cos * 0.16 - raiseZ,
  };
}

export const BULLET_MAX_DIST = 48;

export class BulletPool {
  constructor(max = 80) {
    this.bullets = [];
    for (let i = 0; i < max; i++) {
      this.bullets.push({
        active: false, x: 0, z: 0, vx: 0, vz: 0,
        damage: 0, life: 0, fromPlayer: true,
      });
    }
  }

  spawn(x, z, angle, weapon, fromPlayer = true, world = null) {
    const b = this.bullets.find((b) => !b.active);
    if (!b) return null;
    const spread = weapon.spread || 0.04;
    const a = angle + (Math.random() - 0.5) * spread;
    const speed = weapon.bulletSpeed || 80;

    let sx = x;
    let sz = z;
    if (fromPlayer && world) {
      const spawn = findBulletSpawn(world, x, z, a);
      if (!spawn) return null;
      sx = spawn.x;
      sz = spawn.z;
    } else {
      const dist = fromPlayer ? 0.12 : 0.8;
      sx = x + Math.sin(a) * dist;
      sz = z + Math.cos(a) * dist;
    }

    b.active = true;
    b.x = sx;
    b.z = sz;
    b.spawnX = sx;
    b.spawnZ = sz;
    b.ownerFeetZ = fromPlayer ? bulletOwnerFeetZ(x, z) : z;
    b.vx = Math.sin(a) * speed;
    b.vz = Math.cos(a) * speed;
    b.damage = weapon.damage;
    b.life = 2.5;
    b.fromPlayer = fromPlayer;
    b.aimAngle = fromPlayer ? a : null;
    return b;
  }

  update(dt, world, onHit, player = null) {
    const maxDistSq = BULLET_MAX_DIST * BULLET_MAX_DIST;
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }

      if (player) {
        const dx = b.x - player.x;
        const dz = b.z - player.z;
        if (dx * dx + dz * dz > maxDistSq) {
          b.active = false;
          continue;
        }
      }

      onHit(b);
      if (!b.active) continue;

      const nx = b.x + b.vx * dt;
      const nz = b.z + b.vz * dt;
      if (world.segmentBlocked(b.x, b.z, nx, nz, BULLET_RADIUS, true, b.aimAngle, {
        forwardOnly: true,
        shooterX: b.spawnX ?? b.x,
        shooterZ: b.spawnZ ?? b.z,
        ownerFeetZ: b.ownerFeetZ,
      })) {
        b.active = false;
        continue;
      }
      b.x = nx;
      b.z = nz;
    }
  }
}
