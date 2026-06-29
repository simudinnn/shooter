import { TILE, hash01, hash32, foliageSpriteBounds } from './worldGen.js';
import { PPU } from './renderConfig.js';
import { CHAR_NATIVE_PX, spriteFeetOffset, getEnemyNativePx, getEnemyDrawScale } from './sprites.js';
import {
  rollBuildingStyle,
  rollDecor as rollDecorSprite,
} from './buildingTypes.js';

const PLAYER_SPRITE_SCALE = 1.5;

/** Native pixel art size per building tile (upscaled 2× on screen at PPU 8). */
export const BUILDING_ART_PX = 16;

export const CELL_EMPTY = 0;
export const CELL_WALL = 1;
export const CELL_FLOOR = 2;
export const CELL_DOOR = 3;

/** Quarter-tile thickness for east/west (vertical) wall strips. */
export const EW_WALL_THICK = TILE * 0.25;
export const NS_WALL_THICK = TILE;

/** Extra padding on wall collision strips (single box — movement, bullets, door trap). */
export const WALL_COLLISION_PAD = 0.16;

function makeWallAabb(x, z, halfW, halfH, extra = {}) {
  return {
    kind: 'aabb',
    x,
    z,
    halfW: halfW + WALL_COLLISION_PAD,
    halfH: halfH + WALL_COLLISION_PAD,
    blocksBullets: true,
    ...extra,
  };
}
/** Floor perimeter — 25% strip inward from each exposed floor edge. */
export const FLOOR_EDGE_FRAC = 0.25;

function cellWalkable(cells, w, h, tx, tz) {
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return false;
  const cell = cells[tz * w + tx];
  return cell === CELL_FLOOR || cell === CELL_DOOR;
}

function makeFloorEdgeObstacle(originX, originZ, tx, tz, dir) {
  const tileX = originX + tx * TILE;
  const tileZ = originZ + tz * TILE;
  const edgeHalf = TILE * FLOOR_EDGE_FRAC * 0.5;
  const cx = tileX + TILE * 0.5;
  const cz = tileZ + TILE * 0.5;
  let x;
  let z;
  let halfW;
  let halfH;
  switch (dir) {
    case 'n':
      // Interior lip — bottom 25% under north wall row.
      x = cx;
      z = tileZ + TILE - edgeHalf;
      halfW = TILE * 0.5;
      halfH = edgeHalf;
      break;
    case 's':
      // South lip — bottom 25% of south wall row (same thickness as E/W).
      x = cx;
      z = tileZ + TILE - edgeHalf;
      halfW = TILE * 0.5;
      halfH = edgeHalf;
      break;
    case 'w':
      x = tileX + edgeHalf;
      z = cz;
      halfW = edgeHalf;
      halfH = TILE * 0.5;
      break;
    default:
      x = tileX + TILE - edgeHalf;
      z = cz;
      halfW = edgeHalf;
      halfH = TILE * 0.5;
      break;
  }
  return makeWallAabb(x, z, halfW, halfH, { floorEdge: true, edgeDir: dir });
}

/** Full-tile north perimeter — one tile tall. */
function makeNorthExteriorObstacle(originX, originZ, tx, tz) {
  const tileX = originX + tx * TILE;
  const tileZ = originZ + tz * TILE;
  const cx = tileX + TILE * 0.5;
  const cz = tileZ + TILE * 0.5;
  const halfW = TILE * 0.5;
  const halfH = TILE * 0.5;
  return makeWallAabb(cx, cz, halfW, halfH, { floorEdge: true, edgeDir: 'n' });
}

function pushNorthPerimeter(obstacles, originX, originZ, tx, tz) {
  obstacles.push(makeNorthExteriorObstacle(originX, originZ, tx, tz));
}

/** South wall — single 25% floor-edge strip (same as E/W). */
function pushSouthEdge(obstacles, originX, originZ, tx, tz) {
  obstacles.push(makeFloorEdgeObstacle(originX, originZ, tx, tz, 's'));
}

/** North-row floor tile that is not a corner column. */
export function isNorthInteriorColumn(cells, w, h, tx, tz) {
  if (!cellWalkable(cells, w, h, tx, tz)) return false;
  if (cellWalkable(cells, w, h, tx, tz - 1)) return false;
  if (!cellWalkable(cells, w, h, tx - 1, tz)) return false;
  if (!cellWalkable(cells, w, h, tx + 1, tz)) return false;
  return true;
}

/** Collision from floor cell edges — works for any floor shape. Skips door tile (dynamic). */
export function buildFloorEdgeObstacles(originX, originZ, w, h, cells, doorTx, doorTz) {
  const obstacles = [];
  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      const cell = cells[tz * w + tx];
      if (cell !== CELL_FLOOR && cell !== CELL_DOOR) continue;
      if (cell === CELL_DOOR && tx === doorTx && tz === doorTz) continue;
      if (!cellWalkable(cells, w, h, tx, tz - 1)) {
        pushNorthPerimeter(obstacles, originX, originZ, tx, tz);
      }
      if (!cellWalkable(cells, w, h, tx, tz + 1)) {
        if (tx !== doorTx || tz !== doorTz) {
          pushSouthEdge(obstacles, originX, originZ, tx, tz);
        }
      }
      if (!cellWalkable(cells, w, h, tx - 1, tz)) {
        obstacles.push(makeFloorEdgeObstacle(originX, originZ, tx, tz, 'w'));
      }
      if (!cellWalkable(cells, w, h, tx + 1, tz)) {
        obstacles.push(makeFloorEdgeObstacle(originX, originZ, tx, tz, 'e'));
      }
    }
  }
  return obstacles;
}

/** Closed-door collision — always blocks bullets; not treated as interior foot lip. */
function sealDoorObstacle(obs) {
  obs.doorSeal = true;
  obs.blocksBullets = true;
  return obs;
}

/** Door tile edges when closed (removed entirely when open). */
export function buildDoorTileEdgeObstacles(originX, originZ, w, h, cells, doorTx, doorTz) {
  const obstacles = [];
  if (!cellWalkable(cells, w, h, doorTx, doorTz)) return obstacles;
  if (!cellWalkable(cells, w, h, doorTx, doorTz - 1)) {
    obstacles.push(sealDoorObstacle(makeFloorEdgeObstacle(originX, originZ, doorTx, doorTz, 'n')));
  }
  if (!cellWalkable(cells, w, h, doorTx, doorTz + 1)) {
    obstacles.push(sealDoorObstacle(makeFloorEdgeObstacle(originX, originZ, doorTx, doorTz, 's')));
  }
  if (!cellWalkable(cells, w, h, doorTx - 1, doorTz)) {
    obstacles.push(sealDoorObstacle(makeFloorEdgeObstacle(originX, originZ, doorTx, doorTz, 'w')));
  }
  if (!cellWalkable(cells, w, h, doorTx + 1, doorTz)) {
    obstacles.push(sealDoorObstacle(makeFloorEdgeObstacle(originX, originZ, doorTx, doorTz, 'e')));
  }
  return obstacles;
}

/** Shack footprint variants [width × depth] in tiles (includes wall ring). */
export const SHACK_SIZE_VARIANTS = [
  { w: 5, h: 4 },
  { w: 6, h: 4 },
  { w: 6, h: 5 },
  { w: 7, h: 4 },
  { w: 7, h: 5 },
];

