/**
 * Procedural road network — main highway through origin, branches, finite world bounds.
 */

import { hash01, getWorldSeed, TILE, CHUNK_TILES } from './worldGen.js';

export const HIGHWAY_WIDTH_TILES = 3;
export const PATH_WIDTH_TILES = 1;
export const MAIN_HIGHWAY_TARGET_TILES = 1000;
export const MAIN_HIGHWAY_HALF_TILES = Math.floor(MAIN_HIGHWAY_TARGET_TILES / 2);
export const TOWN_SPACING_TILES = 46;
export const BRANCH_HIGHWAY_MIN_TILES = 140;
export const BRANCH_HIGHWAY_MAX_TILES = 220;
export const BRANCH_CITY_COUNT = 10;
export const BRANCH_TOWN_SPACING_TILES = 70;
export const MAX_MAIN_TOWNS = 22;
export const WORLD_MARGIN_TILES = 100;

export const HIGHWAY_SPAWN_TX = 0;
export const HIGHWAY_SPAWN_TZ = 0;

const ROAD_KIND = 'road';
const PATH_KIND = 'path';

/** @typedef {{ id:string, tx:number, tz:number, kind:'main'|'branch', parentId?:string }} TownSite */
/** @typedef {{ points:{x:number,z:number}[], road:'main'|'branch' }} RoadPath */

let _cacheSeed = null;
/** @type {{ roadPaths:RoadPath[], roadTileSet:Set<string>, towns:TownSite[], mainPoints:{x:number,z:number}[], bounds:{minTx:number,maxTx:number,minTz:number,maxTz:number} }|null} */
let _cache = null;

/**
 * Paint a 3-tile-wide road along Manhattan steps between waypoints.
 * Corners use an L-joint (both arms) so width stays 3, never a 3×3 blob.
 */
function buildCenterline(points) {
  if (!points.length) return [];
  const line = [{ x: points[0].x, z: points[0].z }];
  for (let i = 1; i < points.length; i++) {
    let x = points[i - 1].x;
    let z = points[i - 1].z;
    const tx = points[i].x;
    const tz = points[i].z;
    while (x !== tx) {
      x += tx > x ? 1 : -1;
      line.push({ x, z });
    }
    while (z !== tz) {
      z += tz > z ? 1 : -1;
      line.push({ x, z });
    }
  }
  return line;
}

function stepAxis(a, b) {
  if (a.x === b.x) return 'v';
  if (a.z === b.z) return 'h';
  return null;
}

function paintRoadFromPoints(points, tiles, width = HIGHWAY_WIDTH_TILES) {
  const centerline = buildCenterline(points);
  if (centerline.length === 0) return;

  const paintH = (cx, cz) => {
    for (let w = 0; w < width; w++) tiles.add(`${cx},${cz + w}`);
  };
  const paintV = (cx, cz) => {
    for (let w = 0; w < width; w++) tiles.add(`${cx + w},${cz}`);
  };

  for (let i = 0; i < centerline.length; i++) {
    const cur = centerline[i];
    const inAxis = i > 0 ? stepAxis(centerline[i - 1], cur) : null;
    const outAxis = i < centerline.length - 1 ? stepAxis(cur, centerline[i + 1]) : null;
    const axes = new Set([inAxis, outAxis].filter(Boolean));

    if (axes.has('h') || axes.size === 0) paintH(cur.x, cur.z);
    if (axes.has('v')) paintV(cur.x, cur.z);
  }
}

/**
 * Long straight runs with gentle band shifts — smooth highway curves, not stair-steps.
 */
