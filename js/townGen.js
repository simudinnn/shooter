import { TILE, hash01 } from './worldGen.js';
import {
  HIGHWAY_WIDTH_TILES,
  collectTownStreetTiles,
  getLocalRoadBand,
  getNearbyTownAnchors,
  isHighwayTile,
  nearestRoadEdge,
  townHalf,
} from './highwayGen.js';
import { paintRoadStripToList, fillCollinearRoadGaps, applyBevelJunction } from './roadPaint.js';

export const BUILDING_ROLE = {
  HALL: 'hall',
  HOUSE: 'house',
  STORE: 'store',
  HOSPITAL: 'hospital',
  BAR: 'bar',
};

export const TOWN_MIN_HOUSES = 10;
export const TOWN_MAX_HOUSES = 24;
export const TOWN_INNER_MIN_HOUSES = 3;
export const TOWN_INNER_MAX_HOUSES = 5;

export const WALL_ROAD_GAP_MIN = 1;
export const WALL_ROAD_GAP_MAX = 2;

export const TOWN_STREET_WIDTH = HIGHWAY_WIDTH_TILES;
export const TOWN_SPUR_LENGTH = 14;
export const TOWN_CROSS_HALF_TILES = 24;
export const TOWN_EXCLUSION_RADIUS = 48;

const TOWN_HOUSE_SIZES = [
  { w: 5, h: 4 },
  { w: 5, h: 4 },
  { w: 5, h: 4 },
  { w: 6, h: 4 },
  { w: 5, h: 4 },
];

function rollTownHouseSize(seedA, seedB) {
  return TOWN_HOUSE_SIZES[Math.floor(hash01(seedA, seedB) * TOWN_HOUSE_SIZES.length)];
}

const HALL_SIZE = { w: 7, h: 5 };
const STORE_SIZE = { w: 6, h: 4 };
export const TOWN_BUILDING_GAP = 4;
const PATH_KIND = 'path';
const ROAD_KIND = 'road';

function lotRect(tx, tz, w, h) {
  return { minTx: tx, minTz: tz, maxTx: tx + w, maxTz: tz + h };
}

function rectsOverlap(a, b, gap = 0) {
  return !(
    b.minTx >= a.maxTx + gap
    || a.minTx >= b.maxTx + gap
    || b.minTz >= a.maxTz + gap
    || a.minTz >= b.maxTz + gap
  );
}

function wallRoadGap(seedA, seedB, salt = 0) {
  return WALL_ROAD_GAP_MIN
    + Math.floor(hash01(seedA + salt, seedB + salt * 5) * (WALL_ROAD_GAP_MAX - WALL_ROAD_GAP_MIN + 1));
}

export function detectRoadAxisAt(tx, tz) {
  const band = getLocalRoadBand(tx, tz);
  return band?.axis ?? 'h';
}

function isTownRoad(tx, tz, roadKeys) {
  return roadKeys.has(`${tx},${tz}`) || isHighwayTile(tx, tz);
}

function footprintOverlapsRoad(tx, tz, w, h, roadKeys) {
  for (let dz = 0; dz < h; dz++) {
    for (let dx = 0; dx < w; dx++) {
      if (isTownRoad(tx + dx, tz + dz, roadKeys)) return true;
    }
  }
  return false;
}

function canPlaceLot(tx, tz, w, h, placed, roadKeys, gap = TOWN_BUILDING_GAP) {
  const fp = lotRect(tx, tz, w, h);
  if (footprintOverlapsRoad(tx, tz, w, h, roadKeys)) return false;
  for (const prev of placed) {
    if (rectsOverlap(fp, prev, gap)) return false;
  }
  return true;
}

function inOtherTownZone(tx, tz, anchorId) {
  const nearby = getNearbyTownAnchors(tx, tz, 2);
  const self = nearby.find((t) => t.id === anchorId);
  if (!self) return false;
  const selfDist = Math.abs(self.tx - tx) + Math.abs(self.tz - tz);
  for (const t of nearby) {
    if (t.id === anchorId) continue;
    const d = Math.abs(t.tx - tx) + Math.abs(t.tz - tz);
    if (d < TOWN_EXCLUSION_RADIUS && d < selfDist) return true;
  }
  return false;
}

function syntheticRoadBand(tx, tz, axis) {
  const pad = Math.floor(HIGHWAY_WIDTH_TILES / 2);
  if (axis === 'v') {
    return {
      axis: 'v',
      rx: tx,
      rz: tz,
      minTx: tx - pad,
      maxTx: tx + pad,
      minTz: tz - townHalf({ half: TOWN_CROSS_HALF_TILES }),
      maxTz: tz + townHalf({ half: TOWN_CROSS_HALF_TILES }),
    };
  }
  return {
    axis: 'h',
    rx: tx,
    rz: tz,
    minTx: tx - townHalf({ half: TOWN_CROSS_HALF_TILES }),
    maxTx: tx + townHalf({ half: TOWN_CROSS_HALF_TILES }),
    minTz: tz - pad,
    maxTz: tz + pad,
  };
}

