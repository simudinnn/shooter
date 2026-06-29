import { TILE } from './worldGen.js';
import {
  CELL_DOOR,
  CELL_EMPTY,
  CELL_FLOOR,
  getDoorWorldPos,
  getBuildingCellAtWorld,
  isInOpenDoorNavZone,
  isNavBlockedBuildingCell,
  shapeOverlapsOpenDoorNavZone,
  entityFeetZ,
  playerSouthEdgeZ,
} from './buildingGen.js';

/** One flow cell = one ground tile (see tile-based flow fields). */
const FLOW_INTERVAL = 0.5;
const FLOW_PAD_TILES = 24;
const FLOW_ACTIVATE_RANGE = 56;
const MAX_FIELD_TILES = 96;
const UNREACHABLE = 32767;
/** Run A* after this many seconds without movement. */
const STUCK_ASTAR_THRESHOLD = 0.65;
const STUCK_ASTAR_NEAR_WALL = 0.28;
/** Recompute A* path if still stuck after this long. */
const ASTAR_PATH_TTL = 1.25;
const ASTAR_STEP_COST = 10;
const ASTAR_DIAG_COST = 14;

/** Shared nav footprint for tile walkability tests during field builds. */
const NAV_SHAPE = { kind: 'aabb', halfW: 1.05, halfH: 0.92, zOff: 0.1 };
/** Tighter probe for interior tiles and doorways. */
const TIGHT_NAV_SHAPE = { kind: 'aabb', halfW: 0.55, halfH: 0.5, zOff: 0.08 };
const WALL_PROBE = { kind: 'aabb', halfW: 0.88, halfH: 0.78, zOff: 0.08 };

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const CARDINALS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const ENEMY_SPOT_DELAY = 1.0;
export const ENEMY_ALERT_WANDER_DURATION = 8.0;
export const LAST_KNOWN_REACH = TILE * 0.45;
export const ENEMY_INVESTIGATE_MIN = 4.0;
export const ENEMY_ALERT_DETECT_MULT = 1.2;
export const ENEMY_ALERT_WANDER_SPEED = 0.82;
export const ENEMY_IDLE_FORGET_TIME = 5.0;

export const SPIDER_DETECT_RANGE = 28;
export const SCOUT_DETECT_RANGE = 36;

const _flow = {
  active: false,
  builtAt: -999,
  mode: 'unified',
  playerBuilding: null,
  field: null,
  exterior: null,
  interior: null,
  layerMask: null,
  stats: null,
};

// ─── Building helpers ───────────────────────────────────────────────────────

export function getPlayerBuilding(buildings, player) {
  if (!buildings || !player) return null;
  const col = player.getMoveCollider?.(8);
  const feetZ = playerSouthEdgeZ(player.x, player.z);
  return col
    ? buildings.getBuildingAt(player.x, player.z, col, feetZ)
    : buildings.getBuildingAt(player.x, player.z, feetZ);
}

export function isPlayerBehindClosedDoor(player, buildings) {
  const bld = getPlayerBuilding(buildings, player);
  return bld != null && !bld.doorOpen;
}

function isClosedDoorTile(buildings, wx, wz) {
  const list = buildings?.buildings;
  if (!list) return false;
  for (const b of list) {
    if (b.doorOpen) continue;
    const doorTx = b.doorTx ?? Math.floor(b.w / 2);
    const doorTz = b.doorTz ?? b.h - 1;
    const lx = wx - b.originX;
    const lz = wz - b.originZ;
    if (lx < 0 || lz < 0 || lx >= b.w * TILE || lz >= b.h * TILE) continue;
    if (Math.floor(lx / TILE) === doorTx && Math.floor(lz / TILE) === doorTz) return true;
  }
  return false;
}

function getBuildingCellAt(buildings, wx, wz) {
  return getBuildingCellAtWorld(buildings, wx, wz);
}

function isExteriorDoorApproachTile(buildings, tx, tz) {
  const wx = (tx + 0.5) * TILE;
  const wz = (tz + 0.5) * TILE;
  for (const b of buildings?.buildings ?? []) {
    if (!b.doorOpen) continue;
    const doorTx = b.doorTx ?? Math.floor(b.w / 2);
    const doorTz = b.doorTz ?? b.h - 1;
    const doorWx = b.originX + (doorTx + 0.5) * TILE;
    const mouthZ = b.originZ + (doorTz + 1) * TILE;
    if (Math.abs(wx - doorWx) > TILE * 0.55) continue;
    if (wz >= mouthZ - TILE * 0.1 && wz <= mouthZ + TILE * 0.75) return true;
  }
  return false;
}

function summarizeFlowField(dist, size, goalTiles, seededGoalTiles) {
  let maxReach = 0;
  let reachCount = 0;
  let blockCount = 0;
  for (let i = 0; i < size; i++) {
    if (dist[i] >= UNREACHABLE) blockCount++;
    else {
      reachCount++;
      if (dist[i] > maxReach) maxReach = dist[i];
    }
  }
  const goals = seededGoalTiles?.length ? seededGoalTiles : goalTiles;
  const goalKeys = goals.map((t) => `${t.tx},${t.tz}`);
  return { maxReach, reachCount, blockCount, goalKeys };
}

function buildSplitLayerMask(buildings, playerBld, minTx, minTz, gw, gh) {
  const mask = new Uint8Array(gw * gh);
  for (let tz = minTz; tz < minTz + gh; tz++) {
    for (let tx = minTx; tx < minTx + gw; tx++) {
      const idx = (tz - minTz) * gw + (tx - minTx);
      mask[idx] = isPlayerBuildingInteriorTile(buildings, playerBld, tx, tz) ? 1 : 0;
    }
  }
  return mask;
}

function isTileWalkable(world, buildings, tx, tz) {
  const wx = (tx + 0.5) * TILE;
  const wz = (tz + 0.5) * TILE;
  if (isClosedDoorTile(buildings, wx, wz)) return false;
  if (isInOpenDoorNavZone(buildings, wx, wz)) return true;

  const info = getBuildingCellAt(buildings, wx, wz);
  if (info) {
    const { cell, building } = info;
    if (cell === CELL_EMPTY) {
      return !world.checkCollisionShape(wx, wz, NAV_SHAPE, true, { forNav: true, buildings });
    }
    if (isNavBlockedBuildingCell(building, info.tx, info.tz)) return false;
    if (cell === CELL_DOOR && building.doorOpen) return true;
    if (cell === CELL_FLOOR) {
      return !world.checkCollisionShape(wx, wz, TIGHT_NAV_SHAPE, true, { forNav: true, buildings });
    }
    return false;
  }

  if (isExteriorDoorApproachTile(buildings, tx, tz)) return true;

  return !world.checkCollisionShape(wx, wz, NAV_SHAPE, true, { forNav: true, buildings });
}

