/** Procedural world — 3 ground tile variants, no biomes. */

import { snapAxis, snapPoint, FOLIAGE_SNAP_STEP } from './renderConfig.js';
export { snapAxis as snapRenderAxis, snapPoint as snapRenderPoint, FOLIAGE_SNAP_STEP as RENDER_SNAP_STEP } from './renderConfig.js';

export const TILE = 4;
export const CHUNK_TILES = 8;
export const CHUNK_WORLD = TILE * CHUNK_TILES;
export const BASE_RADIUS = 22;

export const WORLD_SEED = 90210;

let _worldSeed = 90210;

export function getWorldSeed() {
  return _worldSeed;
}

export function setWorldSeed(seed) {
  _worldSeed = (seed >>> 0) || 1;
}

export function rollWorldSeed() {
  setWorldSeed((Math.random() * 0xffffffff) >>> 0);
  return _worldSeed;
}

/** Single ground tile everywhere — floor_dirt. */
export const FLOOR_KIND = 'dirt';

/** One shared tint for all grass / bush foliage — tweak RGB here. */
export const FOLIAGE_TINT = { r: 168, g: 182, b: 96 };

const FOLIAGE = {
  grass: { sprite: 'foliage_grass', blocks: false, tinted: true, ysort: false },
  grass2: { sprite: 'foliage_grass2', blocks: false, tinted: true, ysort: false },
  grass3: { sprite: 'foliage_grass3', blocks: false, tinted: true, ysort: false },
  grass4: { sprite: 'foliage_grass4', blocks: false, tinted: true, ysort: false },
  grass_tall: { sprite: 'foliage_grass_tall', blocks: false, tinted: true, ysort: true, sortZBias: TILE * 0.01 - 0.05 },
  grass_tall2: { sprite: 'foliage_grass_tall2', blocks: false, tinted: true, ysort: true, sortZBias: TILE * 0.01 - 0.05 },
  bush: { sprite: 'foliage_bush', blocks: false, tinted: true, ysort: true, sortZBias: TILE * 0.01 - 0.05 },
  bush2: { sprite: 'foliage_bush2', blocks: false, tinted: true, ysort: true, sortZBias: TILE * 0.01 - 0.05 },
  pebble: { sprite: 'foliage_pebble', blocks: false, tinted: false, ysort: false },
  pebble2: { sprite: 'foliage_pebble2', blocks: false, tinted: false, ysort: false },
  rock: { sprite: 'foliage_rock', blocks: true, radius: 0.45, tinted: false, ysort: false },
  tree: { sprite: 'foliage_tree', blocks: true, radius: 1.35, tinted: false, ysort: true, drawSize: 4, sortZBias: TILE * 0.01 - 0.05 },
  tree2: { sprite: 'foliage_tree2', blocks: true, radius: 1.35, tinted: false, ysort: true, drawSize: 4, sortZBias: TILE * 0.01 - 0.05 },
  tree3: { sprite: 'foliage_tree3', blocks: true, radius: 1.35, tinted: false, ysort: true, drawSize: 4, sortZBias: TILE * 0.01 - 0.05 },
};

export function snapWorldAxis(v) {
  return snapAxis(v);
}

export function snapWorldPoint(x, z) {
  return snapPoint(x, z);
}

export function hash01(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7 + _worldSeed * 0.001) * 43758.5453;
  return n - Math.floor(n);
}

export function hash32(x, y) {
  return (hash01(x, y) * 0xffffffff) >>> 0;
}

export function isInBase(wx, wz) {
  return wx * wx + wz * wz < BASE_RADIUS * BASE_RADIUS;
}

/** @deprecated biomes removed — kept for old callers */
export function getBiome() {
  return '';
}

export function getFloorKind() {
  return FLOOR_KIND;
}

export function getFloorSpriteName(kind) {
  return `floor_${kind}`;
}

export function packTint(tint) {
  if (!tint) return 0;
  return ((tint.r >> 4) << 8) | ((tint.g >> 4) << 4) | (tint.b >> 4);
}

export const FOLIAGE_TINT_KEY = packTint(FOLIAGE_TINT);

