import { hash01, hash32 } from './worldGen.js';

const CELL_EMPTY = 0;
const CELL_WALL = 1;
const CELL_FLOOR = 2;
const CELL_DOOR = 3;

/** South-edge door row must span at least this many tiles (wall | door | wall). */
export const DOOR_EDGE_MIN_TILES = 3;

/** Five north/south wall materials — one per house. */
export const BUILDING_WALL_VARIANTS = [
  { wallNs: 'bld_wall_wood', wallCorner: 'bld_wall_wood' },
  { wallNs: 'bld_wall_brick', wallCorner: 'bld_wall_brick' },
  { wallNs: 'bld_wall_gray', wallCorner: 'bld_wall_gray' },
  { wallNs: 'bld_wall_blue', wallCorner: 'bld_wall_blue' },
  { wallNs: 'bld_wall_white_wood', wallCorner: 'bld_wall_white_wood' },
];

/** Three roof palettes — one per house. */
export const BUILDING_ROOF_VARIANTS = [
  { roofFill: 'bld_roof_brown', roofEdge: 'bld_roof_brown_edge' },
  { roofFill: 'bld_roof_red', roofEdge: 'bld_roof_red_edge' },
  { roofFill: 'bld_roof_blue', roofEdge: 'bld_roof_blue_edge' },
];

/** Three floor materials — one per house (base + alt checker). */
export const BUILDING_FLOOR_VARIANTS = [
  { floor: 'bld_floor_wood', floorAlt: 'bld_floor_wood_alt' },
  { floor: 'bld_floor_parket', floorAlt: 'bld_floor_parket_alt' },
  { floor: 'bld_floor_tiles', floorAlt: 'bld_floor_tiles_alt' },
];

const BUILDING_DOOR_SPRITES = {
  doorMat: 'bld_door_mat_wood',
  doorClosed: 'bld_door_closed_wood',
  doorOpen: 'bld_door_open_wood',
  doorLintel: 'shack_wall_door_top',
};

function pickVariantIndex(length, seedA, seedB, salt = 0) {
  return hash32(seedA + salt * 59, seedB + salt * 83) % length;
}

/** Roll independent wall / roof / floor combo for one house. */
export function rollBuildingStyle(seedA, seedB) {
  const wall = BUILDING_WALL_VARIANTS[pickVariantIndex(BUILDING_WALL_VARIANTS.length, seedA, seedB, 1)];
  const roof = BUILDING_ROOF_VARIANTS[pickVariantIndex(BUILDING_ROOF_VARIANTS.length, seedA, seedB, 2)];
  const fl = BUILDING_FLOOR_VARIANTS[pickVariantIndex(BUILDING_FLOOR_VARIANTS.length, seedA, seedB, 3)];
  return {
    id: `house_${wall.wallNs}_${roof.roofFill}_${fl.floor}`,
    floor: [fl.floor, fl.floorAlt],
    wallNs: wall.wallNs,
    wallEw: 'bld_wall_ew',
    wallCorner: wall.wallCorner,
    roofFill: roof.roofFill,
    roofEdge: roof.roofEdge,
    ...BUILDING_DOOR_SPRITES,
  };
}

export const DECOR_SPRITES = [
  'bld_barrel_blue',
  'bld_barrel_green',
  'bld_barrel_red',
];

/** Footprint gap between buildings — keep in sync with buildingGen BUILDING_MIN_GAP_TILES. */
export const TOWN_BUILDING_GAP_TILES = 4;

/** Rect footprints — width always greater than height. */
export const BUILDING_SIZE_VARIANTS = [
  { w: 5, h: 4 },
  { w: 6, h: 4 },
  { w: 6, h: 5 },
  { w: 7, h: 4 },
  { w: 7, h: 5 },
];

export const BUILDING_WIDTH_VARIANTS = [5, 6, 7];
export const BUILDING_SHAPE_H = 5;

export const BUILDING_MAX_W = 7;
export const BUILDING_MAX_H = 5;

export function rollBuildingSize(seedA, seedB) {
  const idx = Math.floor(hash01(seedA, seedB) * BUILDING_SIZE_VARIANTS.length);
  return BUILDING_SIZE_VARIANTS[idx];
}

export function rollBuildingWidth(seedA, seedB) {
  const idx = Math.floor(hash01(seedA, seedB) * BUILDING_WIDTH_VARIANTS.length);
  return BUILDING_WIDTH_VARIANTS[idx];
}

/** L/T depth so footprint width is always greater than height. */
export function shapeHeightForWidth(w) {
  return w > BUILDING_SHAPE_H ? BUILDING_SHAPE_H : w - 1;
}

