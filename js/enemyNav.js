import { TILE } from './worldGen.js';
import { getDoorWorldPos, entityFeetZ } from './buildingGen.js';

const FORGET_AFTER = 4;
const PATH_INTERVAL = 0.35;
const WAYPOINT_REACH = TILE * 0.45;
const GRID_MARGIN = 14;
const MAX_GRID = 52;

/** Seconds of uninterrupted LOS before an enemy starts chasing. */
export const ENEMY_SPOT_DELAY = 1.0;

/** Seconds of aggressive wander after reaching last known position without sight. */
export const ENEMY_ALERT_WANDER_DURATION = 5.0;

/** Reach distance for the last-known player position. */
export const LAST_KNOWN_REACH = TILE * 0.55;

/** Detection multiplier while in alert search (after grace, before give-up). */
export const ENEMY_ALERT_DETECT_MULT = 1.2;

/** Wander speed multiplier while alert. */
export const ENEMY_ALERT_WANDER_SPEED = 0.82;

export const SPIDER_DETECT_RANGE = 28;
export const SCOUT_DETECT_RANGE = 36;

export function updateEnemySpotTimer(robot, canSee, dt) {
  if (canSee) {
    robot.spotTimer = (robot.spotTimer ?? 0) + dt;
  } else if (!robot.aggroByHit && !robot.chasing) {
    robot.spotTimer = 0;
  }
}

export function isEnemySpotted(robot) {
  return robot.aggroByHit || (robot.spotTimer ?? 0) >= ENEMY_SPOT_DELAY;
}

export function hasLostSightForGood(robot) {
  return robot.searchPhase === 'alert_wander'
    && (robot.alertWanderTimer ?? 0) >= ENEMY_ALERT_WANDER_DURATION;
}

export function isEnemyAlert(robot) {
  return robot.searchPhase === 'alert_wander' && robot.chasing;
}

export function updateEnemyLastKnown(robot, player, canSee) {
  if (!canSee) return;
  robot.lastKnownX = player.x;
  robot.lastKnownZ = player.z;
  robot.hasLastKnown = true;
}

export function resetEnemySearchCycle(robot) {
  robot.searchPhase = 'chase';
  robot.alertWanderTimer = 0;
  const nav = robot._nav;
  if (nav) {
    nav.waypoints = null;
    nav.wpIdx = 0;
    nav.unreachableSince = null;
    nav.lastGoalKind = null;
  }
}

export function isAtLastKnown(robot) {
  if (!robot.hasLastKnown) return false;
  return Math.hypot(robot.x - robot.lastKnownX, robot.z - robot.lastKnownZ) <= LAST_KNOWN_REACH;
}

export function advanceEnemySearchPhase(robot, canSee, dt) {
  if (!robot.chasing && !robot.aggroByHit) {
    robot.searchPhase = null;
    robot.alertWanderTimer = 0;
    return { forget: false };
  }
  if (canSee) {
    resetEnemySearchCycle(robot);
    return { forget: false };
  }
  if (!robot.hasLastKnown) {
    robot.lastKnownX = robot.x;
    robot.lastKnownZ = robot.z;
    robot.hasLastKnown = true;
  }
  if (!robot.searchPhase || robot.searchPhase === 'chase') {
    robot.searchPhase = 'path_to_last';
  }
  if (robot.searchPhase === 'path_to_last' && isAtLastKnown(robot)) {
    robot.searchPhase = 'alert_wander';
    robot.alertWanderTimer = 0;
  }
  if (robot.searchPhase === 'alert_wander') {
    robot.alertWanderTimer = (robot.alertWanderTimer ?? 0) + dt;
    if (robot.alertWanderTimer >= ENEMY_ALERT_WANDER_DURATION) {
      return { forget: true };
    }
  }
  return { forget: false };
}