export function unpackTint(key) {
  if (!key) return null;
  return {
    r: ((key >> 8) & 15) * 17,
    g: ((key >> 4) & 15) * 17,
    b: (key & 15) * 17,
  };
}

export function packTintGradient(grad) {
  if (!grad) return FOLIAGE_TINT_KEY;
  const t = grad.c || grad.a || grad.b || grad;
  return packTint(t);
}

export function unpackTintGradient(key) {
  if (!key) return null;
  const t = unpackTint(key) || FOLIAGE_TINT;
  return { a: t, c: t, b: t };
}

export function getTerrainMapColorFromTile(tile) {
  if (tile?.floorKind === 'grass') return '#5a8a50';
  if (tile?.floorKind === 'road') return '#4a4844';
  if (tile?.floorKind === 'path') return '#6a5c48';
  return '#6a5840';
}

export function getTerrainMapColor() {
  return getTerrainMapColorFromTile();
}

export function isTintedFoliage(kind) {
  return FOLIAGE[kind]?.tinted === true;
}

export function isTreeFoliage(kind) {
  return kind === 'tree' || kind === 'tree2' || kind === 'tree3';
}

export function isYsortFoliage(kind) {
  const def = FOLIAGE[kind];
  return def?.ysort === true;
}

export function foliageSpriteBounds(f) {
  const drawSize = f.drawSize ?? 1;
  const span = TILE * drawSize;
  const halfW = span * 0.5;
  return {
    minX: f.x - halfW,
    maxX: f.x + halfW,
    minZ: f.z - span,
    maxZ: f.z,
  };
}

export function foliageIntersectsRect(f, minX, maxX, minZ, maxZ) {
  const b = foliageSpriteBounds(f);
  return b.minX <= maxX && b.maxX >= minX && b.minZ <= maxZ && b.maxZ >= minZ;
}

export function isCanopyFoliage(kind) {
  return isYsortFoliage(kind);
}

const FOLIAGE_SPACING_TILES = 0.2;

function foliageTileKey(tx, tz) {
  return `${tx},${tz}`;
}

function isFoliageReserved(reserved, tx, tz) {
  return reserved.has(foliageTileKey(tx, tz));
}

function reserveFoliageArea(reserved, tx, tz, radius = FOLIAGE_SPACING_TILES) {
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      reserved.add(foliageTileKey(tx + dx, tz + dz));
    }
  }
}

function pushFoliage(foliage, obstacles, tx, tz, wx, wz, fKey, jitterSalt = 0) {
  const def = FOLIAGE[fKey];
  if (!def) return;

  const maxJ = TILE * 0.45;
  const jx = (hash01(tx * 17 + jitterSalt, tz * 23) - 0.5) * maxJ;
  const jz = (hash01(tx * 31 + jitterSalt, tz * 37) - 0.5) * maxJ;
  const x = wx + jx;
  const z = wz + jz;

  foliage.push({
    kind: fKey,
    sprite: def.sprite,
    x,
    z,
    drawSize: def.drawSize ?? 1,
    sortZBias: def.sortZBias ?? 0,
    tintKey: def.tinted ? FOLIAGE_TINT_KEY : 0,
  });

  if (def.blocks) {
    obstacles.push({
      x,
      z,
      radius: def.radius ?? 0,
    });
  }
}

function tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, fKey, jitterSalt = 0) {
  if (isFoliageReserved(reserved, tx, tz)) return false;
  pushFoliage(foliage, obstacles, tx, tz, wx, wz, fKey, jitterSalt);
  reserveFoliageArea(reserved, tx, tz);
  return true;
}

function pickFromVariants(tx, tz, salt, variants) {
  return variants[hash32(tx + salt * 1009, tz + salt * 9176) % variants.length];
}

function pickGrassVariant(tx, tz, salt = 0) {
  return pickFromVariants(tx, tz, salt, ['grass', 'grass2', 'grass3', 'grass4']);
}

function pickTallGrassVariant(tx, tz, salt = 0) {
  return pickFromVariants(tx, tz, salt, ['grass_tall', 'grass_tall2']);
}

function pickBushVariant(tx, tz, salt = 0) {
  return pickFromVariants(tx, tz, salt, ['bush', 'bush2']);
}