export const SHACK_MAX_W = Math.max(...SHACK_SIZE_VARIANTS.map((v) => v.w));
export const SHACK_MAX_H = Math.max(...SHACK_SIZE_VARIANTS.map((v) => v.h));

export { BUILDING_MAX_W, BUILDING_MAX_H } from './buildingTypes.js';

export function rollShackSize(seedA, seedB) {
  const idx = Math.floor(hash01(seedA, seedB) * SHACK_SIZE_VARIANTS.length);
  return SHACK_SIZE_VARIANTS[idx];
}

/**
 * Rectangular shack — full footprint floor (walls drawn on top), door on south center.
 */
export function generateShackCells(w, h) {
  const cells = new Uint8Array(w * h);
  const doorTx = Math.floor(w / 2);
  const doorTz = h - 1;

  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      cells[tz * w + tx] = (tz === doorTz && tx === doorTx) ? CELL_DOOR : CELL_FLOOR;
    }
  }
  return { w, h, cells, doorTx, doorTz, shape: 'rect' };
}

function isPerimeterWallCell(tx, tz, cells, w, h, doorTx, doorTz) {
  if (tx === doorTx && tz === doorTz) return false;
  const cell = cells[tz * w + tx];
  if (cell !== CELL_FLOOR && cell !== CELL_DOOR) return false;
  return !cellWalkable(cells, w, h, tx - 1, tz)
    || !cellWalkable(cells, w, h, tx + 1, tz)
    || !cellWalkable(cells, w, h, tx, tz - 1)
    || !cellWalkable(cells, w, h, tx, tz + 1);
}

/** Nav grid — outdoor grass notch (EMPTY) is walkable; perimeter floor ring is a wall. */
export function isNavBlockedBuildingCell(building, tx, tz) {
  if (!building) return true;
  const { cells, w, h, doorTx, doorTz = h - 1 } = building;
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return true;
  const cell = cells[tz * w + tx];
  if (cell === CELL_EMPTY) return false;
  if (cell === CELL_DOOR) return !building.doorOpen;
  if (cell === CELL_FLOOR) {
    return isPerimeterWallCell(tx, tz, cells, w, h, doorTx, doorTz);
  }
  return true;
}

function wallOrientForSolidCell(tx, tz, cells, w, h) {
  const west = !cellWalkable(cells, w, h, tx - 1, tz);
  const east = !cellWalkable(cells, w, h, tx + 1, tz);
  const north = !cellWalkable(cells, w, h, tx, tz - 1);
  const south = !cellWalkable(cells, w, h, tx, tz + 1);
  if ((west || east) && (north || south)) return 'corner';
  if (west || east) return 'ew';
  return 'ns';
}

function wallFaceForSolidCell(tx, tz, cells, w, h) {
  const west = !cellWalkable(cells, w, h, tx - 1, tz);
  const east = !cellWalkable(cells, w, h, tx + 1, tz);
  const north = !cellWalkable(cells, w, h, tx, tz - 1);
  const south = !cellWalkable(cells, w, h, tx, tz + 1);
  if (north && west) return 'corner-nw';
  if (north && east) return 'corner-ne';
  if (south && west) return 'corner-sw';
  if (south && east) return 'corner-se';
  if (west) return 'west';
  if (east) return 'east';
  if (north) return 'north';
  return 'south';
}

/** Minimum tile gap between interior EW partition and the entry door column. */
export const INTERIOR_DOOR_WALL_GAP = 2;

/**
 * One vertical EW partition rising from the south wall (open near the north).
 * Returns metadata only — floor cells stay walkable.
 */
export function planInteriorPartition(w, h, doorTx, doorTz, seedA, seedB) {
  if (w < 5 || h < 4) return null;

  const txMin = 2;
  const txMax = w - 3;
  if (txMax < txMin) return null;

  const candidates = [];
  for (let tx = txMin; tx <= txMax; tx++) {
    if (Math.abs(tx - doorTx) < INTERIOR_DOOR_WALL_GAP) continue;
    candidates.push(tx);
  }
  if (!candidates.length) return null;

  const edgeTx = candidates[Math.floor(hash01(seedA, seedB) * candidates.length)];
  const topOpenThrough = Math.min(
    h - 3,
    Math.floor(hash01(seedA + 3, seedB + 4) * Math.max(1, h - 2)),
  );
  const tzMin = Math.max(1, topOpenThrough + 1);
  const tzMax = h - 1;
  if (tzMax - tzMin + 1 < 2) return null;

  return { edgeTx, tzMin, tzMax, face: 'east', doorTx, doorTz };
}

function partitionBlocksCrossing(fromTx, fromTz, toTx, toTz, partition) {
  if (!partition) return false;
  if (fromTz !== toTz) return false;
  if (Math.abs(fromTx - toTx) !== 1) return false;
  const westX = Math.min(fromTx, toTx);
  if (westX !== partition.edgeTx) return false;
  return fromTz >= partition.tzMin && fromTz <= partition.tzMax;
}

function partitionSegmentWalkable(cells, w, h, partition, tz) {
  const { edgeTx, doorTx, doorTz } = partition;
  if (tz === doorTz && Math.abs(edgeTx - doorTx) < INTERIOR_DOOR_WALL_GAP) return false;
  const west = cells[tz * w + edgeTx];
  if (west !== CELL_FLOOR && west !== CELL_DOOR) return false;
  if (edgeTx + 1 >= w) return false;
  const east = cells[tz * w + edgeTx + 1];
  return east === CELL_FLOOR || east === CELL_DOOR;
}

export function partitionReachableFromDoor(cells, w, h, doorTx, doorTz, partition) {
  if (!partition) return true;
  const seen = new Uint8Array(w * h);
  const stack = [[doorTx, doorTz]];
  let count = 0;
  while (stack.length) {
    const [tx, tz] = stack.pop();
    if (tx < 0 || tz < 0 || tx >= w || tz >= h) continue;
    const idx = tz * w + tx;
    if (seen[idx]) continue;
    const cell = cells[idx];
    if (cell !== CELL_FLOOR && cell !== CELL_DOOR) continue;
    seen[idx] = 1;
    count++;
    const neighbors = [[tx - 1, tz], [tx + 1, tz], [tx, tz - 1], [tx, tz + 1]];
    for (const [nx, nz] of neighbors) {
      if (partitionBlocksCrossing(tx, tz, nx, nz, partition)) continue;
      stack.push([nx, nz]);
    }
  }
  let total = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === CELL_FLOOR || cells[i] === CELL_DOOR) total++;
  }
  return count === total;
}

function buildInteriorPartitionWalls(originX, originZ, w, h, cells, partition) {
  if (!partition) return [];
  const walls = [];
  const { edgeTx, tzMin, tzMax, face } = partition;
  for (let tz = tzMin; tz <= tzMax; tz++) {
    if (!partitionSegmentWalkable(cells, w, h, partition, tz)) continue;
    const orient = 'ew';
    const { x, z } = wallCenter(originX, originZ, edgeTx, tz, orient, face);
    const feetZ = wallFeetZ(originZ, tz, orient);
    const sortZ = wallDrawSortZ(originZ, tz, orient, face, false);
    walls.push({
      x,
      z,
      sortZ,
      feetZ,
      extendNorth: false,
      orient,
      face,
      tx: edgeTx,
      tz,
      interior: true,
    });
  }
  return walls;
}