/** Pick spur anchor — center or at cross-street end (edge variety). */
function pickSpurAlongCross(center, minEnd, maxEnd, seedA, seedB, salt) {
  const roll = hash01(seedA + salt, seedB + salt * 11);
  if (roll < 0.34) return { coord: center, edge: 'center' };
  if (roll < 0.67) return { coord: minEnd, edge: 'min' };
  return { coord: maxEnd, edge: 'max' };
}

function spurColumnX(pick) {
  return pick.coord;
}

function spurColumnZ(pick) {
  return pick.coord;
}

/** @typedef {{ dx:number, dz:number }} RoadDir */

function segmentAtVertex(seg, vx, vz) {
  const isEnd = vx === seg.x1 && vz === seg.z1;
  const dx = Math.sign(seg.x1 - seg.x0);
  const dz = Math.sign(seg.z1 - seg.z0);
  if (dx === 0 && dz === 0) return null;
  if (dz === 0) {
    return { dx: isEnd ? dx : -dx, dz: 0 };
  }
  return { dx: 0, dz: isEnd ? dz : -dz };
}

/** Square off perpendicular town-road crossings for clean 90° merges. */
function bevelTownRoadJunctions(roadKeys, segments, width) {
  /** @type {Map<string, { horizontal:boolean, dir:RoadDir }[]>} */
  const arms = new Map();
  for (const seg of segments) {
    const horizontal = seg.z0 === seg.z1;
    for (const [vx, vz] of [[seg.x0, seg.z0], [seg.x1, seg.z1]]) {
      const dir = segmentAtVertex(seg, vx, vz);
      if (!dir) continue;
      const key = `${vx},${vz}`;
      if (!arms.has(key)) arms.set(key, []);
      arms.get(key).push({ horizontal, dir });
    }
  }
  for (const [key, list] of arms) {
    if (list.length < 2) continue;
    const horiz = list.filter((a) => a.horizontal);
    const vert = list.filter((a) => !a.horizontal);
    if (!horiz.length || !vert.length) continue;
    const [vx, vz] = key.split(',').map(Number);
    for (const h of horiz) {
      for (const v of vert) {
        applyBevelJunction(roadKeys, vx, vz, h.dir, v.dir, width);
      }
    }
  }
}

function townRoadTilesFromKeys(roadKeys) {
  const roadTiles = [];
  for (const key of roadKeys) {
    const [tx, tz] = key.split(',').map(Number);
    if (isHighwayTile(tx, tz)) continue;
    roadTiles.push({ tx, tz });
  }
  return roadTiles;
}

/**
 * Reference town street layout (like US-45 diagram):
 * highway through center, north/south spurs + cross streets only (no parallel highway-side strips).
 */
function buildReferenceTownRoads(ax, az, band, seedA, seedB, half) {
  const roadKeys = new Set();
  const segments = [];
  /** @type {Record<string, number>} */
  const roadMeta = { axis: band.axis };

  const streetPad = Math.floor(TOWN_STREET_WIDTH / 2);
  const hwPad = Math.floor(HIGHWAY_WIDTH_TILES / 2);

  if (band.axis === 'h') {
    const spur = TOWN_SPUR_LENGTH;

    const northCrossZ = az - hwPad - spur - streetPad;
    const southCrossZ = az + hwPad + spur + streetPad;
    const westX = ax - half;
    const eastX = ax + half;
    const northPick = pickSpurAlongCross(ax, westX, eastX, seedA, seedB, 11);
    const southPick = pickSpurAlongCross(ax, westX, eastX, seedA, seedB, 22);
    const northSpurX = spurColumnX(northPick);
    const southSpurX = spurColumnX(southPick);

    roadMeta.northCrossZ = northCrossZ;
    roadMeta.southCrossZ = southCrossZ;
    roadMeta.northSpurX = northSpurX;
    roadMeta.southSpurX = southSpurX;
    roadMeta.westX = westX;
    roadMeta.eastX = eastX;

    segments.push(
      { x0: westX, z0: az, x1: eastX, z1: az },
      { x0: westX, z0: northCrossZ, x1: eastX, z1: northCrossZ },
      { x0: northSpurX, z0: northCrossZ, x1: northSpurX, z1: az },
      { x0: westX, z0: southCrossZ, x1: eastX, z1: southCrossZ },
      { x0: southSpurX, z0: southCrossZ, x1: southSpurX, z1: az },
    );
  } else {
    const spur = TOWN_SPUR_LENGTH;
    const westCrossX = ax - hwPad - spur - streetPad;
    const eastCrossX = ax + hwPad + spur + streetPad;
    const westZ = az - half;
    const eastZ = az + half;
    const westPick = pickSpurAlongCross(az, westZ, eastZ, seedA, seedB, 11);
    const eastPick = pickSpurAlongCross(az, westZ, eastZ, seedA, seedB, 22);
    const westSpurZ = spurColumnZ(westPick);
    const eastSpurZ = spurColumnZ(eastPick);

    roadMeta.westCrossX = westCrossX;
    roadMeta.eastCrossX = eastCrossX;
    roadMeta.westSpurZ = westSpurZ;
    roadMeta.eastSpurZ = eastSpurZ;
    roadMeta.westZ = westZ;
    roadMeta.eastZ = eastZ;

    segments.push(
      { x0: ax, z0: westZ, x1: ax, z1: eastZ },
      { x0: westCrossX, z0: westZ, x1: westCrossX, z1: eastZ },
      { x0: westCrossX, z0: westSpurZ, x1: ax, z1: westSpurZ },
      { x0: eastCrossX, z0: westZ, x1: eastCrossX, z1: eastZ },
      { x0: eastCrossX, z0: eastSpurZ, x1: ax, z1: eastSpurZ },
    );
  }

  for (const seg of segments) {
    paintRoadStripToList(
      roadKeys,
      roadKeys,
      [],
      seg.x0,
      seg.z0,
      seg.x1,
      seg.z1,
      TOWN_STREET_WIDTH,
    );
  }

  bevelTownRoadJunctions(roadKeys, segments, TOWN_STREET_WIDTH);

  fillCollinearRoadGaps(roadKeys, TOWN_STREET_WIDTH, 1);
  const roadTiles = townRoadTilesFromKeys(roadKeys);

  return { roadTiles, roadKeys, roadMeta: { ...roadMeta, segments, band } };
}

