import { TILE, hash01 } from './worldGen.js';
import { rollChestLoot, rollChestVariant } from './loot.js';
import { CELL_FLOOR, isNorthInteriorColumn } from './buildingGen.js';

export const CHEST_INTERACT_DIST = 3;
export const CHEST_DRAW_SCALE = 2.1;
/** Native chest art size (assets/buildings/chest_*.png are 16×16). */
export const CHEST_NATIVE_PX = 16;
const CHEST_GAME_PPU = 8;
/** Sprite and collision share the tile center. */
export const CHEST_VIS_PIVOT = { nx: 8, ny: 8 };
export const CHEST_DRAW_PIVOT = CHEST_VIS_PIVOT;
const CHEST_COLLISION_FRAC = 0.72;
export const CHEST_OPAQUE_HALF_W = 6.5 * CHEST_COLLISION_FRAC;
export const CHEST_OPAQUE_HALF_H = 4.5 * CHEST_COLLISION_FRAC;
/** Collision half-extents at draw scale (world units). */
export const CHEST_COLLISION_HALF_W = (CHEST_OPAQUE_HALF_W * CHEST_DRAW_SCALE) / CHEST_GAME_PPU;
export const CHEST_COLLISION_HALF_H = (CHEST_OPAQUE_HALF_H * CHEST_DRAW_SCALE) / CHEST_GAME_PPU;

/** Footprint area (tiles) for “large” houses eligible for a second chest. */
export const LARGE_BUILDING_AREA = 30;
/** Chance of a second chest in a large house. */
export const LARGE_BUILDING_TWO_CHEST_CHANCE = 0.45;

/** Single world anchor for draw, collision, and interaction. */
export function getChestWorldPos(chest) {
  return { x: chest.x, z: chest.z };
}

function cellWalkable(cells, w, h, tx, tz) {
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return false;
  const cell = cells[tz * w + tx];
  return cell === CELL_FLOOR;
}

export function isLargeBuilding(building) {
  const { w, h, shape } = building;
  if (shape === 'l' || shape === 't') return true;
  return w * h >= LARGE_BUILDING_AREA;
}

export function rollBuildingChestCount(building) {
  if (!isLargeBuilding(building)) return 1;
  const seedA = Math.floor(building.originX * 17 + building.w * 3);
  const seedB = Math.floor(building.originZ * 23 + building.h * 5);
  return hash01(seedA, seedB) < LARGE_BUILDING_TWO_CHEST_CHANCE ? 2 : 1;
}

export class ChestManager {
  constructor(world) {
    this.world = world;
    this.chests = [];
  }

  /** Loot chest(s) on the north interior wall when a building is placed. */
  spawnInBuilding(building, chunk) {
    building.chests = [];
    building.chestTiles = [];
    const count = rollBuildingChestCount(building);
    const edges = count >= 2 ? ['start', 'end'] : ['mid'];

    for (let i = 0; i < count; i++) {
      const pos = this._pickNorthBorderSpot(building, building.chestTiles, edges[i] ?? 'mid');
      if (!pos) break;

      const chest = {
        x: pos.x,
        z: pos.z,
        variant: rollChestVariant(),
        slots: rollChestLoot(),
        opened: false,
        homeCx: chunk.cx,
        homeCz: chunk.cz,
        homeBuilding: building,
        obstacle: null,
      };
      building.chestTiles.push({ tx: pos.tx, tz: pos.tz });
      building.chests.push(chest);
      building.chest = building.chests[0];
      building.chestTile = building.chestTiles[0];
      this._registerObstacle(chest);
      this.chests.push(chest);
    }

    return building.chests[0] ?? null;
  }