function buildInteriorPartitionObstacles(originX, originZ, w, h, cells, partition) {
  if (!partition) return [];
  const obstacles = [];
  const { edgeTx, tzMin, tzMax, face } = partition;
  for (let tz = tzMin; tz <= tzMax; tz++) {
    if (!partitionSegmentWalkable(cells, w, h, partition, tz)) continue;
    obstacles.push(makeFloorEdgeObstacle(originX, originZ, edgeTx, tz, face === 'east' ? 'e' : 'w'));
  }
  return obstacles;
}

/** Place interior EW partition when at least two segments fit the floor shape. */
export function carveInteriorRooms(cells, w, h, doorTx, doorTz, seedA, seedB) {
  if (w < 5 || h < 4) return null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const partition = planInteriorPartition(
      w,
      h,
      doorTx,
      doorTz,
      seedA + attempt * 1.7,
      seedB + attempt * 2.3,
    );
    if (!partition) continue;
    let segments = 0;
    for (let tz = partition.tzMin; tz <= partition.tzMax; tz++) {
      if (partitionSegmentWalkable(cells, w, h, partition, tz)) segments++;
    }
    if (segments >= 2) return partition;
  }
  return null;
}

function isBareExterior(cells, w, h, tx, tz) {
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return true;
  return cells[tz * w + tx] === CELL_EMPTY;
}

function wallOrientForCell(tx, tz, cells, w, h) {
  const west = !cellWalkable(cells, w, h, tx - 1, tz);
  const east = !cellWalkable(cells, w, h, tx + 1, tz);
  const north = !cellWalkable(cells, w, h, tx, tz - 1);
  const south = !cellWalkable(cells, w, h, tx, tz + 1);
  if ((west || east) && (north || south)) return 'corner';
  if (west || east) return 'ew';
  return 'ns';
}

function wallFaceForCell(tx, tz, cells, w, h) {
  const west = !cellWalkable(cells, w, h, tx - 1, tz);
  const east = !cellWalkable(cells, w, h, tx + 1, tz);
  const north = !cellWalkable(cells, w, h, tx, tz - 1);
  const south = !cellWalkable(cells, w, h, tx, tz + 1);
  if (north && west) return 'corner-nw';
  if (north && east) return 'corner-ne';
  if (south && west) return 'corner-sw';
  if (south && east) return 'corner-se';
  if (west) return 'west';
  if (east) return 'east';
  if (north) return 'north';
  return 'south';
}

function wallOrient(tx, tz, w, h) {
  const onWest = tx === 0;
  const onEast = tx === w - 1;
  const onNorth = tz === 0;
  const onSouth = tz === h - 1;
  if ((onWest || onEast) && (onNorth || onSouth)) return 'corner';
  if (onWest || onEast) return 'ew';
  return 'ns';
}

/** Compass face for depth sort — north/south handled separately from generic ns. */
export function wallFace(tx, tz, w, h) {
  const onWest = tx === 0;
  const onEast = tx === w - 1;
  const onNorth = tz === 0;
  const onSouth = tz === h - 1;
  if (onNorth && onWest) return 'corner-nw';
  if (onNorth && onEast) return 'corner-ne';
  if (onSouth && onWest) return 'corner-sw';
  if (onSouth && onEast) return 'corner-se';
  if (onWest) return 'west';
  if (onEast) return 'east';
  if (onNorth) return 'north';
  return 'south';
}

function isNorthFace(face) {
  return face === 'north' || face === 'corner-nw' || face === 'corner-ne';
}

function isSouthFace(face) {
  return face === 'south' || face === 'corner-sw' || face === 'corner-se';
}

export function shackWallSpriteId(orient) {
  if (orient === 'corner') return 'shack_wall_corner';
  if (orient === 'ew') return 'shack_wall_ew';
  return 'shack_wall_ns';
}

export function shackWallArtSize(orient, extendNorth = false) {
  if (orient === 'ew') {
    return { w: 4, h: extendNorth ? 32 : 16 };
  }
  return { w: 16, h: 16 };
}

/** South edge of the player sprite in world Z (feet). */
export function playerSouthEdgeZ(px, pz) {
  return pz + spriteFeetOffset(CHAR_NATIVE_PX, PLAYER_SPRITE_SCALE) / PPU;
}

/** South edge Z for player or enemy (used for interior / door routing). */
export function entityFeetZ(entity) {
  if (entity?.type) {
    const nativePx = getEnemyNativePx(entity.type);
    const scale = getEnemyDrawScale(entity.type);
    return entity.z + spriteFeetOffset(nativePx, scale) / PPU;
  }
  return playerSouthEdgeZ(entity.x, entity.z);
}

/** Shift north from feet so floor tiles register while the sprite is still entering. */
export const INSIDE_TEST_Z_UP = TILE * 0.22;

/** Sample Z for floor-cell inside tests (slightly above the sprite feet). */
export function playerInsideTestZ(px, pz) {
  return playerSouthEdgeZ(px, pz) - INSIDE_TEST_Z_UP;
}

/** Center of the player's lowest edge — used for inside/outside floor tests. */
export function playerFootFloorPoint(px, pz) {
  return { x: px, z: playerInsideTestZ(px, pz) };
}

/**
 * Inside when the entity move AABB lies fully on building floor/door cells
 * and sprite feet sit on an interior floor/door cell (not hugging south wall outside).
 */
export function isInsideBuilding(building, px, pz, collider = null, feetZOverride = null) {
  if (collider?.kind === 'aabb') {
    if (!isMoveShapeOnBuildingFloor(building, px, pz, collider)) return false;
    const feetZ = feetZOverride ?? (pz + (collider.zOff ?? 0) + collider.halfH);
    return isFeetOnBuildingFloor(building, px, feetZ);
  }
  const feetZ = typeof collider === 'number' ? collider : null;
  return isInsideBuildingFeet(building, px, pz, feetZ);
}

function isFeetOnBuildingFloor(building, px, feetZ) {
  const { originX, originZ, w, h, cells } = building;
  const southFace = originZ + h * TILE;
  if (feetZ > southFace - TILE * 0.06) return false;

  const tx = Math.floor((px - originX) / TILE);
  const tz = Math.floor((feetZ - originZ) / TILE);
  if (tx < 0 || tx >= w || tz < 0 || tz >= h) return false;

  const cell = cells[tz * w + tx];
  return cell === CELL_FLOOR || cell === CELL_DOOR;
}

function isMoveShapeOnBuildingFloor(building, px, pz, shape) {
  const { originX, originZ, w, h, cells } = building;
  const acz = pz + (shape.zOff ?? 0);
  const minX = px - shape.halfW;
  const maxX = px + shape.halfW;
  const minZ = acz - shape.halfH;
  const maxZ = acz + shape.halfH;

  const northFace = originZ;
  const southFace = originZ + h * TILE;
  const westFace = originX;
  const eastFace = originX + w * TILE;

  if (minX < westFace || maxX > eastFace || minZ < northFace || maxZ > southFace) {
    return false;
  }

  const samples = [
    [minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ],
    [px, minZ], [px, maxZ], [minX, acz], [maxX, acz],
  ];

  for (const [sx, sz] of samples) {
    const tx = Math.floor((sx - originX) / TILE);
    const tz = Math.floor((sz - originZ) / TILE);
    if (tx < 0 || tx >= w || tz < 0 || tz >= h) return false;
    const cell = cells[tz * w + tx];
    if (cell !== CELL_FLOOR && cell !== CELL_DOOR) return false;
  }
  return true;
}

