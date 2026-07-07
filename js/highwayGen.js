/**
 * Town-first road network — scatter towns across the map, connect with main highway.
 */

import { hash01, getWorldSeed, TILE, CHUNK_TILES } from './worldGen.js';
import { paintRoadStrip, fillCollinearRoadGaps, applyBevelCorner } from './roadPaint.js';

export const HIGHWAY_WIDTH_TILES = 3;
export const PATH_WIDTH_TILES = 1;

export const WORLD_SIZE_TILES = 400;
export const WORLD_HALF_TILES = WORLD_SIZE_TILES / 2;
export const WORLD_MARGIN_TILES = 6;

/** Coarse grid cell for procedural town placement (infinite world). */
export const TOWN_REGION_TILES = 80;
export const TOWN_REGION_CHANCE = 0.78;
export const TOWN_SITE_MIN_DIST_TILES = 180;
/** Default stub half-length when a town has no rolled size. */
export const TOWN_HIGHWAY_HALF_TILES = 24;
export const TOWN_HALF_TILES_MIN = 15;
export const TOWN_HALF_TILES_MAX = 30;

export function townHalf(town) {
  return town?.half ?? TOWN_HIGHWAY_HALF_TILES;
}

function rollTownHalf(seed, tx, tz, salt) {
  const span = TOWN_HALF_TILES_MAX - TOWN_HALF_TILES_MIN + 1;
  return TOWN_HALF_TILES_MIN + Math.floor(hash01(seed, tx * 41 + tz * 43 + salt) * span);
}

export const HIGHWAY_SPAWN_TX = 0;
export const HIGHWAY_SPAWN_TZ = 0;

const ROAD_KIND = 'road';
const PATH_KIND = 'path';

/** @typedef {{ id:string, tx:number, tz:number, kind:'main'|'branch', axis:'h'|'v', half:number, parentId?:string }} TownSite */
/** @typedef {{ dx:number, dz:number }} Dir */
/** @typedef {{ points:{x:number,z:number}[], road:'main'|'branch' }} RoadPath */
/** @typedef {{ x:number, z:number, index:number, dir:Dir }} BranchSplit */

let _cacheSeed = null;
/** @type {{ roadPaths:RoadPath[], roadTileSet:Set<string>, towns:TownSite[], mainPoints:{x:number,z:number}[], bounds:{minTx:number,maxTx:number,minTz:number,maxTz:number} }|null} */
let _cache = null;

const DIR = {
  E: { dx: 1, dz: 0 },
  S: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 },
  N: { dx: 0, dz: -1 },
};

const WORLD_MIN = -WORLD_HALF_TILES + WORLD_MARGIN_TILES;
const WORLD_MAX = WORLD_HALF_TILES - 1 - WORLD_MARGIN_TILES;
const MIN_ROAD_GAP_TILES = 24;
const MIN_BRANCH_MAIN_GAP_TILES = 20;
const MIN_BRANCH_SPLIT_INDEX_DIST = 140;
const MIN_BRANCH_ACCEPT_LEN = 150;
const MAX_BRANCH_COUNT = 2;
const BRANCH_MAIN_BUFFER_TILES = 14;
const TOWN_BEND_CLEARANCE_TILES = 28;
/** Match townGen layout — used to keep highways out of town interiors. */
const TOWN_SPUR_LENGTH_TILES = 14;
const TOWN_STREET_PAD = 1;
const TOWN_HW_PAD = 1;
const TOWN_BYPASS_MARGIN = 12;
const TOWN_INTERIOR_PENALTY = 8000;
const FACING_ENDPOINT_BONUS = 120;
const VISIT_CELL = 40;
const EDGE_SKIRT_PENALTY = 55;
const MAX_SAME_TURN_STREAK = 1;
const SPIRAL_CENTROID_LOOKBACK = 160;
const PARALLEL_CORRIDOR_DIST = 24;

function turnLeft(d) {
  if (d.dx === 1) return DIR.N;
  if (d.dz === -1) return DIR.W;
  if (d.dx === -1) return DIR.S;
  return DIR.E;
}

function turnRight(d) {
  if (d.dx === 1) return DIR.S;
  if (d.dz === 1) return DIR.W;
  if (d.dx === -1) return DIR.N;
  return DIR.E;
}

function inWorld(x, z) {
  return x >= WORLD_MIN && x <= WORLD_MAX && z >= WORLD_MIN && z <= WORLD_MAX;
}

function distToEdge(x, z) {
  return Math.min(x - WORLD_MIN, WORLD_MAX - x, z - WORLD_MIN, WORLD_MAX - z);
}

function segmentDir(a, b) {
  return {
    dx: Math.sign(b.x - a.x),
    dz: Math.sign(b.z - a.z),
  };
}

function perpendicularDirs(d) {
  if (d.dx !== 0) return [DIR.N, DIR.S];
  return [DIR.E, DIR.W];
}

function visitKey(x, z) {
  return `${Math.floor(x / VISIT_CELL)},${Math.floor(z / VISIT_CELL)}`;
}

function rollSegmentLength(seed, seedOff) {
  const t = (hash01(seed, seedOff) + hash01(seed, seedOff + 91)) * 0.5;
  return MIN_SEGMENT_TILES + Math.floor(t * (MAX_SEGMENT_TILES - MIN_SEGMENT_TILES + 1));
}

function onSameAxisLine(ax, az, bx, bz, dir) {
  if (dir.dx !== 0) return az === bz;
  return ax === bx;
}

function blocksStep(x, z, occupied, ignoreKeys, incomingDir = null) {
  for (const key of occupied) {
    if (ignoreKeys.has(key)) continue;
    const [ox, oz] = key.split(',').map(Number);
    const md = Math.abs(ox - x) + Math.abs(oz - z);
    if (md === 0) return true;
    if (md < MIN_ROAD_GAP_TILES) {
      if (incomingDir && onSameAxisLine(ox, oz, x, z, incomingDir)) continue;
      return true;
    }
  }
  return false;
}

function pathAheadBlocked(x, z, tryDir, occupied, ignore) {
  for (let d = 1; d <= 55; d++) {
    const px = x + tryDir.dx * d;
    const pz = z + tryDir.dz * d;
    if (!inWorld(px, pz)) break;
    const key = `${px},${pz}`;
    if (occupied.has(key) && !ignore.has(key)) return true;
  }
  return false;
}

function pathKeySet(points, step = 1) {
  const out = new Set();
  for (let i = 0; i < points.length; i += step) {
    out.add(`${points[i].x},${points[i].z}`);
  }
  return out;
}

function distToRoadKeys(x, z, keys, ignore = null) {
  let best = Infinity;
  for (const key of keys) {
    if (ignore?.has(key)) continue;
    const [rx, rz] = key.split(',').map(Number);
    best = Math.min(best, Math.abs(rx - x) + Math.abs(rz - z));
  }
  return best;
}

function collisionIgnoreKeys(points, junctionIgnore, tail = 12) {
  const out = new Set(junctionIgnore ?? []);
  const start = Math.max(0, points.length - tail);
  for (let i = start; i < points.length; i++) {
    out.add(`${points[i].x},${points[i].z}`);
  }
  return out;
}

function corridorIgnoreKeys(x, z, dir, length = MIN_ROAD_GAP_TILES) {
  const out = new Set();
  for (let d = -length; d <= length; d++) {
    out.add(`${x + dir.dx * d},${z + dir.dz * d}`);
  }
  return out;
}

function stepIgnoreKeys(points, junctionIgnore, tail = 12) {
  return collisionIgnoreKeys(points, junctionIgnore, tail);
}

function turnIgnoreKeys(points, x, z, dir, junctionIgnore) {
  const out = stepIgnoreKeys(points, junctionIgnore, MIN_ROAD_GAP_TILES);
  for (const k of corridorIgnoreKeys(x, z, dir)) out.add(k);
  if (points.length >= 2) {
    const prevDir = segmentDir(points[points.length - 2], points[points.length - 1]);
    for (const k of corridorIgnoreKeys(x, z, prevDir)) out.add(k);
  }
  return out;
}

function turnSide(prevDir, tryDir) {
  const left = turnLeft(prevDir);
  return tryDir.dx === left.dx && tryDir.dz === left.dz ? 'L' : 'R';
}

function pathCentroid(points, lookback = SPIRAL_CENTROID_LOOKBACK) {
  const tail = points.slice(-Math.min(lookback, points.length));
  let cx = 0;
  let cz = 0;
  for (const p of tail) {
    cx += p.x;
    cz += p.z;
  }
  return { x: cx / tail.length, z: cz / tail.length };
}

