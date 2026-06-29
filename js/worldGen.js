/** Procedural world — noise terrain, tinted grass floors, grass foliage. */

import { snapAxis, snapPoint, FOLIAGE_SNAP_STEP } from './renderConfig.js';
export { snapAxis as snapRenderAxis, snapPoint as snapRenderPoint, FOLIAGE_SNAP_STEP as RENDER_SNAP_STEP } from './renderConfig.js';

export const TILE = 4;
export const CHUNK_TILES = 8;
export const CHUNK_WORLD = TILE * CHUNK_TILES;
export const BASE_RADIUS = 22;

let _worldSeed = 90210;

/** @deprecated use getWorldSeed() — default until rollWorldSeed() runs */
export const WORLD_SEED = 90210;

export function getWorldSeed() {
  return _worldSeed;
}

export function setWorldSeed(seed) {
  _worldSeed = (seed >>> 0) || 1;
  _refreshTintPalette();
}

function _jitterRgb(base, salt, spread = 42) {
  const r = (s) => hash01(_worldSeed, s);
  return {
    r: Math.min(255, Math.max(0, Math.round(base.r + (r(salt) - 0.5) * spread))),
    g: Math.min(255, Math.max(0, Math.round(base.g + (r(salt + 17) - 0.5) * spread))),
    b: Math.min(255, Math.max(0, Math.round(base.b + (r(salt + 31) - 0.5) * spread))),
  };
}

function _refreshTintPalette() {
  _tintScrubA = _jitterRgb(TINT_SCRUB_A_BASE, 901, 38);
  _tintScrubB = _jitterRgb(TINT_SCRUB_B_BASE, 902, 42);
  _tintScrubDry = _jitterRgb(TINT_SCRUB_DRY_BASE, 903, 35);
}

/** New procedural layout (biomes, floor islands, grass tint) for each deploy. */
export function rollWorldSeed() {
  setWorldSeed((Math.random() * 0xffffffff) >>> 0);
  return _worldSeed;
}

export const FLOOR_KINDS = ['grass', 'dirt', 'rock'];

const FOLIAGE = {
  grass: { sprite: 'foliage_grass', blocks: false, tinted: true, ysort: false },
  grass2: { sprite: 'foliage_grass2', blocks: false, tinted: true, ysort: false },
  grass3: { sprite: 'foliage_grass3', blocks: false, tinted: true, ysort: false },
  grass4: { sprite: 'foliage_grass4', blocks: false, tinted: true, ysort: false },
  grass_tall: { sprite: 'foliage_grass_tall', blocks: false, tinted: true, ysort: true, sortZBias: TILE * 0.01 -0.05},
  grass_tall2: { sprite: 'foliage_grass_tall2', blocks: false, tinted: true, ysort: true, sortZBias: TILE * 0.01 -0.05},
  pebble: { sprite: 'foliage_pebble', blocks: false, tinted: false, ysort: false },
  pebble2: { sprite: 'foliage_pebble2', blocks: false, tinted: false, ysort: false },
  rock: { sprite: 'foliage_rock', blocks: true, radius: 0.45, tinted: false, ysort: false },
  bush: { sprite: 'foliage_bush', blocks: false, tinted: true, ysort: true, sortZBias: TILE * 0.01  -0.05},
  bush2: { sprite: 'foliage_bush2', blocks: false, tinted: true, ysort: true, sortZBias: TILE * 0.01  -0.05},
  tree: { sprite: 'foliage_tree', blocks: true, radius: 1.35, tinted: false, ysort: true, drawSize: 4, sortZBias: TILE * 0.01  -0.05},
  tree2: { sprite: 'foliage_tree2', blocks: true, radius: 1.35, tinted: false, ysort: true, drawSize: 4, sortZBias: TILE * 0.01 -0.05 },
  tree3: { sprite: 'foliage_tree3', blocks: true, radius: 1.35, tinted: false, ysort: true, drawSize: 4, sortZBias: TILE * 0.01 -0.05 },
  stump: { sprite: 'foliage_stump', blocks: true, radius: 0.4, tinted: false, ysort: false },
};

const TINT_SCRUB_A_BASE = { r: 198, g: 205, b: 118 };
const TINT_SCRUB_B_BASE = { r: 158, g: 172, b: 92 };
const TINT_SCRUB_DRY_BASE = { r: 210, g: 198, b: 108 };