/** Legacy feet-point test for entities without a move shape. */
function isInsideBuildingFeet(building, px, pz, feetZOverride = null) {
  const { originX, originZ, w, h, cells } = building;
  const feetZ = feetZOverride ?? playerSouthEdgeZ(px, pz);
  const feetTx = Math.floor((px - originX) / TILE);
  const feetTz = Math.floor((feetZ - originZ) / TILE);

  if (feetTx < 0 || feetTx >= w || feetTz < 0 || feetTz >= h) return false;

  const cell = cells[feetTz * w + feetTx];
  if (cell !== CELL_FLOOR && cell !== CELL_DOOR) return false;

  if (feetTz === 0 && !cellWalkable(cells, w, h, feetTx, -1)) {
    if (feetZ <= originZ + TILE * 0.1) return false;
  }

  return true;
}

/** Y-sort Z for bullets — tuck behind north walls and doors when north of them. */
export function bulletDrawSortZ(bx, bz, buildings) {
  let sortZ = bz;
  for (const b of buildings ?? []) {
    const minX = b.originX;
    const maxX = b.originX + b.w * TILE;
    if (bx < minX - TILE || bx > maxX + TILE) continue;
    const doorZ = doorSortZ(b);
    if (bz < doorZ - TILE * 0.12) {
      sortZ = Math.min(sortZ, doorZ - TILE * 0.48);
    }
    for (const wall of b.walls ?? []) {
      if (!isNorthFace(wall.face)) continue;
      if (Math.abs(bx - wall.x) > TILE * 0.65) continue;
      if (bz < wall.sortZ + TILE * 0.3) {
        sortZ = Math.min(sortZ, wall.sortZ - 0.05);
      }
    }
  }
  return sortZ;
}

/** World Z raise for roof — TILE × 0.75 (12px of 16px art, 24px at PPU 8). */
export function roofRaiseWorld() {
  return TILE * 0.75;
}

/** World clip bounds for gun — horizontal only at ¼-tile E/W wall inner faces. */
export function buildingGunClipBounds(building) {
  const { originX, w } = building;
  const pad = 0.02;
  return {
    minX: originX + EW_WALL_THICK + pad,
    maxX: originX + w * TILE - EW_WALL_THICK - pad,
    clipXOnly: true,
  };
}

function isNearSouthWallOutside(px, pz, wall, building) {
  const southZ = building.originZ + (wall.tz + 1) * TILE;
  const feetZ = playerSouthEdgeZ(px, pz);
  if (Math.abs(px - wall.x) >= TILE * 0.58) return false;
  return feetZ > southZ - TILE * 0.42 && feetZ <= southZ + TILE * 0.12;
}

function isNearNorthWallOutside(px, pz, wall, building) {
  const northZ = building.originZ;
  const feetZ = playerSouthEdgeZ(px, pz);
  if (Math.abs(px - wall.x) >= TILE * 0.58) return false;
  return feetZ >= northZ - TILE * 0.08 && feetZ < northZ + TILE * 0.42;
}

function wallDrawSortZ(originZ, tz, orient, face, extendNorth) {
  if (isSouthFace(face)) return originZ + (tz + 1) * TILE;
  if (isNorthFace(face)) return originZ + tz * TILE;
  const feetZ = wallFeetZ(originZ, tz, orient);
  return extendNorth ? feetZ + TILE * 0.04 : feetZ;
}

/** Depth sort for back-pass walls. */
export function wallBackDrawZ(wall, playerSortZ, playerInside, px, pz, building) {
  if (!building) return wall.sortZ;
  const face = wall.face;
  if (isNorthFace(face)) {
    if (!playerInside && isNearNorthWallOutside(px, pz, wall, building)) return wall.sortZ;
    if (!playerInside) return wall.sortZ;
    return Math.min(wall.sortZ, playerSortZ - 0.06);
  }
  if (isSouthFace(face)) {
    if (!playerInside) {
      if (isNearSouthWallOutside(px, pz, wall, building)) return wall.sortZ;
      return wall.sortZ;
    }
    if (playerSortZ < wall.sortZ - TILE * 0.85) return wall.sortZ;
    return Math.min(wall.sortZ, playerSortZ - 0.06);
  }
  return wall.sortZ;
}

/** Walls that skip the back pass and draw in front of the player body/gun. */
export function wallDrawsInFront(wall, playerSortZ, playerInside, px, pz, building = null) {
  const face = wall.face;
  if (isNorthFace(face)) {
    return !playerInside && building != null
      && isNearNorthWallOutside(px, pz, wall, building);
  }
  if (isSouthFace(face)) {
    if (playerInside) return playerSortZ >= wall.sortZ - TILE * 0.85;
    return building != null && isNearSouthWallOutside(px, pz, wall, building);
  }
  if (wall.orient === 'ew') {
    if (!playerInside) {
      return wall.sortZ > playerSortZ + 0.02;
    }
    if (wall.sortZ > playerSortZ + 0.02) return true;
    if (Math.abs(px - wall.x) < TILE * 0.7) return true;
    if (playerSortZ > wall.sortZ && playerSortZ - wall.sortZ < TILE * 0.95) return true;
    if (Math.abs(playerSortZ - wall.sortZ) < TILE * 0.6) return true;
    return false;
  }
  return false;
}

export function wallFrontDrawZ(wall, playerSortZ, playerInside, px, pz, building = null) {
  if (!wallDrawsInFront(wall, playerSortZ, playerInside, px, pz, building)) {
    return wall.sortZ;
  }
  const face = wall.face;
  if ((isSouthFace(face) || isNorthFace(face)) && !playerInside) {
    return Math.max(wall.sortZ, playerSortZ + 0.06);
  }
  if (wall.sortZ > playerSortZ + 0.02) return wall.sortZ;
  return playerSortZ + 0.08;
}

export function doorLintelSortZ(building) {
  return building.originZ + building.h * TILE;
}

export const DOOR_INTERACT_DIST = 3.5;

export function getDoorWorldPos(building) {
  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorTz = building.doorTz ?? building.h - 1;
  return {
    x: building.originX + (doorTx + 0.5) * TILE,
    z: building.originZ + (doorTz + 0.5) * TILE,
  };
}

/** Building grid cell at a world point (within building bounding box). */
export function getBuildingCellAtWorld(buildings, wx, wz) {
  const list = buildings?.buildings;
  if (!list) return null;
  for (const b of list) {
    const lx = wx - b.originX;
    const lz = wz - b.originZ;
    if (lx < 0 || lz < 0 || lx >= b.w * TILE || lz >= b.h * TILE) continue;
    const tx = Math.floor(lx / TILE);
    const tz = Math.floor(lz / TILE);
    return { building: b, tx, tz, cell: b.cells[tz * b.w + tx] };
  }
  return null;
}