function runsParallelToOldPath(x, z, tryDir, points, ignore) {
  const oldEnd = Math.max(0, points.length - 60);
  /** @type {Set<string>} */
  const oldKeys = new Set();
  for (let i = 0; i < oldEnd; i += 2) oldKeys.add(`${points[i].x},${points[i].z}`);
  if (oldKeys.size === 0) return false;

  for (let d = 12; d <= 48; d += 8) {
    const px = x + tryDir.dx * d;
    const pz = z + tryDir.dz * d;
    if (!inWorld(px, pz)) break;
    for (const pd of perpendicularDirs(tryDir)) {
      for (let o = 3; o <= PARALLEL_CORRIDOR_DIST; o++) {
        const key = `${px + pd.dx * o},${pz + pd.dz * o}`;
        if (ignore.has(key)) continue;
        if (oldKeys.has(key)) return true;
      }
    }
  }
  return false;
}

function runsParallelToNetwork(x, z, tryDir, networkKeys, ignore) {
  for (let d = 12; d <= 48; d += 8) {
    const px = x + tryDir.dx * d;
    const pz = z + tryDir.dz * d;
    if (!inWorld(px, pz)) break;
    for (const pd of perpendicularDirs(tryDir)) {
      for (let o = 3; o <= PARALLEL_CORRIDOR_DIST; o++) {
        const key = `${px + pd.dx * o},${pz + pd.dz * o}`;
        if (ignore.has(key)) continue;
        if (networkKeys.has(key)) return true;
      }
    }
  }
  return false;
}

function wouldSkirtEdge(x, z, dir) {
  const lookX = x + dir.dx * 10;
  const lookZ = z + dir.dz * 10;
  return distToEdge(lookX, lookZ) < 20;
}

function scoreTurnDir(x, z, tryDir, dir, occupied, recentKeys, visitCounts, seed, step, points, wouldBeStreak, networkKeys = null, mainBuffer = null) {
  const nx = x + tryDir.dx;
  const nz = z + tryDir.dz;
  if (!inWorld(nx, nz)) return -10000;
  if (blocksStep(nx, nz, occupied, recentKeys, dir)) return -8000;
  if (pathAheadBlocked(x, z, tryDir, occupied, recentKeys)) return -8200;
  if (wouldBeStreak > MAX_SAME_TURN_STREAK) return -9000;
  const parallel = runsParallelToOldPath(x, z, tryDir, points, recentKeys)
    || (networkKeys && runsParallelToNetwork(x, z, tryDir, networkKeys, recentKeys));

  const lookX = x + tryDir.dx * 28;
  const lookZ = z + tryDir.dz * 28;
  if (!inWorld(lookX, lookZ)) return -5000;

  if (mainBuffer && mainBuffer.afterStart) {
    const mainDist = distToRoadKeys(lookX, lookZ, mainBuffer.keys, mainBuffer.junctionIgnore);
    if (mainDist < MIN_BRANCH_MAIN_GAP_TILES) return -8500;
    if (mainDist < mainBuffer.minDistSeen - 6) return -7000;
  }

  let score = 0;
  const edgeThere = distToEdge(lookX, lookZ);
  const edgeHere = distToEdge(x, z);
  if (edgeThere < 28) score -= 65;
  if (edgeHere < 35 && edgeThere <= edgeHere) score -= 50;
  if (wouldSkirtEdge(x, z, tryDir)) score -= EDGE_SKIRT_PENALTY;

  if (points.length > 60) {
    const { x: cx, z: cz } = pathCentroid(points);
    const distNow = Math.abs(cx - x) + Math.abs(cz - z);
    const distLook = Math.abs(cx - lookX) + Math.abs(cz - lookZ);
    if (distLook < distNow - 10) score -= 55;
    if (distLook < distNow - 25) score -= 80;
  }

  if (parallel) score -= 80;

  const vk = visitKey(lookX, lookZ);
  score -= (visitCounts.get(vk) ?? 0) * 18;
  for (let d = 1; d <= 6; d++) {
    const vx = x + tryDir.dx * d * 24;
    const vz = z + tryDir.dz * d * 24;
    if (!inWorld(vx, vz)) break;
    score -= (visitCounts.get(visitKey(vx, vz)) ?? 0) * 6;
  }
  score += hash01(seed, step * 13 + tryDir.dx * 17 + tryDir.dz * 23) * 12;
  return score;
}

function pickTurnDir(x, z, dir, occupied, recentKeys, visitCounts, seed, step, points, lastTurn, sameTurnStreak, networkKeys = null, mainBuffer = null) {
  const left = turnLeft(dir);
  const right = turnRight(dir);
  const options = hash01(seed, step * 19) < 0.5 ? [left, right] : [right, left];

  let best = null;
  let bestScore = -Infinity;
  let alt = null;
  let altScore = -Infinity;
  for (const tryDir of options) {
    const side = turnSide(dir, tryDir);
    const wouldBeStreak = side === lastTurn ? sameTurnStreak + 1 : 1;
    const score = scoreTurnDir(
      x, z, tryDir, dir, occupied, recentKeys, visitCounts, seed, step, points, wouldBeStreak, networkKeys, mainBuffer,
    );
    if (score > bestScore) {
      alt = best;
      altScore = bestScore;
      bestScore = score;
      best = tryDir;
    } else if (score > altScore) {
      alt = tryDir;
      altScore = score;
    }
  }
  if (bestScore < -5000 && alt && altScore > -9000) return alt;
  return best;
}

function canStepForward(x, z, dir, occupied, ignoreKeys) {
  const nx = x + dir.dx;
  const nz = z + dir.dz;
  return inWorld(nx, nz) && !blocksStep(nx, nz, occupied, ignoreKeys, dir);
}

function bumpVisit(visitCounts, x, z) {
  const k = visitKey(x, z);
  visitCounts.set(k, (visitCounts.get(k) ?? 0) + 1);
}

/**
 * Organic highway — variable straight runs, turns biased toward open map interior.
 */
function buildOrganicPath(seed, startX, startZ, startDir, targetLen, seedOff, occupied, visitCounts, opts = {}) {
  const {
    junctionIgnore = null,
    networkKeys = null,
    mainBuffer = null,
  } = opts;
  /** @type {{x:number,z:number}[]} */
  const points = [{ x: startX, z: startZ }];
  if (!junctionIgnore?.has(`${startX},${startZ}`)) {
    occupied.add(`${startX},${startZ}`);
  }
  bumpVisit(visitCounts, startX, startZ);

  let x = startX;
  let z = startZ;
  let dir = { ...startDir };
  let traveled = 0;
  let runLeft = rollSegmentLength(seed, seedOff + 1);
  let step = 0;
  /** @type {'L'|'R'|null} */
  let lastTurn = null;
  let sameTurnStreak = 0;
  let tilesSinceTurn = 0;
  let stepsAfterTurn = 99;
  let minMainDistSeen = Infinity;

  while (traveled < targetLen) {
    step++;
    const stepIgnore = stepIgnoreKeys(points, junctionIgnore, 12);
    const turnIgnore = turnIgnoreKeys(points, x, z, dir, junctionIgnore);
    const forwardIgnore = () => (
      stepsAfterTurn < 3
        ? turnIgnoreKeys(points, x, z, dir, junctionIgnore)
        : stepIgnore
    );

    if (mainBuffer) {
      const md = distToRoadKeys(x, z, mainBuffer.keys, mainBuffer.junctionIgnore);
      minMainDistSeen = Math.min(minMainDistSeen, md);
      mainBuffer.minDistSeen = minMainDistSeen;
      mainBuffer.afterStart = traveled >= BRANCH_MAIN_BUFFER_TILES;
    }

    const forwardOk = canStepForward(x, z, dir, occupied, forwardIgnore());
    const segmentComplete = runLeft <= 0;

    if (!forwardOk || segmentComplete) {
      if (segmentComplete && forwardOk) {
        const extendRoll = hash01(seed, seedOff + step * 7);
        if (extendRoll < 0.12) {
          runLeft = rollSegmentLength(seed, seedOff + step * 9);
        } else {
          const turned = pickTurnDir(
            x, z, dir, occupied, turnIgnore, visitCounts, seed, step + seedOff, points, lastTurn, sameTurnStreak, networkKeys, mainBuffer,
          );
          if (!turned) break;
          const side = turnSide(dir, turned);
          sameTurnStreak = side === lastTurn ? sameTurnStreak + 1 : 1;
          lastTurn = side;
          tilesSinceTurn = 0;
          stepsAfterTurn = 0;
          dir = turned;
          runLeft = rollSegmentLength(seed, seedOff + step * 5);
        }
      } else {
        const turned = pickTurnDir(
          x, z, dir, occupied, turnIgnore, visitCounts, seed, step + seedOff, points, lastTurn, sameTurnStreak, networkKeys, mainBuffer,
        );
        if (!turned) break;
        const side = turnSide(dir, turned);
        sameTurnStreak = side === lastTurn ? sameTurnStreak + 1 : 1;
        lastTurn = side;
        tilesSinceTurn = 0;
        stepsAfterTurn = 0;
        dir = turned;
        runLeft = rollSegmentLength(seed, seedOff + step * 3);
      }
    }

    if (!canStepForward(x, z, dir, occupied, forwardIgnore())) break;

    x += dir.dx;
    z += dir.dz;
    points.push({ x, z });
    occupied.add(`${x},${z}`);
    bumpVisit(visitCounts, x, z);
    traveled++;
    runLeft--;
    tilesSinceTurn++;
    stepsAfterTurn++;
    if (tilesSinceTurn >= MIN_SEGMENT_TILES) {
      lastTurn = null;
      sameTurnStreak = 0;
    }
  }

  return points;
}