function buildCurvyPath(seed, startX, startZ, preferDx, targetLen, seedOff = 0) {
  const points = [{ x: startX, z: startZ }];
  let x = startX;
  let z = startZ;
  let traveled = 0;
  let segI = 0;
  let drift = 0;
  let pendingZ = 0;

  while (traveled < targetLen) {
    const remaining = targetLen - traveled;
    const run = Math.min(remaining, 16 + Math.floor(hash01(seed, segI * 3 + 1 + seedOff) * 24));
    const nearSpawn = Math.abs(x) <= 20 && Math.abs(z) <= 20;

    drift = drift * 0.78 + (hash01(seed, segI * 7 + seedOff) - 0.5) * 0.45;
    drift = Math.max(-1.4, Math.min(1.4, drift));
    if (!nearSpawn) pendingZ += drift;

    const sx = preferDx >= 0 ? 1 : -1;
    x += sx * run;
    traveled += run;

    if (!nearSpawn && Math.abs(pendingZ) >= 1) {
      const shift = pendingZ > 0 ? 1 : -1;
      z += shift;
      pendingZ -= shift;
    }

    points.push({ x, z });
    segI++;
  }
  return points;
}

function buildMainWaypoints(seed) {
  const half = MAIN_HIGHWAY_HALF_TILES;
  const east = buildCurvyPath(seed, 0, 0, 1, half, 0);
  const west = buildCurvyPath(seed, 0, 0, -1, half, 900);
  west.reverse();
  return [...west.slice(0, -1), ...east];
}

function buildBranchWaypoints(seed, fromX, fromZ, branchIndex) {
  const len = BRANCH_HIGHWAY_MIN_TILES
    + Math.floor(hash01(seed, 900 + branchIndex * 17) * (BRANCH_HIGHWAY_MAX_TILES - BRANCH_HIGHWAY_MIN_TILES));
  const preferDx = hash01(seed, 950 + branchIndex) > 0.5 ? 1 : -1;
  const preferDz = hash01(seed, 960 + branchIndex) > 0.5 ? 1 : -1;
  const points = [{ x: fromX, z: fromZ }];
  let x = fromX;
  let z = fromZ;
  let traveled = 0;
  let segI = 0;
  let drift = 0;

  while (traveled < len) {
    const step = Math.min(len - traveled, 14 + Math.floor(hash01(seed, 1000 + segI + branchIndex) * 20));
    drift = drift * 0.75 + (hash01(seed, 1100 + segI + branchIndex) - 0.5) * 0.5;
    drift = Math.max(-1.5, Math.min(1.5, drift));

    if (hash01(seed, 1200 + segI + branchIndex) < 0.55) {
      x += preferDx * step;
      if (Math.abs(drift) >= 0.85) z += preferDz * (drift > 0 ? 1 : -1);
    } else {
      z += preferDz * step;
      if (Math.abs(drift) >= 0.85) x += preferDx * (drift > 0 ? 1 : -1);
    }
    points.push({ x, z });
    traveled += step;
    segI++;
  }
  return points;
}

const MIN_TOWN_ANCHOR_DIST_TILES = 52;

function anchorTooClose(tx, tz, towns) {
  for (const t of towns) {
    const dist = Math.abs(t.tx - tx) + Math.abs(t.tz - tz);
    if (dist < MIN_TOWN_ANCHOR_DIST_TILES) return true;
  }
  return false;
}

function placeTownsOnMainPath(mainPoints) {
  /** @type {TownSite[]} */
  const towns = [{ id: 'm0', tx: HIGHWAY_SPAWN_TX, tz: HIGHWAY_SPAWN_TZ, kind: 'main' }];
  let traveled = 0;
  let nextTownAt = TOWN_SPACING_TILES;
  let townIdx = 1;

  for (let i = 1; i < mainPoints.length; i++) {
    const a = mainPoints[i - 1];
    const b = mainPoints[i];
    const segLen = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);

    while (traveled + segLen >= nextTownAt && townIdx < MAX_MAIN_TOWNS) {
      const local = nextTownAt - traveled;
      const t = local / Math.max(1, segLen);
      const tx = Math.round(a.x + (b.x - a.x) * t);
      const tz = Math.round(a.z + (b.z - a.z) * t);
      if (!anchorTooClose(tx, tz, towns)) {
        towns.push({ id: `m${townIdx}`, tx, tz, kind: 'main' });
        townIdx++;
      }
      nextTownAt += TOWN_SPACING_TILES;
    }
    traveled += segLen;
  }
  return towns;
}

