import { TILE, hash01, foliageSpriteBounds } from './worldGen.js';
import { PPU } from './renderConfig.js';
import { CHAR_NATIVE_PX, spriteFeetOffset, getEnemyNativePx, getEnemyDrawScale } from './sprites.js';

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

/** Extra collision padding — full size for enemies. */
const WALL_COLLISION_PAD = 0.68;
/** Tighter padding for player movement and bullets (E/W walls). */
const WALL_SOFT_COLLISION_PAD = 0.16;
/** Floor perimeter — 25% strip inward from each exposed floor edge. */
export const FLOOR_EDGE_FRAC = 0.25;

function cellWalkable(cells, w, h, tx, tz) {
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return false;
  const cell = cells[tz * w + tx];
  return cell === CELL_FLOOR || cell === CELL_DOOR;
}

function makeFloorEdgeObstacle(originX, originZ, tx, tz, dir, fpH) {
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
      // Horizontal south edge — bottom 25% (walk behind south wall inside).
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
  const obs = {
    kind: 'aabb',
    x,
    z,
    halfW: halfW + WALL_COLLISION_PAD,
    halfH: halfH + WALL_COLLISION_PAD,
    softHalfW: halfW + WALL_SOFT_COLLISION_PAD,
    softHalfH: halfH + WALL_SOFT_COLLISION_PAD,
    softX: x,
    softZ: z,
    blocksBullets: true,
    floorEdge: true,
  };
  if (dir === 's') {
    obs.bulletZ = originZ + fpH - TILE * 0.62;
    obs.bulletHalfH = TILE * 0.22;
  }
  return obs;
}

/** Full-tile north perimeter — exterior soft/hard (grass side). */
function makeNorthExteriorObstacle(originX, originZ, tx, tz) {
  const tileX = originX + tx * TILE;
  const tileZ = originZ + tz * TILE;
  const cx = tileX + TILE * 0.5;
  const cz = tileZ + TILE * 0.5;
  const halfW = TILE * 0.5;
  const halfH = TILE * 0.5;
  return {
    kind: 'aabb',
    x: cx,
    z: cz,
    halfW: halfW + WALL_COLLISION_PAD,
    halfH: halfH + WALL_COLLISION_PAD,
    softHalfW: halfW + WALL_SOFT_COLLISION_PAD,
    softHalfH: halfH + WALL_SOFT_COLLISION_PAD,
    softX: cx,
    softZ: cz,
    wallSoft: 'exterior',
    blocksBullets: true,
    floorEdge: true,
  };
}

function pushNorthPerimeter(obstacles, originX, originZ, tx, tz, fpH) {
  obstacles.push(makeNorthExteriorObstacle(originX, originZ, tx, tz));
  const lip = makeFloorEdgeObstacle(originX, originZ, tx, tz, 'n', fpH);
  lip.wallSoft = 'interior';
  obstacles.push(lip);
}

/** Collision from floor cell edges — works for any floor shape. Skips door tile (dynamic). */
export function buildFloorEdgeObstacles(originX, originZ, w, h, cells, doorTx) {
  const obstacles = [];
  const fpH = h * TILE;
  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      const cell = cells[tz * w + tx];
      if (cell !== CELL_FLOOR && cell !== CELL_DOOR) continue;
      if (cell === CELL_DOOR && tx === doorTx) continue;
      if (!cellWalkable(cells, w, h, tx, tz - 1)) {
        pushNorthPerimeter(obstacles, originX, originZ, tx, tz, fpH);
      }
      if (!cellWalkable(cells, w, h, tx, tz + 1)) {
        obstacles.push(makeFloorEdgeObstacle(originX, originZ, tx, tz, 's', fpH));
      }
      if (!cellWalkable(cells, w, h, tx - 1, tz)) {
        obstacles.push(makeFloorEdgeObstacle(originX, originZ, tx, tz, 'w', fpH));
      }
      if (!cellWalkable(cells, w, h, tx + 1, tz)) {
        obstacles.push(makeFloorEdgeObstacle(originX, originZ, tx, tz, 'e', fpH));
      }
    }
  }
  return obstacles;
}