/** Corridor through an open doorway — movement/nav ignore wall lips here. */
export function isInOpenDoorNavZone(buildings, wx, wz) {
  for (const b of buildings?.buildings ?? []) {
    if (!b.doorOpen) continue;
    const doorTx = b.doorTx ?? Math.floor(b.w / 2);
    const doorTz = b.doorTz ?? b.h - 1;
    const minX = b.originX + doorTx * TILE - TILE * 0.45;
    const maxX = b.originX + (doorTx + 1) * TILE + TILE * 0.45;
    const minZ = b.originZ + doorTz * TILE - TILE * 0.25;
    const maxZ = b.originZ + (doorTz + 1) * TILE + TILE * 1.25;
    if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) return true;
  }
  return false;
}

/** True when an entity move AABB overlaps any open door corridor. */
export function shapeOverlapsOpenDoorNavZone(buildings, px, pz, shape) {
  if (!shape || shape.kind !== 'aabb') {
    return isInOpenDoorNavZone(buildings, px, pz);
  }
  const acz = pz + (shape.zOff ?? 0);
  const samples = [
    [px, acz],
    [px - shape.halfW, acz - shape.halfH],
    [px + shape.halfW, acz - shape.halfH],
    [px - shape.halfW, acz + shape.halfH],
    [px + shape.halfW, acz + shape.halfH],
    [px, acz - shape.halfH],
    [px, acz + shape.halfH],
  ];
  for (const [sx, sz] of samples) {
    if (isInOpenDoorNavZone(buildings, sx, sz)) return true;
  }
  return false;
}

export function doorSortZ(building) {
  const doorTz = building.doorTz ?? building.h - 1;
  return building.originZ + (doorTz + 1) * TILE;
}

export function isNearDoor(building, px, pz, maxDist = DOOR_INTERACT_DIST) {
  const pos = getDoorWorldPos(building);
  return Math.hypot(px - pos.x, pz - pos.z) <= maxDist;
}

function isNearDoorOutside(px, pz, building) {
  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorTz = building.doorTz ?? building.h - 1;
  const doorX = building.originX + (doorTx + 0.5) * TILE;
  const southZ = building.originZ + (doorTz + 1) * TILE;
  const feetZ = playerSouthEdgeZ(px, pz);
  if (Math.abs(px - doorX) >= TILE * 0.58) return false;
  return feetZ > southZ - TILE * 0.42 && feetZ <= southZ + TILE * 0.12;
}

/** Door depth — closed: player on top outside unless hugging door; open outside: door behind player. */
export function doorDrawsInFront(building, playerSortZ, playerInside, px, pz) {
  const sortZ = doorSortZ(building);
  if (playerInside) return playerSortZ >= sortZ - TILE * 0.85;
  if (building.doorOpen) return false;
  return isNearDoorOutside(px, pz, building);
}

/** Bottom fraction of door tile / player sprite used for doorway overlap tests. */
export const DOOR_TILE_FOOT_FRAC = 0.2;
/** Taller region that blocks door close when the player is in the doorway (esp. exiting). */
export const DOOR_CLOSE_BLOCK_FRAC = 0.52;
export const DOOR_CLOSE_SOUTH_PAD = TILE * 0.14;
export const PLAYER_FEET_FRAC = 0.2;

function playerShapeOverlapsObs(px, pz, shape, obs) {
  if (!shape || !obs.halfW || !obs.halfH) return false;
  const acz = pz + (shape.zOff ?? 0);
  return Math.abs(px - obs.x) < shape.halfW + obs.halfW
    && Math.abs(acz - obs.z) < shape.halfH + obs.halfH;
}

function getClosedDoorObstacles(building) {
  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorTz = building.doorTz ?? building.h - 1;
  return buildDoorTileEdgeObstacles(
    building.originX,
    building.originZ,
    building.w,
    building.h,
    building.cells,
    doorTx,
    doorTz,
  );
}

function playerHitsClosedDoorObstacles(building, player) {
  if (!building || !player) return false;
  const shape = player.getMoveCollider?.(PPU) ?? player.getMoveCollider();
  for (const obs of getClosedDoorObstacles(building)) {
    if (playerShapeOverlapsObs(player.x, player.z, shape, obs)) return true;
  }
  return false;
}

/** True if the player's move collider would hit closed-door floor edge boxes. */
export function playerTouchesClosedDoorFloorCollision(building, player) {
  return playerHitsClosedDoorObstacles(building, player);
}

function playerOverlapsDoorCloseRects(player, rects) {
  const shape = player.getMoveCollider?.(PPU) ?? player.getMoveCollider();
  if (shape) {
    const acz = player.z + (shape.zOff ?? 0);
    for (const r of rects) {
      if (player.x - shape.halfW < r.maxX && player.x + shape.halfW > r.minX
        && acz - shape.halfH < r.maxZ && acz + shape.halfH > r.minZ) {
        return true;
      }
    }
    return false;
  }
  return rects.some((r) => aabbOverlap2D(getPlayerFeetStripBounds(player.x, player.z), r));
}

/** Doorway trap test — would the closed-door collision touch the player hitbox? */
export function playerOccupiesDoorCloseBlock(building, player) {
  return playerHitsClosedDoorObstacles(building, player);
}