function southDoor(tx, tz, w, h, doorTx = Math.floor(w / 2), doorTz = h - 1) {
  return {
    doorX: tx + doorTx,
    doorZ: tz + doorTz + 1,
    doorTx,
    doorTz,
  };
}

function footprintBlocks(placed, px, pz) {
  for (const r of placed) {
    if (px >= r.minTx && px < r.maxTx && pz >= r.minTz && pz < r.maxTz) return true;
  }
  return false;
}

function pathTileBlocked(px, pz, roadKeys, placed) {
  if (isTownRoad(px, pz, roadKeys)) return true;
  if (footprintBlocks(placed, px, pz)) return true;
  return false;
}

function nearestRoadTarget(doorX, doorZ, roadKeys) {
  let bestX = doorX;
  let bestZ = doorZ;
  let bestD = Infinity;
  for (const key of roadKeys) {
    const [rx, rz] = key.split(',').map(Number);
    const d = Math.abs(rx - doorX) + Math.abs(rz - doorZ);
    if (d < bestD) {
      bestD = d;
      bestX = rx;
      bestZ = rz;
    }
  }
  return bestD === Infinity ? null : { x: bestX, z: bestZ };
}

/** Path from 1 tile south of the door: extend south, then east/west/south toward road (never north). */
function pathFromSouthDoorToRoad(doorX, doorZ, roadKeys, placed = []) {
  const target = nearestRoadTarget(doorX, doorZ, roadKeys);
  if (!target) return [];

  const path = [];
  const seen = new Set();
  const add = (px, pz) => {
    if (pathTileBlocked(px, pz, roadKeys, placed)) return false;
    const k = `${px},${pz}`;
    if (seen.has(k)) return false;
    seen.add(k);
    path.push({ tx: px, tz: pz });
    return true;
  };

  let x = doorX;
  let z = doorZ;
  add(x, z);

  let guard = 0;
  while (!isAdjacentToTownRoad(x, z, roadKeys) && guard < 32) {
    guard++;
    const nz = z + 1;
    if (pathTileBlocked(x, nz, roadKeys, placed)) break;
    if (!add(x, nz)) break;
    z = nz;
    if (isAdjacentToTownRoad(x, z, roadKeys)) return path;
  }

  while (!isAdjacentToTownRoad(x, z, roadKeys) && guard < 96) {
    guard++;
    if (z < target.z && !pathTileBlocked(x, z + 1, roadKeys, placed) && add(x, z + 1)) {
      z++;
      continue;
    }
    if (x < target.x && !pathTileBlocked(x + 1, z, roadKeys, placed) && add(x + 1, z)) {
      x++;
      continue;
    }
    if (x > target.x && !pathTileBlocked(x - 1, z, roadKeys, placed) && add(x - 1, z)) {
      x--;
      continue;
    }
    break;
  }
  return path;
}

/** Vertical towns: one tile south of the door, then straight east to the road. */
function pathEastFromSouthDoor(doorX, doorZ, roadKeys, placed = []) {
  const path = [];
  const seen = new Set();
  const add = (px, pz) => {
    if (pathTileBlocked(px, pz, roadKeys, placed)) return false;
    const k = `${px},${pz}`;
    if (seen.has(k)) return false;
    seen.add(k);
    path.push({ tx: px, tz: pz });
    return true;
  };

  let x = doorX;
  const z = doorZ;
  add(x, z);

  let guard = 0;
  while (!isAdjacentToTownRoad(x, z, roadKeys) && guard < 96) {
    guard++;
    if (!add(x + 1, z)) break;
    x++;
  }
  return path;
}