function placeTownsOnBranchPath(branchPoints, towns, branchIndex) {
  let traveled = 0;
  let nextTownAt = BRANCH_TOWN_SPACING_TILES;
  let branchTownIdx = 0;

  for (let i = 1; i < branchPoints.length; i++) {
    const a = branchPoints[i - 1];
    const b = branchPoints[i];
    const segLen = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);

    while (traveled + segLen >= nextTownAt && branchTownIdx < 2) {
      const local = nextTownAt - traveled;
      const t = local / Math.max(1, segLen);
      const tx = Math.round(a.x + (b.x - a.x) * t);
      const tz = Math.round(a.z + (b.z - a.z) * t);
      if (!anchorTooClose(tx, tz, towns)) {
        towns.push({
          id: `b${branchIndex}_${branchTownIdx}`,
          tx,
          tz,
          kind: 'branch',
          parentId: `m${branchIndex}`,
        });
        branchTownIdx++;
      }
      nextTownAt += BRANCH_TOWN_SPACING_TILES;
    }
    traveled += segLen;
  }
}

function computeBounds(roadTileSet, towns) {
  let minTx = Infinity;
  let maxTx = -Infinity;
  let minTz = Infinity;
  let maxTz = -Infinity;

  const grow = (tx, tz) => {
    minTx = Math.min(minTx, tx);
    maxTx = Math.max(maxTx, tx);
    minTz = Math.min(minTz, tz);
    maxTz = Math.max(maxTz, tz);
  };

  for (const key of roadTileSet) {
    const [tx, tz] = key.split(',').map(Number);
    grow(tx, tz);
  }

  const townPad = 28;
  for (const t of towns) {
    grow(t.tx - 22, t.tz - townPad);
    grow(t.tx + 22, t.tz + townPad + HIGHWAY_WIDTH_TILES);
  }

  if (!Number.isFinite(minTx)) {
    minTx = -WORLD_MARGIN_TILES;
    maxTx = WORLD_MARGIN_TILES;
    minTz = -WORLD_MARGIN_TILES;
    maxTz = WORLD_MARGIN_TILES;
  }

  return {
    minTx: minTx - WORLD_MARGIN_TILES,
    maxTx: maxTx + WORLD_MARGIN_TILES,
    minTz: minTz - WORLD_MARGIN_TILES,
    maxTz: maxTz + WORLD_MARGIN_TILES,
  };
}

function buildRoadNetwork(seed) {
  const mainPoints = buildMainWaypoints(seed);
  /** @type {RoadPath[]} */
  const roadPaths = [{ points: mainPoints, road: 'main' }];

  const towns = placeTownsOnMainPath(mainPoints);
  const mainTowns = towns.filter((t) => t.kind === 'main');
  const branchStarts = [];
  for (let i = 0; i < BRANCH_CITY_COUNT && mainTowns.length > 0; i++) {
    const pick = mainTowns[1 + (i * 2) % Math.max(1, mainTowns.length - 1)];
    if (pick) branchStarts.push(pick);
  }

  for (let i = 0; i < branchStarts.length; i++) {
    const start = branchStarts[i];
    const branchPoints = buildBranchWaypoints(seed, start.tx, start.tz, i);
    roadPaths.push({ points: branchPoints, road: 'branch' });
    placeTownsOnBranchPath(branchPoints, towns, i);
  }

  const roadTileSet = new Set();
  for (const path of roadPaths) {
    paintRoadFromPoints(path.points, roadTileSet, HIGHWAY_WIDTH_TILES);
  }

  const bounds = computeBounds(roadTileSet, towns);
  return { roadPaths, roadTileSet, towns, mainPoints, bounds };
}

