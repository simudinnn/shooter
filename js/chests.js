import { CHUNK_WORLD, isInBase, snapWorldPoint, TILE } from './worldGen.js';
import { rollChestLoot, rollChestVariant } from './loot.js';

/** Match CHEST_CHUNK_CHANCE in chunkEntities.js */
export const CHEST_CHUNK_SPAWN_RATE = 0.5;

export const CHEST_INTERACT_DIST = 2.8;
export const CHEST_DRAW_SCALE = 2.1;
/** Native chest art size (assets/buildings/chest_*.png are 16×16). */
export const CHEST_NATIVE_PX = 16;
const CHEST_GAME_PPU = 8;
/** Opaque-pixel centroid in the 16×16 sheet (art sits low in the frame). */
export const CHEST_VIS_PIVOT = { nx: 8.5, ny: 11.0 };
export const CHEST_OPAQUE_HALF_W = 6.5;
export const CHEST_OPAQUE_HALF_H = 4.5;
/** Collision matches visible opaque width at draw scale. */
export const CHEST_COLLISION_RADIUS = (CHEST_OPAQUE_HALF_W * CHEST_DRAW_SCALE) / CHEST_GAME_PPU;
export const CHEST_DRAW_PIVOT = CHEST_VIS_PIVOT;

/** Single world anchor for draw, collision, interaction, and minimap. */
export function getChestWorldPos(chest) {
  return { x: chest.x, z: chest.z };
}

export class ChestManager {
  constructor(world) {
    this.world = world;
    this.chests = [];
  }

  spawnInChunk(chunk, world, player, canSpawn = null, spawnBias = null) {
    const centerX = chunk.cx * CHUNK_WORLD + CHUNK_WORLD * 0.5;
    const centerZ = chunk.cz * CHUNK_WORLD + CHUNK_WORLD * 0.5;
    if (isInBase(centerX, centerZ)) {
      chunk.chestsSpawned = true;
      return;
    }

    if (Math.random() >= CHEST_CHUNK_SPAWN_RATE) {
      chunk.chestsSpawned = true;
      return;
    }

    if (canSpawn && !canSpawn()) return;

    const pos = this._findChunkPoint(chunk, world, player, spawnBias);
    if (!pos) return;

    chunk.chestsSpawned = true;
    const chest = {
      x: pos.x,
      z: pos.z,
      variant: rollChestVariant(),
      slots: rollChestLoot(),
      opened: false,
      homeCx: chunk.cx,
      homeCz: chunk.cz,
      obstacle: null,
    };
    this._registerObstacle(chest);
    this.chests.push(chest);
  }

  remove(chest) {
    this._unregisterObstacle(chest);
    const i = this.chests.indexOf(chest);
    if (i >= 0) this.chests.splice(i, 1);
  }

  getNearby(player, maxDist = CHEST_INTERACT_DIST) {
    let best = null;
    let bestD = maxDist + player.radius;
    for (const chest of this.chests) {
      const d = Math.hypot(player.x - chest.x, player.z - chest.z);
      if (d < bestD) {
        bestD = d;
        best = chest;
      }
    }
    return best;
  }

  isInInteractRange(player, chest) {
    return Math.hypot(player.x - chest.x, player.z - chest.z) <= CHEST_INTERACT_DIST + player.radius;
  }

  isEmpty(chest) {
    return chest.slots.every((s) => s == null);
  }

  _registerObstacle(chest) {
    chest.obstacle = {
      kind: 'circle',
      x: chest.x,
      z: chest.z,
      radius: CHEST_COLLISION_RADIUS,
    };
    this.world.addDynamicObstacle(chest.obstacle);
  }

  _unregisterObstacle(chest) {
    if (!chest.obstacle) return;
    this.world.removeDynamicObstacle(chest.obstacle);
    chest.obstacle = null;
  }

  _findChunkPoint(chunk, world, player, spawnBias = null) {
    const minX = chunk.cx * CHUNK_WORLD + 1.4;
    const minZ = chunk.cz * CHUNK_WORLD + 1.4;
    const span = CHUNK_WORLD - 2.8;
    const fx = spawnBias?.fx ?? 0;
    const fz = spawnBias?.fz ?? 1;

    const tries = [];
    for (let i = 0; i < 24; i++) {
      tries.push([minX + Math.random() * span, minZ + Math.random() * span]);
    }

    if (spawnBias) {
      tries.sort((a, b) => {
        const aheadA = (a[0] - player.x) * fx + (a[1] - player.z) * fz;
        const aheadB = (b[0] - player.x) * fx + (b[1] - player.z) * fz;
        return aheadB - aheadA;
      });
    }

    const isValid = (x, z, requireAhead) => {
      const snapped = snapWorldPoint(x, z);
      const tileOx = Math.floor(snapped.x / TILE) * TILE;
      const tileOz = Math.floor(snapped.z / TILE) * TILE;
      x = tileOx + TILE * 0.5;
      z = tileOz + TILE * 0.5;
      if (isInBase(x, z)) return false;
      if (requireAhead && spawnBias) {
        if ((x - player.x) * fx + (z - player.z) * fz < 3) return false;
      }
      if (world.checkCollision(x, z, CHEST_COLLISION_RADIUS)) return false;
      if (player) {
        const pdx = x - player.x;
        const pdz = z - player.z;
        if (pdx * pdx + pdz * pdz < 2.5) return false;
      }
      const crowded = this.chests.some((c) => {
        const dx = c.x - x;
        const dz = c.z - z;
        return dx * dx + dz * dz < 2.2;
      });
      return !crowded;
    };

    for (const passAhead of [true, false]) {
      for (const [x, z] of tries) {
        if (isValid(x, z, passAhead)) {
          const snapped = snapWorldPoint(x, z);
          const tileOx = Math.floor(snapped.x / TILE) * TILE;
          const tileOz = Math.floor(snapped.z / TILE) * TILE;
          return { x: tileOx + TILE * 0.5, z: tileOz + TILE * 0.5 };
        }
      }
    }
    return null;
  }
}