let _tintScrubA = { ...TINT_SCRUB_A_BASE };
let _tintScrubB = { ...TINT_SCRUB_B_BASE };
let _tintScrubDry = { ...TINT_SCRUB_DRY_BASE };

/** Snap a world axis to the foliage / render pixel grid. */
export function snapWorldAxis(v) {
  return snapAxis(v);
}

export function snapWorldPoint(x, z) {
  return snapPoint(x, z);
}

function snapFoliageAxis(v) {
  return snapAxis(v);
}

export function hash32(x, z) {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(z | 0, 668265263) ^
    Math.imul(_worldSeed | 0, 982451653);

  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;

  return h >>> 0;
}

export function hash01(x, z) {
  return hash32(x, z) / 4294967295;
}

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(a, b, t) {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = smoothstep(fx);
  const sz = smoothstep(fz);
  const a = hash01(ix, iz);
  const b = hash01(ix + 1, iz);
  const c = hash01(ix, iz + 1);
  const d = hash01(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export function fbm(x, z, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(x * freq, z * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return v / max;
}

export function sampleTerrain(wx, wz) {
  return {
    elevation: fbm(wx * 0.01 + 40, wz * 0.01 + 40, 4),
    moisture: fbm(wx * 0.012 + 180, wz * 0.012 - 60, 3),
    rugged: fbm(wx * 0.022 - 90, wz * 0.022 + 30, 3),
    rockIsland: fbm(wx * 0.0055 + 220, wz * 0.0055 - 40, 4),
    dirtIsland: fbm(wx * 0.0065 + 510, wz * 0.0065 - 280, 4),
  };
}

function maxIslandAtTile(tx, tz, key) {
  let v = sampleTerrain(tx * TILE + TILE * 0.5, tz * TILE + TILE * 0.5)[key];
  v = Math.max(v, sampleTerrain(tx * TILE, tz * TILE)[key]);
  v = Math.max(v, sampleTerrain((tx + 1) * TILE, tz * TILE)[key]);
  v = Math.max(v, sampleTerrain(tx * TILE, (tz + 1) * TILE)[key]);
  v = Math.max(v, sampleTerrain((tx + 1) * TILE, (tz + 1) * TILE)[key]);
  return v;
}

export function isInBase(wx, wz) {
  return wx * wx + wz * wz < BASE_RADIUS * BASE_RADIUS;
}

export function getBiome(wx, wz) {
  if (isInBase(wx, wz)) return 'base';
  return 'scrub';
}

export function getFloorKind(wx, wz, tx = null, tz = null) {
  if (isInBase(wx, wz)) return 'dirt';
  return 'grass';
}

export function getFloorSpriteName(kind) {
  return `floor_${kind}`;
}

export function getGrassTint(wx, wz) {
  const broad = fbm(wx * 0.018 + 120, wz * 0.018 - 80, 3);
  const fine = fbm(wx * 0.065 + 340, wz * 0.065 + 210, 2);
  const mix = broad * 0.62 + fine * 0.38;

  let tint = lerpRgb(_tintScrubA, _tintScrubB, mix);
  const dryFade = smoothstep((0.72 - mix) / 0.35);
  if (dryFade > 0) tint = lerpRgb(tint, _tintScrubDry, dryFade * 0.55);

  const tileHash = hash01(Math.floor(wx / TILE), Math.floor(wz / TILE));
  const micro = (tileHash - 0.5) * 0.08;
  tint = lerpRgb(tint, _tintScrubDry, Math.max(0, micro));
  tint = lerpRgb(tint, _tintScrubB, Math.max(0, -micro));

  const bright = 0.965 + fbm(wx * 0.024 + 300, wz * 0.024 - 120, 2) * 0.035;
  return {
    r: Math.min(255, Math.round(tint.r * bright)),
    g: Math.min(255, Math.round(tint.g * bright)),
    b: Math.min(255, Math.round(tint.b * bright)),
  };
}

function tileCenterTint(tx, tz, memo) {
  const key = `${tx},${tz}`;
  if (memo.has(key)) return memo.get(key);
  const cz = tz * TILE + TILE * 0.5;
  const cx = tx * TILE + TILE * 0.5;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const t = getGrassTint(cx + dx * TILE, cz + dz * TILE);
      const dist = Math.max(Math.abs(dx), Math.abs(dz));
      const wt = dist === 0 ? 4 : dist === 1 ? 2 : 1;
      r += t.r * wt;
      g += t.g * wt;
      b += t.b * wt;
      w += wt;
    }
  }
  const out = { r: Math.round(r / w), g: Math.round(g / w), b: Math.round(b / w) };
  memo.set(key, out);
  return out;
}

export function getGrassTintGradient(wx, wz, tx, tz, memo = null) {
  const a = getGrassTint(tx * TILE + TILE * 0.25, tz * TILE + TILE * 0.25);
  const b = getGrassTint(tx * TILE + TILE * 0.75, tz * TILE + TILE * 0.75);
  const c = memo
    ? tileCenterTint(tx, tz, memo)
    : getGrassTint(tx * TILE + TILE * 0.5, tz * TILE + TILE * 0.5);
  return { a, c, b };
}

export function packTint(tint) {
  return ((tint.r >> 4) << 8) | ((tint.g >> 4) << 4) | (tint.b >> 4);
}

export function unpackTint(key) {
  if (!key) return null;
  return {
    r: ((key >> 8) & 15) * 17,
    g: ((key >> 4) & 15) * 17,
    b: (key & 15) * 17,
  };
}

export function packTintGradient(grad) {
  if (!grad) return 0;
  const t = grad.c || grad.a || grad.b || grad;
  return packTint(t);
}

export function unpackTintGradient(key) {
  if (!key) return null;
  if (key > 0xfff) {
    const a = unpackTint(key >> 12);
    const b = unpackTint(key & 0xfff);
    const c = lerpRgb(a, b, 0.5);
    return { a, c, b };
  }
  const t = unpackTint(key);
  return { a: t, c: t, b: t };
}

export function getTerrainMapColorFromTile(tile, wx, wz) {
  if (tile.floorKind === 'rock') return '#5a5a58';
  if (tile.floorKind === 'dirt') return isInBase(wx, wz) ? '#5a6068' : '#6a5840';
  if (!tile.tintKey) return '#5a8a50';
  const { c, a, b } = unpackTintGradient(tile.tintKey);
  const tint = c || lerpRgb(a, b, 0.5);
  const base = { r: 184, g: 184, b: 176 };
  return `rgb(${Math.min(255, Math.round(base.r * tint.r / 200))}, ${Math.min(255, Math.round(base.g * tint.g / 200))}, ${Math.min(255, Math.round(base.b * tint.b / 200))})`;
}

export function getTerrainMapColor(wx, wz, tx, tz) {
  const kind = getFloorKind(wx, wz);
  if (kind === 'rock') return '#5a5a58';
  if (kind === 'dirt') return isInBase(wx, wz) ? '#5a6068' : '#6a5840';
  const tint = getGrassTint(wx, wz);
  const base = { r: 184, g: 184, b: 176 };
  return `rgb(${Math.min(255, Math.round(base.r * tint.r / 200))}, ${Math.min(255, Math.round(base.g * tint.g / 200))}, ${Math.min(255, Math.round(base.b * tint.b / 200))})`;
}

export function isTintedFoliage(kind) {
  const def = FOLIAGE[kind];
  return def?.tinted === true;
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

function tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, fKey, jitterSalt = 0, tintMemo = null, spacing = FOLIAGE_SPACING_TILES) {
  if (isFoliageReserved(reserved, tx, tz)) return false;
  pushFoliage(foliage, obstacles, tx, tz, wx, wz, fKey, jitterSalt, tintMemo);
  reserveFoliageArea(reserved, tx, tz, spacing);
  return true;
}

function pushFoliage(foliage, obstacles, tx, tz, wx, wz, fKey, jitterSalt = 0, tintMemo = null) {
  const def = FOLIAGE[fKey];
  if (!def) {
    console.warn('Missing foliage key:', fKey, { tx, tz, wx, wz });
    return;
  }

  const maxJ = TILE * 0.45;
  const rawJx = (hash01(tx * 3 + 2 + jitterSalt, tz * 5 + jitterSalt) - 0.5) * maxJ * 2;
  const rawJz = (hash01(tx * 7 + 1 + jitterSalt, tz * 11 + jitterSalt) - 0.5) * maxJ * 2;
  const fx = snapFoliageAxis(wx + rawJx);
  const fz = snapFoliageAxis(wz + rawJz);
  const entry = {
    x: fx,
    z: fz,
    sortZ: fz + (def.sortZBias ?? 0),
    sprite: def.sprite,
    kind: fKey,
    blocks: def.blocks,
    drawSize: def.drawSize ?? 1,
    tintKey: def.tinted ? packTintGradient(getGrassTintGradient(wx, wz, tx, tz, tintMemo)) : 0,
  };
  foliage.push(entry);
  if (def.blocks) {
    obstacles.push({
      kind: 'circle',
      x: fx,
      z: fz,
      radius: def.radius ?? 0,
    });
  }
}

function pickFromVariants(tx, tz, salt, variants) {
  const s = salt | 0;
  return variants[hash32(tx + s * 1009, tz + s * 9176) % variants.length];
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

function pickPebbleVariant(tx, tz, salt = 0) {
  return pickFromVariants(tx, tz, salt, ['pebble', 'pebble2']);
}

function inFoliagePatch(tx, tz, freq, offsetX, offsetZ, threshold) {
  const v = fbm(tx * freq + offsetX, tz * freq + offsetZ, 2);
  if (v <= threshold) return 0;
  return smoothstep((v - threshold) / Math.max(0.001, 1 - threshold));
}

function pickFoliageForTile(tx, tz, floorKind, foliage, obstacles, reserved, wx, wz, tintMemo = null) {
  if (isFoliageReserved(reserved, tx, tz)) return;

  const scatter = hash01(tx * 113 + 5, tz * 97 + 11);
  const accent = hash01(tx * 127 + 19, tz * 91 + 31);

  if (floorKind === 'grass') {
    const tallDensity = inFoliagePatch(tx, tz, 0.11, 44, -22, 0.22);
    if (tallDensity > 0) {
      const tallChance = 0.02 + tallDensity * 0.1;
      if (hash01(tx * 59 + 41, tz * 83 + 47) < tallChance) {
        if (tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickTallGrassVariant(tx, tz, 41), 41, tintMemo)) return;
      }
    }

    if (!isInBase(wx, wz)) {
      const bushDensity = inFoliagePatch(tx, tz, 0.09, 120, 80, 0.4);
      if (bushDensity > 0) {
        const bushChance = 0.02 + bushDensity * 0.1;
        if (hash01(tx * 191 + 11, tz * 197 + 13) < bushChance) {
          if (tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickBushVariant(tx, tz, 67), 67, tintMemo)) return;
        }
      }
    }

    const shortChance = 0.6;
    if (scatter < shortChance) {
      if (tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickGrassVariant(tx, tz, 23), 23, tintMemo)) return;
    }

    const pebbleChance = 0.02 + accent * 0.04;
    if (hash01(tx * 201 + 3, tz * 193 + 7) < pebbleChance) {
      tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickPebbleVariant(tx, tz, 53), 53, tintMemo);
    }
    return;
  }

  if (floorKind === 'dirt') {
    if (hash01(tx * 201 + 5, tz * 193 + 9) < 0.05 + accent * 0.05) {
      tryPushFoliage(foliage, obstacles, reserved, tx, tz, wx, wz, pickPebbleVariant(tx, tz, 61), 61, tintMemo);
    }
  }
}

export function generateChunk(cx, cz) {
  const tiles = new Array(CHUNK_TILES * CHUNK_TILES);
  const foliage = [];
  const obstacles = [];
  const reserved = new Set();
  const tintMemo = new Map();

  for (let lz = 0; lz < CHUNK_TILES; lz++) {
    for (let lx = 0; lx < CHUNK_TILES; lx++) {
      const tx = cx * CHUNK_TILES + lx;
      const tz = cz * CHUNK_TILES + lz;
      const wx = tx * TILE + TILE * 0.5;
      const wz = tz * TILE + TILE * 0.5;
      const floorKind = getFloorKind(wx, wz, tx, tz);
      const tintKey = floorKind === 'grass'
        ? packTintGradient(getGrassTintGradient(wx, wz, tx, tz, tintMemo))
        : 0;
      tiles[lz * CHUNK_TILES + lx] = { tx, tz, floorKind, tintKey };

      pickFoliageForTile(tx, tz, floorKind, foliage, obstacles, reserved, wx, wz, tintMemo);
    }
  }

  return { cx, cz, tiles, foliage, obstacles };
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