export function clearEnemyCombatState(robot) {
  robot.chasing = false;
  robot.aggroByHit = false;
  robot.spotTimer = 0;
  robot.searchPhase = null;
  robot.alertWanderTimer = 0;
  robot.hasLastKnown = false;
  const nav = robot._nav;
  if (nav) {
    nav.waypoints = null;
    nav.wpIdx = 0;
    nav.unreachableSince = null;
    nav.lastGoalKind = null;
  }
}

export function canEnemySeePlayer(robot, player, world, buildings, detectRange) {
  const dist = Math.hypot(player.x - robot.x, player.z - robot.z);
  if (dist >= detectRange) return false;
  const robotFeetZ = entityFeetZ(robot);
  const playerFeetZ = entityFeetZ(player);
  if (!world.hasLineOfSight(robot.x, robot.z, player.x, player.z, 0.3, robotFeetZ, playerFeetZ)) {
    return false;
  }
  if (!buildings) return true;

  const playerBld = buildings.getBuildingAt(player.x, player.z, playerFeetZ);
  const enemyBld = buildings.getEntityBuildingAt?.(robot) ?? null;

  if (playerBld && playerBld !== enemyBld) {
    if (!playerBld.doorOpen) return false;
    const col = robot.getWorldCollider();
    if (!canWalkDirect(world, robot.x, robot.z, player.x, player.z, col, buildings)) {
      return false;
    }
  }
  return true;
}

/** UI sprite name for status icon above enemy head, or null. */
export function getEnemyStatusIcon(robot) {
  if (!robot.chasing && !robot.aggroByHit) return null;
  if (isEnemyAlert(robot)) return 'enemy_search';
  return 'enemy_aggro';
}

export function getEnemyDetectRange(robot, player, baseRange) {
  const stealth = player.getStealthMult?.() ?? 1;
  const alertMult = isEnemyAlert(robot) ? ENEMY_ALERT_DETECT_MULT : 1;
  return baseRange * stealth * alertMult;
}

export function shouldEnemyChase(robot, dist, chaseRange, canSee) {
  if (!isEnemySpotted(robot) && !robot.chasing) return false;
  if (canSee && isEnemySpotted(robot)) return true;
  if (robot.chasing) return true;
  if (robot.aggroByHit) return true;
  return canSee || (robot.chasing && dist < chaseRange);
}

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
    const tx = Math.floor(lx / TILE);
    const tz = Math.floor(lz / TILE);
    if (tx === doorTx && tz === doorTz) return true;
  }
  return false;
}

function navCollider(col) {
  const pad = 0.38;
  return {
    kind: 'aabb',
    zOff: col.zOff,
    halfW: col.halfW + pad,
    halfH: col.halfH + pad,
  };
}

function isWalkable(world, wx, wz, shape, buildings) {
  if (isClosedDoorTile(buildings, wx, wz)) return false;
  return !world.checkCollisionShape(wx, wz, shape, true, { forNav: true });
}