function pickTreeVariant(tx, tz, salt = 0) {
  return pickFromVariants(tx, tz, salt, ['tree', 'tree2', 'tree3']);
}

const TALL_GRASS_PATCH_TILES = 6;
const BUSH_PATCH_TILES = 8;
const TALL_GRASS_PATCH_CHANCE = 0.11;
const BUSH_PATCH_CHANCE = 0.09;
const TALL_GRASS_PATCH_FILL = 0.58;
const BUSH_PATCH_FILL = 0.52;

function patchRoll(tx, tz, patchTiles, salt) {
  const px = Math.floor(tx / patchTiles);
  const pz = Math.floor(tz / patchTiles);
  return hash01(px * 131 + salt, pz * 157 + salt);
}

function tileRoll(tx, tz, salt) {
  return hash01(tx * 19 + salt * 3, tz * 29 + salt * 5);
}

function pickFoliageForTile(tx, tz, foliage, obstacles, reserved, wx, wz) {
  if (isFoliageReserved(reserved, tx, tz)) return;

  const scatter = hash01(tx * 113 + 5, tz * 97 + 11);
  const detail = hash01(tx * 53 + 7, tz * 71 + 11);
  const outsideBase = !isInBase(wx, wz);

  if (outsideBase && scatter > 0.992) {
    if (tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickTreeVariant(tx, tz, 71), 71)) return;
  }

  if (patchRoll(tx, tz, TALL_GRASS_PATCH_TILES, 401) < TALL_GRASS_PATCH_CHANCE) {
    if (tileRoll(tx, tz, 41) < TALL_GRASS_PATCH_FILL) {
      if (tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickTallGrassVariant(tx, tz, 41), 41)) return;
    }
  }

  if (outsideBase && patchRoll(tx, tz, BUSH_PATCH_TILES, 509) < BUSH_PATCH_CHANCE) {
    if (tileRoll(tx, tz, 67) < BUSH_PATCH_FILL) {
      if (tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickBushVariant(tx, tz, 67), 67)) return;
    }
  }

  if (detail < 0.06) {
    if (tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickFromVariants(tx, tz, 53, ['pebble', 'pebble2']), 53)) return;
  }

  if (scatter < 0.7) {
    tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickGrassVariant(tx, tz, 23), 23);
  }
}

export function generateChunk(cx, cz) {
  const tiles = new Array(CHUNK_TILES * CHUNK_TILES);

  for (let lz = 0; lz < CHUNK_TILES; lz++) {
    for (let lx = 0; lx < CHUNK_TILES; lx++) {
      const tx = cx * CHUNK_TILES + lx;
      const tz = cz * CHUNK_TILES + lz;
      tiles[lz * CHUNK_TILES + lx] = { tx, tz, floorKind: FLOOR_KIND, tintKey: 0 };
    }
  }

  return { cx, cz, tiles, foliage: [], obstacles: [], foliagePopulated: false };
}

/** Fill chunk foliage after roads/buildings are placed. skipTile(tx,tz) => true to leave bare. */
export function populateChunkFoliage(chunk, skipTile = null) {
  if (!chunk || chunk.foliagePopulated || chunk.outOfBounds) return;
  const reserved = new Set();
  for (const f of chunk.foliage) {
    reserveFoliageArea(reserved, Math.floor(f.x / TILE), Math.floor(f.z / TILE));
  }

  for (let lz = 0; lz < CHUNK_TILES; lz++) {
    for (let lx = 0; lx < CHUNK_TILES; lx++) {
      const tx = chunk.cx * CHUNK_TILES + lx;
      const tz = chunk.cz * CHUNK_TILES + lz;
      if (skipTile?.(tx, tz)) continue;
      const wx = tx * TILE + TILE * 0.5;
      const wz = tz * TILE + TILE * 0.5;
      pickFoliageForTile(tx, tz, chunk.foliage, chunk.obstacles, reserved, wx, wz);
    }
  }
  chunk.foliagePopulated = true;
}

export function worldToChunk(wx, wz) {
  const tx = Math.floor(wx / TILE);
  const tz = Math.floor(wz / TILE);
  return {
    cx: Math.floor(tx / CHUNK_TILES),
    cz: Math.floor(tz / CHUNK_TILES),
    tx,
    tz,
  };
}
