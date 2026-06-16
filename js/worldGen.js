/** Procedural world — noise terrain, tinted grass floors, grass foliage. */

export const TILE = 4;
export const CHUNK_TILES = 8;
export const CHUNK_WORLD = TILE * CHUNK_TILES;
export const BASE_RADIUS = 22;
export const WORLD_SEED = 90210;

export const FLOOR_KINDS = ['grass', 'dirt', 'rock'];

const FOLIAGE = {
  grass: { sprite: 'foliage_grass', blocks: false, tinted: true, canopy: false },
  grass_tall: { sprite: 'foliage_grass_tall', blocks: false, tinted: true, canopy: true },
  rock: { sprite: 'foliage_rock', blocks: true, radius: 0.45, tinted: false, canopy: false },
  tree: { sprite: 'foliage_tree', blocks: true, radius: 0.85, tinted: false, canopy: false },
  stump: { sprite: 'foliage_stump', blocks: true, radius: 0.4, tinted: false, canopy: false },
};

const TINT_DRY = { r: 210, g: 195, b: 120 };
const TINT_MEADOW = { r: 130, g: 248, b: 132 };
const TINT_FOREST = { r: 105, g: 205, b: 108 };

/** One native sprite pixel in world units (16px art on a TILE-wide cell). */
const FOLIAGE_PIXEL_W = TILE / 16;

function snapFoliageAxis(v) {
  return Math.round(v / FOLIAGE_PIXEL_W) * FOLIAGE_PIXEL_W;
}

function hash32(x, z) {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263 + WORLD_SEED * 982451653;
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

  const meadowMix = smoothstep((moisture - 0.2) / 0.3);
  const forestMix = smoothstep((moisture - 0.5) / 0.28)
    * (1 - smoothstep((elevation - 0.44) / 0.26));
  const dryMix = 1 - meadowMix;

  let tint = lerpRgb(TINT_DRY, TINT_MEADOW, meadowMix);
  tint = lerpRgb(tint, TINT_FOREST, forestMix * 0.8);

  const dryPush = dryMix * smoothstep((0.3 - moisture) / 0.16);
  if (dryPush > 0) tint = lerpRgb(tint, TINT_DRY, dryPush * 0.4);

  const bright = 0.94 + fbm(wx * 0.035 + 300, wz * 0.035 - 120, 2) * 0.1;
  return {
    r: Math.min(255, Math.round(tint.r * bright)),
    g: Math.min(255, Math.round(tint.g * bright)),
    b: Math.min(255, Math.round(tint.b * bright)),
  };
}

/** West → east colors for a soft horizontal gradient masked by sprite alpha. */
export function getGrassTintGradient(wx, wz, tx, tz) {
  const cz = tz * TILE + TILE * 0.5;
  return {
    a: getGrassTint(tx * TILE, cz),
    b: getGrassTint((tx + 1) * TILE, cz),
  };
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
  const a = grad.a || grad;
  const b = grad.b || grad;
  return (packTint(a) << 12) | packTint(b);
}

export function unpackTintGradient(key) {
  if (!key) return null;
  return {
    a: unpackTint(key >> 12),
    b: unpackTint(key & 0xfff),
  };
}

/** Display color for minimap. */
export function getTerrainMapColorFromTile(tile, wx, wz) {
  if (tile.floorKind === 'rock') return '#5a5a58';
  if (tile.floorKind === 'dirt') return isInBase(wx, wz) ? '#5a6068' : '#6a5840';
  if (!tile.tintKey) return '#5a8a50';
  const { a, b } = unpackTintGradient(tile.tintKey);
  const tint = lerpRgb(a, b, 0.5);
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

export function isCanopyFoliage(kind) {
  const def = FOLIAGE[kind];
  return def?.canopy === true;
}

function pushFoliage(foliage, obstacles, tx, tz, wx, wz, fKey, jitterSalt = 0) {
  const def = FOLIAGE[fKey];
  const maxJ = TILE * 0.45;
  const rawJx = (hash01(tx * 3 + 2 + jitterSalt, tz * 5 + jitterSalt) - 0.5) * maxJ * 2;
  const rawJz = (hash01(tx * 7 + 1 + jitterSalt, tz * 11 + jitterSalt) - 0.5) * maxJ * 2;
  const fx = snapFoliageAxis(wx + rawJx);
  const fz = snapFoliageAxis(wz + rawJz);
  const entry = {
    x: fx,
    z: fz,
    sortZ: fz + (fKey === 'grass_tall' ? 0.02 : 0),
    sprite: def.sprite,
    kind: fKey,
    blocks: def.blocks,
    tintKey: def.tinted ? packTintGradient(getGrassTintGradient(wx, wz, tx, tz)) : 0,
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

function pickFoliageForTile(tx, tz, floorKind, foliage, obstacles, wx, wz) {
  const scatter = hash01(tx * 113 + 5, tz * 97 + 11);
  const patch = hash01(tx * 59 + 71, tz * 83 + 47);
  const accent = hash01(tx * 127 + 19, tz * 91 + 31);

  if (floorKind === 'grass') {
    const { moisture } = sampleTerrain(wx, wz);
    const shortChance = 0.1 + moisture * 0.14;
    const tallChance = 0.04 + moisture * 0.09;

    if (scatter < shortChance) {
      pushFoliage(foliage, obstacles, tx, tz, wx, wz, 'grass');
    }
    if (patch < tallChance) {
      pushFoliage(foliage, obstacles, tx, tz, wx, wz, 'grass_tall', 41);
    }
    return;
  }

  if (floorKind === 'rock') {
    const rockChance = 0.16 + accent * 0.2;
    if (scatter < rockChance) {
      pushFoliage(foliage, obstacles, tx, tz, wx, wz, 'rock');
    }
  }
}

export function generateChunk(cx, cz) {
  const tiles = new Array(CHUNK_TILES * CHUNK_TILES);
  const foliage = [];
  const obstacles = [];

  for (let lz = 0; lz < CHUNK_TILES; lz++) {
    for (let lx = 0; lx < CHUNK_TILES; lx++) {
      const tx = cx * CHUNK_TILES + lx;
      const tz = cz * CHUNK_TILES + lz;
      const wx = tx * TILE + TILE * 0.5;
      const wz = tz * TILE + TILE * 0.5;
      const floorKind = getFloorKind(wx, wz, tx, tz);
      const tintKey = floorKind === 'grass'
        ? packTintGradient(getGrassTintGradient(wx, wz, tx, tz))
        : 0;
      tiles[lz * CHUNK_TILES + lx] = { tx, tz, floorKind, tintKey };

      pickFoliageForTile(tx, tz, floorKind, foliage, obstacles, wx, wz);
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