/** Door tile edges when closed (removed entirely when open). */
export function buildDoorTileEdgeObstacles(originX, originZ, w, h, cells, doorTx) {
  const tz = h - 1;
  const obstacles = [];
  if (!cellWalkable(cells, w, h, doorTx, tz)) return obstacles;
  const fpH = h * TILE;
  if (!cellWalkable(cells, w, h, doorTx, tz - 1)) {
    obstacles.push(makeFloorEdgeObstacle(originX, originZ, doorTx, tz, 'n', fpH));
  }
  if (!cellWalkable(cells, w, h, doorTx, tz + 1)) {
    obstacles.push(makeFloorEdgeObstacle(originX, originZ, doorTx, tz, 's', fpH));
  }
  if (!cellWalkable(cells, w, h, doorTx - 1, tz)) {
    obstacles.push(makeFloorEdgeObstacle(originX, originZ, doorTx, tz, 'w', fpH));
  }
  if (!cellWalkable(cells, w, h, doorTx + 1, tz)) {
    obstacles.push(makeFloorEdgeObstacle(originX, originZ, doorTx, tz, 'e', fpH));
  }
  return obstacles;
}

/** Shack footprint variants [width × depth] in tiles (includes wall ring). */
export const SHACK_SIZE_VARIANTS = [
  { w: 4, h: 5 },
  { w: 5, h: 5 },
  { w: 6, h: 5 },
  { w: 4, h: 7 },
  { w: 5, h: 7 },
  { w: 6, h: 7 },
];

export const SHACK_MAX_W = Math.max(...SHACK_SIZE_VARIANTS.map((v) => v.w));
export const SHACK_MAX_H = Math.max(...SHACK_SIZE_VARIANTS.map((v) => v.h));

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

  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      cells[tz * w + tx] = (tz === h - 1 && tx === doorTx) ? CELL_DOOR : CELL_FLOOR;
    }
  }
  return { w, h, cells, doorTx };
}