function filterGoalCandidates(player, buildings, candidates) {
  const playerBld = getPlayerBuilding(buildings, player);
  const filtered = [];
  for (const t of candidates) {
    const wx = (t.tx + 0.5) * TILE;
    const wz = (t.tz + 0.5) * TILE;
    const info = getBuildingCellAt(buildings, wx, wz);
    if (!info) {
      if (!playerBld) filtered.push(t);
      continue;
    }
    if (info.cell === CELL_EMPTY) continue;
    if (!playerBld) continue;
    if (info.building !== playerBld) continue;
    if (info.cell === CELL_FLOOR || (info.cell === CELL_DOOR && info.building.doorOpen)) {
      filtered.push(t);
    }
  }
  return filtered.length ? filtered : candidates;
}

function isGoalTile(world, buildings, tx, tz) {
  const wx = (tx + 0.5) * TILE;
  const wz = (tz + 0.5) * TILE;
  const info = getBuildingCellAt(buildings, wx, wz);
  if (info) {
    const { cell, building } = info;
    if (cell === CELL_EMPTY) return false;
    // Floor/door goals include perimeter tiles (south/EW wall rows) where the player can stand.
    if (cell === CELL_FLOOR) return true;
    if (cell === CELL_DOOR && building.doorOpen) return true;
    return false;
  }
  return isTileWalkable(world, buildings, tx, tz);
}

/** Seed BFS from player/door tiles even when perimeter lip cells block enemy transit. */
function isFlowGoalSeed(world, buildings, tx, tz) {
  if (isTileWalkable(world, buildings, tx, tz)) return true;
  const wx = (tx + 0.5) * TILE;
  const wz = (tz + 0.5) * TILE;
  const info = getBuildingCellAt(buildings, wx, wz);
  if (!info) return false;
  if (info.cell === CELL_EMPTY) return false;
  if (info.cell === CELL_FLOOR) return true;
  if (info.cell === CELL_DOOR && info.building.doorOpen) return true;
  return false;
}

export function canWalkDirect(world, ax, az, bx, bz, shape, buildings = null) {
  const dist = Math.hypot(bx - ax, bz - az);
  if (dist < 0.05) return true;
  const steps = Math.max(3, Math.ceil(dist / (TILE * 0.65)));
  const nav = shape ?? NAV_SHAPE;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wx = ax + (bx - ax) * t;
    const wz = az + (bz - az) * t;
    if (buildings) {
      const tx = Math.floor(wx / TILE);
      const tz = Math.floor(wz / TILE);
      if (!isTileWalkable(world, buildings, tx, tz)) return false;
      continue;
    }
    if (isClosedDoorTile(buildings, wx, wz)) return false;
    if (world.checkCollisionShape(wx, wz, nav, true, { forNav: true, buildings })) return false;
  }
  return true;
}

function dirNorm(dx, dz) {
  const len = Math.hypot(dx, dz) || 1;
  return { dirX: dx / len, dirZ: dz / len };
}

function dirTo(ax, az, bx, bz) {
  return dirNorm(bx - ax, bz - az);
}

function tileIdx(field, tx, tz) {
  return (tz - field.minTz) * field.gw + (tx - field.minTx);
}

function getEntityMoveGoalCenter(entity, ppu = 8) {
  const shape = entity.getMoveCollider?.(ppu);
  if (!shape || shape.kind !== 'aabb') return { x: entity.x, z: entity.z };
  return { x: entity.x, z: entity.z + (shape.zOff ?? 0) };
}

function getEntityMoveGoalTiles(entity, ppu = 8) {
  const shape = entity.getMoveCollider?.(ppu);
  const center = getEntityMoveGoalCenter(entity, ppu);
  const tiles = new Map();
  const add = (tx, tz) => tiles.set(`${tx},${tz}`, { tx, tz });

  if (shape?.kind === 'aabb') {
    const acz = entity.z + (shape.zOff ?? 0);
    const minTx = Math.floor((entity.x - shape.halfW) / TILE);
    const maxTx = Math.floor((entity.x + shape.halfW) / TILE);
    const minTz = Math.floor((acz - shape.halfH) / TILE);
    const maxTz = Math.floor((acz + shape.halfH) / TILE);
    for (let tz = minTz; tz <= maxTz; tz++) {
      for (let tx = minTx; tx <= maxTx; tx++) add(tx, tz);
    }
  } else {
    add(Math.floor(entity.x / TILE), Math.floor(entity.z / TILE));
  }

  add(Math.floor(center.x / TILE), Math.floor(center.z / TILE));
  const feetZ = entity.type ? entityFeetZ(entity) : playerSouthEdgeZ(entity.x, entity.z);
  add(Math.floor(entity.x / TILE), Math.floor(feetZ / TILE));

  return [...tiles.values()];
}

function resolveGoalTiles(world, buildings, player, candidates) {
  const filtered = filterGoalCandidates(player, buildings, candidates);
  const pool = filtered.length ? filtered : candidates;
  const seeded = [];
  for (const t of pool) {
    if (isGoalTile(world, buildings, t.tx, t.tz)) seeded.push(t);
  }
  if (seeded.length) return seeded;

  let sumTx = 0;
  let sumTz = 0;
  for (const t of pool) {
    sumTx += t.tx;
    sumTz += t.tz;
  }
  const cx = Math.round(sumTx / pool.length);
  const cz = Math.round(sumTz / pool.length);
  for (let r = 0; r <= 5; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const tx = cx + dx;
        const tz = cz + dz;
        if (isGoalTile(world, buildings, tx, tz)) return [{ tx, tz }];
        if (isTileWalkable(world, buildings, tx, tz)) return [{ tx, tz }];
      }
    }
  }
  return [{ tx: cx, tz: cz }];
}