function aabbOverlap2D(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Bottom 20% of the player sprite in world space (feet-anchored). */
export function getPlayerFeetStripBounds(x, z) {
  const feetZ = playerSouthEdgeZ(x, z);
  const spriteH = (CHAR_NATIVE_PX * PLAYER_SPRITE_SCALE) / PPU;
  const stripH = spriteH * PLAYER_FEET_FRAC;
  const halfW = (CHAR_NATIVE_PX * PLAYER_SPRITE_SCALE) / PPU * 0.5;
  return {
    minX: x - halfW,
    maxX: x + halfW,
    minZ: feetZ - stripH,
    maxZ: feetZ,
  };
}

/** Bottom 20% of the door floor tile (south edge = tile bottom). */
export function getDoorTileFootStrip(building) {
  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorTz = building.doorTz ?? building.h - 1;
  const tileSouth = building.originZ + (doorTz + 1) * TILE;
  const stripH = TILE * DOOR_TILE_FOOT_FRAC;
  return {
    minX: building.originX + doorTx * TILE,
    maxX: building.originX + (doorTx + 1) * TILE,
    minZ: tileSouth - stripH,
    maxZ: tileSouth,
  };
}

/** Close-block region — lower half+ of door tile plus a lip south (exit path). */
export function getDoorCloseBlockRects(building) {
  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorTz = building.doorTz ?? building.h - 1;
  const tileSouth = building.originZ + (doorTz + 1) * TILE;
  const stripH = TILE * DOOR_CLOSE_BLOCK_FRAC;
  return [{
    minX: building.originX + doorTx * TILE,
    maxX: building.originX + (doorTx + 1) * TILE,
    minZ: tileSouth - stripH,
    maxZ: tileSouth + DOOR_CLOSE_SOUTH_PAD,
  }];
}

/** @deprecated use getDoorTileFootStrip */
export function getDoorCloseBlockRect(building) {
  return getDoorTileFootStrip(building);
}

/** @deprecated use getDoorTileFootStrip */
export function getDoorGapRect(building) {
  return getDoorTileFootStrip(building);
}

export function entityOccupiesDoorGap(building, x, z, player = null) {
  const rects = getDoorCloseBlockRects(building);
  if (player?.getMoveCollider) {
    return playerOverlapsDoorCloseRects(player, rects);
  }
  const feet = getPlayerFeetStripBounds(x, z);
  return rects.some((door) => aabbOverlap2D(feet, door));
}

export function wouldClosingDoorTrapPlayer(building, player) {
  if (!building?.doorOpen || !player) return false;
  return playerHitsClosedDoorObstacles(building, player);
}

export function doorBackDrawZ(building, playerSortZ, playerInside, px, pz) {
  const sortZ = doorSortZ(building);
  if (!playerInside) return sortZ;
  if (playerSortZ < sortZ - TILE * 0.85) return sortZ;
  return Math.min(sortZ, playerSortZ - 0.06);
}

export function doorFrontDrawZ(building, playerSortZ, playerInside, px, pz) {
  const sortZ = doorSortZ(building);
  if (!doorDrawsInFront(building, playerSortZ, playerInside, px, pz)) return sortZ;
  if (!playerInside) return Math.max(sortZ, playerSortZ + 0.06);
  if (sortZ > playerSortZ + 0.02) return sortZ;
  return playerSortZ + 0.08;
}

/** Closed door — bottom 20% of the door tile; soft matches hard (no extra lip). */
export function createDoorObstacle(building) {
  const { originX, originZ, doorTx } = building;
  const doorTz = building.doorTz ?? building.h - 1;
  const tileZ = originZ + doorTz * TILE;
  const stripH = TILE * DOOR_TILE_FOOT_FRAC;
  const x = originX + (doorTx + 0.5) * TILE;
  const southZ = tileZ + TILE - stripH * 0.5;
  const halfH = stripH * 0.5;
  return {
    kind: 'aabb',
    x,
    z: southZ,
    halfW: TILE * 0.45,
    halfH,
    blocksBullets: true,
    isDoor: true,
  };
}

/** Y-sort foliage sprite overlaps walkable interior (feet can sit just outside). */
export function foliageOverlapsBuildingInterior(building, foliage) {
  const interior = building?.interior;
  if (!interior) return false;
  const b = foliageSpriteBounds(foliage);
  const pad = TILE * 0.2;
  return (
    b.minX <= interior.maxX + pad
    && b.maxX >= interior.minX - pad
    && b.minZ <= interior.maxZ + pad
    && b.maxZ >= interior.minZ - pad
  );
}

/** Clear all foliage on the building footprint (walls + interior); exterior tiles keep grass. */
export function buildingFoliageClearRects(building) {
  return [getBuildingFootprintRect(building.originX, building.originZ, building.w, building.h)];
}

/** @deprecated — use buildingFoliageClearRects */
export function buildingFoliageClearRect(building) {
  const rects = buildingFoliageClearRects(building);
  if (!rects.length) {
    const interior = building.interior;
    return {
      minX: interior.minX - TILE,
      maxX: interior.maxX + TILE,
      minZ: interior.minZ - TILE,
      maxZ: interior.maxZ + TILE,
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.minX);
    maxX = Math.max(maxX, r.maxX);
    minZ = Math.min(minZ, r.minZ);
    maxZ = Math.max(maxZ, r.maxZ);
  }
  return { minX, maxX, minZ, maxZ };
}

function wallFeetZ(originZ, tz, orient) {
  // N/S segments and corners anchor to tile center; E/W walls keep south-edge feet.
  if (orient === 'ns' || orient === 'corner') {
    return originZ + (tz + 0.5) * TILE;
  }
  return originZ + (tz + 1) * TILE;
}

function wallCenter(originX, originZ, tx, tz, orient, face) {
  if (orient === 'corner') {
    return {
      x: originX + (tx + 0.5) * TILE,
      z: originZ + (tz + 0.5) * TILE,
    };
  }
  if (orient === 'ew') {
    const cx = face === 'west'
      ? originX + tx * TILE + EW_WALL_THICK * 0.5
      : originX + (tx + 1) * TILE - EW_WALL_THICK * 0.5;
    return { x: cx, z: originZ + (tz + 0.5) * TILE };
  }
  const cz = face === 'north'
    ? originZ + tz * TILE + NS_WALL_THICK * 0.5
    : originZ + (tz + 1) * TILE - NS_WALL_THICK * 0.5;
  return { x: originX + (tx + 0.5) * TILE, z: cz };
}

/** Walkable AABB from floor + door tiles (stable interior test). */
export function computeInteriorBounds(originX, originZ, w, h, cells) {
  let minTX = w;
  let maxTX = -1;
  let minTZ = h;
  let maxTZ = -1;
  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      const cell = cells[tz * w + tx];
      if (cell !== CELL_FLOOR && cell !== CELL_DOOR) continue;
      minTX = Math.min(minTX, tx);
      maxTX = Math.max(maxTX, tx);
      minTZ = Math.min(minTZ, tz);
      maxTZ = Math.max(maxTZ, tz);
    }
  }
  const inset = 0.02;
  return {
    minX: originX + minTX * TILE + inset,
    maxX: originX + (maxTX + 1) * TILE - inset,
    minZ: originZ + minTZ * TILE + inset,
    maxZ: originZ + (maxTZ + 1) * TILE - inset,
  };
}

/** Minimum clear tile gap between building footprints (roof grid bbox). */
export const BUILDING_MIN_GAP_TILES = 4;

export function getBuildingFootprintRect(originX, originZ, w, h) {
  return {
    minX: originX,
    maxX: originX + w * TILE,
    minZ: originZ,
    maxZ: originZ + h * TILE,
  };
}

/** True when footprint bboxes are closer than gapTiles edge-to-edge. */
export function buildingFootprintsTooClose(a, b, gapTiles = BUILDING_MIN_GAP_TILES) {
  const gap = gapTiles * TILE;
  const separated = b.minX >= a.maxX + gap
    || a.minX >= b.maxX + gap
    || b.minZ >= a.maxZ + gap
    || a.minZ >= b.maxZ + gap;
  return !separated;
}

/** @deprecated use getBuildingFootprintRect */
export function getBuildingInteriorRect(originX, originZ, w, h, cells) {
  return computeInteriorBounds(originX, originZ, w, h, cells);
}

/** @deprecated use buildingFootprintsTooClose */
export function buildingInteriorsTooClose(a, b, gapTiles = BUILDING_MIN_GAP_TILES) {
  return buildingFootprintsTooClose(a, b, gapTiles);
}

/** Barrel decor — 16×16 px native art (one floor tile). */
export const BARREL_NATIVE_W = 16;
export const BARREL_NATIVE_H = 16;

export function barrelWorldSize() {
  return { worldW: TILE, worldH: TILE };
}

export function barrelScreenSize(tilePx) {
  return { drawW: tilePx, drawH: tilePx };
}

/** Collision matches one ground tile — aligned with tile flow fields. */
export const BARREL_COLLISION_FRAC = 0.88;

export function tileWorldCenter(originX, originZ, tx, tz) {
  return {
    x: originX + (tx + 0.5) * TILE,
    z: originZ + (tz + 0.5) * TILE,
  };
}

export function barrelCollisionHalfExtents() {
  const half = TILE * BARREL_COLLISION_FRAC * 0.5;
  return { halfW: half, halfH: half };
}

export function makeBarrelObstacle(x, z) {
  const { halfW, halfH } = barrelCollisionHalfExtents();
  return {
    kind: 'aabb',
    x,
    z,
    halfW,
    halfH,
    blocksBullets: true,
    blocksVision: true,
    isDecor: true,
  };
}