  _pickNorthBorderSpot(building, reservedTiles = [], edge = 'mid') {
    const { originX, originZ, w, h, cells, doorTx } = building;
    const doorTz = building.doorTz ?? h - 1;
    const reserved = new Set(reservedTiles.map((t) => `${t.tx},${t.tz}`));
    const candidates = [];

    for (let tz = 0; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        if (cells[tz * w + tx] !== CELL_FLOOR) continue;
        if (tx === doorTx && tz === doorTz) continue;
        if (reserved.has(`${tx},${tz}`)) continue;
        if (cellWalkable(cells, w, h, tx, tz - 1)) continue;
        candidates.push({ tx, tz });
      }
    }

    if (!candidates.length) return null;

    const northTz = Math.min(...candidates.map((c) => c.tz));
    const northRow = candidates.filter((c) => c.tz === northTz);
    const interiorRow = northRow.filter((c) => isNorthInteriorColumn(cells, w, h, c.tx, c.tz));
    const pool = interiorRow.length ? interiorRow : northRow;
    pool.sort((a, b) => a.tx - b.tx);

    let pick;
    if (edge === 'start') {
      pick = pool[0];
    } else if (edge === 'end') {
      pick = pool[pool.length - 1];
    } else {
      pick = pool[Math.floor(pool.length / 2)];
    }
    if (reserved.has(`${pick.tx},${pick.tz}`)) {
      pick = pool.find((c) => !reserved.has(`${c.tx},${c.tz}`)) ?? pool[0];
    }

    return {
      tx: pick.tx,
      tz: pick.tz,
      x: originX + (pick.tx + 0.5) * TILE,
      z: originZ + (pick.tz + 1) * TILE,
    };
  }

  remove(chest) {
    const building = chest.homeBuilding;
    if (building?.chests) {
      const i = building.chests.indexOf(chest);
      if (i >= 0) building.chests.splice(i, 1);
      building.chest = building.chests[0] ?? null;
      building.chestTile = building.chestTiles?.[0] ?? null;
      if (building.chestTiles) {
        const ti = building.chestTiles.findIndex((t) =>
          Math.abs(chest.x - (building.originX + (t.tx + 0.5) * TILE)) < 0.01);
        if (ti >= 0) building.chestTiles.splice(ti, 1);
      }
    } else if (building?.chest === chest) {
      building.chest = null;
      building.chestTile = null;
    }
    this._unregisterObstacle(chest);
    const i = this.chests.indexOf(chest);
    if (i >= 0) this.chests.splice(i, 1);
  }

  removeAllFromBuilding(building) {
    for (const chest of [...(building.chests ?? (building.chest ? [building.chest] : []))]) {
      this.remove(chest);
    }
    building.chests = [];
    building.chestTiles = [];
    building.chest = null;
    building.chestTile = null;
  }

  /** Restore chest loot/state when loading a save. */
  restoreInBuilding(saved, building) {
    const chest = {
      x: saved.x,
      z: saved.z,
      variant: saved.variant,
      slots: saved.slots.map((s) => (s ? { ...s } : null)),
      opened: !!saved.opened,
      homeCx: building.homeCx,
      homeCz: building.homeCz,
      homeBuilding: building,
      obstacle: null,
    };
    if (!building.chests) building.chests = [];
    if (!building.chestTiles) building.chestTiles = [];
    building.chests.push(chest);
    building.chest = building.chests[0];
    this._registerObstacle(chest);
    this.chests.push(chest);
    return chest;
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
      kind: 'aabb',
      x: chest.x,
      z: chest.z,
      halfW: CHEST_COLLISION_HALF_W,
      halfH: CHEST_COLLISION_HALF_H,
      softHalfW: CHEST_COLLISION_HALF_W,
      softHalfH: CHEST_COLLISION_HALF_H,
      softX: chest.x,
      softZ: chest.z,
      blocksBullets: false,
    };
    this.world.addDynamicObstacle(chest.obstacle);
  }

  _unregisterObstacle(chest) {
    if (!chest.obstacle) return;
    this.world.removeDynamicObstacle(chest.obstacle);
    chest.obstacle = null;
  }
}