function pathForTownAxis(roadAxis) {
  return roadAxis === 'v' ? pathEastFromSouthDoor : pathFromSouthDoorToRoad;
}

function isAdjacentToTownRoad(tx, tz, roadKeys) {
  return (
    isTownRoad(tx + 1, tz, roadKeys)
    || isTownRoad(tx - 1, tz, roadKeys)
    || isTownRoad(tx, tz + 1, roadKeys)
    || isTownRoad(tx, tz - 1, roadKeys)
  );
}

function isAdjacentToHighway(tx, tz) {
  return (
    isHighwayTile(tx + 1, tz)
    || isHighwayTile(tx - 1, tz)
    || isHighwayTile(tx, tz + 1)
    || isHighwayTile(tx, tz - 1)
  );
}

function walkPathToTarget(doorX, doorZ, targetX, targetZ, roadKeys, isDone) {
  const path = [];
  const seen = new Set();
  const add = (px, pz) => {
    if (isTownRoad(px, pz, roadKeys)) return false;
    const k = `${px},${pz}`;
    if (seen.has(k)) return false;
    seen.add(k);
    path.push({ tx: px, tz: pz });
    return true;
  };

  let x = doorX;
  let z = doorZ;
  add(x, z);

  let guard = 0;
  while (!isDone(x, z) && guard < 96) {
    guard++;
    const prevX = x;
    const prevZ = z;
    if (Math.abs(targetX - x) >= Math.abs(targetZ - z)) {
      x += x < targetX ? 1 : -1;
    } else {
      z += z < targetZ ? 1 : -1;
    }
    if (x === prevX && z === prevZ) break;
    if (!add(x, z)) break;
  }
  return path;
}

/** Path from door to the nearest main-highway tile (ignores cross streets). */
function pathToMainRoad(doorX, doorZ, roadKeys) {
  let bestRx = doorX;
  let bestRz = doorZ;
  let bestD = Infinity;
  for (const key of roadKeys) {
    const [rx, rz] = key.split(',').map(Number);
    if (!isHighwayTile(rx, rz)) continue;
    const d = Math.abs(rx - doorX) + Math.abs(rz - doorZ);
    if (d < bestD) {
      bestD = d;
      bestRx = rx;
      bestRz = rz;
    }
  }
  if (bestD === Infinity) return pathToTownRoad(doorX, doorZ, roadKeys);
  return walkPathToTarget(doorX, doorZ, bestRx, bestRz, roadKeys, isAdjacentToHighway);
}

/** Path from door to the nearest road edge (straight approach). */
function pathToTownRoad(doorX, doorZ, roadKeys) {
  const path = [];
  const seen = new Set();
  const add = (px, pz) => {
    if (isTownRoad(px, pz, roadKeys)) return false;
    const k = `${px},${pz}`;
    if (seen.has(k)) return false;
    seen.add(k);
    path.push({ tx: px, tz: pz });
    return true;
  };

  let bestRx = doorX;
  let bestRz = doorZ;
  let bestD = Infinity;
  for (const key of roadKeys) {
    const [rx, rz] = key.split(',').map(Number);
    const d = Math.abs(rx - doorX) + Math.abs(rz - doorZ);
    if (d < bestD) {
      bestD = d;
      bestRx = rx;
      bestRz = rz;
    }
  }
  if (bestD === Infinity) return path;
  return walkPathToTarget(doorX, doorZ, bestRx, bestRz, roadKeys, (x, z) => isAdjacentToTownRoad(x, z, roadKeys));
}

function tryPlaceBuilding({
  tx, tz, w, h, role, doorTx, doorTz, doorX, doorZ,
  placed, roadKeys, addStreet, lots, anchor, pathFn, roadAxis,
}) {
  if (inOtherTownZone(tx, tz, anchor.id)) return false;
  if (!canPlaceLot(tx, tz, w, h, placed, roadKeys)) return false;

  const pickPath = pathFn ?? pathForTownAxis(roadAxis);
  const housePath = pickPath(doorX, doorZ, roadKeys, placed);
  placed.push(lotRect(tx, tz, w, h));
  for (const p of housePath) addStreet(p.tx, p.tz);
  lots.push({
    tx, tz, w, h, role, doorTx, doorTz, pathTiles: housePath,
  });
  return true;
}

function spurBlocksLot(tx, tz, w, h, spurCoords, axis) {
  const pad = Math.floor(TOWN_STREET_WIDTH / 2);
  for (const spur of spurCoords) {
    const spurMin = spur - pad;
    const spurMax = spur + pad;
    if (axis === 'h') {
      if (tx + w > spurMin && tx <= spurMax) return true;
    } else if (tz + h > spurMin && tz <= spurMax) return true;
  }
  return false;
}