function canPlaceRoadTile(x, z, legDir, occupied) {
  if (!inWorld(x, z)) return false;
  if (occupied.has(`${x},${z}`)) return false;
  return !blocksStep(x, z, occupied, new Set(), legDir);
}

function legDirBetween(ax, az, bx, bz) {
  return { dx: Math.sign(bx - ax), dz: Math.sign(bz - az) };
}

function buildLegPoints(fromX, fromZ, toX, toZ, hFirst) {
  /** @type {{x:number,z:number}[]} */
  const path = [];
  let cx = fromX;
  let cz = fromZ;
  if (hFirst) {
    while (cx !== toX) {
      cx += Math.sign(toX - cx);
      path.push({ x: cx, z: cz });
    }
    while (cz !== toZ) {
      cz += Math.sign(toZ - cz);
      path.push({ x: cx, z: cz });
    }
  } else {
    while (cz !== toZ) {
      cz += Math.sign(toZ - cz);
      path.push({ x: cx, z: cz });
    }
    while (cx !== toX) {
      cx += Math.sign(toX - cx);
      path.push({ x: cx, z: cz });
    }
  }
  return path;
}

function tryAppendLeg(points, occupied, visitCounts, toX, toZ, seed, seedOff) {
  const from = points[points.length - 1];
  for (const hFirst of hash01(seed, seedOff) < 0.5 ? [true, false] : [false, true]) {
    const leg = buildLegPoints(from.x, from.z, toX, toZ, hFirst);
    let prev = from;
    let ok = true;
    for (const p of leg) {
      const d = legDirBetween(prev.x, prev.z, p.x, p.z);
      if (!canPlaceRoadTile(p.x, p.z, d, occupied)) {
        ok = false;
        break;
      }
      prev = p;
    }
    if (!ok) continue;
    prev = from;
    for (const p of leg) {
      points.push(p);
      occupied.add(`${p.x},${p.z}`);
      bumpVisit(visitCounts, p.x, p.z);
      prev = p;
    }
    return true;
  }
  return false;
}

function pickMainWaypoints(seed) {
  const count = 6 + Math.floor(hash01(seed, 301) * 3);
  /** @type {{x:number,z:number}[]} */
  const waypoints = [];
  const margin = 58;
  for (let attempt = 0; attempt < 100 && waypoints.length < count; attempt++) {
    const x = WORLD_MIN + margin + Math.floor(
      hash01(seed, attempt * 17 + 400) * (WORLD_MAX - WORLD_MIN - margin * 2),
    );
    const z = WORLD_MIN + margin + Math.floor(
      hash01(seed, attempt * 23 + 500) * (WORLD_MAX - WORLD_MIN - margin * 2),
    );
    const farFromOthers = waypoints.every((w) => Math.abs(w.x - x) + Math.abs(w.z - z) >= 88);
    const farFromSpawn = Math.abs(x - HIGHWAY_SPAWN_TX) + Math.abs(z - HIGHWAY_SPAWN_TZ) >= 70;
    if (farFromOthers && farFromSpawn) waypoints.push({ x, z });
  }
  return waypoints;
}

function buildMainHighway(seed, occupied, visitCounts) {
  /** @type {{x:number,z:number}[]} */
  const points = [{ x: HIGHWAY_SPAWN_TX, z: HIGHWAY_SPAWN_TZ }];
  occupied.add(`${HIGHWAY_SPAWN_TX},${HIGHWAY_SPAWN_TZ}`);
  bumpVisit(visitCounts, HIGHWAY_SPAWN_TX, HIGHWAY_SPAWN_TZ);

  const waypoints = pickMainWaypoints(seed);
  waypoints.sort((a, b) => {
    const da = Math.abs(a.x - HIGHWAY_SPAWN_TX) + Math.abs(a.z - HIGHWAY_SPAWN_TZ);
    const db = Math.abs(b.x - HIGHWAY_SPAWN_TX) + Math.abs(b.z - HIGHWAY_SPAWN_TZ);
    return da - db;
  });

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    tryAppendLeg(points, occupied, visitCounts, wp.x, wp.z, seed, 600 + i * 41);
  }

  return points;
}

function branchSpurIgnore(mainPoints, split) {
  const out = junctionIgnoreSet(mainPoints, split, MIN_ROAD_GAP_TILES + 8);
  for (const p of mainPoints) {
    if (Math.abs(p.x - split.x) + Math.abs(p.z - split.z) <= MIN_ROAD_GAP_TILES + 10) {
      out.add(`${p.x},${p.z}`);
    }
  }
  return out;
}

function buildBranchSpur(seed, split, branchLen, seedOff, occupied, visitCounts, mainPoints, mainKeys) {
  /** @type {{x:number,z:number}[]} */
  const points = [{ x: split.x, z: split.z }];
  let x = split.x;
  let z = split.z;
  let dir = { ...split.dir };
  let traveled = 0;
  let turnCount = 0;
  const spurIgnore = branchSpurIgnore(mainPoints, split);

  const stepBlocked = (nx, nz, stepDir) => {
    const tooCloseMain = traveled >= BRANCH_MAIN_BUFFER_TILES
      && distToRoadKeys(nx, nz, mainKeys, spurIgnore) < MIN_BRANCH_MAIN_GAP_TILES;
    return !inWorld(nx, nz)
      || occupied.has(`${nx},${nz}`)
      || blocksStep(nx, nz, occupied, spurIgnore, stepDir)
      || tooCloseMain;
  };

  while (traveled < branchLen) {
    const nx = x + dir.dx;
    const nz = z + dir.dz;

    if (!stepBlocked(nx, nz, dir)) {
      x = nx;
      z = nz;
      points.push({ x, z });
      occupied.add(`${x},${z}`);
      bumpVisit(visitCounts, x, z);
      traveled++;
      continue;
    }

    if (turnCount >= 2) break;
    const [perpA, perpB] = perpendicularDirs(dir);
    const order = hash01(seed, seedOff + turnCount * 31) < 0.5 ? [perpA, perpB] : [perpB, perpA];
    let turned = false;
    for (const tryDir of order) {
      const tx = x + tryDir.dx;
      const tz = z + tryDir.dz;
      if (!stepBlocked(tx, tz, tryDir)) {
        dir = tryDir;
        turnCount++;
        turned = true;
        break;
      }
    }
    if (!turned) break;
  }

  return points;
}

function junctionIgnoreSet(mainPoints, split, radius = 6) {
  const out = new Set();
  for (const p of mainPoints) {
    if (Math.abs(p.x - split.x) + Math.abs(p.z - split.z) <= radius) {
      out.add(`${p.x},${p.z}`);
    }
  }
  return out;
}

function quadrantVisitScore(visitCounts, dir, fromX, fromZ) {
  const lookX = fromX + dir.dx * 80;
  const lookZ = fromZ + dir.dz * 80;
  const vk = visitKey(lookX, lookZ);
  return -(visitCounts.get(vk) ?? 0);
}

function branchDirectionScore(dir, fromX, fromZ, visitCounts, networkKeys) {
  let score = quadrantVisitScore(visitCounts, dir, fromX, fromZ) * 12;
  for (let d = 20; d <= 70; d += 10) {
    const px = fromX + dir.dx * d;
    const pz = fromZ + dir.dz * d;
    if (!inWorld(px, pz)) return -1000;
    const nearRoad = distToRoadKeys(px, pz, networkKeys) < MIN_ROAD_GAP_TILES + 8;
    if (nearRoad) score -= 40;
    score -= (visitCounts.get(visitKey(px, pz)) ?? 0) * 3;
  }
  return score;
}