function collectDoorSeedTiles(playerBld) {
  if (!playerBld?.doorOpen) return [];
  const doorTx = playerBld.doorTx ?? Math.floor(playerBld.w / 2);
  const doorTz = playerBld.doorTz ?? playerBld.h - 1;
  const doorWx = playerBld.originX + (doorTx + 0.5) * TILE;
  const doorWz = playerBld.originZ + (doorTz + 0.5) * TILE;
  const mouthZ = playerBld.originZ + (doorTz + 1) * TILE;
  const seeds = new Map();
  const add = (wx, wz) => seeds.set(`${Math.floor(wx / TILE)},${Math.floor(wz / TILE)}`, {
    tx: Math.floor(wx / TILE),
    tz: Math.floor(wz / TILE),
  });
  add(doorWx, doorWz);
  add(doorWx, mouthZ + TILE * 0.35);
  add(doorWx, mouthZ + TILE * 0.85);
  add(doorWx - TILE * 0.55, mouthZ + TILE * 0.55);
  add(doorWx + TILE * 0.55, mouthZ + TILE * 0.55);
  return [...seeds.values()];
}

function isPlayerBuildingInteriorTile(buildings, building, tx, tz) {
  if (!building) return false;
  const wx = (tx + 0.5) * TILE;
  const wz = (tz + 0.5) * TILE;
  const info = getBuildingCellAt(buildings, wx, wz);
  if (!info || info.building !== building) return false;
  if (info.cell === CELL_EMPTY) return false;
  return info.cell === CELL_FLOOR || info.cell === CELL_DOOR;
}

/** Exterior field → door; interior field → player (split when sheltered inside). */
function pickFlowLayer(wx, wz, buildings, robot = null) {
  if (!_flow.active) return null;
  if (_flow.mode !== 'split') return _flow.field;

  const bld = _flow.playerBuilding;
  if (!bld) return _flow.field;

  if (robot && buildings) {
    const enemyBld = buildings.getEntityBuildingAt?.(robot);
    if (enemyBld === bld) return _flow.interior;
  }

  const tx = Math.floor(wx / TILE);
  const tz = Math.floor(wz / TILE);
  if (isPlayerBuildingInteriorTile(buildings, bld, tx, tz)) return _flow.interior;
  return _flow.exterior;
}

function getDoorApproachGoal(building, robot, player, buildings) {
  const door = getDoorWorldPos(building);
  const doorTz = building.doorTz ?? building.h - 1;
  const mouthZ = building.originZ + (doorTz + 1) * TILE;
  const navShape = robot.getMoveCollider?.() ?? NAV_SHAPE;
  const distMouth = Math.hypot(robot.x - door.x, robot.z - mouthZ);

  if (shapeOverlapsOpenDoorNavZone(buildings, robot.x, robot.z, navShape) || distMouth <= TILE * 1.35) {
    const center = getEntityMoveGoalCenter(player, 8);
    return { x: center.x, z: center.z, kind: 'door-through' };
  }
  if (distMouth <= TILE * 2.5) {
    return { x: door.x, z: mouthZ + TILE * 0.4, kind: 'door-approach' };
  }
  return { x: door.x, z: mouthZ + TILE * 0.85, kind: 'door-open' };
}

function getPlayerFlowGoalTiles(player, world, buildings) {
  if (isPlayerBehindClosedDoor(player, buildings)) {
    const bld = getPlayerBuilding(buildings, player);
    if (!bld) {
      return resolveGoalTiles(world, buildings, player, getEntityMoveGoalTiles(player, 8));
    }
    const door = getDoorWorldPos(bld);
    return resolveGoalTiles(world, buildings, player, [{
      tx: Math.floor(door.x / TILE),
      tz: Math.floor((bld.originZ + bld.h * TILE + TILE * 0.5) / TILE),
    }]);
  }
  const candidates = filterGoalCandidates(player, buildings, getEntityMoveGoalTiles(player, 8));
  return resolveGoalTiles(world, buildings, player, candidates);
}

function computeFlowGoal(player, buildings) {
  if (isPlayerBehindClosedDoor(player, buildings)) {
    const bld = getPlayerBuilding(buildings, player);
    const door = getDoorWorldPos(bld);
    return {
      x: door.x,
      z: bld.originZ + bld.h * TILE + TILE * 0.5,
    };
  }
  return getEntityMoveGoalCenter(player, 8);
}

function buildTileFlowField(world, buildings, goalTiles, minTx, minTz, maxTx, maxTz) {
  const gw = maxTx - minTx + 1;
  const gh = maxTz - minTz + 1;
  if (gw > MAX_FIELD_TILES || gh > MAX_FIELD_TILES) return null;

  const size = gw * gh;
  const blocked = new Uint8Array(size);
  const dist = new Int16Array(size);
  dist.fill(UNREACHABLE);

  const grid = { minTx, minTz, gw };

  const inGrid = (tx, tz) => tx >= minTx && tx <= maxTx && tz >= minTz && tz <= maxTz;

  const gridIdx = (tx, tz) => tileIdx(grid, tx, tz);

  const isWalkable = (tx, tz) => {
    if (!inGrid(tx, tz)) return false;
    const idx = gridIdx(tx, tz);
    if (blocked[idx]) return blocked[idx] === 2;
    const ok = isTileWalkable(world, buildings, tx, tz);
    blocked[idx] = ok ? 2 : 1;
    return ok;
  };

  const hasReach = (tx, tz) => {
    if (!inGrid(tx, tz)) return false;
    return dist[gridIdx(tx, tz)] < UNREACHABLE;
  };

  const queue = [];
  const seededGoalTiles = [];
  for (const { tx, tz } of goalTiles) {
    if (!isFlowGoalSeed(world, buildings, tx, tz)) continue;
    const idx = gridIdx(tx, tz);
    if (dist[idx] === 0) continue;
    dist[idx] = 0;
    queue.push(idx);
    seededGoalTiles.push({ tx, tz });
  }

  if (queue.length === 0) {
    let avgTx = 0;
    let avgTz = 0;
    for (const { tx, tz } of goalTiles) {
      avgTx += tx;
      avgTz += tz;
    }
    avgTx = Math.round(avgTx / goalTiles.length);
    avgTz = Math.round(avgTz / goalTiles.length);
    outer: for (let r = 0; r <= 6; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (!isFlowGoalSeed(world, buildings, avgTx + dx, avgTz + dz)) continue;
          const idx = gridIdx(avgTx + dx, avgTz + dz);
          dist[idx] = 0;
          queue.push(idx);
          break outer;
        }
      }
    }
  }
  if (queue.length === 0) return null;

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const tx = (cur % gw) + minTx;
    const tz = Math.floor(cur / gw) + minTz;
    const curD = dist[cur];
    for (const [dx, dz] of NEIGHBORS) {
      const nx = tx + dx;
      const nz = tz + dz;
      if (!isWalkable(nx, nz)) continue;
      if (dx !== 0 && dz !== 0) {
        if (!isWalkable(tx + dx, tz) || !isWalkable(tx, tz + dz)) continue;
      }
      const ni = gridIdx(nx, nz);
      if (dist[ni] <= curD + 1) continue;
      dist[ni] = curD + 1;
      queue.push(ni);
    }
  }

  const flowDx = new Int8Array(size);
  const flowDz = new Int8Array(size);
  const tileBesideBlocked = (tx, tz) => {
    for (const [dx, dz] of CARDINALS) {
      if (!isWalkable(tx + dx, tz + dz)) return true;
    }
    return false;
  };
  for (let tz = minTz; tz <= maxTz; tz++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const idx = gridIdx(tx, tz);
      if (dist[idx] === 0 || dist[idx] >= UNREACHABLE) continue;
      let best = dist[idx];
      let bdx = 0;
      let bdz = 0;
      const arrowDirs = tileBesideBlocked(tx, tz) ? CARDINALS : NEIGHBORS;
      for (const [dx, dz] of arrowDirs) {
        const nx = tx + dx;
        const nz = tz + dz;
        if (!hasReach(nx, nz)) continue;
        const ni = gridIdx(nx, nz);
        if (dx !== 0 && dz !== 0) {
          if (!hasReach(tx + dx, tz) || !hasReach(tx, tz + dz)) continue;
        }
        const isCard = dx === 0 || dz === 0;
        const bestIsDiag = bdx !== 0 && bdz !== 0;
        if (dist[ni] < best || (dist[ni] === best && isCard && bestIsDiag)) {
          best = dist[ni];
          bdx = dx;
          bdz = dz;
        }
      }
      flowDx[idx] = bdx;
      flowDz[idx] = bdz;
    }
  }

  const summary = summarizeFlowField(dist, size, goalTiles, seededGoalTiles);
  return {
    minTx, minTz, gw, gh, dist, flowDx, flowDz,
    goalTiles, seededGoalTiles,
    ...summary,
  };
}