function packAlongRow({
  start, end, step, fixedCoord, axis, gap, houseCount,
  seedA, seedB, placed, roadKeys, addStreet, lots, anchor, roadAxis, spurCoords = [],
}) {
  let placedCount = 0;
  let attempt = 0;
  const pathFn = pathForTownAxis(roadAxis);
  const streetPad = Math.floor(TOWN_STREET_WIDTH / 2);
  for (let c = start; c < end && placedCount < houseCount && attempt < 240; c += step, attempt++) {
    const size = rollTownHouseSize(seedA + c * 3, seedB + placedCount * 7 + attempt);
    let tx;
    let tz;
    let doorX;
    let doorZ;
    let doorTx;
    let doorTz;

    if (axis === 'h') {
      tx = c - Math.floor(size.w / 2);
      tz = fixedCoord - streetPad - gap - size.h;
    } else {
      tz = c - Math.floor(size.h / 2);
      tx = fixedCoord - streetPad - gap - size.w;
    }
    ({ doorX, doorZ, doorTx, doorTz } = southDoor(tx, tz, size.w, size.h));

    if (spurBlocksLot(tx, tz, size.w, size.h, spurCoords, axis === 'h' ? 'h' : 'v')) continue;

    if (tryPlaceBuilding({
      tx, tz, w: size.w, h: size.h, role: BUILDING_ROLE.HOUSE,
      doorTx, doorTz, doorX, doorZ,
      placed, roadKeys, addStreet, lots, anchor,
      pathFn, roadAxis,
    })) {
      placedCount++;
      c += (axis === 'h' ? size.w : size.h) + TOWN_BUILDING_GAP - step;
    }
  }
  return placedCount;
}

/** Houses between a cross street and the main highway (horizontal highway towns — north side). */
function packInnerHighwayRowH({
  startX, endX, highwayNorthZ, crossSouthZ, spurX, gap, houseCount,
  seedA, seedB, placed, roadKeys, addStreet, lots, anchor, roadAxis,
}) {
  let placedCount = 0;
  let attempt = 0;
  const spurPad = Math.floor(TOWN_STREET_WIDTH / 2);
  const spurMin = spurX - spurPad;
  const spurMax = spurX + spurPad;

  const innerGap = Math.max(1, gap - 1);

  for (let c = startX; c < endX && placedCount < houseCount && attempt < 120; c++, attempt++) {
    const size = rollTownHouseSize(seedA + c * 5, seedB + placedCount * 11 + attempt);
    const tx = c - Math.floor(size.w / 2);
    const tz = highwayNorthZ - innerGap - size.h;

    if (tz < crossSouthZ + innerGap) continue;
    if (tx + size.w > spurMin && tx <= spurMax) continue;

    const { doorX, doorZ, doorTx, doorTz } = southDoor(tx, tz, size.w, size.h);
    if (tryPlaceBuilding({
      tx, tz, w: size.w, h: size.h, role: BUILDING_ROLE.HOUSE,
      doorTx, doorTz, doorX, doorZ,
      placed, roadKeys, addStreet, lots, anchor,
      roadAxis,
    })) {
      placedCount++;
      c += size.w + TOWN_BUILDING_GAP - 1;
    }
  }
  return placedCount;
}

/** Houses between a cross street and the main highway (vertical highway towns — west side). */
function packInnerHighwayRowV({
  startZ, endZ, highwayWestX, crossEastX, spurZ, gap, houseCount,
  seedA, seedB, placed, roadKeys, addStreet, lots, anchor, roadAxis,
}) {
  let placedCount = 0;
  let attempt = 0;
  const spurPad = Math.floor(TOWN_STREET_WIDTH / 2);
  const spurMin = spurZ - spurPad;
  const spurMax = spurZ + spurPad;

  const innerGap = Math.max(1, gap - 1);

  for (let c = startZ; c < endZ && placedCount < houseCount && attempt < 120; c++, attempt++) {
    const size = rollTownHouseSize(seedA + c * 5, seedB + placedCount * 11 + attempt);
    const tx = highwayWestX - innerGap - size.w;
    const tz = c - Math.floor(size.h / 2);

    if (tx < crossEastX + innerGap) continue;
    if (tz + size.h > spurMin && tz <= spurMax) continue;

    const { doorX, doorZ, doorTx, doorTz } = southDoor(tx, tz, size.w, size.h);
    if (tryPlaceBuilding({
      tx, tz, w: size.w, h: size.h, role: BUILDING_ROLE.HOUSE,
      doorTx, doorTz, doorX, doorZ,
      placed, roadKeys, addStreet, lots, anchor,
      roadAxis,
    })) {
      placedCount++;
      c += size.h + TOWN_BUILDING_GAP - 1;
    }
  }
  return placedCount;
}