function pickBranchSplits(mainPoints, seed, visitCounts, networkKeys) {
  const branchCount = MAX_BRANCH_COUNT;
  /** @type {BranchSplit[]} */
  const splits = [];
  const usedIndices = [];

  if (mainPoints.length < 160) return splits;

  const runs = straightRunsFromPoints(mainPoints).filter((r) => r.len >= MIN_STRAIGHT_FOR_TOWN_TILES);
  const candidates = [];
  for (const run of runs) {
    const mid = {
      x: Math.round((run.a.x + run.b.x) * 0.5),
      z: Math.round((run.b.z + run.a.z) * 0.5),
    };
    const idx = mainPoints.findIndex((p) => p.x === mid.x && p.z === mid.z);
    const index = idx >= 0 ? idx : mainPoints.findIndex((p) => Math.abs(p.x - mid.x) + Math.abs(p.z - mid.z) < 2);
    if (index < 40 || index > mainPoints.length - 41) continue;
    candidates.push({ run, index, x: mainPoints[index].x, z: mainPoints[index].z });
  }

  candidates.sort((a, b) => b.run.len - a.run.len);

  if (candidates.length === 0) {
    const step = Math.floor(mainPoints.length / (branchCount + 1));
    for (let i = 1; i <= branchCount; i++) {
      const index = Math.max(40, Math.min(mainPoints.length - 41, step * i));
      const cur = mainPoints[index];
      const prev = mainPoints[Math.max(0, index - 1)];
      const d = segmentDir(prev, cur);
      if (d.dx === 0 && d.dz === 0) continue;
      const [perpA, perpB] = perpendicularDirs(d);
      const scoreA = branchDirectionScore(perpA, cur.x, cur.z, visitCounts, networkKeys);
      const scoreB = branchDirectionScore(perpB, cur.x, cur.z, visitCounts, networkKeys);
      let branchDir = scoreA >= scoreB ? perpA : perpB;
      if (scoreA === scoreB && hash01(seed, index * 13) < 0.5) branchDir = perpB;
      candidates.push({ run: { len: 60 }, index, x: cur.x, z: cur.z, dir: branchDir });
    }
  }

  for (const cand of candidates) {
    if (splits.length >= branchCount) break;
    if (usedIndices.some((u) => Math.abs(u - cand.index) < MIN_BRANCH_SPLIT_INDEX_DIST)) continue;

    const prev = mainPoints[Math.max(0, cand.index - 1)];
    const cur = mainPoints[cand.index];
    const d = segmentDir(prev, cur);
    if (d.dx === 0 && d.dz === 0) continue;

    const [perpA, perpB] = perpendicularDirs(d);
    const scoreA = branchDirectionScore(perpA, cur.x, cur.z, visitCounts, networkKeys);
    const scoreB = branchDirectionScore(perpB, cur.x, cur.z, visitCounts, networkKeys);
    let branchDir = cand.dir ?? (scoreA >= scoreB ? perpA : perpB);
    if (!cand.dir) {
      if (scoreA === scoreB && hash01(seed, cand.index * 13) < 0.5) branchDir = perpB;
    if (Math.max(scoreA, scoreB) < -200) continue;
    }

    splits.push({ x: cur.x, z: cur.z, index: cand.index, dir: branchDir });
    usedIndices.push(cand.index);
  }

  return splits;
}

function trimBranchCurl(branchPoints, mainKeys, junctionIgnore) {
  if (branchPoints.length < 40) return branchPoints;
  let bestEnd = branchPoints.length;
  let peakDist = 0;
  for (let i = BRANCH_MAIN_BUFFER_TILES; i < branchPoints.length; i++) {
    const p = branchPoints[i];
    const d = distToRoadKeys(p.x, p.z, mainKeys, junctionIgnore);
    if (d > peakDist) peakDist = d;
    if (peakDist > MIN_BRANCH_MAIN_GAP_TILES + 10 && d < peakDist - 14) {
      bestEnd = Math.max(BRANCH_MAIN_BUFFER_TILES + 20, i - 8);
      break;
    }
  }
  return branchPoints.slice(0, bestEnd);
}

function branchIsWorthKeeping(branchPoints, mainKeys, junctionIgnore) {
  if (branchPoints.length < MIN_BRANCH_ACCEPT_LEN) return false;
  let farTiles = 0;
  let minDist = Infinity;
  let sumDist = 0;
  let count = 0;
  for (let i = BRANCH_MAIN_BUFFER_TILES; i < branchPoints.length; i++) {
    const p = branchPoints[i];
    const d = distToRoadKeys(p.x, p.z, mainKeys, junctionIgnore);
    minDist = Math.min(minDist, d);
    sumDist += d;
    count++;
    if (d >= MIN_BRANCH_MAIN_GAP_TILES) farTiles++;
  }
  if (farTiles < 70) return false;
  if (minDist < MIN_BRANCH_MAIN_GAP_TILES - 4) return false;
  if (count > 0 && sumDist / count < MIN_BRANCH_MAIN_GAP_TILES + 2) return false;
  const runs = straightRunsFromPoints(branchPoints);
  const longRuns = runs.filter((r) => r.len >= MIN_STRAIGHT_FOR_TOWN_TILES);
  return longRuns.length >= 1;
}

function countPotentialTowns(pathPoints) {
  return straightRunsFromPoints(pathPoints).filter((r) => r.len >= MIN_STRAIGHT_FOR_TOWN_TILES).length;
}

function isNearPathBend(tx, tz, pathPoints, clearance = TOWN_BEND_CLEARANCE_TILES) {
  for (let i = 1; i < pathPoints.length - 1; i++) {
    const prev = pathPoints[i - 1];
    const cur = pathPoints[i];
    const next = pathPoints[i + 1];
    const dIn = segmentDir(prev, cur);
    const dOut = segmentDir(cur, next);
    if (dIn.dx === dOut.dx && dIn.dz === dOut.dz) continue;
    const dist = Math.abs(cur.x - tx) + Math.abs(cur.z - tz);
    if (dist <= clearance) return true;
  }
  return false;
}

function anchorTooClose(tx, tz, towns) {
  for (const t of towns) {
    const dist = Math.abs(t.tx - tx) + Math.abs(t.tz - tz);
    if (dist < MIN_TOWN_ANCHOR_DIST_TILES) return true;
  }
  return false;
}

function anchorAtSegmentT(a, b, local, segLen) {
  const t = local / Math.max(1, segLen);
  return {
    tx: Math.round(a.x + (b.x - a.x) * t),
    tz: Math.round(a.z + (b.z - a.z) * t),
  };
}

function findTownAnchorOnSegment(a, b, local, pathPoints, towns, maxSlide = 30) {
  const segLen = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
  for (let offset = 0; offset <= maxSlide; offset++) {
    for (const sign of offset === 0 ? [0] : [1, -1]) {
      const localAdj = local + sign * offset;
      if (localAdj < 0 || localAdj > segLen) continue;
      const { tx, tz } = anchorAtSegmentT(a, b, localAdj, segLen);
      if (!inWorld(tx, tz)) continue;
      if (!anchorTooClose(tx, tz, towns) && !isNearPathBend(tx, tz, pathPoints)) {
        return { tx, tz };
      }
    }
  }
  return null;
}

function straightRunsFromPoints(pathPoints) {
  /** @type {{ a:{x:number,z:number}, b:{x:number,z:number}, len:number }[]} */
  const runs = [];
  if (pathPoints.length < 2) return runs;

  let runStart = 0;
  let i = 1;
  while (i < pathPoints.length) {
    const d = segmentDir(pathPoints[i - 1], pathPoints[i]);
    let j = i;
    while (j < pathPoints.length) {
      const nd = segmentDir(pathPoints[j - 1], pathPoints[j]);
      if (nd.dx !== d.dx || nd.dz !== d.dz) break;
      j++;
    }
    runs.push({
      a: pathPoints[runStart],
      b: pathPoints[j - 1],
      len: j - runStart,
    });
    runStart = j - 1;
    i = j;
  }
  return runs;
}

function placeTownsOnPath(pathPoints, towns, spacing, kind, idPrefix, maxTowns, seedOff = 0) {
  const seed = getWorldSeed();
  let traveled = 0;
  let nextTownAt = spacing * (0.85 + hash01(seed, seedOff + idPrefix.length * 19) * 0.55);
  const existing = towns.filter((t) => t.kind === kind && t.id.startsWith(idPrefix)).length;
  let townIdx = existing;

  for (const run of straightRunsFromPoints(pathPoints)) {
    const { a, b, len: segLen } = run;
    const straightEnough = segLen >= MIN_STRAIGHT_FOR_TOWN_TILES;

    while (straightEnough && traveled + segLen >= nextTownAt && townIdx < maxTowns) {
      const local = nextTownAt - traveled;
      const anchor = findTownAnchorOnSegment(a, b, local, pathPoints, towns);
      if (anchor) {
        towns.push({ id: `${idPrefix}${townIdx}`, tx: anchor.tx, tz: anchor.tz, kind });
        townIdx++;
      }
      const jitter = Math.floor(hash01(seed, seedOff + townIdx * 31) * 18) - 6;
      nextTownAt += spacing + jitter;
    }
    traveled += segLen;
  }
}

function fixedWorldBounds() {
  return {
    minTx: -WORLD_HALF_TILES,
    maxTx: WORLD_HALF_TILES - 1,
    minTz: -WORLD_HALF_TILES,
    maxTz: WORLD_HALF_TILES - 1,
  };
}

function minDistToTowns(tx, tz, towns) {
  let best = Infinity;
  for (const t of towns) {
    best = Math.min(best, Math.abs(t.tx - tx) + Math.abs(t.tz - tz));
  }
  return best;
}