/** Edge tile that carries a wall sprite (floor still underneath). */
function isShackWallCell(tx, tz, w, h, doorTx) {
  if (tz === h - 1 && tx === doorTx) return false;
  return tx === 0 || tx === w - 1 || tz === 0 || tz === h - 1;
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

/**
 * Inside when the tile under the player's feet is floor or door, and the anchor
 * has cleared the north exterior lip (feet offset false-positives when hugging north).
 */
export function isInsideBuilding(building, px, pz, feetZOverride = null) {
  const { originX, originZ, w, h, cells } = building;
  const fpSouth = originZ + h * TILE;

  if (pz < originZ + TILE * 0.08) return false;
  if (pz > fpSouth + TILE * 0.05) return false;

  const feetZ = feetZOverride ?? playerSouthEdgeZ(px, pz);
  if (feetZ < originZ + TILE * 0.12) return false;
  if (feetZ > fpSouth + TILE * 0.08) return false;

  const tx = Math.floor((px - originX) / TILE);
  const tz = Math.floor((feetZ - originZ) / TILE);
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return false;
  const cell = cells[tz * w + tx];
  return cell === CELL_FLOOR || cell === CELL_DOOR;
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
  return {
    x: building.originX + (doorTx + 0.5) * TILE,
    z: building.originZ + (building.h - 0.5) * TILE,
  };
}

export function doorSortZ(building) {
  return building.originZ + building.h * TILE;
}

export function isNearDoor(building, px, pz, maxDist = DOOR_INTERACT_DIST) {
  const pos = getDoorWorldPos(building);
  return Math.hypot(px - pos.x, pz - pos.z) <= maxDist;
}

function isNearDoorOutside(px, pz, building) {
  const doorX = building.originX + (building.doorTx + 0.5) * TILE;
  const southZ = building.originZ + building.h * TILE;
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

function shapeOverlapsSoftAabb(px, pz, shape, obs) {
  if (!shape || obs.softHalfW == null) return false;
  const acz = pz + (shape.zOff ?? 0);
  const ox = obs.softX ?? obs.x;
  const oz = obs.softZ ?? obs.z;
  return Math.abs(px - ox) < shape.halfW + obs.softHalfW
    && Math.abs(acz - oz) < shape.halfH + obs.softHalfH;
}

/** True if the player's move collider would hit closed-door floor edge boxes. */
export function playerTouchesClosedDoorFloorCollision(building, player) {
  if (!building || !player) return false;
  const defs = buildDoorTileEdgeObstacles(
    building.originX,
    building.originZ,
    building.w,
    building.h,
    building.cells,
    building.doorTx,
  );
  const shape = player.getMoveCollider?.(PPU) ?? player.getMoveCollider();
  for (const obs of defs) {
    if (shapeOverlapsSoftAabb(player.x, player.z, shape, obs)) return true;
  }
  return false;
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
  const tileSouth = building.originZ + building.h * TILE;
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
  const tileSouth = building.originZ + building.h * TILE;
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
  if (player?.getMoveCollider) {
    return playerTouchesClosedDoorFloorCollision(building, player);
  }
  const feet = getPlayerFeetStripBounds(x, z);
  return getDoorCloseBlockRects(building).some((door) => aabbOverlap2D(feet, door));
}

export function wouldClosingDoorTrapPlayer(building, player) {
  if (!building?.doorOpen || !player) return false;
  return playerTouchesClosedDoorFloorCollision(building, player);
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
  const { originX, originZ, h, doorTx } = building;
  const fpH = h * TILE;
  const tileSouth = originZ + fpH;
  const stripH = TILE * DOOR_TILE_FOOT_FRAC;
  const x = originX + (doorTx + 0.5) * TILE;
  const southZ = tileSouth - stripH * 0.5;
  const southBulletZ = originZ + fpH - TILE * 0.62;
  const halfH = stripH * 0.5;
  return {
    kind: 'aabb',
    x,
    z: southZ,
    halfW: TILE * 0.45,
    halfH,
    softHalfW: TILE * 0.45,
    softHalfH: halfH,
    softX: x,
    softZ: southZ,
    blocksBullets: true,
    bulletZ: southBulletZ,
    bulletHalfH: TILE * 0.22,
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

/** World rect for clearing foliage around a shack (includes north sprite overhang). */
export function buildingFoliageClearRect(building) {
  const interior = building.interior;
  const pad = TILE * 4;
  return {
    minX: interior.minX - pad,
    maxX: interior.maxX + pad,
    minZ: interior.minZ - pad,
    maxZ: interior.maxZ + pad,
  };
}

function wallFeetZ(originZ, tz, orient) {
  // N/S segments and corners anchor to tile center; E/W walls keep south-edge feet.
  if (orient === 'ns' || orient === 'corner') {
    return originZ + (tz + 0.5) * TILE;
  }
  return originZ + (tz + 1) * TILE;
}

function wallCenter(originX, originZ, tx, tz, w, h, orient) {
  if (orient === 'corner') {
    return {
      x: originX + (tx + 0.5) * TILE,
      z: originZ + (tz + 0.5) * TILE,
    };
  }
  if (orient === 'ew') {
    const cx = originX + (tx === 0 ? EW_WALL_THICK * 0.5 : w * TILE - EW_WALL_THICK * 0.5);
    const cz = originZ + (tz + 0.5) * TILE;
    return { x: cx, z: cz };
  }
  const cx = originX + (tx + 0.5) * TILE;
  const zOff = tz === 0 ? NS_WALL_THICK * 0.5 : h * TILE - NS_WALL_THICK * 0.5;
  return { x: cx, z: originZ + zOff };
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

export function buildShackPieces(originX, originZ, w, h, cells) {
  const walls = [];
  const doorTx = Math.floor(w / 2);

  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      if (!isShackWallCell(tx, tz, w, h, doorTx)) continue;
      const orient = wallOrient(tx, tz, w, h);
      const face = wallFace(tx, tz, w, h);
      const { x, z } = wallCenter(originX, originZ, tx, tz, w, h, orient);
      const extendNorth = orient === 'ew' && tz === 1;
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

  const interior = computeInteriorBounds(originX, originZ, w, h, cells);
  const obstacles = buildFloorEdgeObstacles(originX, originZ, w, h, cells, doorTx);

  return {
    type: 'shack',
    originX,
    originZ,
    footprintW: w * TILE,
    footprintH: h * TILE,
    w,
    h,
    cells,
    doorTx,
    interior,
    walls,
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