function collectReentrantEwWalls(cells, w, h) {
  const extra = [];
  const seen = new Set();
  const add = (tx, tz, face) => {
    if (tx < 0 || tz < 0 || tx >= w || tz >= h) return;
    const key = `${tx},${tz},${face}`;
    if (seen.has(key)) return;
    seen.add(key);
    extra.push({ tx, tz, orient: 'ew', face, reentrant: true });
  };

  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      if (!cellWalkable(cells, w, h, tx, tz)) continue;
      if (cellWalkable(cells, w, h, tx + 1, tz)
        && cellWalkable(cells, w, h, tx, tz + 1)
        && !cellWalkable(cells, w, h, tx + 1, tz + 1)) {
        add(tx, tz, 'east');
      }
      if (cellWalkable(cells, w, h, tx - 1, tz)
        && cellWalkable(cells, w, h, tx, tz + 1)
        && !cellWalkable(cells, w, h, tx - 1, tz + 1)) {
        add(tx, tz, 'west');
      }
      if (cellWalkable(cells, w, h, tx, tz - 1)
        && cellWalkable(cells, w, h, tx + 1, tz)
        && !cellWalkable(cells, w, h, tx + 1, tz - 1)) {
        add(tx, tz, 'east');
      }
      if (cellWalkable(cells, w, h, tx, tz - 1)
        && cellWalkable(cells, w, h, tx - 1, tz)
        && !cellWalkable(cells, w, h, tx - 1, tz - 1)) {
        add(tx, tz, 'west');
      }
    }
  }
  return extra;
}

function makePropObstacle(x, z, { blocksBullets = false, blocksVision = null, sizeFrac = BARREL_COLLISION_FRAC } = {}) {
  const half = TILE * sizeFrac * 0.5;
  const obs = {
    kind: 'aabb',
    x,
    z,
    halfW: half,
    halfH: half,
    blocksBullets,
    isDecor: true,
  };
  if (blocksVision != null) obs.blocksVision = blocksVision;
  return obs;
}

function tileKey(tx, tz) {
  return `${tx},${tz}`;
}

/** North-wall prop anchor — same south-edge pivot as loot chests. */
function northWallPropPos(originX, originZ, tx, tz) {
  return {
    x: originX + (tx + 0.5) * TILE,
    z: originZ + (tz + 1) * TILE,
  };
}

const INTERIOR_PROP_COLLISION_FRAC = 0.72;

function isReserved(tx, tz, reserved) {
  return reserved.some((t) => t.tx === tx && t.tz === tz);
}

/** Keep tables/fridges off the door approach (south entry corridor). */
function isDoorApproachTile(tx, tz, doorTx, doorTz) {
  const northOfDoor = doorTz - tz;
  if (northOfDoor < 0 || northOfDoor > 2) return false;
  const spread = northOfDoor === 2 ? 1 : 2;
  return Math.abs(tx - doorTx) <= spread;
}

/** Fridge on north border; table on interior floor — avoids reserved tiles (chest, etc.). */
export function buildBuildingInteriorProps(
  originX,
  originZ,
  w,
  h,
  cells,
  doorTx,
  doorTz,
  reserved = [],
  seedA,
  seedB,
) {
  const props = [];
  const taken = new Set(reserved.map((t) => tileKey(t.tx, t.tz)));
  let northWallTz = h;

  const northCandidates = [];
  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      if (cells[tz * w + tx] !== CELL_FLOOR) continue;
      if (tx === doorTx && tz === doorTz) continue;
      if (taken.has(tileKey(tx, tz))) continue;
      if (cellWalkable(cells, w, h, tx, tz - 1)) continue;
      northCandidates.push({ tx, tz });
    }
  }
  if (northCandidates.length) {
    northWallTz = Math.min(...northCandidates.map((c) => c.tz));
    const northRow = northCandidates.filter((c) => c.tz === northWallTz);
    const interiorRow = northRow.filter((c) => isNorthInteriorColumn(cells, w, h, c.tx, c.tz));
    const pool = interiorRow.length ? interiorRow : northRow;
    const idx = hash32(seedA + 11, seedB + 13) % pool.length;
    const fridge = pool[idx];
    if (fridge) {
      taken.add(tileKey(fridge.tx, fridge.tz));
      const pos = northWallPropPos(originX, originZ, fridge.tx, fridge.tz);
      props.push({
        sprite: 'bld_fridge',
        x: pos.x,
        z: pos.z,
        sortZ: pos.z - TILE * 0.12,
        sortBias: -1,
        tx: fridge.tx,
        tz: fridge.tz,
        interior: true,
        obstacle: makePropObstacle(pos.x, pos.z, {
          blocksBullets: true,
          blocksVision: false,
          sizeFrac: INTERIOR_PROP_COLLISION_FRAC,
        }),
      });
    }
  }

  const frontBlocked = new Set();
  for (const key of taken) {
    const [txStr, tzStr] = key.split(',');
    const tx = Number(txStr);
    const tz = Number(tzStr);
    frontBlocked.add(tileKey(tx, tz + 1));
  }

  const tableCandidates = [];
  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      if (cells[tz * w + tx] !== CELL_FLOOR) continue;
      if (tx === doorTx && tz === doorTz) continue;
      if (taken.has(tileKey(tx, tz))) continue;
      if (isDoorApproachTile(tx, tz, doorTx, doorTz)) continue;
      if (frontBlocked.has(tileKey(tx, tz))) continue;
      if (tz < northWallTz + 2) continue;
      if (!cellWalkable(cells, w, h, tx - 1, tz)
        || !cellWalkable(cells, w, h, tx + 1, tz)
        || !cellWalkable(cells, w, h, tx, tz - 1)
        || !cellWalkable(cells, w, h, tx, tz + 1)) continue;
      tableCandidates.push({ tx, tz });
    }
  }
  if (tableCandidates.length) {
    const idx = hash32(seedA + 17, seedB + 19) % tableCandidates.length;
    const table = tableCandidates[idx];
    const center = tileWorldCenter(originX, originZ, table.tx, table.tz);
    props.push({
      sprite: 'bld_table',
      x: center.x,
      z: center.z + TILE * 0.08,
      sortZ: center.z - TILE * 0.16,
      sortBias: -1,
      tx: table.tx,
      tz: table.tz,
      interior: true,
      obstacle: makePropObstacle(center.x, center.z, { blocksBullets: false }),
    });
  }

  return props;
}