function pickScatteredTowns(seed) {
  const target = TOWN_SITE_COUNT_MIN
    + Math.floor(hash01(seed, 50) * (TOWN_SITE_COUNT_MAX - TOWN_SITE_COUNT_MIN + 1));
  /** @type {TownSite[]} */
  const towns = [{
    id: 't0',
    tx: HIGHWAY_SPAWN_TX,
    tz: HIGHWAY_SPAWN_TZ,
    axis: hash01(seed, 3) < 0.5 ? 'h' : 'v',
    kind: 'main',
    half: rollTownHalf(seed, HIGHWAY_SPAWN_TX, HIGHWAY_SPAWN_TZ, 0),
  }];

  const spanX = WORLD_MAX - WORLD_MIN - TOWN_SITE_MARGIN_TILES * 2;
  const spanZ = WORLD_MAX - WORLD_MIN - TOWN_SITE_MARGIN_TILES * 2;
  const gridN = Math.ceil(Math.sqrt(target * 1.4));
  const stepX = spanX / gridN;
  const stepZ = spanZ / gridN;
  let idx = 1;

  /** @type {{ tx:number, tz:number, rank:number }[]} */
  const pool = [];
  for (let row = 0; row < gridN; row++) {
    for (let col = 0; col < gridN; col++) {
      const baseX = WORLD_MIN + TOWN_SITE_MARGIN_TILES + (col + 0.5) * stepX;
      const baseZ = WORLD_MIN + TOWN_SITE_MARGIN_TILES + (row + 0.5) * stepZ;
      const jx = (hash01(seed, row * 17 + col * 31 + 100) - 0.5) * stepX * 0.28;
      const jz = (hash01(seed, row * 23 + col * 37 + 100) - 0.5) * stepZ * 0.28;
      const tx = Math.round(baseX + jx);
      const tz = Math.round(baseZ + jz);
      pool.push({
        tx,
        tz,
        rank: hash01(seed, tx * 11 + tz * 19),
      });
    }
  }
  pool.sort((a, b) => a.rank - b.rank);

  for (const cand of pool) {
    if (towns.length >= target) break;
    const { tx, tz } = cand;
    if (Math.abs(tx - HIGHWAY_SPAWN_TX) + Math.abs(tz - HIGHWAY_SPAWN_TZ) < 48) continue;
    if (towns.some((t) => Math.abs(t.tx - tx) + Math.abs(t.tz - tz) < TOWN_SITE_MIN_DIST_TILES)) continue;
    towns.push({
      id: `t${idx}`,
      tx,
      tz,
      axis: hash01(seed, idx * 29) < 0.5 ? 'h' : 'v',
      kind: 'main',
      half: rollTownHalf(seed, tx, tz, idx),
    });
    idx++;
  }

  for (let attempt = 0; towns.length < target && attempt < 900; attempt++) {
    let bestTx = 0;
    let bestTz = 0;
    let bestMin = -1;
    for (let k = 0; k < 16; k++) {
      const tx = WORLD_MIN + TOWN_SITE_MARGIN_TILES
        + Math.floor(hash01(seed, attempt * 7 + k * 41 + 500) * spanX);
      const tz = WORLD_MIN + TOWN_SITE_MARGIN_TILES
        + Math.floor(hash01(seed, attempt * 13 + k * 43 + 500) * spanZ);
      if (Math.abs(tx - HIGHWAY_SPAWN_TX) + Math.abs(tz - HIGHWAY_SPAWN_TZ) < 48) continue;
      const md = minDistToTowns(tx, tz, towns);
      if (md < TOWN_SITE_MIN_DIST_TILES) continue;
      if (md > bestMin) {
        bestMin = md;
        bestTx = tx;
        bestTz = tz;
      }
    }
    if (bestMin < 0) continue;
    towns.push({
      id: `t${towns.length}`,
      tx: bestTx,
      tz: bestTz,
      axis: hash01(seed, attempt * 31) < 0.5 ? 'h' : 'v',
      kind: 'main',
      half: rollTownHalf(seed, bestTx, bestTz, towns.length + attempt),
    });
  }

  return towns;
}

/** Endpoints of the town's main highway strip (neg = west/north, pos = east/south). */
function townEndpoints(town) {
  const half = townHalf(town);
  if (town.axis === 'h') {
    return {
      neg: { x: town.tx - half, z: town.tz },
      pos: { x: town.tx + half, z: town.tz },
    };
  }
  return {
    neg: { x: town.tx, z: town.tz - half },
    pos: { x: town.tx, z: town.tz + half },
  };
}

/** Match townGen spur roll (seedA = tx*41, seedB = tz*43). */
function rollSpurPlacement(town, salt) {
  const seedA = town.tx * 41;
  const seedB = town.tz * 43;
  const half = townHalf(town);
  const roll = hash01(seedA + salt, seedB + salt * 11);
  if (town.axis === 'h') {
    if (roll < 0.34) return { along: town.tx, edge: 'center' };
    if (roll < 0.67) return { along: town.tx - half, edge: 'min' };
    return { along: town.tx + half, edge: 'max' };
  }
  if (roll < 0.34) return { along: town.tz, edge: 'center' };
  if (roll < 0.67) return { along: town.tz - half, edge: 'min' };
  return { along: town.tz + half, edge: 'max' };
}

/** All viable highway attach points — ends, sides, and edge-spur corners. */
function townAttachPoints(town) {
  const half = townHalf(town);
  /** @type {{ x:number, z:number, key:string }[]} */
  const pts = [];
  const seen = new Set();
  const add = (x, z, key) => {
    if (seen.has(key)) return;
    seen.add(key);
    pts.push({ x, z, key });
  };

  if (town.axis === 'h') {
    const zMid = town.tz;
    const zN = zMid - 1;
    const zS = zMid + 1;
    const north = rollSpurPlacement(town, 11);
    const south = rollSpurPlacement(town, 22);
    add(town.tx - half, zMid, 'w');
    add(town.tx + half, zMid, 'e');
    add(north.along, zN, 'n');
    add(south.along, zS, 's');
    add(town.tx, zN, 'nc');
    add(town.tx, zS, 'sc');
    if (north.edge === 'min') add(town.tx - half, zN, 'nw');
    if (north.edge === 'max') add(town.tx + half, zN, 'ne');
    if (south.edge === 'min') add(town.tx - half, zS, 'sw');
    if (south.edge === 'max') add(town.tx + half, zS, 'se');
  } else {
    const xMid = town.tx;
    const xW = xMid - 1;
    const xE = xMid + 1;
    const west = rollSpurPlacement(town, 11);
    const east = rollSpurPlacement(town, 22);
    add(xMid, town.tz - half, 'n');
    add(xMid, town.tz + half, 's');
    add(xW, west.along, 'w');
    add(xE, east.along, 'e');
    add(xW, town.tz, 'wc');
    add(xE, town.tz, 'ec');
    if (west.edge === 'min') add(xW, town.tz - half, 'nw');
    if (west.edge === 'max') add(xW, town.tz + half, 'sw');
    if (east.edge === 'min') add(xE, town.tz - half, 'ne');
    if (east.edge === 'max') add(xE, town.tz + half, 'se');
  }
  return pts;
}

/** Pick the stub end that faces toward another town. */
function facingEndpoint(town, targetX, targetZ) {
  const ep = townEndpoints(town);
  if (town.axis === 'h') {
    return targetX >= town.tx ? ep.pos : ep.neg;
  }
  return targetZ >= town.tz ? ep.pos : ep.neg;
}

/** Minimum straight run from a stub end before the main highway may bend. */
const CONNECTOR_STRAIGHT_MIN = 15;

function stubEndPoints(town) {
  const ep = townEndpoints(town);
  if (town.axis === 'h') {
    return [
      { x: ep.neg.x, z: ep.neg.z, key: 'w' },
      { x: ep.pos.x, z: ep.pos.z, key: 'e' },
    ];
  }
  return [
    { x: ep.neg.x, z: ep.neg.z, key: 'n' },
    { x: ep.pos.x, z: ep.pos.z, key: 's' },
  ];
}

/** Outward direction from a stub end (away from town center). */
function outwardDir(town, ep) {
  const half = townHalf(town);
  if (town.axis === 'h') {
    if (ep.x >= town.tx + half - 1) return DIR.E;
    if (ep.x <= town.tx - half + 1) return DIR.W;
    return ep.x >= town.tx ? DIR.E : DIR.W;
  }
  if (ep.z >= town.tz + half - 1) return DIR.S;
  if (ep.z <= town.tz - half + 1) return DIR.N;
  return ep.z >= town.tz ? DIR.S : DIR.N;
}

/** Connector attach at town gateway on the main artery. */
function stubLeavePoint(town, ep) {
  return { x: ep.x, z: ep.z };
}

function stubArrivePoint(town, ep) {
  return { x: ep.x, z: ep.z };
}

function connectionDistance(townA, townB) {
  const ptsA = stubEndPoints(townA);
  const ptsB = stubEndPoints(townB);
  let best = Infinity;
  for (const a of ptsA) {
    for (const b of ptsB) {
      best = Math.min(best, Math.abs(a.x - b.x) + Math.abs(a.z - b.z));
    }
  }
  return best;
}