/** Rebuild tile flow field at most every 0.5s when aggro enemies are near the player. */
export function tickTileFlowField(time, world, buildings, player, robots) {
  if (!player?.alive || !world) {
    _flow.active = false;
    return;
  }

  let hasAggro = false;
  for (const r of robots ?? []) {
    if (!r.alive || r.emerging) continue;
    if (!r.chasing && !r.aggroByHit) continue;
    if (Math.hypot(r.x - player.x, r.z - player.z) <= FLOW_ACTIVATE_RANGE) {
      hasAggro = true;
      break;
    }
  }

  if (!hasAggro) {
    _flow.active = false;
    return;
  }

  if (_flow.active && time - _flow.builtAt < FLOW_INTERVAL) return;

  const playerBld = getPlayerBuilding(buildings, player);
  const splitInside = playerBld?.doorOpen ? playerBld : null;

  const goal = computeFlowGoal(player, buildings);
  const goalTx = Math.floor(goal.x / TILE);
  const goalTz = Math.floor(goal.z / TILE);

  let minTx = goalTx - FLOW_PAD_TILES;
  let maxTx = goalTx + FLOW_PAD_TILES;
  let minTz = goalTz - FLOW_PAD_TILES;
  let maxTz = goalTz + FLOW_PAD_TILES;

  const playerGoals = getPlayerFlowGoalTiles(player, world, buildings);
  const doorGoals = splitInside
    ? resolveGoalTiles(world, buildings, player, collectDoorSeedTiles(splitInside))
    : null;

  for (const { tx, tz } of playerGoals) {
    minTx = Math.min(minTx, tx - 4);
    maxTx = Math.max(maxTx, tx + 4);
    minTz = Math.min(minTz, tz - 4);
    maxTz = Math.max(maxTz, tz + 4);
  }
  if (doorGoals) {
    for (const { tx, tz } of doorGoals) {
      minTx = Math.min(minTx, tx - 4);
      maxTx = Math.max(maxTx, tx + 4);
      minTz = Math.min(minTz, tz - 4);
      maxTz = Math.max(maxTz, tz + 4);
    }
  }

  for (const r of robots ?? []) {
    if (!r.alive || (!r.chasing && !r.aggroByHit)) continue;
    const rtx = Math.floor(r.x / TILE);
    const rtz = Math.floor(r.z / TILE);
    minTx = Math.min(minTx, rtx - 4);
    maxTx = Math.max(maxTx, rtx + 4);
    minTz = Math.min(minTz, rtz - 4);
    maxTz = Math.max(maxTz, rtz + 4);
  }

  if (splitInside) {
    const exterior = buildTileFlowField(world, buildings, doorGoals, minTx, minTz, maxTx, maxTz);
    const interior = buildTileFlowField(world, buildings, playerGoals, minTx, minTz, maxTx, maxTz);
    if (!exterior || !interior) {
      _flow.active = false;
      return;
    }
    _flow.active = true;
    _flow.builtAt = time;
    _flow.mode = 'split';
    _flow.playerBuilding = splitInside;
    _flow.field = null;
    _flow.exterior = exterior;
    _flow.interior = interior;
    _flow.layerMask = buildSplitLayerMask(buildings, splitInside, minTx, minTz, exterior.gw, exterior.gh);
    _flow.stats = {
      maxReach: Math.max(exterior.maxReach, interior.maxReach),
      reachCount: exterior.reachCount + interior.reachCount,
      blockCount: exterior.blockCount + interior.blockCount,
    };
    return;
  }

  const field = buildTileFlowField(world, buildings, playerGoals, minTx, minTz, maxTx, maxTz);
  if (!field) {
    _flow.active = false;
    return;
  }

  _flow.active = true;
  _flow.builtAt = time;
  _flow.mode = 'unified';
  _flow.playerBuilding = null;
  _flow.field = field;
  _flow.exterior = null;
  _flow.interior = null;
  _flow.layerMask = null;
  _flow.stats = {
    maxReach: field.maxReach,
    reachCount: field.reachCount,
    blockCount: field.blockCount,
  };
}

/** Debug hook — current tile flow field snapshot. */
export function getTileFlowFieldDebug() {
  if (!_flow.active) return null;
  return { ..._flow };
}

/** Pick exterior/interior layer for F3 overlay at a tile. */
export function getFlowDebugLayerForTile(buildings, player, tx, tz) {
  if (!_flow.active) return null;
  const wx = (tx + 0.5) * TILE;
  const wz = (tz + 0.5) * TILE;
  return pickFlowLayer(wx, wz, buildings, null);
}