/** Straight-line walk test — LOS alone is not enough when walls block movement. */
export function canWalkDirect(world, ax, az, bx, bz, shape, buildings = null) {
  const navShape = navCollider(shape);
  const dist = Math.hypot(bx - ax, bz - az);
  if (dist < 0.05) return true;
  const steps = Math.max(2, Math.ceil(dist / (TILE * 0.3)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (!isWalkable(world, x, z, navShape, buildings)) return false;
  }
  return true;
}

/**
 * Chase target — route through doors when either side is separated by building walls.
 */
export function getChaseGoal(robot, player, buildings, world) {
  const col = navCollider(robot.getWorldCollider());
  const playerFeetZ = entityFeetZ(player);
  const playerBuilding = buildings?.getBuildingAt?.(player.x, player.z, playerFeetZ) ?? null;
  const enemyBuilding = buildings?.getEntityBuildingAt?.(robot) ?? null;

  if (playerBuilding && playerBuilding !== enemyBuilding) {
    if (!playerBuilding.doorOpen) {
      const door = getDoorWorldPos(playerBuilding);
      const outsideZ = playerBuilding.originZ + playerBuilding.h * TILE + TILE * 0.55;
      return { x: door.x, z: outsideZ, kind: 'door-outside' };
    }
    const door = getDoorWorldPos(playerBuilding);
    if (canWalkDirect(world, robot.x, robot.z, player.x, player.z, col, buildings)) {
      return { x: player.x, z: player.z, kind: 'player' };
    }
    return { x: door.x, z: door.z, kind: 'door-enter' };
  }

  if (enemyBuilding && enemyBuilding !== playerBuilding) {
    if (!enemyBuilding.doorOpen) {
      const door = getDoorWorldPos(enemyBuilding);
      const outsideZ = enemyBuilding.originZ + enemyBuilding.h * TILE + TILE * 0.55;
      return { x: door.x, z: outsideZ, kind: 'door-outside' };
    }
    const door = getDoorWorldPos(enemyBuilding);
    if (canWalkDirect(world, robot.x, robot.z, player.x, player.z, col, buildings)) {
      return { x: player.x, z: player.z, kind: 'player' };
    }
    return { x: door.x, z: door.z, kind: 'door-enter' };
  }

  return { x: player.x, z: player.z, kind: 'player' };
}

export function findPath(world, fromX, fromZ, toX, toZ, shape, buildings = null) {
  const navShape = navCollider(shape);
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
      if (!isWalkable(world, wx, wz, navShape, buildings)) continue;
      visited[ni] = 1;
      parent[ni] = cur;
      queue.push(ni);
    }
  }

  return null;
}

export function canReachPlayer(robot, player, world, buildings) {
  const col = navCollider(robot.getWorldCollider());
  const goal = getChaseGoal(robot, player, buildings, world);
  if (canWalkDirect(world, robot.x, robot.z, goal.x, goal.z, col, buildings)) return true;
  const path = findPath(world, robot.x, robot.z, goal.x, goal.z, col, buildings);
  return !!path?.length;
}

export function getSearchGoal(robot, player, buildings, world) {
  const playerFeetZ = entityFeetZ(player);
  const playerBld = buildings?.getBuildingAt?.(player.x, player.z, playerFeetZ) ?? null;
  const enemyBld = buildings?.getEntityBuildingAt?.(robot) ?? null;

  if (robot.searchPhase === 'path_to_last' && robot.hasLastKnown) {
    if (playerBld && !playerBld.doorOpen && playerBld !== enemyBld) {
      const door = getDoorWorldPos(playerBld);
      const outsideZ = playerBld.originZ + playerBld.h * TILE + TILE * 0.55;
      return { x: door.x, z: outsideZ, kind: 'door-outside' };
    }
    return { x: robot.lastKnownX, z: robot.lastKnownZ, kind: 'last_known' };
  }
  return getChaseGoal(robot, player, buildings, world);
}

export function updateChaseNav(robot, player, world, buildings, time) {
  const nav = ensureNavState(robot);
  const goal = getSearchGoal(robot, player, buildings, world);
  const col = navCollider(robot.getWorldCollider());
  const playerReachable = canReachPlayer(robot, player, world, buildings);

  if (nav.lastGoalKind !== goal.kind) {
    nav.waypoints = null;
    nav.wpIdx = 0;
    nav.lastGoalKind = goal.kind;
  }

  if (!playerReachable) {
    if (!nav.unreachableSince) nav.unreachableSince = time;
    if (time - nav.unreachableSince >= FORGET_AFTER) {
      return { dirX: 0, dirZ: 0, forget: true };
    }
  } else {
    nav.unreachableSince = null;
  }

  if (canWalkDirect(world, robot.x, robot.z, goal.x, goal.z, col, buildings)) {
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
    nav.waypoints = findPath(world, robot.x, robot.z, goal.x, goal.z, col, buildings);
    nav.wpIdx = 0;
  }

  if (!nav.waypoints?.length) {
    return {
      dirX: goal.x - robot.x,
      dirZ: goal.z - robot.z,
      forget: false,
    };
  }

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