/** Houses north of a horizontal town highway — paths run south to the main road. */
function packAlongHighwaySideH({
  startX, endX, band, spurCoords, gap, houseCount,
  seedA, seedB, placed, roadKeys, addStreet, lots, anchor, roadAxis,
}) {
  let placedCount = 0;
  let attempt = 0;
  const toMain = pathFromSouthDoorToRoad;

  for (let x = startX; x < endX && placedCount < houseCount && attempt < 240; x++, attempt++) {
    const size = rollTownHouseSize(seedA + x * 3, seedB + placedCount * 7 + attempt);
    const tx = x - Math.floor(size.w / 2);
    const tz = band.minTz - gap - size.h;
    if (spurBlocksLot(tx, tz, size.w, size.h, spurCoords, 'h')) {
      x += size.w;
      continue;
    }

    const door = southDoor(tx, tz, size.w, size.h);

    if (tryPlaceBuilding({
      tx, tz, w: size.w, h: size.h, role: BUILDING_ROLE.HOUSE,
      doorTx: door.doorTx, doorTz: door.doorTz, doorX: door.doorX, doorZ: door.doorZ,
      placed, roadKeys, addStreet, lots, anchor,
      pathFn: toMain, roadAxis,
    })) {
      placedCount++;
      x += size.w + TOWN_BUILDING_GAP - 1;
    }
  }
  return placedCount;
}

/** Houses west of a vertical town highway — paths run east to the main road. */
function packAlongHighwaySideV({
  startZ, endZ, band, spurCoords, gap, houseCount,
  seedA, seedB, placed, roadKeys, addStreet, lots, anchor, roadAxis,
}) {
  let placedCount = 0;
  let attempt = 0;
  const toMain = pathEastFromSouthDoor;

  for (let z = startZ; z < endZ && placedCount < houseCount && attempt < 240; z++, attempt++) {
    const size = rollTownHouseSize(seedA + z * 3, seedB + placedCount * 7 + attempt);
    const tz = z - Math.floor(size.h / 2);
    const tx = band.minTx - gap - size.w;
    if (spurBlocksLot(tx, tz, size.w, size.h, spurCoords, 'v')) {
      z += size.h;
      continue;
    }

    const door = southDoor(tx, tz, size.w, size.h);

    if (tryPlaceBuilding({
      tx, tz, w: size.w, h: size.h, role: BUILDING_ROLE.HOUSE,
      doorTx: door.doorTx, doorTz: door.doorTz, doorX: door.doorX, doorZ: door.doorZ,
      placed, roadKeys, addStreet, lots, anchor,
      pathFn: toMain, roadAxis,
    })) {
      placedCount++;
      z += size.h + TOWN_BUILDING_GAP - 1;
    }
  }
  return placedCount;
}

/**
 * Town matching reference layout — highway hub, north hall + houses, south store + houses.
 */
