import { BASE_RADIUS, CHUNK_WORLD, hash01, isInBase } from './worldGen.js';
import { ITEM_NATIVE_PX } from './sprites.js';
import { MELEE_WEAPONS } from './player.js';

/** Match ITEM_CHUNK_CHANCE in chunkEntities.js */
const ITEM_CHUNK_SPAWN_RATE = 0.05;

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
    // Loot is streamed per chunk — see chunkEntities.js
  }

  spawnInChunk(chunk, world, player, canSpawn = null, spawnBias = null) {
    const centerX = chunk.cx * CHUNK_WORLD + CHUNK_WORLD * 0.5;
    const centerZ = chunk.cz * CHUNK_WORLD + CHUNK_WORLD * 0.5;
    if (isInBase(centerX, centerZ)) {
      chunk.itemsSpawned = true;
      return;
    }

    if (hash01(chunk.cx * 3 + 120, chunk.cz * 5 + 80) >= ITEM_CHUNK_SPAWN_RATE) {
      chunk.itemsSpawned = true;
      return;
    }

    if (canSpawn && !canSpawn()) return;

    const pos = this._findChunkItemPoint(chunk, world, player, spawnBias);
    if (!pos) return;

    chunk.itemsSpawned = true;
    this.items.push({
      type: this._rollLootType(chunk.cx, chunk.cz),
      x: pos.x,
      z: pos.z,
      active: true,
      bobPhase: hash01(chunk.cx * 41, chunk.cz * 53) * 6,
      homeCx: chunk.cx,
      homeCz: chunk.cz,
    });
  }

  _rollLootType(cx, cz) {
    const roll = hash01(cx * 19 + 7, cz * 23 + 11);
    if (roll < 0.42) return 'ammo';
    if (roll < 0.72) return 'bandage';
    if (roll < 0.88) return 'mystery_power';
    return 'mystery_weapon';
  }

  _findChunkItemPoint(chunk, world, player, spawnBias = null) {
    const half = itemWorldHalfSize();
    const minX = chunk.cx * CHUNK_WORLD + half + 0.5;
    const minZ = chunk.cz * CHUNK_WORLD + half + 0.5;
    const span = CHUNK_WORLD - (half + 0.5) * 2;
    const fx = spawnBias?.fx ?? 0;
    const fz = spawnBias?.fz ?? 1;

    const tries = [];
    for (let i = 0; i < 24; i++) {
      const h1 = hash01(chunk.cx * 13 + i * 5, chunk.cz * 17 + 3);
      const h2 = hash01(chunk.cx * 29 + 7, chunk.cz * 31 + i * 11);
      tries.push([minX + h1 * span, minZ + h2 * span]);
    }

    if (spawnBias) {
      tries.sort((a, b) => {
        const aheadA = (a[0] - player.x) * fx + (a[1] - player.z) * fz;
        const aheadB = (b[0] - player.x) * fx + (b[1] - player.z) * fz;
        return aheadB - aheadA;
      });
    }

    const isValid = (x, z, requireAhead) => {
      if (isInBase(x, z)) return false;
      if (requireAhead && spawnBias) {
        if ((x - player.x) * fx + (z - player.z) * fz < 3) return false;
      }
      if (world.checkCollision(x, z, half)) return false;
      if (player) {
        const pdx = x - player.x;
        const pdz = z - player.z;
        if (pdx * pdx + pdz * pdz < 2.5) return false;
      }
      const minSep = half * 2 + 0.5;
      const crowded = this.items.some((item) => {
        if (!item.active) return false;
        const dx = item.x - x;
        const dz = item.z - z;
        return dx * dx + dz * dz < minSep * minSep;
      });
      return !crowded;
    };

    for (const passAhead of [true, false]) {
      for (const [x, z] of tries) {
        if (isValid(x, z, passAhead)) return { x, z };
      }
    }
    return null;
  }

  spawnLoot(count) {
    this.items = [];
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

  /** @deprecated wave loot — use spawnLoot */
  spawnWaveItems(wave) {
    if (wave > 0) this.spawnLoot(2 + Math.min(7, Math.floor(wave * 1.25) + 1));
  }

  _findSpawnSpots(count, avoid = []) {
    const half = itemWorldHalfSize();
    const spots = [];
    const minR = BASE_RADIUS + 10;
    const maxR = minR + 140;
    const minSep = half * 2 + 0.5;

    const tooClose = (x, z) => {
      if (spots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < minSep ** 2)) return true;
      return avoid.some((a) => (a.x - x) ** 2 + (a.z - z) ** 2 < minSep ** 2);
    };

    for (let t = 0; t < count * 30 && spots.length < count; t++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minR + Math.random() * (maxR - minR);
      const x = Math.sin(angle) * dist;
      const z = Math.cos(angle) * dist;
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
        msg = added > 0 ? `+${added} ammo` : 'Reserve full';
        if (added > 0) game.audio.pickup();
        break;
      }
      case 'bandage':
        msg = player.heal(30) ? '+30 HP' : 'HP full';
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