export function lShapeMetrics(w, h) {
  const legW = Math.max(2, Math.ceil(w * 0.38));
  const legH = Math.max(2, Math.min(h - 2, Math.ceil(h * 0.42)));
  const hallH = h - legH + 1;
  return { legW, legH, hallH };
}

/** L-wing on east or west side of the hall. */
export function rollLVariant(seedA, seedB) {
  return hash01(seedA, seedB) < 0.5 ? 'east' : 'west';
}

function setCell(cells, w, tx, tz, value) {
  if (tx < 0 || tz < 0 || tx >= w) return;
  cells[tz * w + tx] = value;
}

function carveRect(cells, w, x0, z0, rw, rh) {
  for (let tz = z0; tz < z0 + rh; tz++) {
    for (let tx = x0; tx < x0 + rw; tx++) {
      setCell(cells, w, tx, tz, CELL_FLOOR);
    }
  }
}

function cellWalkable(cells, w, h, tx, tz) {
  if (tx < 0 || tz < 0 || tx >= w || tz >= h) return false;
  const c = cells[tz * w + tx];
  return c === CELL_FLOOR || c === CELL_DOOR;
}

function isSouthEdgeTile(cells, w, h, tx, tz) {
  if (!cellWalkable(cells, w, h, tx, tz)) return false;
  return !cellWalkable(cells, w, h, tx, tz + 1);
}

function groupContiguousRuns(sortedTx) {
  if (!sortedTx.length) return [];
  const runs = [];
  let start = sortedTx[0];
  let end = sortedTx[0];
  for (let i = 1; i < sortedTx.length; i++) {
    if (sortedTx[i] === end + 1) end = sortedTx[i];
    else {
      runs.push({ start, end });
      start = end = sortedTx[i];
    }
  }
  runs.push({ start, end });
  return runs;
}

function runsWithMinLength(runs, minLen) {
  return runs.filter((r) => r.end - r.start + 1 >= minLen);
}

/**
 * Door on a south perimeter row with at least DOOR_EDGE_MIN_TILES contiguous tiles
 * (wall segments on both sides of the door). L-shapes use the upper hall's south edge.
 */
export function placeDoorOnSouthEdge(cells, w, h, opts = {}) {
  const { shape, lLeg } = opts;
  let rowFilter = null;
  if (shape === 'l') {
    const { hallH, legW } = lShapeMetrics(w, h);
    rowFilter = (tx, tz) => {
      if (tz !== hallH - 1) return false;
      return lLeg === 'west' ? tx >= legW : tx < w - legW;
    };
  }

  const byRow = new Map();
  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      if (!isSouthEdgeTile(cells, w, h, tx, tz)) continue;
      if (rowFilter && !rowFilter(tx, tz)) continue;
      if (!byRow.has(tz)) byRow.set(tz, []);
      byRow.get(tz).push(tx);
    }
  }

  const rowOrder = shape === 'l'
    ? [...byRow.keys()].sort((a, b) => a - b)
    : [...byRow.keys()].sort((a, b) => b - a);

  for (const tz of rowOrder) {
    const runs = runsWithMinLength(
      groupContiguousRuns(byRow.get(tz).sort((a, b) => a - b)),
      DOOR_EDGE_MIN_TILES,
    );
    if (!runs.length) continue;
    const bestRun = runs.reduce(
      (best, run) => ((run.end - run.start) > (best.end - best.start) ? run : best),
      runs[0],
    );
    const len = bestRun.end - bestRun.start + 1;
    const doorTx = bestRun.start + Math.floor(len / 2);
    cells[tz * w + doorTx] = CELL_DOOR;
    return { doorTx, doorTz: tz };
  }

  const doorTx = Math.floor(w / 2);
  const doorTz = h - 1;
  if (cellWalkable(cells, w, h, doorTx, doorTz)) {
    cells[doorTz * w + doorTx] = CELL_DOOR;
  }
  return { doorTx, doorTz };
}

export function generateRectCells(w, h) {
  const cells = new Uint8Array(w * h);
  for (let i = 0; i < cells.length; i++) cells[i] = CELL_FLOOR;
  const { doorTx, doorTz } = placeDoorOnSouthEdge(cells, w, h, { shape: 'rect' });
  return { w, h, cells, doorTx, doorTz, shape: 'rect' };
}