export function rollTownLayoutAtAnchor(anchor, seedA, seedB) {
  let band = getLocalRoadBand(anchor.tx, anchor.tz);
  let ax = anchor.tx;
  let az = anchor.tz;
  if (!band) {
    const edge = nearestRoadEdge(ax, az);
    if (edge) {
      ax = edge.rx;
      az = edge.rz;
      band = getLocalRoadBand(ax, az);
    }
    if (!band) {
      band = syntheticRoadBand(ax, az, anchor.axis ?? (hash01(seedA, seedB) < 0.5 ? 'h' : 'v'));
    }
  }
  const gap = wallRoadGap(seedA, seedB, 0);
  const houseCount = TOWN_MIN_HOUSES
    + Math.floor(hash01(seedA, seedB + 99) * (TOWN_MAX_HOUSES - TOWN_MIN_HOUSES + 1));
  const highwayHouses = Math.ceil(houseCount * 0.5);
  const crossHouses = houseCount - highwayHouses;
  const northCrossHouses = Math.ceil(crossHouses * 0.5);
  const southCrossHouses = crossHouses - northCrossHouses;

  const streetKeys = new Set();
  const streetTiles = [];
  const addStreet = (tx, tz) => {
    if (isHighwayTile(tx, tz)) return;
    const key = `${tx},${tz}`;
    if (streetKeys.has(key)) return;
    streetKeys.add(key);
    streetTiles.push({ tx, tz });
  };

  const { roadTiles: townRoadTiles, roadKeys: townRoadKeys, roadMeta } = buildReferenceTownRoads(
    ax, az, band, seedA, seedB, townHalf(anchor),
  );
  const roadAxis = band.axis;
  const lots = [];
  const placed = [];
  const half = townHalf(anchor);

  if (roadAxis === 'h') {
    const { northCrossZ, southCrossZ, northSpurX, southSpurX } = roadMeta;
    const spurCoords = [northSpurX, southSpurX];
    const hwStart = ax - half + 3;
    const hwEnd = ax + half - 3;

    packAlongHighwaySideH({
      startX: hwStart, endX: hwEnd, band, spurCoords, gap,
      houseCount: highwayHouses,
      seedA: seedA + 80, seedB, placed, roadKeys: townRoadKeys, addStreet, lots, anchor, roadAxis,
    });

    packAlongRow({
      start: ax - half + 2, end: ax + half - 2, step: 1,
      fixedCoord: northCrossZ, axis: 'h', gap, houseCount: northCrossHouses,
      spurCoords,
      seedA, seedB, placed, roadKeys: townRoadKeys, addStreet, lots, anchor,
      roadAxis,
    });

    packAlongRow({
      start: ax - half + 2, end: ax + half - 2, step: 1,
      fixedCoord: southCrossZ, axis: 'h', gap, houseCount: southCrossHouses,
      spurCoords,
      seedA: seedA + 50, seedB: seedB + 50, placed, roadKeys: townRoadKeys, addStreet, lots, anchor,
      roadAxis,
    });
  } else {
    const { westCrossX, eastCrossX, westSpurZ, eastSpurZ } = roadMeta;
    const spurCoords = [westSpurZ, eastSpurZ];
    const hwStart = az - half + 3;
    const hwEnd = az + half - 3;

    packAlongHighwaySideV({
      startZ: hwStart, endZ: hwEnd, band, spurCoords, gap,
      houseCount: highwayHouses,
      seedA: seedA + 80, seedB, placed, roadKeys: townRoadKeys, addStreet, lots, anchor, roadAxis,
    });

    packAlongRow({
      start: az - half + 2, end: az + half - 2, step: 1,
      fixedCoord: westCrossX, axis: 'v', gap, houseCount: northCrossHouses,
      spurCoords,
      seedA, seedB, placed, roadKeys: townRoadKeys, addStreet, lots, anchor,
      roadAxis,
    });

    packAlongRow({
      start: az - half + 2, end: az + half - 2, step: 1,
      fixedCoord: eastCrossX, axis: 'v', gap, houseCount: southCrossHouses,
      spurCoords,
      seedA: seedA + 50, seedB: seedB + 50, placed, roadKeys: townRoadKeys, addStreet, lots, anchor,
      roadAxis,
    });
  }

  if (lots.length === 0) {
    return emptyLayout(anchor, ax, az, roadAxis, gap);
  }

  let minTx = Infinity;
  let minTz = Infinity;
  let maxTx = -Infinity;
  let maxTz = -Infinity;
  for (const lot of lots) {
    minTx = Math.min(minTx, lot.tx);
    minTz = Math.min(minTz, lot.tz);
    maxTx = Math.max(maxTx, lot.tx + lot.w);
    maxTz = Math.max(maxTz, lot.tz + lot.h);
  }

  const originTileX = minTx;
  const originTileZ = minTz;
  const relLots = lots.map((lot) => ({
    ox: lot.tx - minTx,
    oz: lot.tz - minTz,
    w: lot.w,
    h: lot.h,
    role: lot.role,
    doorTx: lot.doorTx,
    doorTz: lot.doorTz,
    pathTiles: lot.pathTiles,
  }));

  return {
    anchor,
    anchorId: anchor.id,
    anchorTx: ax,
    anchorTz: az,
    originTileX,
    originTileZ,
    lots: relLots,
    streetTiles,
    townRoadTiles,
    townRoadKeys,
    townW: maxTx - minTx,
    townDepth: maxTz - minTz,
    roadSetback: gap,
    roadAxis,
    roadBand: band,
  };
}

function emptyLayout(anchor, ax, az, roadAxis, gap) {
  return {
    anchor,
    anchorId: anchor.id,
    anchorTx: ax,
    anchorTz: az,
    originTileX: ax,
    originTileZ: az,
    lots: [],
    streetTiles: [],
    townRoadTiles: [],
    townRoadKeys: new Set(),
    townW: 1,
    townDepth: 1,
    roadSetback: gap,
    roadAxis,
    roadBand: null,
  };
}

function doorApproachTile(bx, bz, w, h, doorTx, doorTz) {
  return { doorX: bx + doorTx, doorZ: bz + doorTz + 1 };
}

function buildingFootprints(buildings, skipIndex = -1) {
  const placed = [];
  for (let i = 0; i < buildings.length; i++) {
    if (i === skipIndex) continue;
    const b = buildings[i];
    const bx = Math.round(b.originX / TILE);
    const bz = Math.round(b.originZ / TILE);
    placed.push(lotRect(bx, bz, b.w, b.h));
  }
  return placed;
}

