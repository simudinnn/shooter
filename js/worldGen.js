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
  _tintDry = _jitterRgb(TINT_DRY_BASE, 901, 55);
  _tintMeadow = _jitterRgb(TINT_MEADOW_BASE, 902, 48);
  _tintForest = _jitterRgb(TINT_FOREST_BASE, 903, 40);
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

const TINT_DRY_BASE = { r: 210, g: 195, b: 120 };
const TINT_MEADOW_BASE = { r: 130, g: 248, b: 132 };
const TINT_FOREST_BASE = { r: 105, g: 205, b: 108 };

let _tintDry = { ...TINT_DRY_BASE };
let _tintMeadow = { ...TINT_MEADOW_BASE };
let _tintForest = { ...TINT_FOREST_BASE };

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

function hash32(x, z) {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263 + _worldSeed * 982451653;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
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
    /** Large rock islands (~40+ tiles across). */
    rockIsland: fbm(wx * 0.0055 + 220, wz * 0.0055 - 40, 4),
    /** Large dirt islands (~35+ tiles across). */
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
  const { elevation, moisture, rugged, rockIsland } = sampleTerrain(wx, wz);
  const kind = getFloorKind(wx, wz);

  if (kind === 'rock' || rockIsland > 0.52 || rugged > 0.62) return 'rock';
  if (moisture > 0.5 && elevation < 0.58) return 'forest';
  if (moisture < 0.28) return 'scrub';
  return 'meadow';
}

/** @returns {'grass'|'dirt'|'rock'} */
export function getFloorKind(wx, wz, tx = null, tz = null) {
  if (isInBase(wx, wz)) return 'dirt';

  let rockIsland;
  let dirtIsland;
  if (tx !== null && tz !== null) {
    rockIsland = maxIslandAtTile(tx, tz, 'rockIsland');
    dirtIsland = maxIslandAtTile(tx, tz, 'dirtIsland');
  } else {
    ({ rockIsland, dirtIsland } = sampleTerrain(wx, wz));
  }

  if (rockIsland > 0.44) return 'rock';
  if (dirtIsland > 0.42) return 'dirt';

  return 'grass';
}

export function getFloorSpriteName(kind) {
  return `floor_${kind}`;
}

/** Grass tint from smooth terrain noise (no per-tile hash — avoids streaks). */
export function getGrassTint(wx, wz) {
  const { elevation, moisture } = sampleTerrain(wx, wz);

  const meadowMix = smoothstep((moisture - 0.18) / 0.45);
  const forestMix = smoothstep((moisture - 0.48) / 0.38)
    * (1 - smoothstep((elevation - 0.44) / 0.35));
  const dryMix = 1 - meadowMix;

  let tint = lerpRgb(_tintDry, _tintMeadow, meadowMix);
  tint = lerpRgb(tint, _tintForest, forestMix * 0.8);

  const dryPush = dryMix * smoothstep((0.3 - moisture) / 0.22);
  if (dryPush > 0) tint = lerpRgb(tint, _tintDry, dryPush * 0.4);

  const bright = 0.97 + fbm(wx * 0.02 + 300, wz * 0.02 - 120, 2) * 0.006;
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

/** One smoothed tint per tile — no within-tile gradient (avoids vertical banding). */
export function getGrassTintGradient(wx, wz, tx, tz, memo = null) {
  const c = memo
    ? tileCenterTint(tx, tz, memo)
    : getGrassTint(tx * TILE + TILE * 0.5, tz * TILE + TILE * 0.5);
  return { a: c, c, b: c };
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

/** Display color for minimap. */
export function getTerrainMapColorFromTile(tile, wx, wz) {
  if (tile.floorKind === 'rock') return '#5a5a58';
  if (tile.floorKind === 'dirt') return isInBase(wx, wz) ? '#5a6068' : '#6a5840';
  if (!tile.tintKey) return '#5a8a50';
  const { c, a, b } = unpackTintGradient(tile.tintKey);
  const tint = c || lerpRgb(a, b, 0.5);
  const base = { r: 184, g: 184, b: 176 };
  return `rgb(${Math.min(255, Math.round(base.r * tint.r / 200))}, ${Math.min(255, Math.round(base.g * tint.g / 200))}, ${Math.min(255, Math.round(base.b * tint.b / 200))})`;
}

/** @deprecated use getTerrainMapColorFromTile */
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

/** World AABB for y-sort foliage culling (feet at x,z; sprite extends north and sideways). */
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

/** @deprecated use isYsortFoliage */
export function isCanopyFoliage(kind) {
  return isYsortFoliage(kind);
}

function pushFoliage(foliage, obstacles, tx, tz, wx, wz, fKey, jitterSalt = 0, tintMemo = null) {
  const def = FOLIAGE[fKey];
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
      radius: def.radius ?? 0.5,
    });
  }
}

