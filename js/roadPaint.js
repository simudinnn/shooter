/**
 * Shared road painting with beveled 90° corners.
 * Strips are painted on a centerline (x0,z0) with width extending symmetrically.
 */

export const ROAD_W = 3;

export function addRoadTile(tiles, tx, tz) {
  tiles.add(`${tx},${tz}`);
}

export function removeRoadTile(tiles, tx, tz) {
  tiles.delete(`${tx},${tz}`);
}

/** Road thickness band at a tile (for gap-fill alignment). */
function roadBandAt(tiles, x, z) {
  let minX = x;
  let maxX = x;
  let minZ = z;
  let maxZ = z;
  while (tiles.has(`${minX - 1},${z}`)) minX--;
  while (tiles.has(`${maxX + 1},${z}`)) maxX++;
  while (tiles.has(`${x},${minZ - 1}`)) minZ--;
  while (tiles.has(`${x},${maxZ + 1}`)) maxZ++;
  return { minX, maxX, minZ, maxZ };
}

/** Paint a width-wide axis-aligned strip centered on the segment line. */
export function paintRoadStrip(tiles, x0, z0, x1, z1, width = ROAD_W) {
  const pad = Math.floor(width / 2);
  if (z0 === z1) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    for (let x = minX; x <= maxX; x++) {
      for (let d = -pad; d < width - pad; d++) {
        addRoadTile(tiles, x, z0 + d);
      }
    }
    return;
  }
  if (x0 === x1) {
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    for (let z = minZ; z <= maxZ; z++) {
      for (let d = -pad; d < width - pad; d++) {
        addRoadTile(tiles, x0 + d, z);
      }
    }
  }
}

function clampBand(min, max, center, maxWidth) {
  const span = max - min + 1;
  if (span <= maxWidth) return { min, max };
  const pad = Math.floor(maxWidth / 2);
  return { min: center - pad, max: center + (maxWidth - pad - 1) };
}

function addBridgeCell(tiles, cx, cz, axisDx, axisDz, anchorX, anchorZ, maxWidth, highwayTiles = null) {
  const lookup = (x, y) => tiles.has(`${x},${y}`) || highwayTiles?.has(`${x},${y}`);

  if (axisDx !== 0) {
    let minZ = anchorZ;
    let maxZ = anchorZ;
    while (lookup(anchorX, minZ - 1)) minZ--;
    while (lookup(anchorX, maxZ + 1)) maxZ++;
    ({ min: minZ, max: maxZ } = clampBand(minZ, maxZ, anchorZ, maxWidth));
    for (let z = minZ; z <= maxZ; z++) addRoadTile(tiles, cx, z);
    return;
  }

  let minX = anchorX;
  let maxX = anchorX;
  while (lookup(minX - 1, anchorZ)) minX--;
  while (lookup(maxX + 1, anchorZ)) maxX++;
  ({ min: minX, max: maxX } = clampBand(minX, maxX, anchorX, maxWidth));
  for (let x = minX; x <= maxX; x++) addRoadTile(tiles, x, cz);
}

/** Bridge gaps between town roads and nearby highway tiles (perpendicular near-misses). */
export function fillPerpendicularRoadGaps(tiles, highwayTiles, width, maxGap = 6) {
  const snapshot = [...tiles];
  for (const key of snapshot) {
    const [x, z] = key.split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let gx = x + dx;
      let gz = z + dz;
      const cells = [];
      while (
        cells.length < maxGap
        && !tiles.has(`${gx},${gz}`)
        && !highwayTiles.has(`${gx},${gz}`)
      ) {
        cells.push([gx, gz]);
        gx += dx;
        gz += dz;
      }
      if (
        cells.length === 0
        || cells.length > maxGap
        || (!tiles.has(`${gx},${gz}`) && !highwayTiles.has(`${gx},${gz}`))
      ) continue;
      for (const [cx, cz] of cells) {
        if (tiles.has(`${cx},${cz}`)) continue;
        addBridgeCell(tiles, cx, cz, dx, dz, x, z, width, highwayTiles);
      }
    }
  }
}

/** Bridge small collinear gaps — only paints missing cells aligned to the anchor band. */
export function fillCollinearRoadGaps(tiles, width, maxGap = 3) {
  const snapshot = [...tiles];
  for (const key of snapshot) {
    const [x, z] = key.split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let gx = x + dx;
      let gz = z + dz;
      const cells = [];
      while (cells.length < maxGap && !tiles.has(`${gx},${gz}`)) {
        cells.push([gx, gz]);
        gx += dx;
        gz += dz;
      }
      if (cells.length === 0 || cells.length > maxGap || !tiles.has(`${gx},${gz}`)) continue;
      for (const [cx, cz] of cells) {
        if (tiles.has(`${cx},${cz}`)) continue;
        addBridgeCell(tiles, cx, cz, dx, dz, x, z, width);
      }
    }
  }
}

function dirKey(d) {
  if (d.dx === 1) return 'E';
  if (d.dx === -1) return 'W';
  if (d.dz === 1) return 'S';
  return 'N';
}