export function collectPathTilesFromBuildings(buildings, layout) {
  const roadKeys = layout.townRoadKeys ?? new Set();
  if (roadKeys.size === 0) return [];

  const out = [];
  const seen = new Set();
  const add = (tx, tz) => {
    const k = `${tx},${tz}`;
    if (seen.has(k) || isTownRoad(tx, tz, roadKeys)) return;
    seen.add(k);
    out.push({ tx, tz, kind: PATH_KIND });
  };

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const bx = Math.round(b.originX / TILE);
    const bz = Math.round(b.originZ / TILE);
    const doorTx = b.doorTx ?? Math.floor(b.w / 2);
    const doorTz = b.doorTz ?? b.h - 1;
    const { doorX, doorZ } = doorApproachTile(bx, bz, b.w, b.h, doorTx, doorTz);

    const path = pathForTownAxis(layout.roadAxis)(
      doorX,
      doorZ,
      roadKeys,
      buildingFootprints(buildings, i),
    );
    for (const p of path) add(p.tx, p.tz);
  }
  return out;
}

export function collectTownPaintTiles(layout, buildings = []) {
  const tiles = [];
  const seen = new Set();
  const add = (tx, tz, kind) => {
    const k = `${tx},${tz},${kind}`;
    if (seen.has(k)) return;
    seen.add(k);
    tiles.push({ tx, tz, kind });
  };

  for (const t of layout.townRoadTiles ?? []) {
    if (isHighwayTile(t.tx, t.tz)) continue;
    add(t.tx, t.tz, ROAD_KIND);
  }

  if (buildings.length > 0) {
    for (const t of collectPathTilesFromBuildings(buildings, layout)) {
      add(t.tx, t.tz, PATH_KIND);
    }
  } else {
    for (const st of layout.streetTiles ?? []) {
      add(st.tx, st.tz, PATH_KIND);
    }
    for (const lot of layout.lots ?? []) {
      for (const p of lot.pathTiles ?? []) {
        add(p.tx, p.tz, PATH_KIND);
      }
    }
  }
  return tiles;
}

export function getTownFootprintTiles(layout) {
  const tiles = [];
  const seen = new Set();
  const add = (tx, tz) => {
    const k = `${tx},${tz}`;
    if (seen.has(k)) return;
    seen.add(k);
    tiles.push({ tx, tz });
  };
  for (const st of layout.townRoadTiles ?? []) add(st.tx, st.tz);
  for (const st of layout.streetTiles) add(st.tx, st.tz);
  for (const lot of layout.lots) {
    for (const p of lot.pathTiles ?? []) add(p.tx, p.tz);
    const bx = layout.originTileX + lot.ox;
    const bz = layout.originTileZ + lot.oz;
    for (let dz = 0; dz < lot.h; dz++) {
      for (let dx = 0; dx < lot.w; dx++) {
        add(bx + dx, bz + dz);
      }
    }
  }
  return tiles;
}

export function townOriginTiles(anchor, layout) {
  return {
    originTileX: layout.originTileX,
    originTileZ: layout.originTileZ,
    highwayZ: anchor.tz,
  };
}

export function paintTownStreets(world, layout, buildings) {
  const tiles = collectTownPaintTiles(layout, buildings);
  world.registerTownFloorTiles(tiles);
  world.paintFloorWorldTiles(tiles);

  for (let i = 0; i < layout.lots.length && i < buildings.length; i++) {
    buildings[i].buildingRole = layout.lots[i].role;
    buildings[i].townAnchorId = layout.anchorId;
    buildings[i].townAnchorTx = layout.anchorTx;
    buildings[i].townAnchorTz = layout.anchorTz;
  }
}

export function inferTownLayout(buildings) {
  if (buildings.length < 1) return null;
  const anchorTx = buildings[0].townAnchorTx
    ?? Math.round((buildings[0].originX + buildings[buildings.length - 1].originX) * 0.5 / TILE);
  const anchorTz = buildings[0].townAnchorTz ?? Math.round(buildings[0].originZ / TILE);
  const anchorId = buildings[0].townAnchorId ?? buildings[0].townId?.replace('town@', '') ?? 't0';
  const anchor = { id: anchorId, tx: anchorTx, tz: anchorTz, kind: 'main' };
  return rollTownLayoutAtAnchor(anchor, anchorTx * 41, anchorTz * 43);
}

export function repaintAllTownStreets(world, buildings) {
  const byTown = new Map();
  for (const b of buildings) {
    const id = b.townId
      ?? (b.townAnchorId != null ? `town@${b.townAnchorId}` : null)
      ?? (b.townAnchorTx != null ? `town@${b.townAnchorTx},${b.townAnchorTz ?? 0}` : null);
    if (!id) continue;
    if (!byTown.has(id)) byTown.set(id, []);
    byTown.get(id).push(b);
  }
  for (const group of byTown.values()) {
    if (group.length < 1) continue;
    const layout = inferTownLayout(group);
    if (!layout) continue;
    const tiles = collectTownPaintTiles(layout, group);
    world.registerTownFloorTiles(tiles);
    world.paintFloorWorldTiles(tiles);
  }
}

export const TOWN_ROAD_WIDTH_TILES = TOWN_STREET_WIDTH;
export const TOWN_PLACE_CHUNK_SPAN = 5;