/**
 * Pick stub-end attach points only — avoids parallel runs beside edge spurs.
 */
function pickConnectionPair(townA, townB, usedEnds) {
  const ptsA = stubEndPoints(townA);
  const ptsB = stubEndPoints(townB);
  const usedA = usedEnds.get(townA.id) ?? new Set();
  const usedB = usedEnds.get(townB.id) ?? new Set();
  const faceA = facingEndpoint(townA, townB.tx, townB.tz);
  const faceB = facingEndpoint(townB, townA.tx, townA.tz);
  /** @type {{ keyA:string, keyB:string, a:{x:number,z:number}, b:{x:number,z:number}, cost:number }[]} */
  const options = [];
  for (const a of ptsA) {
    for (const b of ptsB) {
      let cost = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      cost += (usedA.has(a.key) ? 600 : 0) + (usedB.has(b.key) ? 600 : 0);
      if (a.x === faceA.x && a.z === faceA.z) cost -= FACING_ENDPOINT_BONUS;
      if (b.x === faceB.x && b.z === faceB.z) cost -= FACING_ENDPOINT_BONUS;
      options.push({ keyA: a.key, keyB: b.key, a, b, cost });
    }
  }
  options.sort((x, y) => x.cost - y.cost);
  const best = options[0];
  usedA.add(best.keyA);
  usedB.add(best.keyB);
  usedEnds.set(townA.id, usedA);
  usedEnds.set(townB.id, usedB);
  return { a: { x: best.a.x, z: best.a.z }, b: { x: best.b.x, z: best.b.z } };
}

/** Minimum spanning tree — edge weight = endpoint-to-endpoint distance. */
function mstEdges(towns) {
  /** @type {[number, number][]} */
  const edges = [];
  const inTree = new Set([0]);

  while (inTree.size < towns.length) {
    let bestI = -1;
    let bestJ = -1;
    let bestD = Infinity;
    for (const i of inTree) {
      for (let j = 0; j < towns.length; j++) {
        if (inTree.has(j)) continue;
        const d = connectionDistance(towns[i], towns[j]);
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0 || bestJ < 0) break;
    edges.push([bestI, bestJ]);
    inTree.add(bestJ);
  }
  return edges;
}

function legCenterline(fromX, fromZ, toX, toZ, hFirst) {
  /** @type {{ x:number, z:number }[]} */
  const pts = [{ x: fromX, z: fromZ }];
  let cx = fromX;
  let cz = fromZ;
  if (hFirst) {
    while (cx !== toX) {
      cx += Math.sign(toX - cx);
      pts.push({ x: cx, z: cz });
    }
    while (cz !== toZ) {
      cz += Math.sign(toZ - cz);
      pts.push({ x: cx, z: cz });
    }
  } else {
    while (cz !== toZ) {
      cz += Math.sign(toZ - cz);
      pts.push({ x: cx, z: cz });
    }
    while (cx !== toX) {
      cx += Math.sign(toX - cx);
      pts.push({ x: cx, z: cz });
    }
  }
  return pts;
}

function joinLegPoints(...legs) {
  /** @type {{ x:number, z:number }[]} */
  const out = [];
  for (const leg of legs) {
    if (!leg?.length) continue;
    if (out.length === 0) {
      out.push(...leg);
      continue;
    }
    const last = out[out.length - 1];
    const start = (leg[0].x === last.x && leg[0].z === last.z) ? 1 : 0;
    for (let i = start; i < leg.length; i++) out.push(leg[i]);
  }
  return out;
}

/** Axis-aligned town road footprint (cross streets + spurs + main street). */
function townLayoutBounds(town) {
  const half = townHalf(town);
  const spur = TOWN_SPUR_LENGTH_TILES;
  if (town.axis === 'h') {
    return {
      minX: town.tx - half,
      maxX: town.tx + half,
      minZ: town.tz - TOWN_HW_PAD - spur - TOWN_STREET_PAD,
      maxZ: town.tz + TOWN_HW_PAD + spur + TOWN_STREET_PAD,
    };
  }
  return {
    minX: town.tx - TOWN_HW_PAD - spur - TOWN_STREET_PAD,
    maxX: town.tx + TOWN_HW_PAD + spur + TOWN_STREET_PAD,
    minZ: town.tz - half,
    maxZ: town.tz + half,
  };
}

function isTownEndpoint(x, z, town) {
  const ep = townEndpoints(town);
  return (x === ep.neg.x && z === ep.neg.z) || (x === ep.pos.x && z === ep.pos.z);
}

/** True when a tile lies inside the town street grid (full footprint — no highway paint). */
function isInsideTownFootprint(x, z, town) {
  const b = townLayoutBounds(town);
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

/** Main through-street only — connectors may use this band inside a town. */
function isOnTownMainArtery(x, z, town) {
  const ep = townEndpoints(town);
  const pad = Math.floor(HIGHWAY_WIDTH_TILES / 2);
  if (town.axis === 'h') {
    if (Math.abs(z - town.tz) > pad) return false;
    return x >= ep.neg.x && x <= ep.pos.x;
  }
  if (Math.abs(x - town.tx) > pad) return false;
  return z >= ep.neg.z && z <= ep.pos.z;
}

/** Cross streets / spurs — never paint highway here. */
function isInBlockedTownHighwayArea(x, z, town) {
  if (!isInsideTownFootprint(x, z, town)) return false;
  return !isOnTownMainArtery(x, z, town);
}

function isHighwayPaintBlocked(x, z, towns) {
  for (const town of towns) {
    if (isInBlockedTownHighwayArea(x, z, town)) return true;
  }
  return false;
}

/** @deprecated */
function isInTownInterior(x, z, town) {
  return isInBlockedTownHighwayArea(x, z, town);
}

function segmentCrossesBlockedTownArea(x0, z0, x1, z1, town) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    if (isInBlockedTownHighwayArea(x, z, town)) return true;
  }
  return false;
}

function segmentCrossesTownFootprint(x0, z0, x1, z1, town) {
  return segmentCrossesBlockedTownArea(x0, z0, x1, z1, town);
}

function segmentCrossesTownInterior(x0, z0, x1, z1, town) {
  return segmentCrossesTownFootprint(x0, z0, x1, z1, town);
}

function manhattanThroughWaypoints(waypoints) {
  if (waypoints.length < 2) return waypoints.slice();
  /** @type {{ x:number, z:number }[]} */
  const out = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i++) {
    const a = out[out.length - 1];
    const b = waypoints[i];
    const leg = legCenterline(
      a.x, a.z, b.x, b.z,
      Math.abs(b.x - a.x) >= Math.abs(b.z - a.z),
    );
    for (let j = 1; j < leg.length; j++) out.push(leg[j]);
  }
  return out;
}

function bypassRoutesAround(start, end, outA, inB, straightMin, town) {
  const b = townLayoutBounds(town);
  const m = TOWN_BYPASS_MARGIN;
  const mid = {
    x: start.x + outA.dx * straightMin,
    z: start.z + outA.dz * straightMin,
  };
  const approach = { x: end.x - inB.dx, z: end.z - inB.dz };
  return [
    [start, mid, { x: mid.x, z: b.minZ - m }, { x: approach.x, z: b.minZ - m }, approach, end],
    [start, mid, { x: mid.x, z: b.maxZ + m }, { x: approach.x, z: b.maxZ + m }, approach, end],
    [start, mid, { x: b.minX - m, z: mid.z }, { x: b.minX - m, z: approach.z }, approach, end],
    [start, mid, { x: b.maxX + m, z: mid.z }, { x: b.maxX + m, z: approach.z }, approach, end],
  ].map((wps) => manhattanThroughWaypoints(wps));
}

function buildConnectorCandidates(startA, endB, outA, inB, straightMin, towns, townA, townB) {
  /** @type {{ x:number, z:number }[][]} */
  const candidates = [];
  const seen = new Set();
  const add = (pts) => {
    const key = pts.map((p) => `${p.x},${p.z}`).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(pts);
  };

  const direct = buildAlignedConnectorPath(startA, endB, outA, inB, straightMin);
  add(direct);

  for (const town of towns) {
    let blocks = false;
    for (let i = 1; i < direct.length; i++) {
      if (segmentCrossesTownFootprint(
        direct[i - 1].x, direct[i - 1].z, direct[i].x, direct[i].z, town,
      )) {
        blocks = true;
        break;
      }
    }
    if (!blocks) continue;
    for (const route of bypassRoutesAround(startA, endB, outA, inB, straightMin, town)) {
      add(route);
    }
  }
  return candidates;
}

/**
 * Manhattan route: first leg follows outDir, final step follows inDir into the stub.
 */
