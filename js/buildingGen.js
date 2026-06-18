import { TILE, hash01 } from './worldGen.js';
import { PPU } from './renderConfig.js';
import { CHAR_NATIVE_PX, spriteFeetOffset } from './sprites.js';

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
const WALL_HALF = TILE * 0.5;
/** N/S walls — soft collision exterior slice (thick enough to meet corners when gliding). */
const NS_SOFT_HALF = WALL_HALF * 0.54;

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

/**
 * Inside when the tile under the player's feet is floor or door, and the anchor
 * has cleared the north exterior lip (feet offset false-positives when hugging north).
 */
export function isInsideBuilding(building, px, pz) {
  const { originX, originZ, w, h, cells } = building;
  const fpSouth = originZ + h * TILE;

  if (pz < originZ + TILE * 0.08) return false;
  if (pz > fpSouth + TILE * 0.05) return false;

  const feetZ = playerSouthEdgeZ(px, pz);
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

/** Merged perimeter colliders — overlapping bars + corners, no gaps at joints. */
function buildWallObstacles(originX, originZ, w, h, doorTx) {
  const obstacles = [];
  const pushSoftOnly = (x, z, halfW, halfH) => {
    obstacles.push({
      kind: 'aabb',
      x,
      z,
      halfW: 0,
      halfH: 0,
      softHalfW: halfW,
      softHalfH: halfH,
      softX: x,
      softZ: z,
      blocksBullets: false,
    });
  };

  const push = (x, z, halfW, halfH, opts = {}) => {
    const {
      ns = false,
      softZ = null,
      softHalfH = null,
      bulletZ = null,
      bulletHalfH = null,
    } = opts;
    const softPad = ns ? 0 : WALL_SOFT_COLLISION_PAD;
    const obs = {
      kind: 'aabb',
      x,
      z,
      halfW: halfW + WALL_COLLISION_PAD,
      halfH: halfH + WALL_COLLISION_PAD,
      softHalfW: halfW + softPad,
      softHalfH: softHalfH ?? halfH + softPad,
      softX: x,
      softZ: softZ ?? z,
      blocksBullets: true,
    };
    if (bulletZ != null) {
      obs.bulletZ = bulletZ;
      obs.bulletHalfH = bulletHalfH ?? halfH;
    }
    obstacles.push(obs);
  };

  const fpW = w * TILE;
  const fpH = h * TILE;

  // North — full width; soft collision only blocks the north exterior lip.
  push(originX + fpW * 0.5, originZ + WALL_HALF, fpW * 0.5, WALL_HALF, {
    ns: true,
    softZ: originZ + NS_SOFT_HALF,
    softHalfH: NS_SOFT_HALF,
  });

  // Interior north floor edge — keep player out of the north wall row.
  pushSoftOnly(
    originX + fpW * 0.5,
    originZ + TILE - 0.18,
    fpW * 0.5 - EW_WALL_THICK,
    0.18,
  );

  // West / east — full height.
  push(originX + EW_WALL_THICK * 0.5, originZ + fpH * 0.5, EW_WALL_THICK * 0.5, fpH * 0.5);
  push(originX + fpW - EW_WALL_THICK * 0.5, originZ + fpH * 0.5, EW_WALL_THICK * 0.5, fpH * 0.5);

  const southZ = originZ + fpH - WALL_HALF;
  const southSoftZ = originZ + fpH - NS_SOFT_HALF;
  /** Bullet block on interior lip only — exterior hugging can still shoot inward. */
  const southBulletZ = originZ + fpH - TILE * 0.62;
  const southBulletHalf = TILE * 0.22;

  const pushSouth = (x, halfW) => {
    push(x, southZ, halfW, WALL_HALF, {
      ns: true,
      softZ: southSoftZ,
      softHalfH: NS_SOFT_HALF,
      bulletZ: southBulletZ,
      bulletHalfH: southBulletHalf,
    });
  };
  {
    const west = originX;
    const east = originX + Math.min(TILE, doorTx * TILE);
    if (east - west > 0.01) {
      pushSouth((west + east) * 0.5, (east - west) * 0.5);
    }
  }
  {
    const east = originX + fpW;
    const west = originX + Math.max((w - 1) * TILE, (doorTx + 1) * TILE);
    if (east - west > 0.01) {
      pushSouth((west + east) * 0.5, (east - west) * 0.5);
    }
  }

  // South wall spans between corner caps and door.
  if (doorTx > 1) {
    const west = originX + TILE;
    const east = originX + doorTx * TILE;
    pushSouth((west + east) * 0.5, (east - west) * 0.5);
  }

  if (doorTx < w - 2) {
    const west = originX + (doorTx + 1) * TILE;
    const east = originX + (w - 1) * TILE;
    pushSouth((west + east) * 0.5, (east - west) * 0.5);
  }

  return obstacles;
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
  const obstacles = buildWallObstacles(originX, originZ, w, h, doorTx);

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
  { id: 'wall_ns', file: 'wall_ns.png', size: '16×16', notes: 'North/south wall segment (full tile width)' },
  { id: 'wall_ew', file: 'wall_ew.png', size: '4×16', notes: 'East/west wall — quarter-tile wide; top segment stacks 2× at north' },
  { id: 'wall_corner', file: 'wall_corner.png', size: '16×16', notes: 'Corner pillar (full tile)' },
  { id: 'wall_door_top', file: 'wall_door_top.png', size: '16×8', notes: 'Lintels above 1-tile door (south)' },
  { id: 'roof_fill', file: 'roof_fill.png', size: '16×16', notes: 'Flat roof interior fill tile' },
  { id: 'roof_edge', file: 'roof_edge.png', size: '16×16', notes: 'Roof edge/cap (overhang on south/north)' },
  { id: 'roof_corner', file: 'roof_corner.png', size: '16×16', notes: 'Roof corner piece (optional)' },
];