function nearestReachableTile(wx, wz, field) {
  if (!field?.dist) return -1;
  const tx = Math.floor(wx / TILE);
  const tz = Math.floor(wz / TILE);
  let bestIdx = -1;
  let bestD = UNREACHABLE;
  for (let r = 0; r <= 3; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const ntx = tx + dx;
        const ntz = tz + dz;
        if (ntx < field.minTx || ntx >= field.minTx + field.gw) continue;
        if (ntz < field.minTz || ntz >= field.minTz + field.gh) continue;
        const idx = tileIdx(field, ntx, ntz);
        if (field.dist[idx] < bestD) {
          bestD = field.dist[idx];
          bestIdx = idx;
        }
      }
    }
    if (bestIdx >= 0) break;
  }
  return bestIdx;
}

function tileFlowVector(tx, tz, field) {
  if (!field?.dist) return null;
  if (tx < field.minTx || tx >= field.minTx + field.gw) return null;
  if (tz < field.minTz || tz >= field.minTz + field.gh) return null;

  const idx = tileIdx(field, tx, tz);
  if (field.dist[idx] >= UNREACHABLE) return null;

  const fdx = field.flowDx[idx];
  const fdz = field.flowDz[idx];
  if (fdx !== 0 || fdz !== 0) return { x: fdx, z: fdz };

  if (field.dist[idx] === 0) return null;

  let bestDx = 0;
  let bestDz = 0;
  let best = field.dist[idx];
  for (const [dx, dz] of NEIGHBORS) {
    const ntx = tx + dx;
    const ntz = tz + dz;
    if (ntx < field.minTx || ntx >= field.minTx + field.gw) continue;
    if (ntz < field.minTz || ntz >= field.minTz + field.gh) continue;
    const ni = tileIdx(field, ntx, ntz);
    if (field.dist[ni] < best) {
      best = field.dist[ni];
      bestDx = dx;
      bestDz = dz;
    }
  }
  if (best < field.dist[idx]) return { x: bestDx, z: bestDz };
  return null;
}

function readDiscreteTileFlowDir(wx, wz, field) {
  const tx = Math.floor(wx / TILE);
  const tz = Math.floor(wz / TILE);
  let vec = tileFlowVector(tx, tz, field);
  if (!vec) {
    const idx = nearestReachableTile(wx, wz, field);
    if (idx >= 0) {
      const ntx = (idx % field.gw) + field.minTx;
      const ntz = Math.floor(idx / field.gw) + field.minTz;
      vec = tileFlowVector(ntx, ntz, field);
    }
  }
  if (!vec) return null;
  return dirNorm(vec.x, vec.z);
}

function flowDistAt(field, wx, wz) {
  if (!field?.dist) return UNREACHABLE;
  const tx = Math.floor(wx / TILE);
  const tz = Math.floor(wz / TILE);
  if (tx < field.minTx || tx >= field.minTx + field.gw) return UNREACHABLE;
  if (tz < field.minTz || tz >= field.minTz + field.gh) return UNREACHABLE;
  return field.dist[fieldTileIdx(field, tx, tz)];
}

function fieldTileIdx(field, tx, tz) {
  return (tz - field.minTz) * field.gw + (tx - field.minTx);
}

function fieldInBounds(field, tx, tz) {
  return tx >= field.minTx && tx < field.minTx + field.gw
    && tz >= field.minTz && tz < field.minTz + field.gh;
}

function distGradientDir(wx, wz, field) {
  const here = flowDistAt(field, wx, wz);
  if (here >= UNREACHABLE) return null;
  let best = here;
  let bdx = 0;
  let bdz = 0;
  for (const [dx, dz] of CARDINALS) {
    const d = flowDistAt(field, wx + dx * TILE * 0.45, wz + dz * TILE * 0.45);
    if (d < best) {
      best = d;
      bdx = dx;
      bdz = dz;
    }
  }
  if (best < here) return dirNorm(bdx, bdz);
  return null;
}

function isNearNavObstacle(world, wx, wz, buildings = null) {
  const navOpts = { forNav: true, ...(buildings ? { buildings } : {}) };
  for (const [dx, dz] of CARDINALS) {
    const px = wx + dx * TILE * 0.36;
    const pz = wz + dz * TILE * 0.36;
    if (world.checkCollisionShape(px, pz, WALL_PROBE, true, navOpts)) return true;
  }
  return false;
}

function pickBestMovableCardinal(robot, world, buildings, field, prefer, dt) {
  const shape = robot.getMoveCollider();
  const moveOpts = buildings ? { buildings } : {};
  const step = Math.max(0.08, robot.speed * dt * 1.15);
  const here = flowDistAt(field, robot.x, robot.z);

  const ranked = CARDINALS.map(([dx, dz]) => ({
    dx,
    dz,
    sampleD: flowDistAt(field, robot.x + dx * TILE * 0.4, robot.z + dz * TILE * 0.4),
    dot: dx * prefer.dirX + dz * prefer.dirZ,
  }));
  ranked.sort((a, b) => a.sampleD - b.sampleD || b.dot - a.dot);

  const tryMove = (needLowerDist) => {
    for (const { dx, dz, sampleD } of ranked) {
      if (needLowerDist && sampleD >= here) continue;
      const r = world.moveAxisShape(robot.x, robot.z, dx * step, dz * step, shape, moveOpts);
      if (Math.hypot(r.x - robot.x, r.z - robot.z) > step * 0.05) {
        return dirNorm(dx, dz);
      }
    }
    return null;
  };

  return tryMove(true) ?? tryMove(false);
}

/** Smooth flow direction across tile corners — reduces edge flipping. */
function readBilinearFlowDir(wx, wz, field) {
  if (!field?.flowDx) return null;

  const gx = wx / TILE;
  const gz = wz / TILE;
  const tx0 = Math.floor(gx);
  const tz0 = Math.floor(gz);
  const fx = gx - tx0;
  const fz = gz - tz0;

  let vx = 0;
  let vz = 0;
  let wSum = 0;
  const samples = [
    { tx: tx0, tz: tz0, w: (1 - fx) * (1 - fz) },
    { tx: tx0 + 1, tz: tz0, w: fx * (1 - fz) },
    { tx: tx0, tz: tz0 + 1, w: (1 - fx) * fz },
    { tx: tx0 + 1, tz: tz0 + 1, w: fx * fz },
  ];

  for (const s of samples) {
    if (s.w < 1e-6) continue;
    const vec = tileFlowVector(s.tx, s.tz, field);
    if (!vec) continue;
    vx += vec.x * s.w;
    vz += vec.z * s.w;
    wSum += s.w;
  }

  if (wSum < 1e-5) return readDiscreteTileFlowDir(wx, wz, field);

  if (Math.hypot(vx, vz) < 0.08) {
    return distGradientDir(wx, wz, field) ?? readDiscreteTileFlowDir(wx, wz, field);
  }
  return dirNorm(vx, vz);
}