function buildAlignedConnectorPath(start, end, outDir, inDir, straightMin) {
  const outH = outDir.dx !== 0;
  const inH = inDir.dx !== 0;
  const approach = { x: end.x - inDir.dx, z: end.z - inDir.dz };

  if (outH && start.z === end.z && inH) {
    return legCenterline(start.x, start.z, end.x, end.z, true);
  }
  if (!outH && start.x === end.x && !inH) {
    return legCenterline(start.x, start.z, end.x, end.z, false);
  }

  const mid = {
    x: start.x + outDir.dx * straightMin,
    z: start.z + outDir.dz * straightMin,
  };

  if (!outH && !inH) {
    return joinLegPoints(
      legCenterline(start.x, start.z, mid.x, mid.z, false),
      legCenterline(mid.x, mid.z, approach.x, mid.z, true),
      legCenterline(approach.x, mid.z, approach.x, approach.z, false),
      legCenterline(approach.x, approach.z, end.x, end.z, false),
    );
  }

  if (outH && inH) {
    return joinLegPoints(
      legCenterline(start.x, start.z, mid.x, mid.z, true),
      legCenterline(mid.x, mid.z, approach.x, mid.z, false),
      legCenterline(approach.x, mid.z, approach.x, approach.z, true),
      legCenterline(approach.x, approach.z, end.x, end.z, true),
    );
  }

  if (outH && !inH) {
    return joinLegPoints(
      legCenterline(start.x, start.z, mid.x, mid.z, true),
      legCenterline(mid.x, mid.z, approach.x, mid.z, true),
      legCenterline(approach.x, mid.z, approach.x, approach.z, false),
      legCenterline(approach.x, approach.z, end.x, end.z, false),
    );
  }

  return joinLegPoints(
    legCenterline(start.x, start.z, mid.x, mid.z, false),
    legCenterline(mid.x, mid.z, approach.x, mid.z, true),
    legCenterline(approach.x, mid.z, approach.x, approach.z, false),
    legCenterline(approach.x, approach.z, end.x, end.z, true),
  );
}

function scoreConnectorLeg(points, towns, townA, townB) {
  let score = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    for (const town of towns) {
      if (isInBlockedTownHighwayArea(p.x, p.z, town)) score += TOWN_INTERIOR_PENALTY;
    }
  }
  for (let i = 1; i < points.length; i++) {
    for (const town of towns) {
      if (segmentCrossesBlockedTownArea(
        points[i - 1].x, points[i - 1].z, points[i].x, points[i].z, town,
      )) score += TOWN_INTERIOR_PENALTY;
    }
  }
  return score;
}

function scoreConnectorAlignment(points, townA, epA) {
  const outA = outwardDir(townA, epA);
  let score = 0;
  for (let i = 1; i < Math.min(6, points.length); i++) {
    const p = points[i];
    if (outA.dx !== 0 && p.z !== epA.z) score += 40;
    if (outA.dz !== 0 && p.x !== epA.x) score += 40;
  }
  return score;
}

function legLeavesStub(points, town, ep) {
  if (points.length < 2) return true;
  const out = outwardDir(town, ep);
  const a = points[0];
  const b = points[1];
  if (out.dx !== 0) {
    return b.z === a.z && Math.sign(b.x - a.x) === out.dx;
  }
  return b.x === a.x && Math.sign(b.z - a.z) === out.dz;
}

function legArrivesStub(points, town, ep) {
  if (points.length < 2) return true;
  const out = outwardDir(town, ep);
  const inD = { dx: -out.dx, dz: -out.dz };
  const b = points[points.length - 1];
  const a = points[points.length - 2];
  if (inD.dx !== 0) {
    return b.z === a.z && Math.sign(b.x - a.x) === inD.dx;
  }
  return b.x === a.x && Math.sign(b.z - a.z) === inD.dz;
}

function buildConnectorLeg(epA, epB, townA, townB, towns, seed, ai, bi) {
  const startA = stubLeavePoint(townA, epA);
  const endB = stubArrivePoint(townB, epB);
  const outA = outwardDir(townA, epA);
  const inB = { dx: -outwardDir(townB, epB).dx, dz: -outwardDir(townB, epB).dz };
  const candidates = buildConnectorCandidates(
    startA, endB, outA, inB, CONNECTOR_STRAIGHT_MIN, towns, townA, townB,
  );

  let pool = candidates.filter((pts) => legLeavesStub(pts, townA, epA));
  if (!pool.length) pool = candidates;
  const arriveOk = pool.filter((pts) => legArrivesStub(pts, townB, epB));
  if (arriveOk.length) pool = arriveOk;

  let best = pool[0];
  let bestScore = Infinity;
  for (let i = 0; i < pool.length; i++) {
    const pts = pool[i];
    let score = scoreConnectorLeg(pts, towns, townA, townB);
    score += scoreConnectorAlignment(pts, townA, epA);
    score += hash01(seed, 700 + ai * 17 + bi * 23 + i * 9) * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = pts;
    }
  }
  return best;
}

/** Drop connector tiles inside any town street grid — highways only touch town edges. */
function clipTownInteriorPoints(points, towns, epA, epB) {
  if (points.length <= 2) return points;
  /** @type {{ x:number, z:number }[]} */
  const out = [];
  for (const p of points) {
    const isEndpoint = (p.x === epA.x && p.z === epA.z) || (p.x === epB.x && p.z === epB.z);
    if (isEndpoint) {
      out.push(p);
      continue;
    }
    let interior = false;
    for (const town of towns) {
      if (isInTownInterior(p.x, p.z, town)) {
        interior = true;
        break;
      }
    }
    if (!interior) out.push(p);
  }
  if (out.length === 0) return points.slice(0, 1);
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (tail.x !== last.x || tail.z !== last.z) out.push(last);
  return out;
}

/** Re-insert L-turn steps; prefer continuing the previous segment axis for clean merges. */
function ensureManhattanPath(points, preferHFirst = null) {
  if (points.length < 2) return points;
  /** @type {{ x:number, z:number }[]} */
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    if (prev.x === cur.x && prev.z === cur.z) continue;
    if (prev.x !== cur.x && prev.z !== cur.z) {
      let hFirst = preferHFirst;
      if (hFirst == null && out.length >= 2) {
        const before = out[out.length - 2];
        hFirst = before.z === prev.z;
      }
      if (hFirst == null) {
        hFirst = Math.abs(cur.x - prev.x) >= Math.abs(cur.z - prev.z);
      }
      const bridge = legCenterline(prev.x, prev.z, cur.x, cur.z, hFirst);
      for (let j = 1; j < bridge.length; j++) out.push(bridge[j]);
    } else {
      out.push(cur);
    }
  }
  return out;
}

/** Remove any highway tiles that landed inside a town footprint. */
function scrubInteriorHighwayTiles(tiles, towns) {
  for (const key of [...tiles]) {
    const [x, z] = key.split(',').map(Number);
    if (isHighwayPaintBlocked(x, z, towns)) tiles.delete(key);
  }
}

function bevelNearTownFootprint(x, z, towns, margin = 3) {
  for (const town of towns) {
    const b = townLayoutBounds(town);
    if (
      x >= b.minX - margin && x <= b.maxX + margin
      && z >= b.minZ - margin && z <= b.maxZ + margin
    ) return true;
  }
  return false;
}

function paintHighwayAvoidingTownInteriors(points, tiles, towns, width, opts = {}) {
  if (points.length < 2) return;
  const bevel = opts.bevel !== false;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const temp = new Set();
    paintRoadStrip(temp, a.x, a.z, b.x, b.z, width);
    for (const key of temp) {
      const [x, z] = key.split(',').map(Number);
      if (isHighwayPaintBlocked(x, z, towns)) continue;
      tiles.add(key);
    }
  }

  if (!bevel || points.length < 3) return;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (bevelNearTownFootprint(cur.x, cur.z, towns)) continue;
    const dIn = segmentDir(prev, cur);
    const dOut = segmentDir(cur, next);
    if (dIn.dx === dOut.dx && dIn.dz === dOut.dz) continue;
    if (dIn.dx !== 0 && dOut.dx !== 0) continue;
    if (dIn.dz !== 0 && dOut.dz !== 0) continue;
    applyBevelCorner(tiles, cur.x, cur.z, dIn, dOut, width);
    scrubInteriorHighwayTiles(tiles, towns);
  }
}

function paintTownMainArtery(roadTiles, town) {
  const ep = townEndpoints(town);
  if (town.axis === 'h') {
    paintRoadStrip(roadTiles, ep.neg.x, town.tz, ep.pos.x, town.tz, HIGHWAY_WIDTH_TILES);
  } else {
    paintRoadStrip(roadTiles, town.tx, ep.neg.z, town.tx, ep.pos.z, HIGHWAY_WIDTH_TILES);
  }
}

function buildRoadNetwork() {
  return {
    roadPaths: [],
    roadTileSet: new Set(),
    towns: [],
    mainPoints: [],
    bounds: {
      minTx: -1e9,
      maxTx: 1e9,
      minTz: -1e9,
      maxTz: 1e9,
    },
  };
}

