import { ITEM_NATIVE_PX } from './sprites.js';
import { MELEE_WEAPONS } from './player.js';

export const ITEM_DRAW_SCALE = 1.2;
export const PPU = 5.5;

export function itemWorldHalfSize() {
  return (ITEM_NATIVE_PX * ITEM_DRAW_SCALE) / (2 * PPU);
}

export class ItemManager {
  constructor(world) {
    this.world = world;
    this.items = [];
    this.pickupMsg = '';
    this.pickupMsgTimer = 0;
  }

  spawnAll() {
    this.spawnWaveItems(0);
  }

  spawnWaveItems(wave) {
    if (wave > 0) this.items = [];

    const count = wave === 0
      ? 13
      : 2 + Math.min(7, Math.floor(wave * 1.25) + 1);
    const spots = this._findSpawnSpots(count);
    for (const { x, z } of spots) {
      const roll = Math.random();
      let type = 'ammo';
      if (roll < 0.42) type = 'ammo';
      else if (roll < 0.72) type = 'bandage';
      else if (roll < 0.88) type = 'mystery_power';
      else type = 'mystery_weapon';
      this.items.push({ type, x, z, active: true, bobPhase: Math.random() * 6 });
    }
  }

  _findSpawnSpots(count, avoid = []) {
    const half = itemWorldHalfSize();
    const spots = [];
    const mapW = this.world.halfW * 1.7;
    const mapH = this.world.halfH * 1.7;
    const minCenter = this.world.usesImageMap() ? 6 : 8;
    const minSep = half * 2 + 0.5;

    const tooClose = (x, z) => {
      if (spots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < minSep ** 2)) return true;
      return avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < minSep ** 2);
    };

    for (let t = 0; t < count * 25 && spots.length < count; t++) {
      const x = (Math.random() - 0.5) * mapW;
      const z = (Math.random() - 0.5) * mapH;
      if (Math.abs(x) < minCenter && Math.abs(z) < minCenter) continue;
      if (this.world.checkCollision(x, z, half)) continue;
      if (tooClose(x, z)) continue;
      spots.push({ x, z });
    }
    return spots;
  }

  _distToItem(player, item) {
    const dx = player.x - item.x;
    const dz = player.z - item.z;
    return Math.hypot(dx, dz);
  }

  _pickupReach() {
    return itemWorldHalfSize();
  }

  getNearbyInteractable(player) {
    let best = null;
    let bestD = itemWorldHalfSize() + player.radius + 0.15;
    for (const item of this.items) {
      if (!item.active || !item.type.startsWith('mystery')) continue;
      const d = this._distToItem(player, item);
      if (d < bestD) { bestD = d; best = item; }
    }
    return best;
  }

  tryInteract(player, game) {
    const item = this.getNearbyInteractable(player);
    if (!item) return false;
    this._collect(item, player, game);
    return true;
  }

  update(dt, player, game) {
    if (this.pickupMsgTimer > 0) {
      this.pickupMsgTimer -= dt;
      if (this.pickupMsgTimer <= 0) this.pickupMsg = '';
    }
    const reach = this._pickupReach() + player.radius;
    for (const item of this.items) {
      if (!item.active) continue;
      item.bobPhase += dt * 2.5;
      if (item.type.startsWith('mystery')) continue;
      if (this._distToItem(player, item) < reach) this._collect(item, player, game);
    }
  }

  _collect(item, player, game) {
    if (!item.active) return;
    let msg = '';
    switch (item.type) {
      case 'ammo': {
        const before = player.getWeapon().reserve;
        player.addAmmo(15);
        const added = player.getWeapon().reserve - before;
        msg = added > 0 ? `+${added} AMMO` : 'RESERVE FULL';
        if (added > 0) game.audio.pickup();
        break;
      }
      case 'bandage':
        msg = player.heal(30) ? '+30 HP' : 'HP FULL';
        if (msg === '+30 HP') game.audio.pickup();
        break;
      case 'mystery_power':
        msg = player.applyRandomPowerUp();
        game.audio.mysteryOpen();
        break;
      case 'mystery_weapon': {
        const roll = Math.random();
        if (roll < 0.28) {
          const key = player.grantRandomMelee();
          if (key) msg = `EQUIPPED: ${MELEE_WEAPONS[key].name}`;
          else {
            player.grantRandomWeapon();
            msg = `EQUIPPED: ${player.getWeapon().name}`;
          }
        } else {
          player.grantRandomWeapon();
          msg = `EQUIPPED: ${player.getWeapon().name}`;
        }
        game.audio.mysteryOpen();
        break;
      }
    }
    item.active = false;
    this.pickupMsg = msg;
    this.pickupMsgTimer = 2.5;
  }

  getSpriteName(type) {
    if (type === 'mystery_power') return 'mystery';
    if (type === 'mystery_weapon') return 'mystery_weapon';
    return type;
  }
}