function readChaseFlowDir(wx, wz, buildings, robot, world, dt) {
  const field = pickFlowLayer(wx, wz, buildings, robot);
  if (!field) return null;

  const nearWall = world && isNearNavObstacle(world, wx, wz, buildings);
  if (nearWall) {
    const grad = distGradientDir(wx, wz, field);
    const prefer = grad ?? readDiscreteTileFlowDir(wx, wz, field);
    if (prefer && robot && world) {
      const movable = pickBestMovableCardinal(robot, world, buildings, field, prefer, dt);
      if (movable) return movable;
    }
    return grad ?? readDiscreteTileFlowDir(wx, wz, field);
  }

  const bilinear = readBilinearFlowDir(wx, wz, field);
  if (bilinear && Math.abs(bilinear.dirX) > 0.15 && Math.abs(bilinear.dirZ) > 0.15) {
    return distGradientDir(wx, wz, field) ?? bilinear;
  }
  return bilinear;
}

function astarHeuristic(tx, tz, goalTx, goalTz) {
  return (Math.abs(goalTx - tx) + Math.abs(goalTz - tz)) * ASTAR_STEP_COST;
}

function findNearestWalkableTile(world, buildings, field, tx, tz, maxR = 6) {
  if (fieldInBounds(field, tx, tz) && isTileWalkable(world, buildings, tx, tz)) {
    return { tx, tz };
  }
  for (let r = 1; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const ntx = tx + dx;
        const ntz = tz + dz;
        if (!fieldInBounds(field, ntx, ntz)) continue;
        if (isTileWalkable(world, buildings, ntx, ntz)) return { tx: ntx, tz: ntz };
      }
    }
  }
  return null;
}

function findTileAstar(world, buildings, field, startTx, startTz, goalTx, goalTz) {
  if (!fieldInBounds(field, startTx, startTz)) return null;
  const goal = findNearestWalkableTile(world, buildings, field, goalTx, goalTz);
  if (!goal) return null;

  const size = field.gw * field.gh;
  const gScore = new Int32Array(size);
  const fScore = new Int32Array(size);
  const cameFrom = new Int32Array(size);
  gScore.fill(UNREACHABLE);
  fScore.fill(UNREACHABLE);
  cameFrom.fill(-1);

  const startIdx = fieldTileIdx(field, startTx, startTz);
  const goalIdx = fieldTileIdx(field, goal.tx, goal.tz);
  if (startIdx === goalIdx) return [];

  gScore[startIdx] = 0;
  fScore[startIdx] = astarHeuristic(startTx, startTz, goal.tx, goal.tz);
  const open = [startIdx];

  while (open.length > 0) {
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestI]]) bestI = i;
    }
    const cur = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();

    if (cur === goalIdx) {
      const path = [];
      let idx = cur;
      while (idx !== startIdx && idx >= 0) {
        const tx = (idx % field.gw) + field.minTx;
        const tz = Math.floor(idx / field.gw) + field.minTz;
        path.push({ tx, tz });
        idx = cameFrom[idx];
      }
      path.reverse();
      return path;
    }

    const tx = (cur % field.gw) + field.minTx;
    const tz = Math.floor(cur / field.gw) + field.minTz;
    const curG = gScore[cur];

    for (const [dx, dz] of NEIGHBORS) {
      const nx = tx + dx;
      const nz = tz + dz;
      if (!fieldInBounds(field, nx, nz)) continue;
      if (!isTileWalkable(world, buildings, nx, nz)) continue;
      if (dx !== 0 && dz !== 0) {
        if (!isTileWalkable(world, buildings, tx + dx, tz)
          || !isTileWalkable(world, buildings, tx, tz + dz)) continue;
      }
      const ni = fieldTileIdx(field, nx, nz);
      const step = (dx !== 0 && dz !== 0) ? ASTAR_DIAG_COST : ASTAR_STEP_COST;
      const tentative = curG + step;
      if (tentative >= gScore[ni]) continue;
      cameFrom[ni] = cur;
      gScore[ni] = tentative;
      fScore[ni] = tentative + astarHeuristic(nx, nz, goal.tx, goal.tz);
      if (!open.includes(ni)) open.push(ni);
    }
  }
  return null;
}

function clearAstarPlan(nav) {
  nav.astarPath = null;
  nav.astarIdx = 0;
  nav.astarGoalKey = null;
  nav.astarAt = -999;
}

function maybeRefreshAstarPath(robot, world, buildings, goal, nav, time) {
  const stuck = nav.stuckTime ?? 0;
  if (stuck < STUCK_ASTAR_THRESHOLD) {
    if (nav.astarPath) clearAstarPlan(nav);
    return;
  }

  const goalKey = `${goal.kind}:${Math.round(goal.x)}:${Math.round(goal.z)}`;
  if (nav.astarGoalKey === goalKey && (time - (nav.astarAt ?? -999)) < ASTAR_PATH_TTL) {
    return;
  }

  const field = pickFlowLayer(robot.x, robot.z, buildings, robot);
  if (!field) return;

  const startTx = Math.floor(robot.x / TILE);
  const startTz = Math.floor(robot.z / TILE);
  const goalTx = Math.floor(goal.x / TILE);
  const goalTz = Math.floor(goal.z / TILE);
  const path = findTileAstar(world, buildings, field, startTx, startTz, goalTx, goalTz);

  nav.astarPath = path;
  nav.astarIdx = 0;
  nav.astarGoalKey = goalKey;
  nav.astarAt = time;
}

function followAstarPath(robot, nav, goal) {
  const path = nav.astarPath;
  if (!path?.length) return null;

  let idx = nav.astarIdx ?? 0;
  while (idx < path.length) {
    const wp = path[idx];
    const wx = (wp.tx + 0.5) * TILE;
    const wz = (wp.tz + 0.5) * TILE;
    if (Math.hypot(robot.x - wx, robot.z - wz) > TILE * 0.32) {
      nav.astarIdx = idx;
      return dirTo(robot.x, robot.z, wx, wz);
    }
    idx++;
  }

  nav.astarIdx = path.length;
  return dirTo(robot.x, robot.z, goal.x, goal.z);
}