/** Deterministic town anchor for one region cell — no inter-town highways. */
export function getTownAnchorAtRegion(gx, gz) {
  const seed = getWorldSeed();
  const guaranteed = gx === 0 && gz === 0;
  if (guaranteed) {
    return {
      id: 'r0_0',
      tx: HIGHWAY_SPAWN_TX,
      tz: HIGHWAY_SPAWN_TZ,
      axis: hash01(seed, 41) < 0.5 ? 'h' : 'v',
      kind: 'main',
      half: rollTownHalf(seed, HIGHWAY_SPAWN_TX, HIGHWAY_SPAWN_TZ, 0),
    };
  }
  if (hash01(seed, gx * 919 + gz * 733) > TOWN_REGION_CHANCE) return null;

  const jitterX = (hash01(seed, gx * 17 + gz * 31 + 100) - 0.5) * TOWN_REGION_TILES * 0.44;
  const jitterZ = (hash01(seed, gx * 23 + gz * 37 + 100) - 0.5) * TOWN_REGION_TILES * 0.44;
  const tx = Math.round(gx * TOWN_REGION_TILES + TOWN_REGION_TILES * 0.5 + jitterX);
  const tz = Math.round(gz * TOWN_REGION_TILES + TOWN_REGION_TILES * 0.5 + jitterZ);

  return {
    id: `r${gx}_${gz}`,
    tx,
    tz,
    axis: hash01(seed, gx * 41 + gz * 43) < 0.5 ? 'h' : 'v',
    kind: 'main',
    half: rollTownHalf(seed, tx, tz, gx * 1000 + gz),
  };
}

/** Nearby procedural town anchors (region cells around a tile). */
export function getNearbyTownAnchors(tx, tz, regionRadius = 2) {
  const gx0 = Math.floor(tx / TOWN_REGION_TILES) - regionRadius;
  const gx1 = Math.floor(tx / TOWN_REGION_TILES) + regionRadius;
  const gz0 = Math.floor(tz / TOWN_REGION_TILES) - regionRadius;
  const gz1 = Math.floor(tz / TOWN_REGION_TILES) + regionRadius;
  const out = [];
  for (let gz = gz0; gz <= gz1; gz++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const anchor = getTownAnchorAtRegion(gx, gz);
      if (anchor) out.push(anchor);
    }
  }
  return out;
}

export function getRoadNetwork() {
  const seed = getWorldSeed();
  if (_cacheSeed === seed && _cache) return _cache;
  _cacheSeed = seed;
  _cache = buildRoadNetwork();
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

export function isInWorldBoundsTile() {
  return true;
}

export function chunkOverlapsWorldBounds() {
  return true;
}

export function clampWorldPosition(x, z) {
  return { x, z };
}

export function getHighwayPlayerSpawn() {
  const anchor = getTownAnchorAtRegion(0, 0);
  if (anchor) {
    return {
      x: anchor.tx * TILE + TILE * 0.5,
      z: (anchor.tz + 10) * TILE + TILE * 0.5,
    };
  }
  return { x: TILE * 0.5, z: TILE * 0.5 };
}

export function isHighwayTile(tx, tz) {
  return getRoadNetwork().roadTileSet.has(`${tx},${tz}`);
}

export const ROAD_CLEARANCE_TILES = 2;

export function isNearHighwayTile(tx, tz, clearance = ROAD_CLEARANCE_TILES) {
  for (let dz = -clearance; dz <= clearance; dz++) {
    for (let dx = -clearance; dx <= clearance; dx++) {
      if (isHighwayTile(tx + dx, tz + dz)) return true;
    }
  }
  return false;
}

export function getLocalRoadBand(tx, tz, radius = 12) {
  const { roadTileSet } = getRoadNetwork();
  /** @type {{tx:number,tz:number}[]} */
  const local = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const nx = tx + dx;
      const nz = tz + dz;
      if (roadTileSet.has(`${nx},${nz}`)) local.push({ tx: nx, tz: nz });
    }
  }
  if (local.length === 0) return null;

  let hRun = 0;
  let vRun = 0;
  for (let dx = -radius; dx <= radius; dx++) {
    if (roadTileSet.has(`${tx + dx},${tz}`)) hRun++;
  }
  for (let dz = -radius; dz <= radius; dz++) {
    if (roadTileSet.has(`${tx},${tz + dz}`)) vRun++;
  }
  const axis = hRun >= vRun ? 'h' : 'v';

  let minTx = Infinity;
  let maxTx = -Infinity;
  let minTz = Infinity;
  let maxTz = -Infinity;

  if (axis === 'h') {
    let bandMinTz = Infinity;
    let bandMaxTz = -Infinity;
    for (let dz = -2; dz <= 2; dz++) {
      if (roadTileSet.has(`${tx},${tz + dz}`)) {
        bandMinTz = Math.min(bandMinTz, tz + dz);
        bandMaxTz = Math.max(bandMaxTz, tz + dz);
      }
    }
    if (!Number.isFinite(bandMinTz)) {
      const pad = Math.floor(HIGHWAY_WIDTH_TILES / 2);
      bandMinTz = tz - pad;
      bandMaxTz = tz + pad;
    } else if (bandMaxTz - bandMinTz + 1 > HIGHWAY_WIDTH_TILES) {
      const pad = Math.floor(HIGHWAY_WIDTH_TILES / 2);
      bandMinTz = tz - pad;
      bandMaxTz = tz + pad;
    }
    for (const t of local) {
      if (t.tz < bandMinTz || t.tz > bandMaxTz) continue;
      minTx = Math.min(minTx, t.tx);
      maxTx = Math.max(maxTx, t.tx);
      minTz = Math.min(minTz, t.tz);
      maxTz = Math.max(maxTz, t.tz);
    }
    minTz = bandMinTz;
    maxTz = bandMaxTz;
  } else {
    let bandMinTx = Infinity;
    let bandMaxTx = -Infinity;
    for (let dx = -2; dx <= 2; dx++) {
      if (roadTileSet.has(`${tx + dx},${tz}`)) {
        bandMinTx = Math.min(bandMinTx, tx + dx);
        bandMaxTx = Math.max(bandMaxTx, tx + dx);
      }
    }
    if (!Number.isFinite(bandMinTx)) {
      const pad = Math.floor(HIGHWAY_WIDTH_TILES / 2);
      bandMinTx = tx - pad;
      bandMaxTx = tx + pad;
    } else if (bandMaxTx - bandMinTx + 1 > HIGHWAY_WIDTH_TILES) {
      const pad = Math.floor(HIGHWAY_WIDTH_TILES / 2);
      bandMinTx = tx - pad;
      bandMaxTx = tx + pad;
    }
    for (const t of local) {
      if (t.tx < bandMinTx || t.tx > bandMaxTx) continue;
      minTx = Math.min(minTx, t.tx);
      maxTx = Math.max(maxTx, t.tx);
      minTz = Math.min(minTz, t.tz);
      maxTz = Math.max(maxTz, t.tz);
    }
    minTx = bandMinTx;
    maxTx = bandMaxTx;
  }

  if (!Number.isFinite(minTx)) return null;
  return { axis, minTx, maxTx, minTz, maxTz };
}

export function nearestRoadEdge(tx, tz) {
  const { roadTileSet } = getRoadNetwork();
  let best = null;
  let bestD = Infinity;
  for (const key of roadTileSet) {
    const [rx, rz] = key.split(',').map(Number);
    const d = Math.abs(rx - tx) + Math.abs(rz - tz);
    if (d < bestD) {
      bestD = d;
      best = { rx, rz };
    }
  }
  return best;
}

export function collectHighwayTilesInChunk(cx, cz) {
  const minTx = cx * CHUNK_TILES;
  const maxTx = minTx + CHUNK_TILES - 1;
  const minTz = cz * CHUNK_TILES;
  const maxTz = minTz + CHUNK_TILES - 1;
  const out = [];
  for (let tz = minTz; tz <= maxTz; tz++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (isHighwayTile(tx, tz)) out.push({ tx, tz, kind: ROAD_KIND });
    }
  }
  return out;
}

export function getTownSiteById(id) {
  const match = /^r(-?\d+)_(-?\d+)$/.exec(id);
  if (!match) return null;
  return getTownAnchorAtRegion(Number(match[1]), Number(match[2]));
}

export function getTownsInChunk(cx, cz) {
  const minTx = cx * CHUNK_TILES;
  const maxTx = minTx + CHUNK_TILES - 1;
  const minTz = cz * CHUNK_TILES;
  const maxTz = minTz + CHUNK_TILES - 1;
  const pad = TOWN_HALF_TILES_MAX + 48;
  const minGx = Math.floor((minTx - pad) / TOWN_REGION_TILES);
  const maxGx = Math.floor((maxTx + pad) / TOWN_REGION_TILES);
  const minGz = Math.floor((minTz - pad) / TOWN_REGION_TILES);
  const maxGz = Math.floor((maxTz + pad) / TOWN_REGION_TILES);
  const towns = [];
  for (let gz = minGz; gz <= maxGz; gz++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      const anchor = getTownAnchorAtRegion(gx, gz);
      if (anchor) towns.push(anchor);
    }
  }
  return towns;
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