/** L-wing on the east or west side of the south hall (h should be 5). */
export function generateLShapeCells(w, h, leg = 'east') {
  const cells = new Uint8Array(w * h);
  const { legW, hallH } = lShapeMetrics(w, h);
  const legH = h - hallH + 1;
  carveRect(cells, w, 0, 0, w, hallH);
  if (leg === 'west') {
    carveRect(cells, w, 0, hallH - 1, legW, legH);
  } else {
    carveRect(cells, w, w - legW, hallH - 1, legW, legH);
  }
  const { doorTx, doorTz } = placeDoorOnSouthEdge(cells, w, h, { shape: 'l', lLeg: leg });
  return { w, h, cells, doorTx, doorTz, shape: 'l', lLeg: leg };
}

/** T-bar across the top of a central stem. */
export function generateTShapeCells(w, h) {
  const cells = new Uint8Array(w * h);
  const barH = Math.max(2, Math.floor(h * 0.32));
  const stemW = Math.max(3, Math.floor(w * 0.38));
  const stemX = Math.floor((w - stemW) / 2);
  carveRect(cells, w, 0, 0, w, barH);
  carveRect(cells, w, stemX, barH - 1, stemW, h - barH + 1);
  const { doorTx, doorTz } = placeDoorOnSouthEdge(cells, w, h, { shape: 't' });
  return { w, h, cells, doorTx, doorTz, shape: 't' };
}

export function rollBuildingShape(seedA, seedB) {
  const r = hash01(seedA, seedB);
  if (r < 0.38) return 'rect';
  if (r < 0.72) return 'l';
  return 't';
}

export function generateBuildingCells(w, h, shape, opts = {}) {
  if (shape === 'l') return generateLShapeCells(w, h, opts.lLeg ?? 'east');
  if (shape === 't') return generateTShapeCells(w, h);
  return generateRectCells(w, h);
}

/** Multi-building town layouts (may span into neighbor chunks). */
function placeTownRow(sizes, gap, startOz = 0) {
  const lots = [];
  let ox = 0;
  for (const size of sizes) {
    lots.push({ ox, oz: startOz, w: size.w, h: size.h });
    ox += size.w + gap;
  }
  return lots;
}

function placeTownGrid2x2(sizes, gap) {
  const [a, b, c, d] = sizes;
  const rowW = a.w + gap + b.w;
  const colH = a.h + gap + c.h;
  return [
    { ox: 0, oz: 0, w: a.w, h: a.h },
    { ox: a.w + gap, oz: 0, w: b.w, h: b.h },
    { ox: 0, oz: a.h + gap, w: c.w, h: c.h },
    { ox: rowW - d.w, oz: colH - d.h, w: d.w, h: d.h },
  ];
}

/** Multi-building town lots with gapTiles between each footprint. */
export function rollTownLots(seedA, seedB, gapTiles = TOWN_BUILDING_GAP_TILES) {
  const layoutRoll = hash01(seedA, seedB);
  if (layoutRoll < 0.3) {
    return placeTownRow([
      rollBuildingSize(seedA + 1, seedB + 1),
      rollBuildingSize(seedA + 2, seedB + 2),
    ], gapTiles);
  }
  if (layoutRoll < 0.55) {
    return placeTownRow([
      rollBuildingSize(seedA + 1, seedB + 1),
      rollBuildingSize(seedA + 2, seedB + 2),
      rollBuildingSize(seedA + 3, seedB + 3),
    ], gapTiles);
  }
  if (layoutRoll < 0.8) {
    return placeTownGrid2x2([
      rollBuildingSize(seedA + 1, seedB + 1),
      rollBuildingSize(seedA + 2, seedB + 2),
      rollBuildingSize(seedA + 3, seedB + 3),
      rollBuildingSize(seedA + 4, seedB + 4),
    ], gapTiles);
  }
  const s0 = rollBuildingSize(seedA + 1, seedB + 1);
  const s1 = rollBuildingSize(seedA + 2, seedB + 2);
  const s2 = rollBuildingSize(seedA + 3, seedB + 3);
  const rowH = Math.max(s0.h, s1.h);
  return [
    { ox: 0, oz: 0, w: s0.w, h: s0.h },
    { ox: s0.w + gapTiles, oz: 0, w: s1.w, h: s1.h },
    {
      ox: Math.max(0, Math.floor((s0.w + gapTiles + s1.w - s2.w) * 0.5)),
      oz: rowH + gapTiles,
      w: s2.w,
      h: s2.h,
    },
  ];
}

/** @deprecated use rollTownLots */
export function rollTownLot(seedA, seedB) {
  return rollTownLots(seedA, seedB).slice(0, 1);
}

export function rollDecor(seedA, seedB) {
  const sprite = DECOR_SPRITES[hash32(seedA, seedB) % DECOR_SPRITES.length];
  return { sprite };
}
