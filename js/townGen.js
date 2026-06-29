import { TILE, hash01 } from './worldGen.js';
import { rollBuildingSize } from './buildingTypes.js';
import { HIGHWAY_WIDTH_TILES, collectTownStreetTiles, getRoadNetwork, isHighwayTile } from './highwayGen.js';
import { BUILDING_MIN_GAP_TILES } from './buildingGen.js';

export const BUILDING_ROLE = {
  HALL: 'hall',
  HOUSE: 'house',
  STORE: 'store',
  HOSPITAL: 'hospital',
  BAR: 'bar',
};

export const TOWN_MIN_HOUSES = 10;
export const TOWN_MAX_HOUSES = 20;

const HALL_SIZE = { w: 7, h: 5 };
/** Branches that work with south-facing doors (no south branch — overlaps highway). */
const HOUSE_BRANCH_DIRS = ['n', 'e', 'w'];
const VERTICAL_BRANCH_DIRS = ['n', 's', 'e'];
const MIN_SLOT_STEP = 3;

function roadSetbackTiles(seedA, seedB) {
  return 4 + Math.floor(hash01(seedA + 50, seedB + 50) * 3);
}

function streetHouseGap(seedA, seedB, salt) {
  return 3 + Math.floor(hash01(seedA + salt, seedB + salt * 3) * 4);
}

const ROAD_LOT_CLEARANCE = 2;

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

export function detectRoadAxisAt(tx, tz) {
  const { roadTileSet } = getRoadNetwork();
  let hRun = 0;
  let vRun = 0;
  for (let dx = -5; dx <= 5; dx++) {
    if (roadTileSet.has(`${tx + dx},${tz}`)) hRun++;
  }
  for (let dz = -5; dz <= 5; dz++) {
    if (roadTileSet.has(`${tx},${tz + dz}`)) vRun++;
  }
  return hRun >= vRun ? 'h' : 'v';
}