export function buildBuildingDecor(originX, originZ, w, h, cells, doorTx, doorTz, seedA, seedB, excludeTiles = []) {
  const decor = [];
  const excluded = (tx, tz) => excludeTiles.some((t) => t.tx === tx && t.tz === tz);
  const candidates = [];
  const seen = new Set();

  const addExterior = (tx, tz, dir) => {
    if (tx === doorTx && tz === doorTz && dir === 's') return;
    let otx = tx;
    let otz = tz;
    if (dir === 'n') otz -= 1;
    else if (dir === 's') otz += 1;
    else if (dir === 'w') otx -= 1;
    else otx += 1;
    if (!isBareExterior(cells, w, h, otx, otz)) return;
    const key = `${otx},${otz}`;
    if (seen.has(key)) return;
    seen.add(key);
    const { x, z } = tileWorldCenter(originX, originZ, otx, otz);
    candidates.push({ x, z, sortZ: z + TILE * 0.35, otx, otz, dir });
  };

  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      if (!cellWalkable(cells, w, h, tx, tz)) continue;
      if (excluded(tx, tz)) continue;
      if (!cellWalkable(cells, w, h, tx, tz - 1) && isBareExterior(cells, w, h, tx, tz - 1)) {
        addExterior(tx, tz, 'n');
      }
      if (!cellWalkable(cells, w, h, tx, tz + 1) && isBareExterior(cells, w, h, tx, tz + 1)) {
        addExterior(tx, tz, 's');
      }
      if (!cellWalkable(cells, w, h, tx - 1, tz) && isBareExterior(cells, w, h, tx - 1, tz)) {
        addExterior(tx, tz, 'w');
      }
      if (!cellWalkable(cells, w, h, tx + 1, tz) && isBareExterior(cells, w, h, tx + 1, tz)) {
        addExterior(tx, tz, 'e');
      }
    }
  }

  if (!candidates.length) return decor;
  const count = Math.min(
    candidates.length,
    2 + (hash32(seedA, seedB) % 2),
  );
  const southPool = candidates.filter((c) => c.dir === 's');
  const sidePool = candidates.filter((c) => c.dir === 'w' || c.dir === 'e');
  const pool = southPool.length >= count
    ? southPool
    : [...southPool, ...sidePool, ...candidates.filter((c) => c.dir === 'n')];

  for (let i = 0; i < count; i++) {
    const idx = hash32(seedA + i * 3.1, seedB + i * 5.7) % pool.length;
    const pick = pool.splice(idx, 1)[0];
    if (!pick) break;
    const { sprite } = rollDecorSprite(seedA + pick.otx, seedB + pick.otz);
    decor.push({
      sprite,
      x: pick.x,
      z: pick.z,
      sortZ: pick.sortZ,
      tx: pick.otx,
      tz: pick.otz,
      exterior: true,
      obstacle: makeBarrelObstacle(pick.x, pick.z),
    });
  }
  return decor;
}

export function wallSpriteId(style, orient) {
  if (orient === 'corner') return style.wallCorner ?? style.wallNs;
  if (orient === 'ew') return style.wallEw;
  return style.wallNs;
}

export function buildBuildingPieces(originX, originZ, cellData, style = rollBuildingStyle(0, 0)) {
  const { w, h, cells, doorTx, doorTz, shape = 'rect' } = cellData;

  const walls = [];

  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      if (!isPerimeterWallCell(tx, tz, cells, w, h, doorTx, doorTz)) continue;
      const orient = wallOrientForCell(tx, tz, cells, w, h);
      const face = wallFaceForCell(tx, tz, cells, w, h);
      const { x, z } = wallCenter(originX, originZ, tx, tz, orient, face);
      const extendNorth = orient === 'ew' && cellWalkable(cells, w, h, tx, tz - 1);
      const feetZ = wallFeetZ(originZ, tz, orient);
      const sortZ = wallDrawSortZ(originZ, tz, orient, face, extendNorth);
      walls.push({
        x,
        z,
        sortZ,
        feetZ,
        extendNorth,
        orient,
        face,
        tx,
        tz,
      });
    }
  }

  const existingEw = new Set(
    walls.filter((w) => w.orient === 'ew').map((w) => `${w.tx},${w.tz},${w.face}`),
  );
  for (const seg of collectReentrantEwWalls(cells, w, h)) {
    const key = `${seg.tx},${seg.tz},${seg.face}`;
    if (existingEw.has(key)) continue;
    existingEw.add(key);
    const { x, z } = wallCenter(originX, originZ, seg.tx, seg.tz, seg.orient, seg.face);
    const feetZ = wallFeetZ(originZ, seg.tz, seg.orient);
    const sortZ = wallDrawSortZ(originZ, seg.tz, seg.orient, seg.face, false);
    walls.push({
      x,
      z,
      sortZ,
      feetZ,
      extendNorth: false,
      orient: seg.orient,
      face: seg.face,
      tx: seg.tx,
      tz: seg.tz,
      reentrant: true,
    });
  }

  const interior = computeInteriorBounds(originX, originZ, w, h, cells);
  const obstacles = buildFloorEdgeObstacles(originX, originZ, w, h, cells, doorTx, doorTz);

  return {
    type: style.id,
    style,
    shape,
    originX,
    originZ,
    footprintW: w * TILE,
    footprintH: h * TILE,
    w,
    h,
    cells,
    doorTx,
    doorTz,
    interior,
    walls,
    decor: [],
    obstacles,
    roof: {
      originX,
      originZ,
      w: w * TILE,
      h: h * TILE,
      sortZ: originZ + h * TILE + TILE * 0.15,
    },
    doorOpen: false,
    doorEdgeObstacles: null,
  };
}

export function buildShackPieces(originX, originZ, w, h, cells, doorTx, doorTz) {
  const cellData = doorTz != null
    ? { w, h, cells, doorTx, doorTz, shape: 'rect' }
    : { w, h, cells, doorTx: doorTx ?? Math.floor(w / 2), doorTz: h - 1, shape: 'rect' };
  return buildBuildingPieces(originX, originZ, cellData, rollBuildingStyle(0, 0));
}

/** @deprecated use isInsideBuilding */
export function isInteriorCell(cells, w, h, px, pz, originX, originZ) {
  const tx = Math.floor((px - originX) / TILE);
  const tz = Math.floor((pz - originZ) / TILE);
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return false;
  const cell = cells[tz * w + tx];
  return cell === CELL_FLOOR || cell === CELL_DOOR;
}

/**
 * Sprites to author (16×16 px native art; rendered at 2× = 32 screen px per tile).
 * Place under assets/buildings/shack/
 */
export const SHACK_SPRITE_MANIFEST = [
  { id: 'floor_wood', file: 'floor_wood.png', size: '16×16', notes: 'Interior floor tile' },
  { id: 'floor_wood_alt', file: 'floor_wood_alt.png', size: '16×16', notes: 'Floor variation (optional)' },
  { id: 'door_mat', file: 'door_mat.png', size: '16×16', notes: 'Door threshold / mat on south entry' },
  { id: 'door_closed', file: 'door_closed.png', size: '16×16', notes: 'Closed door panel on south entry' },
  { id: 'door_open', file: 'door_open.png', size: '22×16', notes: 'Open door swung west — 6px wider left of the door tile' },
  { id: 'wall_ns', file: 'wall_ns.png', size: '16×16', notes: 'North/south wall segment (full tile width)' },
  { id: 'wall_ew', file: 'wall_ew.png', size: '4×16', notes: 'East/west wall — quarter-tile wide; top segment stacks 2× at north' },
  { id: 'wall_corner', file: 'wall_corner.png', size: '16×16', notes: 'Corner pillar (full tile)' },
  { id: 'wall_door_top', file: 'wall_door_top.png', size: '16×8', notes: 'Lintels above 1-tile door (south)' },
  { id: 'roof_fill', file: 'roof_fill.png', size: '16×16', notes: 'Flat roof interior fill tile' },
  { id: 'roof_edge', file: 'roof_edge.png', size: '16×16', notes: 'Roof edge/cap (overhang on south/north)' },
  { id: 'roof_corner', file: 'roof_corner.png', size: '16×16', notes: 'Roof corner piece (optional)' },
];