function readTileFlowDir(wx, wz, world = null, buildings = null, robot = null, dt = 1 / 60) {
  return readChaseFlowDir(wx, wz, buildings, robot, world, dt);
}

// ─── Goals ──────────────────────────────────────────────────────────────────

export function getChaseGoal(robot, player, buildings, world) {
  const playerBld = getPlayerBuilding(buildings, player);
  const enemyBld = buildings?.getEntityBuildingAt?.(robot) ?? null;

  if (playerBld && playerBld !== enemyBld) {
    const door = getDoorWorldPos(playerBld);
    if (!playerBld.doorOpen) {
      const outsideZ = playerBld.originZ + playerBld.h * TILE + TILE * 0.55;
      return { x: door.x, z: outsideZ, kind: 'door-closed' };
    }
    if (enemyBld === playerBld) {
      const center = getEntityMoveGoalCenter(player, 8);
      return { x: center.x, z: center.z, kind: 'player' };
    }
    return getDoorApproachGoal(playerBld, robot, player, buildings);
  }

  if (enemyBld && enemyBld !== playerBld) {
    const door = getDoorWorldPos(enemyBld);
    if (!enemyBld.doorOpen) {
      const outsideZ = enemyBld.originZ + enemyBld.h * TILE + TILE * 0.55;
      return { x: door.x, z: outsideZ, kind: 'door-closed' };
    }
    return { x: door.x, z: door.z, kind: 'door-exit' };
  }

  const center = getEntityMoveGoalCenter(player, 8);
  return { x: center.x, z: center.z, kind: 'player' };
}

function getMindGoal(robot, player, buildings, world) {
  if (robot.searchPhase === 'search' && robot.hasLastKnown) {
    const playerBld = getPlayerBuilding(buildings, player);
    const enemyBld = buildings?.getEntityBuildingAt?.(robot) ?? null;
    if (playerBld && playerBld !== enemyBld && !playerBld.doorOpen) {
      const door = getDoorWorldPos(playerBld);
      const outsideZ = playerBld.originZ + playerBld.h * TILE + TILE * 0.55;
      return { x: door.x, z: outsideZ, kind: 'door-closed' };
    }
    return { x: robot.lastKnownX, z: robot.lastKnownZ, kind: 'last_known' };
  }
  return getChaseGoal(robot, player, buildings, world);
}

// ─── Combat mind ────────────────────────────────────────────────────────────

export function canEnemySeePlayer(robot, player, world, buildings, detectRange) {
  const dist = Math.hypot(player.x - robot.x, player.z - robot.z);
  if (dist >= detectRange) return false;

  const robotFeetZ = entityFeetZ(robot);
  const playerFeetZ = entityFeetZ(player);
  if (!world.hasLineOfSight(robot.x, robot.z, player.x, player.z, 0.3, robotFeetZ, playerFeetZ)) {
    return false;
  }

  const playerBld = getPlayerBuilding(buildings, player);
  const enemyBld = buildings?.getEntityBuildingAt?.(robot) ?? null;
  if (playerBld && playerBld !== enemyBld && !playerBld.doorOpen) return false;
  return true;
}

export function updateEnemySpotTimer(robot, canSee, dt) {
  if (canSee) robot.spotTimer = (robot.spotTimer ?? 0) + dt;
  else if (!robot.aggroByHit && !robot.chasing) robot.spotTimer = 0;
}

export function isEnemySpotted(robot) {
  return robot.aggroByHit || (robot.spotTimer ?? 0) >= ENEMY_SPOT_DELAY;
}

export function shouldEnemyChase(robot, dist, chaseRange, canSee) {
  if (!isEnemySpotted(robot) && !robot.chasing) return false;
  if (canSee && isEnemySpotted(robot)) return true;
  if (robot.chasing) return true;
  if (robot.aggroByHit) return true;
  return robot.chasing && dist < chaseRange;
}

export function isEnemyAlert(robot) {
  return robot.searchPhase === 'search' && robot.chasing;
}

export function hasLostSightForGood(robot) {
  return robot.searchPhase === 'search'
    && (robot.searchTimer ?? 0) >= ENEMY_ALERT_WANDER_DURATION;
}

export function getEnemyDetectRange(robot, player, baseRange) {
  const stealth = player.getStealthMult?.() ?? 1;
  const alertMult = isEnemyAlert(robot) ? ENEMY_ALERT_DETECT_MULT : 1;
  return baseRange * stealth * alertMult;
}

export function getEnemyStatusIcon(robot) {
  if (!robot.chasing && !robot.aggroByHit) return null;
  if (isEnemyAlert(robot)) return 'enemy_search';
  return 'enemy_aggro';
}

export function isAtLastKnown(robot) {
  if (!robot.hasLastKnown) return false;
  return Math.hypot(robot.x - robot.lastKnownX, robot.z - robot.lastKnownZ) <= LAST_KNOWN_REACH;
}

export function resetNavPlan(nav) {
  if (!nav) return;
  nav.stuckTime = 0;
  nav.goalKey = null;
  clearAstarPlan(nav);
}

export function ensureNavState(robot) {
  if (!robot._nav) {
    robot._nav = {
      stuckTime: 0,
      idleTime: 0,
      anchorTime: 0,
      anchorX: null,
      anchorZ: null,
      goalKey: null,
      astarPath: null,
      astarIdx: 0,
      astarGoalKey: null,
      astarAt: -999,
    };
  }
  return robot._nav;
}

export function resetEnemySearchCycle(robot) {
  robot.searchPhase = 'chase';
  robot.searchTimer = 0;
  robot.investigateTimer = 0;
  if (robot._nav) {
    robot._nav.stuckTime = 0;
    robot._nav.anchorTime = 0;
    robot._nav.anchorX = robot.x;
    robot._nav.anchorZ = robot.z;
    clearAstarPlan(robot._nav);
  }
}

export function clearEnemyCombatState(robot) {
  robot.chasing = false;
  robot.aggroByHit = false;
  robot.spotTimer = 0;
  robot.searchPhase = null;
  robot.searchTimer = 0;
  robot.investigateTimer = 0;
  robot.hasLastKnown = false;
  if (robot._nav) {
    robot._nav.stuckTime = 0;
    robot._nav.idleTime = 0;
    robot._nav.anchorTime = 0;
    robot._nav.anchorX = robot.x;
    robot._nav.anchorZ = robot.z;
    robot._nav.goalKey = null;
    clearAstarPlan(robot._nav);
  }
}