export function getRoadNetwork() {
  const seed = getWorldSeed();
  if (_cacheSeed === seed && _cache) return _cache;
  _cacheSeed = seed;
  _cache = buildRoadNetwork(seed);
  return _cache;
}

export function getWorldBoundsTiles() {
  return { ...getRoadNetwork().bounds };
}

export function getWorldBoundsWorld() {
  const b = getWorldBoundsTiles();
  return {
    minX: b.minTx * TILE,
    maxX: (b.maxTx + 1) * TILE,
    minZ: b.minTz * TILE,
    maxZ: (b.maxTz + 1) * TILE,
  };
}

export function isInWorldBoundsTile(tx, tz) {
  const b = getWorldBoundsTiles();
  return tx >= b.minTx && tx <= b.maxTx && tz >= b.minTz && tz <= b.maxTz;
}

export function chunkOverlapsWorldBounds(cx, cz) {
  const minTx = cx * CHUNK_TILES;
  const maxTx = minTx + CHUNK_TILES - 1;
  const minTz = cz * CHUNK_TILES;
  const maxTz = minTz + CHUNK_TILES - 1;
  const b = getWorldBoundsTiles();
  return maxTx >= b.minTx && minTx <= b.maxTx && maxTz >= b.minTz && minTz <= b.maxTz;
}

export function clampWorldPosition(x, z) {
  const b = getWorldBoundsWorld();
  const pad = TILE * 0.5;
  return {
    x: Math.max(b.minX + pad, Math.min(b.maxX - pad, x)),
    z: Math.max(b.minZ + pad, Math.min(b.maxZ - pad, z)),
  };
}

export function getHighwayPlayerSpawn() {
  const tx = HIGHWAY_SPAWN_TX;
  const tz = HIGHWAY_SPAWN_TZ + 1;
  return clampWorldPosition(
    tx * TILE + TILE * 0.5,
    tz * TILE + TILE * 0.5,
  );
}

export function isHighwayTile(tx, tz) {
  return getRoadNetwork().roadTileSet.has(`${tx},${tz}`);
}

export function collectHighwayTilesInChunk(cx, cz) {
  if (!chunkOverlapsWorldBounds(cx, cz)) return [];
  const { roadTileSet } = getRoadNetwork();
  const minTx = cx * CHUNK_TILES;
  const maxTx = minTx + CHUNK_TILES - 1;
  const minTz = cz * CHUNK_TILES;
  const maxTz = minTz + CHUNK_TILES - 1;
  const out = [];

  for (const key of roadTileSet) {
    const [tx, tz] = key.split(',').map(Number);
    if (tx < minTx || tx > maxTx || tz < minTz || tz > maxTz) continue;
    out.push({ tx, tz, kind: ROAD_KIND });
  }
  return out;
}

export function getTownSiteById(id) {
  return getRoadNetwork().towns.find((t) => t.id === id) ?? null;
}

export function getTownsInChunk(cx, cz) {
  const minTx = cx * CHUNK_TILES - 40;
  const maxTx = minTx + CHUNK_TILES + 80;
  const minTz = cz * CHUNK_TILES - 40;
  const maxTz = minTz + CHUNK_TILES + 80;
  return getRoadNetwork().towns.filter(
    (t) => t.tx >= minTx && t.tx <= maxTx && t.tz >= minTz && t.tz <= maxTz,
  );
}

export function collectTownStreetTiles(anchor, layout) {
  const out = [];
  for (const st of layout.streetTiles) {
    out.push({ tx: st.tx, tz: st.tz, kind: PATH_KIND });
  }
  for (const lot of layout.lots) {
    if (!lot.pathTiles) continue;
    for (const p of lot.pathTiles) {
      out.push({ tx: p.tx, tz: p.tz, kind: PATH_KIND });
    }
  }
  return out;
}

export { ROAD_KIND as HIGHWAY_KIND, PATH_KIND };
