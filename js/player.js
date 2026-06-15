import { PLAYER_RADIUS, BULLET_RADIUS } from './world.js';
import { getSheetPlayDuration, gunAimTransform, gunPivotHoldOffset, getIncrementalReloadSpec, getIncrementalReloadFrame, getReloadAnimFrame, REVOLVER_RELOAD_CASING_EJECT_FRAME } from './sprites.js';

export const ROLL_DURATION = 0.46;
export const ROLL_SPEED = 24;
export const JUMP_DURATION = 0.42;
export const JUMP_SPEED = 10;
export const SNEAK_MULT = 0.52;
export const STAMINA_MAX = 200;
export const STAMINA_REGEN = 26;
export const STAMINA_SPRINT_DRAIN = 22;
export const STAMINA_ROLL_COST = 20;
export const STAMINA_JUMP_COST = 14;
export const STAMINA_ROLL_MIN = 20;
export const STAMINA_JUMP_MIN = 14;
export const STAMINA_SPRINT_MIN = 10;
export const STAMINA_REGEN_DELAY = 2;
export const GUN_HOLD_OFFSET = 1.1;
/** Extra distance from gun hold point to barrel tip (world units). */
export const BARREL_TIP_OFFSET = 0.55;
/** Lifts spawn point on screen toward the gun barrel (pixels, screen-up). */
export const BARREL_SCREEN_RAISE = 8;

const SCREEN_PPU = 5.5;

export const ITEM_STORAGE_SIZE = 20;
export const UNLOCKED_ITEM_SLOTS = 14;
export const EQUIPMENT_SLOT_COUNT = 4;