export function advanceEnemySearchPhase(robot, canSee, dt, player, buildings) {
  if (!robot.chasing && !robot.aggroByHit) {
    robot.searchPhase = null;
    robot.searchTimer = 0;
    return { forget: false };
  }

  const idle = robot._nav?.idleTime ?? 0;
  const anchored = robot._nav?.anchorTime ?? 0;
  if (idle >= ENEMY_IDLE_FORGET_TIME || anchored >= ENEMY_IDLE_FORGET_TIME) {
    return { forget: true };
  }

  if (player && buildings && isPlayerBehindClosedDoor(player, buildings)) {
    const enemyBld = buildings.getEntityBuildingAt?.(robot);
    const playerBld = getPlayerBuilding(buildings, player);
    if (playerBld && playerBld !== enemyBld) {
      robot.searchPhase = 'search';
      robot.searchTimer = (robot.searchTimer ?? 0) + dt;
      if (robot.searchTimer >= ENEMY_ALERT_WANDER_DURATION) return { forget: true };
      return { forget: false };
    }
  }

  if (player && buildings && idle >= 3.0) {
    const playerBld = getPlayerBuilding(buildings, player);
    const enemyBld = buildings.getEntityBuildingAt?.(robot);
    if (playerBld?.doorOpen && playerBld !== enemyBld) {
      const col = robot.getMoveCollider?.();
      if (shapeOverlapsOpenDoorNavZone(buildings, robot.x, robot.z, col)) {
        robot.searchPhase = 'search';
        robot.searchTimer = (robot.searchTimer ?? 0) + dt;
        if (robot.searchTimer >= ENEMY_ALERT_WANDER_DURATION) return { forget: true };
        return { forget: false };
      }
    }
  }

  if (canSee) {
    const playerBld = player && buildings ? getPlayerBuilding(buildings, player) : null;
    const enemyBld = buildings?.getEntityBuildingAt?.(robot) ?? null;
    const col = robot.getMoveCollider?.();
    const doorCamping = playerBld && playerBld !== enemyBld && playerBld.doorOpen
      && shapeOverlapsOpenDoorNavZone(buildings, robot.x, robot.z, col)
      && (robot._nav?.idleTime ?? 0) >= 1.25;
    if (!doorCamping) resetEnemySearchCycle(robot);
    return { forget: false };
  }

  if (!robot.hasLastKnown) {
    robot.lastKnownX = robot.x;
    robot.lastKnownZ = robot.z;
    robot.hasLastKnown = true;
  }

  if (!robot.searchPhase || robot.searchPhase === 'chase') {
    robot.searchPhase = 'investigate';
    robot.investigateTimer = 0;
  }

  if (robot.searchPhase === 'investigate') {
    robot.investigateTimer = (robot.investigateTimer ?? 0) + dt;
    if (isAtLastKnown(robot) && robot.investigateTimer >= ENEMY_INVESTIGATE_MIN) {
      robot.searchPhase = 'search';
      robot.searchTimer = 0;
    }
  }

  if (robot.searchPhase === 'search') {
    robot.searchTimer = (robot.searchTimer ?? 0) + dt;
    if (robot.searchTimer >= ENEMY_ALERT_WANDER_DURATION) return { forget: true };
  }

  return { forget: false };
}

export function updateEnemyLastKnown(robot, player, canSee) {
  if (!canSee) return;
  const center = getEntityMoveGoalCenter(player, 8);
  robot.lastKnownX = center.x;
  robot.lastKnownZ = center.z;
  robot.hasLastKnown = true;
}

export function updateChaseNav(robot, player, world, buildings, time, dt = 1 / 60) {
  const nav = ensureNavState(robot);
  const goal = getMindGoal(robot, player, buildings, world);
  const navShape = robot.getMoveCollider();
  const goalKey = `${goal.kind}:${Math.round(goal.x)}:${Math.round(goal.z)}`;
  if (nav.goalKey !== goalKey) {
    nav.goalKey = goalKey;
    nav.stuckTime = 0;
    clearAstarPlan(nav);
  }

  const prefer = dirTo(robot.x, robot.z, goal.x, goal.z);

  if (canWalkDirect(world, robot.x, robot.z, goal.x, goal.z, navShape, buildings)) {
    return { dirX: prefer.dirX, dirZ: prefer.dirZ, forget: false, goalX: goal.x, goalZ: goal.z };
  }

  const nearWall = isNearNavObstacle(world, robot.x, robot.z, buildings);
  const astarAfter = nearWall ? STUCK_ASTAR_NEAR_WALL : STUCK_ASTAR_THRESHOLD;

  maybeRefreshAstarPath(robot, world, buildings, goal, nav, time);
  if ((nav.stuckTime ?? 0) >= astarAfter && nav.astarPath) {
    const astarDir = followAstarPath(robot, nav, goal);
    if (astarDir) {
      return { dirX: astarDir.dirX, dirZ: astarDir.dirZ, forget: false, goalX: goal.x, goalZ: goal.z };
    }
  }

  const flowDir = readChaseFlowDir(robot.x, robot.z, buildings, robot, world, dt);
  if (flowDir) {
    return { dirX: flowDir.dirX, dirZ: flowDir.dirZ, forget: false, goalX: goal.x, goalZ: goal.z };
  }

  return { dirX: prefer.dirX, dirZ: prefer.dirZ, forget: false, goalX: goal.x, goalZ: goal.z };
}

export function noteChaseMoveResult(robot, moved, dt) {
  const nav = ensureNavState(robot);
  const anchorEps = TILE * 0.38;
  if (nav.anchorX == null) {
    nav.anchorX = robot.x;
    nav.anchorZ = robot.z;
    nav.anchorTime = 0;
  }
  if (Math.hypot(robot.x - nav.anchorX, robot.z - nav.anchorZ) > anchorEps) {
    nav.anchorX = robot.x;
    nav.anchorZ = robot.z;
    nav.anchorTime = 0;
  } else {
    nav.anchorTime = (nav.anchorTime ?? 0) + dt;
  }

  if (moved) {
    nav.stuckTime = 0;
    nav.idleTime = 0;
    clearAstarPlan(nav);
  } else {
    nav.stuckTime = (nav.stuckTime ?? 0) + dt;
    nav.idleTime = (nav.idleTime ?? 0) + dt;
  }
}

export function canMeleeTarget(world, ax, az, tx, tz) {
  return world.hasLineOfSight(ax, az, tx, tz, 0.3);
}