function pickGrassVariant(tx, tz, salt = 0) {
  const h = hash01(tx * 131 + salt, tz * 149 + salt * 3);
  if (h < 0.25) return 'grass';
  if (h < 0.5) return 'grass2';
  if (h < 0.75) return 'grass3';
  return 'grass4';
}

function pickTallGrassVariant(tx, tz, salt = 0) {
  return hash01(tx * 167 + salt, tz * 173 + salt) < 0.5 ? 'grass_tall' : 'grass_tall2';
}

function pickBushVariant(tx, tz, salt = 0) {
  return hash01(tx * 179 + salt, tz * 181 + salt) < 0.5 ? 'bush' : 'bush2';
}

function pickPebbleVariant(tx, tz, salt = 0) {
  return hash01(tx * 187 + salt, tz * 191 + salt) < 0.5 ? 'pebble' : 'pebble2';
}

/** Patch noise — values above threshold form clustered spawn regions. */
function inFoliagePatch(tx, tz, freq, offsetX, offsetZ, threshold) {
  const v = fbm(tx * freq + offsetX, tz * freq + offsetZ, 2);
  if (v <= threshold) return 0;
  return smoothstep((v - threshold) / Math.max(0.001, 1 - threshold));
}

function pickFoliageForTile(tx, tz, floorKind, foliage, obstacles, wx, wz, tintMemo = null) {
  const scatter = hash01(tx * 113 + 5, tz * 97 + 11);
  const accent = hash01(tx * 127 + 19, tz * 91 + 31);
  const biome = getBiome(wx, wz);

  if (floorKind === 'grass') {
    const { moisture } = sampleTerrain(wx, wz);
    let inTallPatch = false;
    let inBushPatch = false;

    if (biome === 'scrub') {
      const tallDensity = inFoliagePatch(tx, tz, 0.11, 44, -22, 0.22);
      if (tallDensity > 0) {
        inTallPatch = true;
        const tallChance = 0.07 + tallDensity * 0.62;
        if (hash01(tx * 59 + 41, tz * 83 + 47) < tallChance) {
          pushFoliage(foliage, obstacles, tx, tz, wx, wz, pickTallGrassVariant(tx, tz, 41), 41, tintMemo);
        }
      }
    }

    if (!isInBase(wx, wz)) {
      const bushThreshold = biome === 'forest' ? 0.28 : biome === 'meadow' ? 0.34 : 0.4;
      const bushDensity = inFoliagePatch(tx, tz, 0.09, 120, 80, bushThreshold);
      if (bushDensity > 0) {
        inBushPatch = true;
        const bushChance = 0.1 + bushDensity * 0.75 + moisture * 0.08;
        if (hash01(tx * 191 + 11, tz * 197 + 13) < bushChance) {
          pushFoliage(foliage, obstacles, tx, tz, wx, wz, pickBushVariant(tx, tz, 67), 67, tintMemo);
        }
      }
    }

    if (!inTallPatch && !inBushPatch) {
      const shortChance = 0.1 + moisture * 0.014;
      if (scatter < shortChance) {
        pushFoliage(foliage, obstacles, tx, tz, wx, wz, pickGrassVariant(tx, tz, scatter * 100 | 0), 0, tintMemo);
      }
    }

    const pebbleChance = 0.02 + accent * 0.04;
    if (hash01(tx * 201 + 3, tz * 193 + 7) < pebbleChance) {
      pushFoliage(foliage, obstacles, tx, tz, wx, wz, pickPebbleVariant(tx, tz, 53), 53, tintMemo);
    }
    return;
  }

  if (floorKind === 'dirt') {
    if (hash01(tx * 201 + 5, tz * 193 + 9) < 0.05 + accent * 0.05) {
      pushFoliage(foliage, obstacles, tx, tz, wx, wz, pickPebbleVariant(tx, tz, 61), 61, tintMemo);
    }
    return;
  }

  if (floorKind === 'rock') {
    const rockChance = 0.03 + accent * 0.2;
    if (scatter < rockChance) {
      pushFoliage(foliage, obstacles, tx, tz, wx, wz, 'rock', 0, tintMemo);
    }
    if (hash01(tx * 211 + 7, tz * 199 + 11) < 0.05 + accent * 0.06) {
      pushFoliage(foliage, obstacles, tx, tz, wx, wz, pickPebbleVariant(tx, tz, 71), 71, tintMemo);
    }
  }
}

export function generateChunk(cx, cz) {
  const tiles = new Array(CHUNK_TILES * CHUNK_TILES);
  const foliage = [];
  const obstacles = [];
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

      pickFoliageForTile(tx, tz, floorKind, foliage, obstacles, wx, wz, tintMemo);
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
