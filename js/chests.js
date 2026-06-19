import { TILE } from './worldGen.js';
import { rollChestLoot, rollChestVariant } from './loot.js';
import { CELL_FLOOR, isNorthInteriorColumn } from './buildingGen.js';

export const CHEST_INTERACT_DIST = 2.8;
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

/** Single world anchor for draw, collision, interaction, and minimap. */
export function getChestWorldPos(chest) {
  return { x: chest.x, z: chest.z };
}

function cellWalkable(cells, w, h, tx, tz) {
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return false;
  const cell = cells[tz * w + tx];
  return cell === CELL_FLOOR;
}

export class ChestManager {
  constructor(world) {
    this.world = world;
    this.chests = [];
  }

  /** One loot chest against the north interior wall when a building is placed. */
  spawnInBuilding(building, chunk) {
    const pos = this._pickNorthBorderSpot(building);
    if (!pos) return null;

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
    building.chest = chest;
    this._registerObstacle(chest);
    this.chests.push(chest);
    return chest;
  }

  _pickNorthBorderSpot(building) {
    const { originX, originZ, w, h, cells, doorTx } = building;
    const doorTz = building.doorTz ?? h - 1;
    const candidates = [];

    for (let tz = 0; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        if (cells[tz * w + tx] !== CELL_FLOOR) continue;
        if (tx === doorTx && tz === doorTz) continue;
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
    const pick = pool[Math.floor(pool.length / 2)];
    building.chestTile = { tx: pick.tx, tz: pick.tz };
    return {
      x: originX + (pick.tx + 0.5) * TILE,
      z: originZ + (pick.tz + 1) * TILE,
    };
  }

  remove(chest) {
    if (chest.homeBuilding?.chest === chest) chest.homeBuilding.chest = null;
    this._unregisterObstacle(chest);
    const i = this.chests.indexOf(chest);
    if (i >= 0) this.chests.splice(i, 1);
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
    building.chest = chest;
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
