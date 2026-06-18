import { TILE } from './worldGen.js';
import { getDoorWorldPos } from './buildingGen.js';

const FORGET_AFTER = 5;
const PATH_INTERVAL = 0.35;
const WAYPOINT_REACH = TILE * 0.45;
const GRID_MARGIN = 14;
const MAX_GRID = 52;

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function ensureNavState(robot) {
  if (!robot._nav) {
    robot._nav = {
      waypoints: null,
      wpIdx: 0,
      lastPathAt: -99,
      unreachableSince: null,
      lastGoalKind: null,
    };
  }
  return robot._nav;
}

function isWalkable(world, wx, wz, shape) {
  return !world.checkCollisionShape(wx, wz, shape, true);
}

/** Straight-line walk test — LOS alone is not enough when walls block movement. */
export function canWalkDirect(world, ax, az, bx, bz, shape) {
  const dist = Math.hypot(bx - ax, bz - az);
  if (dist < 0.05) return true;
  const steps = Math.max(2, Math.ceil(dist / (TILE * 0.3)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (!isWalkable(world, x, z, shape)) return false;
  }
  return true;
}

/**
 * Chase target — route through doors when either side is separated by building walls.
 */
export function getChaseGoal(robot, player, buildings, world) {
  const col = robot.getWorldCollider();
  const playerBuilding = buildings?.getBuildingAt?.(player.x, player.z) ?? null;
  const enemyBuilding = buildings?.getEntityBuildingAt?.(robot) ?? null;

  // Player inside, enemy outside (or in another building).
  if (playerBuilding && playerBuilding !== enemyBuilding) {
    const door = getDoorWorldPos(playerBuilding);
    if (playerBuilding.doorOpen) {
      if (canWalkDirect(world, robot.x, robot.z, player.x, player.z, col)) {
        return { x: player.x, z: player.z, kind: 'player' };
      }
      return { x: door.x, z: door.z, kind: 'door-enter' };
    }
    return {
      x: door.x,
      z: playerBuilding.originZ + playerBuilding.h * TILE + TILE * 0.55,
      kind: 'door-outside',
    };
  }

  // Enemy inside, player outside.
  if (enemyBuilding && enemyBuilding !== playerBuilding) {
    const door = getDoorWorldPos(enemyBuilding);
    if (enemyBuilding.doorOpen) {
      if (canWalkDirect(world, robot.x, robot.z, player.x, player.z, col)) {
        return { x: player.x, z: player.z, kind: 'player' };
      }
      return { x: door.x, z: door.z, kind: 'door-exit' };
    }
    return {
      x: door.x,
      z: enemyBuilding.originZ + enemyBuilding.h * TILE + TILE * 0.55,
      kind: 'door-outside',
    };
  }

  return { x: player.x, z: player.z, kind: 'player' };
}

export function findPath(world, fromX, fromZ, toX, toZ, shape) {
  const ftx = Math.floor(fromX / TILE);
  const ftz = Math.floor(fromZ / TILE);
  const ttx = Math.floor(toX / TILE);
  const ttz = Math.floor(toZ / TILE);

  const minTx = Math.min(ftx, ttx) - GRID_MARGIN;
  const maxTx = Math.max(ftx, ttx) + GRID_MARGIN;
  const minTz = Math.min(ftz, ttz) - GRID_MARGIN;
  const maxTz = Math.max(ftz, ttz) + GRID_MARGIN;

  const gw = maxTx - minTx + 1;
  const gh = maxTz - minTz + 1;
  if (gw > MAX_GRID || gh > MAX_GRID) return null;

  const toIdx = (tx, tz) => (tz - minTz) * gw + (tx - minTx);
  const start = toIdx(ftx, ftz);
  const goal = toIdx(ttx, ttz);

  const visited = new Uint8Array(gw * gh);
  const parent = new Int32Array(gw * gh);
  parent.fill(-1);

  const queue = [start];
  visited[start] = 1;

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === goal) {
      const path = [];
      let p = cur;
      while (p !== start) {
        const tx = (p % gw) + minTx;
        const tz = Math.floor(p / gw) + minTz;
        path.push({ x: tx * TILE + TILE * 0.5, z: tz * TILE + TILE * 0.5 });
        p = parent[p];
      }
      path.reverse();
      return path;
    }

    const ctx = (cur % gw) + minTx;
    const ctz = Math.floor(cur / gw) + minTz;
    for (const [dx, dz] of NEIGHBORS) {
      const ntx = ctx + dx;
      const ntz = ctz + dz;
      if (ntx < minTx || ntx > maxTx || ntz < minTz || ntz > maxTz) continue;
      const ni = toIdx(ntx, ntz);
      if (visited[ni]) continue;
      const wx = ntx * TILE + TILE * 0.5;
      const wz = ntz * TILE + TILE * 0.5;
      if (!isWalkable(world, wx, wz, shape)) continue;
      visited[ni] = 1;
      parent[ni] = cur;
      queue.push(ni);
    }
  }

  return null;
}

/**
 * Returns steering toward the next waypoint (or direct line when walk is clear).
 * Sets forget=true when blocked with no route for FORGET_AFTER seconds.
 */
export function updateChaseNav(robot, player, world, buildings, time) {
  const nav = ensureNavState(robot);
  const goal = getChaseGoal(robot, player, buildings, world);
  const col = robot.getWorldCollider();

  if (nav.lastGoalKind !== goal.kind) {
    nav.waypoints = null;
    nav.wpIdx = 0;
    nav.lastGoalKind = goal.kind;
  }

  if (canWalkDirect(world, robot.x, robot.z, goal.x, goal.z, col)) {
    nav.unreachableSince = null;
    nav.waypoints = null;
    return {
      dirX: goal.x - robot.x,
      dirZ: goal.z - robot.z,
      forget: false,
    };
  }

  const needPath = !nav.waypoints || time - nav.lastPathAt >= PATH_INTERVAL;
  if (needPath) {
    nav.lastPathAt = time;
    nav.waypoints = findPath(world, robot.x, robot.z, goal.x, goal.z, col);
    nav.wpIdx = 0;
  }

  if (!nav.waypoints?.length) {
    if (!nav.unreachableSince) nav.unreachableSince = time;
    if (time - nav.unreachableSince >= FORGET_AFTER) {
      return { dirX: 0, dirZ: 0, forget: true };
    }
    return {
      dirX: goal.x - robot.x,
      dirZ: goal.z - robot.z,
      forget: false,
    };
  }

  nav.unreachableSince = null;

  let idx = nav.wpIdx;
  while (idx < nav.waypoints.length) {
    const wp = nav.waypoints[idx];
    if (Math.hypot(robot.x - wp.x, robot.z - wp.z) > WAYPOINT_REACH) break;
    idx += 1;
  }
  nav.wpIdx = idx;
  const target = nav.waypoints[Math.min(idx, nav.waypoints.length - 1)];

  return {
    dirX: target.x - robot.x,
    dirZ: target.z - robot.z,
    forget: false,
  };
}

export function canMeleeTarget(world, ax, az, tx, tz) {
  return world.hasLineOfSight(ax, az, tx, tz, 0.3);
}