function segmentDir(a, b) {
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  if (dx === 0 && dz === 0) return { dx: 1, dz: 0 };
  return { dx, dz };
}

function mirrorBevelX(spec) {
  return {
    add: spec.add.map(([dx, dz]) => [-dx, dz]),
    remove: spec.remove.map(([dx, dz]) => [-dx, dz]),
  };
}

function buildBevelTables() {
  // Offsets relative to centerline bend vertex (symmetric strip painting).
  const w3 = {
    'E,S': { add: [[-1, -1]], remove: [[1, 1], [2, 1], [1, 2]] },
    'E,N': { add: [[-1, 1]], remove: [[1, -1], [2, -1], [1, 0]] },
    'S,E': { add: [[1, -1]], remove: [[-1, 1], [-1, 2], [0, 2]] },
    'W,N': { add: [[1, 1]], remove: [[-1, -1], [-2, -1], [-1, 0]] },
    'N,E': { add: [[-1, 1]], remove: [[1, -1], [2, -1], [1, 0]] },
    'N,W': { add: [[1, 1]], remove: [[-1, -1], [-2, -1], [-1, 0]] },
  };
  w3['W,S'] = mirrorBevelX(w3['E,S']);
  w3['S,W'] = mirrorBevelX(w3['S,E']);

  const w2 = {
    'E,S': { add: [[-1, -1]], remove: [[1, 0], [1, 1]] },
    'E,N': { add: [[-1, 1]], remove: [[1, -1], [1, 0]] },
    'S,E': { add: [[1, -1]], remove: [[-1, 1], [0, 1]] },
    'W,N': { add: [[1, 1]], remove: [[-1, 0], [-1, -1]] },
    'N,E': { add: [[-1, 1]], remove: [[1, -1], [1, 0]] },
    'N,W': { add: [[1, 1]], remove: [[-1, 0], [-1, -1]] },
  };
  w2['W,S'] = mirrorBevelX(w2['E,S']);
  w2['S,W'] = mirrorBevelX(w2['S,E']);

  return { w3, w2 };
}

const { w3: BEVEL_W3, w2: BEVEL_W2 } = buildBevelTables();

function bevelTable(width) {
  return width <= 2 ? BEVEL_W2 : BEVEL_W3;
}

/**
 * Bevel a 90° corner: +1 inner tile, trim outer tiles.
 * Vertex (vx,vz) is the centerline bend point.
 */
export function applyBevelCorner(tiles, vx, vz, inDir, outDir, width = ROAD_W) {
  const table = bevelTable(width);
  const spec = table[`${dirKey(inDir)},${dirKey(outDir)}`];
  if (!spec) return;
  for (const [dx, dz] of spec.add) addRoadTile(tiles, vx + dx, vz + dz);
  for (const [dx, dz] of spec.remove) removeRoadTile(tiles, vx + dx, vz + dz);
}

/** Apply bevel when junction dirs may be listed in either order. */
export function applyBevelJunction(tiles, vx, vz, dirA, dirB, width = ROAD_W) {
  const table = bevelTable(width);
  const a = dirKey(dirA);
  const b = dirKey(dirB);
  if (table[`${a},${b}`]) {
    applyBevelCorner(tiles, vx, vz, dirA, dirB, width);
    return true;
  }
  if (table[`${b},${a}`]) {
    applyBevelCorner(tiles, vx, vz, dirB, dirA, width);
    return true;
  }
  return false;
}

/** Paint width-wide road along polyline; optional square corners (no bevel trim). */
export function paintRoadFromPoints(points, tiles, width = ROAD_W, opts = {}) {
  if (points.length < 2) return;
  const bevel = opts.bevel !== false;

  for (let i = 0; i < points.length - 1; i++) {
    paintRoadStrip(tiles, points[i].x, points[i].z, points[i + 1].x, points[i + 1].z, width);
  }

  if (!bevel) return;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const dIn = segmentDir(prev, cur);
    const dOut = segmentDir(cur, next);
    if (dIn.dx === dOut.dx && dIn.dz === dOut.dz) continue;
    if (dIn.dx !== 0 && dOut.dx !== 0) continue;
    if (dIn.dz !== 0 && dOut.dz !== 0) continue;
    applyBevelCorner(tiles, cur.x, cur.z, dIn, dOut, width);
  }
}

/** Paint strips into a Set plus flat tile list (for town registration). */
export function paintRoadStripToList(tiles, roadKeys, roadList, x0, z0, x1, z1, width = ROAD_W) {
  const temp = new Set();
  paintRoadStrip(temp, x0, z0, x1, z1, width);
  for (const key of temp) {
    if (roadKeys.has(key)) continue;
    roadKeys.add(key);
    const [tx, tz] = key.split(',').map(Number);
    roadList.push({ tx, tz });
  }
}

export function paintRoadFromPointsToList(points, roadKeys, roadList, width = ROAD_W) {
  const temp = new Set();
  paintRoadFromPoints(points, temp, width);
  for (const key of temp) {
    if (roadKeys.has(key)) continue;
    roadKeys.add(key);
    const [tx, tz] = key.split(',').map(Number);
    roadList.push({ tx, tz });
  }
}