function pickBranches(seedA, seedB, count, dirs = HOUSE_BRANCH_DIRS) {
  const scored = dirs.map((dir, i) => ({
    dir,
    score: hash01(seedA + i * 17, seedB + i * 23),
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, Math.min(count, dirs.length)).map((x) => x.dir);
}

function branchStreetAt(ax, az, dir, dist, setback, roadAxis = 'h') {
  const d = setback + dist;
  if (roadAxis === 'v') {
    switch (dir) {
      case 'n':
        return { tx: ax + 1, tz: az - d };
      case 's':
        return { tx: ax + 1, tz: az + HIGHWAY_WIDTH_TILES + d };
      case 'e':
        return { tx: ax + HIGHWAY_WIDTH_TILES + d, tz: az + 1 };
      case 'w':
        return { tx: ax - d, tz: az + 1 };
      default:
        return { tx: ax + 1, tz: az };
    }
  }
  switch (dir) {
    case 'n':
      return { tx: ax, tz: az - d };
    case 'e':
      return { tx: ax + HIGHWAY_WIDTH_TILES + d, tz: az + HIGHWAY_WIDTH_TILES + 1 };
    case 'w':
      return { tx: ax - d, tz: az + HIGHWAY_WIDTH_TILES + 1 };
    default:
      return { tx: ax, tz: az };
  }
}

/** House placement beside branch streets — south-facing doors. */
function houseBesideStreet(stx, stz, dir, side, w, h, gap) {
  switch (dir) {
    case 'n':
      return {
        tx: side < 0 ? stx - w - gap : stx + gap,
        tz: stz - h - gap,
        doorTx: Math.floor(w / 2),
      };
    case 'e':
    case 'w':
      return {
        tx: side < 0 ? stx - w - gap : stx + gap,
        tz: stz + gap,
        doorTx: Math.floor(w / 2),
      };
    case 's':
      return {
        tx: side < 0 ? stx - w - gap : stx + gap,
        tz: stz + gap,
        doorTx: Math.floor(w / 2),
      };
    default:
      return { tx: stx - w, tz: stz - h - gap, doorTx: Math.floor(w / 2) };
  }
}

function doorPathTiles(hx, hz, w, h, stx, stz) {
  const doorTx = Math.floor(w / 2);
  const path = [];
  const doorX = hx + doorTx;
  const doorSouthZ = hz + h;
  for (let tz = doorSouthZ; tz <= stz; tz++) {
    path.push({ tx: doorX, tz });
  }
  if (doorX !== stx) {
    const step = doorX < stx ? 1 : -1;
    for (let tx = doorX + step; tx !== stx + step; tx += step) {
      path.push({ tx, tz: stz });
    }
  }
  return path;
}

function overlapsRoadBand(tx, tz, w, h, ax, az, setback, roadAxis = 'h') {
  const band = roadAxis === 'v'
    ? {
      minTx: ax - setback,
      minTz: az - setback,
      maxTx: ax + HIGHWAY_WIDTH_TILES + setback,
      maxTz: az + setback,
    }
    : {
      minTx: ax - setback,
      minTz: az - setback,
      maxTx: ax + HIGHWAY_WIDTH_TILES + setback,
      maxTz: az + HIGHWAY_WIDTH_TILES + setback,
    };
  return rectsOverlap(lotRect(tx, tz, w, h), band, 0);
}

function footprintOverlapsRoad(tx, tz, w, h) {
  const pad = ROAD_LOT_CLEARANCE;
  for (let dz = -pad; dz < h + pad; dz++) {
    for (let dx = -pad; dx < w + pad; dx++) {
      if (isHighwayTile(tx + dx, tz + dz)) return true;
    }
  }
  return false;
}

function canPlaceLot(tx, tz, w, h, placed, ax, az, setback, roadAxis = 'h') {
  const fp = lotRect(tx, tz, w, h);
  if (overlapsRoadBand(tx, tz, w, h, ax, az, setback, roadAxis)) return false;
  if (footprintOverlapsRoad(tx, tz, w, h)) return false;
  for (const prev of placed) {
    if (rectsOverlap(fp, prev, BUILDING_MIN_GAP_TILES)) return false;
  }
  return true;
}

/**
 * Town at highway anchor — hall north of road, houses on branch streets with spacing.
 */
export function rollTownLayoutAtAnchor(anchor, seedA, seedB) {
  const roadAxis = anchor.kind === 'branch' ? detectRoadAxisAt(anchor.tx, anchor.tz) : 'h';
  const { tx: ax, tz: az } = anchor;
  const setback = roadSetbackTiles(seedA, seedB);
  const houseCount = TOWN_MIN_HOUSES
    + Math.floor(hash01(seedA, seedB + 99) * (TOWN_MAX_HOUSES - TOWN_MIN_HOUSES + 1));
  const branchCount = 2 + Math.floor(hash01(seedA + 7, seedB + 11) * 2);
  const branchDirs = pickBranches(
    seedA,
    seedB,
    branchCount,
    roadAxis === 'v' ? VERTICAL_BRANCH_DIRS : HOUSE_BRANCH_DIRS,
  );
  const branches = branchDirs.map((dir, bi) => ({
    dir,
    len: 18 + Math.floor(hash01(seedA + bi * 19, seedB + bi * 29) * 14),
  }));

  const streetKeys = new Set();
  const streetTiles = [];
  const addStreet = (tx, tz) => {
    const key = `${tx},${tz}`;
    if (streetKeys.has(key)) return;
    streetKeys.add(key);
    streetTiles.push({ tx, tz });
  };

  for (const br of branches) {
    for (let d = 1; d <= br.len; d++) {
      const st = branchStreetAt(ax, az, br.dir, d, setback, roadAxis);
      addStreet(st.tx, st.tz);
    }
  }

  const hallGap = streetHouseGap(seedA, seedB, 77);
  const hallTx = roadAxis === 'v'
    ? ax - setback - hallGap - HALL_SIZE.w
    : ax - Math.floor(HALL_SIZE.w / 2);
  const hallTz = roadAxis === 'v'
    ? az + 1 - Math.floor(HALL_SIZE.h / 2)
    : az - setback - hallGap - HALL_SIZE.h;
  const lots = [];
  const placed = [lotRect(hallTx, hallTz, HALL_SIZE.w, HALL_SIZE.h)];

  lots.push({
    tx: hallTx,
    tz: hallTz,
    w: HALL_SIZE.w,
    h: HALL_SIZE.h,
    role: BUILDING_ROLE.HALL,
    doorTx: Math.floor(HALL_SIZE.w / 2),
    pathTiles: [],
  });

  const usedSlots = new Set();
  let housesPlaced = 0;

  const tryPlaceHouse = (bi, slot, side, salt) => {
    const br = branches[bi];
    if (slot < 1 || slot > br.len) return false;
    const slotKey = `${br.dir}:${slot}:${side}`;
    if (usedSlots.has(slotKey)) return false;

    const gap = streetHouseGap(seedA, seedB, salt);
    const size = rollBuildingSize(seedA + salt * 3, seedB + salt * 5);
    const st = branchStreetAt(ax, az, br.dir, slot, setback, roadAxis);
    const place = houseBesideStreet(st.tx, st.tz, br.dir, side, size.w, size.h, gap);

    if (!canPlaceLot(place.tx, place.tz, size.w, size.h, placed, ax, az, setback, roadAxis)) return false;

    usedSlots.add(slotKey);
    placed.push(lotRect(place.tx, place.tz, size.w, size.h));
    addStreet(st.tx, st.tz);
    lots.push({
      tx: place.tx,
      tz: place.tz,
      w: size.w,
      h: size.h,
      role: BUILDING_ROLE.HOUSE,
      doorTx: place.doorTx,
      pathTiles: doorPathTiles(place.tx, place.tz, size.w, size.h, st.tx, st.tz),
    });
    housesPlaced++;
    return true;
  };

  let salt = 0;
  for (let bi = 0; bi < branches.length && housesPlaced < houseCount; bi++) {
    const br = branches[bi];
    const sides = (br.dir === 'e' || br.dir === 'w') ? [1] : [-1, 1];
    for (let slot = 1; slot <= br.len && housesPlaced < houseCount; slot += MIN_SLOT_STEP) {
      for (const side of sides) {
        if (housesPlaced >= houseCount) break;
        tryPlaceHouse(bi, slot, side, salt++);
      }
    }
  }

  let attempts = 0;
  while (housesPlaced < houseCount && attempts < houseCount * 20) {
    attempts++;
    const bi = Math.floor(hash01(seedA + attempts * 3, seedB + attempts) * branches.length);
    const br = branches[bi];
    const slot = 1 + Math.floor(hash01(seedA + attempts * 5, seedB + attempts * 7) * br.len);
    const side = (br.dir === 'e' || br.dir === 'w')
      ? 1
      : (hash01(seedA + attempts * 19, seedB + attempts * 23) > 0.5 ? -1 : 1);
    tryPlaceHouse(bi, slot, side, 1000 + attempts);
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
    townW: maxTx - minTx,
    townDepth: maxTz - minTz,
    roadSetback: setback,
    roadAxis,
  };
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
  const tiles = collectTownStreetTiles(layout.anchor, layout);
  world.paintFloorWorldTiles(tiles);

  for (let i = 0; i < layout.lots.length && i < buildings.length; i++) {
    buildings[i].buildingRole = layout.lots[i].role;
    buildings[i].townAnchorId = layout.anchorId;
    buildings[i].townAnchorTx = layout.anchorTx;
    buildings[i].townAnchorTz = layout.anchorTz;
  }
}

export function inferTownLayout(buildings) {
  if (buildings.length < 2) return null;
  const anchorTx = buildings[0].townAnchorTx
    ?? Math.round((buildings[0].originX + buildings[buildings.length - 1].originX) * 0.5 / TILE);
  const anchorTz = buildings[0].townAnchorTz ?? Math.round(buildings[0].originZ / TILE);
  const anchorId = buildings[0].townAnchorId ?? buildings[0].townId?.replace('town@', '') ?? 'm0';
  const originTileX = Math.min(...buildings.map((b) => Math.round(b.originX / TILE)));
  const originTileZ = Math.min(...buildings.map((b) => Math.round(b.originZ / TILE)));
  const lots = buildings.map((b) => ({
    ox: Math.round(b.originX / TILE) - originTileX,
    oz: Math.round(b.originZ / TILE) - originTileZ,
    w: b.w,
    h: b.h,
    doorTx: b.doorTx ?? Math.floor(b.w / 2),
    pathTiles: [],
  }));
  const anchor = { id: anchorId, tx: anchorTx, tz: anchorTz, kind: 'main' };
  const layout = rollTownLayoutAtAnchor(anchor, anchorTx * 41, anchorTz * 43);
  layout.lots = lots;
  layout.originTileX = originTileX;
  layout.originTileZ = originTileZ;
  return layout;
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
    if (group.length < 2) continue;
    const layout = inferTownLayout(group);
    if (!layout) continue;
    const tiles = collectTownStreetTiles(layout.anchor, layout);
    world.paintFloorWorldTiles(tiles);
  }
}

export const TOWN_ROAD_WIDTH_TILES = 3;
export const TOWN_PLACE_CHUNK_SPAN = 3;