export const WEAPONS = {
  glock: {
    name: 'GLOCK',
    magSize: 12,
    reserve: 36,
    maxReserve: 60,
    damage: 12,
    fireRate: 0,
    reloadTime: 1.6,
    bulletSpeed: 150,
    spread: 0.04,
    pellets: 1,
    sprite: 'glock',
    shotSprite: 'glock_shot',
    sound: 'pistol',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
  m16: {
    name: 'M16',
    magSize: 30,
    reserve: 60,
    maxReserve: 120,
    damage: 15,
    fireRate: 0.09,
    automatic: true,
    reloadTime: 2.0,
    bulletSpeed: 150,
    spread: 0.015,
    pellets: 1,
    sprite: 'm16',
    shotSprite: 'm16_shot',
    sound: 'rifle',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
  m870: {
    name: '870',
    magSize: 6,
    reserve: 12,
    maxReserve: 30,
    damage: 14,
    fireRate: 0.9,
    reloadTime: 2.6,
    reloadStyle: 'incremental',
    bulletSpeed: 100,
    spread: 0.5,
    pellets: 8,
    sprite: 'm870',
    shotSprite: 'm870_shot',
    sound: 'shotgun',
    casingMode: 'mid_cooldown',
    casingColor: 'red',
  },
  m24: {
    name: 'M24',
    magSize: 5,
    reserve: 15,
    maxReserve: 25,
    damage: 95,
    fireRate: 1.15,
    reloadTime: 2.8,
    reloadStyle: 'incremental',
    bulletSpeed: 150,
    spread: 0.005,
    pellets: 1,
    sprite: 'm24',
    shotSprite: 'm24_shot',
    sound: 'sniper',
    casingMode: 'mid_cooldown',
    casingColor: 'yellow',
  },
  uzi: {
    name: 'UZI',
    magSize: 32,
    reserve: 64,
    maxReserve: 128,
    damage: 8,
    fireRate: 0.06,
    automatic: true,
    reloadTime: 1.8,
    bulletSpeed: 150,
    spread: 0.09,
    pellets: 1,
    sprite: 'uzi',
    shotSprite: 'uzi_shot',
    sound: 'rifle',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
  revolver: {
    name: 'REVOLVER',
    magSize: 6,
    reserve: 24,
    maxReserve: 48,
    damage: 32,
    fireRate: 0.48,
    reloadTime: 2,
    bulletSpeed: 150,
    spread: 0.03,
    pellets: 1,
    sprite: 'revolver',
    shotSprite: 'revolver_shot',
    sound: 'pistol',
    casingColor: 'yellow',
  },
  famas: {
    name: 'FAMAS',
    magSize: 25,
    reserve: 50,
    maxReserve: 100,
    damage: 14,
    fireRate: 0.07,
    automatic: true,
    reloadTime: 2.1,
    bulletSpeed: 150,
    spread: 0.028,
    pellets: 1,
    sprite: 'famas',
    shotSprite: 'famas_shot',
    sound: 'rifle',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
  fal: {
    name: 'FAL',
    magSize: 20,
    reserve: 40,
    maxReserve: 80,
    damage: 22,
    fireRate: 0.14,
    automatic: true,
    reloadTime: 2.3,
    bulletSpeed: 150,
    spread: 0.02,
    pellets: 1,
    sprite: 'fal',
    shotSprite: 'fal_shot',
    sound: 'rifle',
    casingMode: 'per_shot',
    casingColor: 'yellow',
  },
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

export const MELEE_WEAPONS = {
  knife: {
    name: 'KNIFE',
    damage: 35,
    range: 3,
    arc: Math.PI * 0.65,
    swingDuration: 0.22,
    swingDownRatio: 0.34,
    swingAngle: Math.PI / 2.4,
    maxChargeTime: 0.75,
    minDamageMult: 0.35,
    maxDamageMult: 1.0,
    maxRaiseAngle: Math.PI / 2.8,
    sprite: 'knife',
  },
  fire_axe: {
    name: 'FIRE AXE',
    damage: 55,
    range: 5,
    arc: Math.PI * 0.72,
    swingDuration: 0.38,
    swingDownRatio: 0.36,
    swingAngle: Math.PI / 2.0,
    maxChargeTime: 1.0,
    minDamageMult: 0.3,
    maxDamageMult: 1.15,
    maxRaiseAngle: Math.PI / 2.2,
    sprite: 'fire_axe',
  },
  wooden_bat: {
    name: 'BAT',
    damage: 25,
    range: 4,
    arc: Math.PI * 0.78,
    swingDuration: 0.26,
    swingDownRatio: 0.34,
    swingAngle: Math.PI / 2.5,
    maxChargeTime: 0.85,
    minDamageMult: 0.4,
    maxDamageMult: 1.0,
    maxRaiseAngle: Math.PI / 2.6,
    sprite: 'wooden_bat',
  },
  crowbar: {
    name: 'CROWBAR',
    damage: 32,
    range: 3.1,
    arc: Math.PI * 0.68,
    swingDuration: 0.24,
    swingDownRatio: 0.32,
    swingAngle: Math.PI / 2.35,
    maxChargeTime: 0.7,
    minDamageMult: 0.38,
    maxDamageMult: 1.05,
    maxRaiseAngle: Math.PI / 2.7,
    sprite: 'crowbar',
  },
};

export const MELEE_KEYS = Object.keys(MELEE_WEAPONS);

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

function capReserve(key, amount) {
  const max = WEAPONS[key]?.maxReserve ?? amount;
  return Math.min(max, Math.max(0, amount));
}

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
    this.radius = 1.75;
    this.isMoving = false;
    this.isSprinting = false;
    this.walkPhase = 0;
    this.moveDirX = 0;
    this.moveDirZ = 0;
    this.weaponSlot = 'gun';
    this.melee = {
      charging: false,
      chargeStart: 0,
      swingStart: 0,
      swingUntil: 0,
      swingCharge: 0,
      hitApplied: false,
    };
    this.meleeKey = 'knife';
    this.meleeInventory = new Set(MELEE_KEYS);
    this.shotFlashUntil = 0;
    this.casingMidEmitted = false;
    this.casingCooldownWeaponKey = null;
    this.isCrouching = false;
    this.isSneaking = false;
    this.sneakMult = SNEAK_MULT;
    this.stamina = STAMINA_MAX;
    this.maxStamina = STAMINA_MAX;
    this.staminaRegenDelayUntil = 0;
    this.roll = { active: false, until: 0, dirX: 0, dirZ: 0, startTime: 0, duration: ROLL_DURATION };
    this.jump = { active: false, until: 0, dirX: 0, dirZ: 0, startTime: 0, duration: JUMP_DURATION, inPlace: false };
    this.reloadAim = {
      phase: 'idle',
      fromAngle: 0,
      lowerStart: 0,
    };
    this.gunKick = 0;
    this.invulnTimer = 0;
    this.shield = 0;
    this.powerUps = { speed: { until: 0 }, damage: { mult: 1.5, until: 0 } };
    this.weaponInventory = new Map();
    this.weaponKey = null;
    this.weapon = null;
    this.itemSlots = Array(ITEM_STORAGE_SIZE).fill(null);
    this.equipmentSlots = Array(EQUIPMENT_SLOT_COUNT).fill(null);
    for (const key of WEAPON_KEYS) this.addWeaponToInventory(key);
    this.equipWeapon('glock');
    this.syncWeaponStorage();
  }

  _saveWeaponState() {
    if (!this.weaponKey || !this.weapon) return;
    this.weaponInventory.set(this.weaponKey, {
      ammo: this.weapon.ammo,
      reserve: this.weapon.reserve,
    });
  }

  _buildWeaponRuntime(key) {
    const cfg = WEAPONS[key];
    const saved = this.weaponInventory.get(key);
    return {
      ...cfg,
      ammo: saved.ammo,
      reserve: saved.reserve,
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

  addWeaponToInventory(key) {
    if (!WEAPONS[key] || this.weaponInventory.has(key)) return false;
    const cfg = WEAPONS[key];
    this.weaponInventory.set(key, {
      ammo: cfg.magSize,
      reserve: capReserve(key, cfg.reserve),
    });
    return true;
  }

  acquireWeapon(key) {
    const isNew = this.addWeaponToInventory(key);
    if (!isNew) {
      const st = this.weaponInventory.get(key);
      const cfg = WEAPONS[key];
      st.ammo = cfg.magSize;
      st.reserve = capReserve(key, st.reserve + Math.floor(cfg.maxReserve * 0.35));
    }
    this.equipWeapon(key);
    this.syncWeaponStorage();
    return key;
  }

  equipWeapon(key) {
    if (!this.weaponInventory.has(key)) return false;
    this._saveWeaponState();
    if (key !== this.casingCooldownWeaponKey) {
      this.casingMidEmitted = true;
      this.casingCooldownWeaponKey = null;
    }
    this.weaponKey = key;
    this.weapon = this._buildWeaponRuntime(key);
    this.weaponSlot = 'gun';
    this.syncWeaponStorage();
    return true;
  }

  isItemSlotUnlocked(index) {
    return index < UNLOCKED_ITEM_SLOTS;
  }

  syncWeaponStorage() {
    for (let i = 0; i < this.itemSlots.length; i++) {
      const s = this.itemSlots[i];
      if (s?.kind === 'weapon' || s?.kind === 'melee') this.itemSlots[i] = null;
    }
    for (const key of MELEE_KEYS) {
      if (!this.meleeInventory.has(key)) continue;
      if (key === this.meleeKey) continue;
      const idx = this.itemSlots.findIndex((s, i) => s === null && this.isItemSlotUnlocked(i));
      if (idx < 0) break;
      this.itemSlots[idx] = { kind: 'melee', key };
    }
    for (const key of this.getOwnedWeaponKeys()) {
      if (key === this.weaponKey) continue;
      const idx = this.itemSlots.findIndex((s, i) => s === null && this.isItemSlotUnlocked(i));
      if (idx < 0) break;
      this.itemSlots[idx] = { kind: 'weapon', key };
    }
  }

  /** Equip melee from an inventory slot (click or drag onto melee slot). */
  equipMeleeFromSlot(_slotIndex, incomingKey) {
    if (!this.meleeInventory.has(incomingKey)) return false;
    if (incomingKey === this.meleeKey && this.weaponSlot === 'melee') return false;
    this.meleeKey = incomingKey;
    this.weaponSlot = 'melee';
    this.melee.charging = false;
    this.syncWeaponStorage();
    return true;
  }

  equipStoredWeapon(key) {
    if (!this.weaponInventory.has(key)) return false;
    return this.equipWeapon(key);
  }

  equipStoredMelee(key) {
    if (!this.meleeInventory.has(key)) return false;
    return this.equipMelee(key);
  }

  getOwnedWeaponKeys() {
    return WEAPON_KEYS.filter((k) => this.weaponInventory.has(k));
  }

  /** @deprecated use acquireWeapon / equipWeapon */
  setWeapon(key) {
    return this.acquireWeapon(key);
  }

  grantRandomWeapon() {
    const key = WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
    this.acquireWeapon(key);
    return key;
  }

  grantRandomMelee() {
    const pool = MELEE_KEYS.filter((k) => !this.meleeInventory.has(k));
    if (!pool.length) return null;
    const key = pool[Math.floor(Math.random() * pool.length)];
    this.addMeleeToInventory(key);
    this.equipMelee(key);
    return key;
  }

  getWeapon() {
    return this.weapon;
  }

  getActiveMelee() {
    return MELEE_WEAPONS[this.meleeKey] || MELEE_WEAPONS.knife;
  }

  addMeleeToInventory(key) {
    if (!MELEE_WEAPONS[key]) return false;
    this.meleeInventory.add(key);
    return true;
  }

  equipMelee(key) {
    if (!this.meleeInventory.has(key)) return false;
    this.meleeKey = key;
    this.weaponSlot = 'melee';
    this.melee.charging = false;
    this.syncWeaponStorage();
    return true;
  }

  getWeaponDraw(time = 0) {
    if (this.isMeleeActive()) return { sheet: this.getActiveMelee().sprite };
    const cfg = WEAPONS[this.weaponKey];
    if (!cfg) return { sheet: 'm16' };

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

    if (cfg.casingMode === 'mid_cooldown' && this.weapon.lastShot != null) {
      const elapsed = time - this.weapon.lastShot;
      const cycleSheet = `${cfg.sprite}_cycle`;
      if (elapsed >= 0 && elapsed < getSheetPlayDuration(cycleSheet)) {
        return { sheet: cycleSheet, elapsed };
      }
    }

    if (time && time < this.shotFlashUntil && cfg.shotSprite) {
      return { sheet: cfg.shotSprite };
    }
    return { sheet: cfg.sprite || 'm16' };
  }

  /** @deprecated use getWeaponDraw */
  getWeaponSprite(time = 0) {
    return this.getWeaponDraw(time).sheet;
  }

  toggleWeaponSlot() {
    if (this.isMeleeActive()) return this.setWeaponSlot('gun');
    return this.equipMelee(this.meleeKey);
  }

  swapItemSlots(a, b) {
    if (a === b) return false;
    if (!this.isItemSlotUnlocked(a) || !this.isItemSlotUnlocked(b)) return false;
    const tmp = this.itemSlots[a];
    this.itemSlots[a] = this.itemSlots[b];
    this.itemSlots[b] = tmp;
    return true;
  }

  /** Swap a stored gun with the currently equipped main weapon. */
  swapItemSlotWithMain(slotIndex) {
    if (!this.isItemSlotUnlocked(slotIndex)) return false;
    const slot = this.itemSlots[slotIndex];
    if (!slot || slot.kind !== 'weapon' || !WEAPONS[slot.key]) return false;
    const incomingKey = slot.key;
    if (incomingKey === this.weaponKey) return false;

    this._saveWeaponState();
    const outgoingKey = this.weaponKey;
    this.weaponKey = incomingKey;
    this.weapon = this._buildWeaponRuntime(incomingKey);
    this.weaponSlot = 'gun';
    this.itemSlots[slotIndex] = { kind: 'weapon', key: outgoingKey };

    for (let i = 0; i < this.itemSlots.length; i++) {
      if (i === slotIndex) continue;
      const s = this.itemSlots[i];
      if (s?.kind === 'weapon' && (s.key === incomingKey || s.key === outgoingKey)) {
        this.itemSlots[i] = null;
      }
    }
    return true;
  }

  /** Swap a stored melee with the currently equipped melee weapon. */
  swapItemSlotWithMelee(slotIndex) {
    if (!this.isItemSlotUnlocked(slotIndex)) return false;
    const slot = this.itemSlots[slotIndex];
    if (!slot || slot.kind !== 'melee' || !MELEE_WEAPONS[slot.key]) return false;
    return this.equipMeleeFromSlot(slotIndex, slot.key);
  }

  isRolling(time) {
    return this.roll.active && time < this.roll.until;
  }

  isJumping(time) {
    return this.jump.active && time < this.jump.until;
  }

  getJumpT(time) {
    if (!this.isJumping(time)) return 0;
    const dur = this.jump.duration || JUMP_DURATION;
    return Math.min(1, (time - this.jump.startTime) / dur);
  }

  isMobilityLocked(time) {
    return this.isRolling(time) || this.isJumping(time);
  }

  getStealthMult() {
    if (this.isSneaking) return 0.38;
    if (this.isCrouching) return 0.62;
    if (this.roll?.active) return 0.45;
    return 1;
  }

  canRoll(time) {
    if (!this.alive || this.isMobilityLocked(time)) return false;
    if (this.stamina < STAMINA_ROLL_MIN) return false;
    return true;
  }

  canJump(time) {
    if (!this.alive || this.isMobilityLocked(time)) return false;
    if (this.weapon?.reloading) return false;
    if (this.stamina < STAMINA_JUMP_MIN) return false;
    return true;
  }

  canSprint() {
    return this.stamina >= STAMINA_SPRINT_MIN;
  }

  markStaminaUsed(time) {
    this.staminaRegenDelayUntil = time + STAMINA_REGEN_DELAY;
  }

  updateStamina(dt, time) {
    if (!this.alive) return;
    if (this.isMobilityLocked(time)) return;
    if (this.isSprinting && this.isMoving) {
      const drain = STAMINA_SPRINT_DRAIN * dt;
      if (drain > 0) {
        this.stamina = Math.max(0, this.stamina - drain);
        this.markStaminaUsed(time);
      }
      return;
    }
    if (time < this.staminaRegenDelayUntil) return;
    this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * dt);
  }

  startRoll(time, dirX, dirZ) {
    if (!this.canRoll(time)) return false;
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.01) return false;
    this.stamina = Math.max(0, this.stamina - STAMINA_ROLL_COST);
    this.markStaminaUsed(time);
    this.roll.active = true;
    this.roll.duration = ROLL_DURATION;
    this.roll.until = time + ROLL_DURATION;
    this.roll.startTime = time;
    this.roll.dirX = dirX / len;
    this.roll.dirZ = dirZ / len;
    this.moveDirX = this.roll.dirX;
    this.moveDirZ = this.roll.dirZ;
    this.invulnTimer = Math.max(this.invulnTimer, time + ROLL_DURATION);
    this.melee.charging = false;
    this.isCrouching = false;
    this.isSneaking = false;
    return true;
  }

  startJump(time, hasMoveIntent = false, dirX = 0, dirZ = 0) {
    if (!this.canJump(time)) return false;
    this.stamina = Math.max(0, this.stamina - STAMINA_JUMP_COST);
    this.markStaminaUsed(time);
    this.jump.inPlace = !hasMoveIntent;
    if (hasMoveIntent) {
      let dx = dirX;
      let dz = dirZ;
      const inLen = Math.hypot(dx, dz);
      if (inLen < 0.01) {
        dx = this.moveDirX;
        dz = this.moveDirZ;
      }
      if (Math.hypot(dx, dz) < 0.01) {
        dx = Math.sin(this.angle);
        dz = Math.cos(this.angle);
      }
      const len = Math.hypot(dx, dz) || 1;
      this.jump.dirX = dx / len;
      this.jump.dirZ = dz / len;
    } else {
      this.jump.dirX = 0;
      this.jump.dirZ = 0;
    }
    this.jump.active = true;
    this.jump.duration = JUMP_DURATION;
    this.jump.until = time + JUMP_DURATION;
    this.jump.startTime = time;
    this.invulnTimer = Math.max(this.invulnTimer, time + JUMP_DURATION * 0.65);
    this.melee.charging = false;
    this.isCrouching = false;
    this.isSneaking = false;
    return true;
  }

  updateMobility(time) {
    if (this.roll.active && time >= this.roll.until) this.roll.active = false;
    if (this.jump.active && time >= this.jump.until) this.jump.active = false;
  }

  setWeaponSlot(slot) {
    if (slot !== 'gun' && slot !== 'melee') return false;
    if (slot !== 'gun' && this.weaponSlot === 'gun') {
      this.casingMidEmitted = true;
      this.casingCooldownWeaponKey = null;
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
    if (!this.isMeleeActive()) return false;
    return this.melee.charging || time < this.melee.swingUntil;
  }

  isAutomaticWeapon() {
    if (this.isMeleeActive() || !this.weaponKey) return false;
    return !!WEAPONS[this.weaponKey]?.automatic;
  }

  getWeaponCycleList() {
    const list = WEAPON_KEYS
      .filter((k) => this.weaponInventory.has(k))
      .map((key) => ({ type: 'gun', key }));
    for (const key of MELEE_KEYS) {
      if (this.meleeInventory.has(key)) list.push({ type: 'melee', key });
    }
    return list;
  }

  cycleWeapon(delta) {
    const list = this.getWeaponCycleList();
    if (list.length <= 1) return false;

    let idx = list.findIndex((s) => (
      s.type === 'melee'
        ? this.isMeleeActive() && s.key === this.meleeKey
        : !this.isMeleeActive() && s.key === this.weaponKey
    ));
    if (idx < 0) idx = 0;

    const next = list[(idx + delta + list.length) % list.length];
    if (next.type === 'melee') {
      if (this.isMeleeActive() && next.key === this.meleeKey) return false;
      return this.equipMelee(next.key);
    }
    if (!this.isMeleeActive() && next.key === this.weaponKey) return false;
    return this.equipWeapon(next.key);
  }

  getDisplayWeapon() {
    if (this.weaponSlot === 'melee') return this.getActiveMelee();
    return this.weapon;
  }

  canMeleeCharge(time) {
    if (this.isMobilityLocked(time)) return false;
    if (this.isJumping(time)) return false;
    if (this.isMeleeSwinging(time)) return false;
    if (this.melee.charging) return false;
    return true;
  }

  isMeleeCharging() {
    return this.melee.charging;
  }

  startMeleeCharge(time) {
    if (!this.canMeleeCharge(time)) return false;
    this.melee.charging = true;
    this.melee.chargeStart = time;
    this.melee.swingCharge = 0;
    return true;
  }

  releaseMeleeCharge(time) {
    if (!this.melee.charging) return false;
    this.melee.charging = false;
    const melee = this.getActiveMelee();
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
    if (this.melee.charging) {
      const melee = this.getActiveMelee();
      const maxT = melee.maxChargeTime ?? 0.85;
      return Math.min(1, (time - this.melee.chargeStart) / maxT);
    }
    return this.melee.swingCharge;
  }

  getMeleeDamageMult(charge = this.melee.swingCharge) {
    const melee = this.getActiveMelee();
    const minM = melee.minDamageMult ?? 0.35;
    const maxM = melee.maxDamageMult ?? 1;
    const c = Math.max(0, Math.min(1, charge));
    return minM + c * (maxM - minM);
  }

  getMeleeSwingDuration() {
    const melee = this.getActiveMelee();
    const charge = this.melee.swingCharge;
    return melee.swingDuration * (0.7 + 0.55 * charge);
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
    const t = this.getMeleeSwingT(time);
    const melee = this.getActiveMelee();
    const charge = this.melee.swingCharge;
    const downEnd = (melee.swingDownRatio ?? 0.35) * (0.88 + 0.2 * (1 - charge));
    const strikeT = downEnd * (0.62 + 0.12 * charge);
    return t >= strikeT;
  }

  _meleeDownEnd(charge = this.melee.swingCharge) {
    const melee = this.getActiveMelee();
    return (melee.swingDownRatio ?? 0.35) * (0.88 + 0.2 * (1 - charge));
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
    if (this.melee.charging) {
      const melee = this.getActiveMelee();
      const charge = this.getMeleeChargeProgress(time);
      const raise = (melee.maxRaiseAngle ?? Math.PI / 2.4) * charge;
      return -raise;
    }
    const t = this.getMeleeSwingT(time);
    if (t <= 0) return 0;
    const melee = this.getActiveMelee();
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
    if (this.melee.charging) {
      return -12 * this.getMeleeChargeProgress(time);
    }
    const t = this.getMeleeSwingT(time);
    if (t <= 0) return 0;
    const lift = this._meleeAnimCurve(t).lift;
    return 14 * lift * (0.75 + this.melee.swingCharge * 0.55);
  }

  getMeleeSwingLunge(time) {
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
    this.weapon.reserve = capReserve(
      this.weaponKey,
      Math.max(this.weapon.reserve, this.weapon.magSize * 3),
    );
    this._saveWeaponState();
    return 'FULL RESUPPLY';
  }

  getSpeedMult(time) {
    return time < this.powerUps.speed.until ? 1.35 : 1;
  }

  getDamageMult(time) {
    return time < this.powerUps.damage.until ? this.powerUps.damage.mult : 1;
  }

  getActivePowerUpLabel(time) {
    const labels = [];
    if (time < this.powerUps.speed.until) labels.push('SPEED');
    if (time < this.powerUps.damage.until) labels.push('DAMAGE');
    if (this.shield > 0) labels.push(`SHIELD ${Math.ceil(this.shield)}`);
    return labels.join(' · ');
  }

  addAmmo(amount) {
    this.weapon.reserve = capReserve(this.weaponKey, this.weapon.reserve + amount);
    this._saveWeaponState();
  }

  getMaxReserve() {
    return WEAPONS[this.weaponKey]?.maxReserve ?? 0;
  }

  heal(amount) {
    if (this.health >= this.maxHealth) return false;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return true;
  }

  canShoot(time) {
    if (this.isMobilityLocked(time) || this.isCrouching) return false;
    const w = this.weapon;
    if (w.reloading && !this.isIncrementalReloadWeapon()) return false;
    if (w.ammo <= 0) return false;
    if (w.fireRate <= 0) return true;
    return time - w.lastShot >= w.fireRate;
  }

  wantsAutoReload(time) {
    if (this.isMeleeActive() || !this.weaponKey) return false;
    if (this.isMobilityLocked(time) || this.isCrouching) return false;
    const w = this.weapon;
    if (!w || w.reloading) return false;
    return w.ammo <= 0 && w.reserve > 0;
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
    if (this.isMobilityLocked(time) || this.isCrouching) return false;
    const w = this.weapon;
    if (w.reloading) {
      if (this.isIncrementalReloadWeapon()) {
        this.cancelReload(time);
        return { ok: true, cancelled: true };
      }
      return false;
    }
    if (w.ammo === w.magSize || w.reserve <= 0) return false;
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
      if (needed <= 0 || w.reserve <= 0) {
        this._finishIncrementalReload(time);
        return { finished: true };
      }

      w.ammo += 1;
      w.reserve -= 1;
      inc.shellsLoaded += 1;
      inc.shellStart = time;
      this._saveWeaponState();

      const magFull = w.ammo >= w.magSize;
      const noReserve = w.reserve <= 0;

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
    const w = this.weapon;
    if (!w.reloading) return null;

    if (this.isIncrementalReloadWeapon()) {
      return this._updateIncrementalReload(time);
    }

    const casingResult = this._checkRevolverReloadCasingEject(time);

    if (time - w.reloadStart >= w.reloadTime) {
      const needed = w.magSize - w.ammo;
      const taken = Math.min(needed, w.reserve);
      w.ammo += taken;
      w.reserve -= taken;
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

  takeDamage(amount, time) {
    if (!this.alive || time < this.invulnTimer) return false;
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining <= 0) {
      this.invulnTimer = time + 0.25;
      return true;
    }
    this.health = Math.max(0, this.health - remaining);
    this.invulnTimer = time + 0.4;
    if (this.health <= 0) this.alive = false;
    return true;
  }
}

function findBulletSpawn(world, px, pz, angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const aim = gunAimTransform(angle);
  const hold = GUN_HOLD_OFFSET + gunPivotHoldOffset(aim.angle);
  const gunX = px + sin * hold;
  const gunZ = pz + cos * hold;
  const raiseZ = BARREL_SCREEN_RAISE / SCREEN_PPU;
  const maxD = BARREL_TIP_OFFSET;
  const minD = 0.06;

  for (let d = maxD; d >= minD; d -= 0.04) {
    const x = gunX + sin * d;
    const z = gunZ + cos * d - raiseZ;
    if (world.checkCollision(x, z, BULLET_RADIUS)) continue;
    const fromX = px + sin * (PLAYER_RADIUS * 0.65);
    const fromZ = pz + cos * (PLAYER_RADIUS * 0.65) - raiseZ * 0.35;
    if (world.segmentBlocked(fromX, fromZ, x, z, BULLET_RADIUS)) continue;
    return { x, z };
  }
  return null;
}

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
    const spread = weapon.spread || 0.02;
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
      const dist = fromPlayer ? BARREL_TIP_OFFSET : 0.8;
      sx = x + Math.sin(a) * dist;
      sz = z + Math.cos(a) * dist - (fromPlayer ? BARREL_SCREEN_RAISE / SCREEN_PPU : 0);
    }

    b.active = true;
    b.x = sx;
    b.z = sz;
    b.vx = Math.sin(a) * speed;
    b.vz = Math.cos(a) * speed;
    b.damage = weapon.damage;
    b.life = 2.5;
    b.fromPlayer = fromPlayer;
    return b;
  }

  update(dt, world, onHit) {
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }

      onHit(b);
      if (!b.active) continue;

      const nx = b.x + b.vx * dt;
      const nz = b.z + b.vz * dt;
      if (world.segmentBlocked(b.x, b.z, nx, nz)) {
        b.active = false;
        continue;
      }
      b.x = nx;
      b.z = nz;
    }
  }
}
