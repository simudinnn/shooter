import { TILE } from './worldGen.js';
import { BUILDING_ART_PX, playerSouthEdgeZ, WALL_COLLISION_PAD } from './buildingGen.js';
import { collectObstaclesInView, obsAabb } from './collisionDebug.js';
import { PPU } from './renderConfig.js';

const ANGLE_EPS = 0.00015;
const VIEW_RAY_COUNT = 24;
const TAU = Math.PI * 2;
/** Ignore hits this close when no wall was hit — stops zero-radius polygon at view bounds. */
const VISION_MIN_HIT = TILE * 0.14;
/** One floor-sprite pixel in world units (16 art px per TILE). */
const FLOOR_PIXEL_WORLD = TILE / BUILDING_ART_PX;
/** Floor art pixel on screen (2px at PPU 8 with TILE 4). */
const FLOOR_SCREEN_PX = Math.max(1, Math.round(FLOOR_PIXEL_WORLD * 2));

function angleTo(x, z, ox, oz) {
  return Math.atan2(x - ox, z - oz);
}

function normAngle(a) {
  a %= TAU;
  if (a < 0) a += TAU;
  return a;
}

function dedupeAngles(sorted) {
  const out = [];
  for (const a of sorted) {
    if (!out.length || a - out[out.length - 1] > 1e-4) out.push(a);
  }
  return out;
}

function raySegmentDist(ox, oz, dx, dz, x1, z1, x2, z2) {
  const vx = x2 - x1;
  const vz = z2 - z1;
  const wx = ox - x1;
  const wz = oz - z1;
  const den = dx * vz - dz * vx;
  if (Math.abs(den) < 1e-10) return Infinity;
  const ua = (vx * wz - vz * wx) / den;
  const ub = (dx * wz - dz * wx) / den;
  if (ua >= 0 && ub >= 0 && ub <= 1) return ua;
  return Infinity;
}

function rayViewBoundsDist(ox, oz, dx, dz, minX, maxX, minZ, maxZ) {
  let best = Infinity;
  if (Math.abs(dx) > 1e-10) {
    const tx = dx > 0 ? (maxX - ox) / dx : (minX - ox) / dx;
    if (tx > 0) best = Math.min(best, tx);
  }
  if (Math.abs(dz) > 1e-10) {
    const tz = dz > 0 ? (maxZ - oz) / dz : (minZ - oz) / dz;
    if (tz > 0) best = Math.min(best, tz);
  }
  return best;
}

function segmentInView(seg, minX, maxX, minZ, maxZ) {
  const sx = Math.min(seg.x1, seg.x2);
  const ex = Math.max(seg.x1, seg.x2);
  const sz = Math.min(seg.z1, seg.z2);
  const ez = Math.max(seg.z1, seg.z2);
  return ex >= minX && sx <= maxX && ez >= minZ && sz <= maxZ;
}

function pushSeg(out, x1, z1, x2, z2, minX, maxX, minZ, maxZ) {
  const seg = { x1, z1, x2, z2 };
  if (segmentInView(seg, minX, maxX, minZ, maxZ)) out.push(seg);
}

function pushRectOutline(out, x0, z0, x1, z1, minX, maxX, minZ, maxZ) {
  pushSeg(out, x0, z0, x1, z0, minX, maxX, minZ, maxZ);
  pushSeg(out, x0, z1, x1, z1, minX, maxX, minZ, maxZ);
  pushSeg(out, x0, z0, x0, z1, minX, maxX, minZ, maxZ);
  pushSeg(out, x1, z0, x1, z1, minX, maxX, minZ, maxZ);
}

function rectContains(x0, z0, x1, z1, ox, oz) {
  return ox >= x0 && ox <= x1 && oz >= z0 && oz <= z1;
}

function snapFloorArt(v) {
  return Math.round(v / FLOOR_PIXEL_WORLD) * FLOOR_PIXEL_WORLD;
}

function projectFogVertex(wx, wz, worldToScreen) {
  const s = worldToScreen(snapFloorArt(wx), snapFloorArt(wz));
  const step = FLOOR_SCREEN_PX;
  return {
    x: Math.round(s.x / step) * step,
    y: Math.round(s.y / step) * step,
  };
}

/** Tight lip bounds for vision — excludes collision padding so fog meets wall art. */
function obsVisionBounds(obs) {
  const halfW = Math.max(0.01, obs.halfW - WALL_COLLISION_PAD);
  const halfH = Math.max(0.01, obs.halfH - WALL_COLLISION_PAD);
  return {
    minX: obs.x - halfW,
    maxX: obs.x + halfW,
    minZ: obs.z - halfH,
    maxZ: obs.z + halfH,
  };
}

function pushObstacleFaceSegment(out, obs, vMinX, vMaxX, vMinZ, vMaxZ) {
  const a = obsVisionBounds(obs);
  switch (obs.edgeDir) {
    case 'n':
      pushSeg(out, a.minX, a.minZ, a.maxX, a.minZ, vMinX, vMaxX, vMinZ, vMaxZ);
      break;
    case 's':
      pushSeg(out, a.minX, a.maxZ, a.maxX, a.maxZ, vMinX, vMaxX, vMinZ, vMaxZ);
      break;
    case 'w':
      pushSeg(out, a.minX, a.minZ, a.minX, a.maxZ, vMinX, vMaxX, vMinZ, vMaxZ);
      break;
    case 'e':
      pushSeg(out, a.maxX, a.minZ, a.maxX, a.maxZ, vMinX, vMaxX, vMinZ, vMaxZ);
      break;
    default:
      pushRectOutline(out, a.minX, a.minZ, a.maxX, a.maxZ, vMinX, vMaxX, vMinZ, vMaxZ);
      break;
  }
}

/** Building wall lips + closed-door seals only (same boxes as collision debug, not decor). */
function obstacleBlocksVision(obs) {
  if (obs.kind !== 'aabb') return false;
  if (obs.blocksVision === false) return false;
  if (obs.isDecor) return false;
  return !!(obs.floorEdge || obs.doorSeal);
}

function nudgeOriginOutOfAabb(ox, oz, a) {
  const inset = TILE * 0.06;
  const toN = oz - a.minZ;
  const toS = a.maxZ - oz;
  const toW = ox - a.minX;
  const toE = a.maxX - ox;
  const minOut = Math.min(toN, toS, toW, toE);
  if (minOut === toN) return { x: ox, z: a.minZ - inset };
  if (minOut === toS) return { x: ox, z: a.maxZ + inset };
  if (minOut === toW) return { x: a.minX - inset, z: oz };
  return { x: a.maxX + inset, z: oz };
}

function pushBuildingVisionSegments(out, building, vMinX, vMaxX, vMinZ, vMaxZ) {
  const defs = building.obstacleDefs ?? building.obstacles ?? [];
  for (const obs of defs) {
    if (obs.blocksVision === false || obs.isDecor) continue;
    if (!obs.floorEdge && !obs.doorSeal) continue;
    pushObstacleFaceSegment(out, obs, vMinX, vMaxX, vMinZ, vMaxZ);
  }
}

/** Raycast blockers from collision AABBs (red debug boxes) — not wall-tile silhouettes. */
export function collectVisionSegments(
  world,
  buildings,
  minX,
  maxX,
  minZ,
  maxZ,
  insideBuilding = null,
) {
  const out = [];
  const pad = TILE * 2;
  const vMinX = minX - pad;
  const vMaxX = maxX + pad;
  const vMinZ = minZ - pad;
  const vMaxZ = maxZ + pad;

  for (const obs of collectObstaclesInView(world, vMinX, vMaxX, vMinZ, vMaxZ)) {
    if (!obstacleBlocksVision(obs)) continue;
    pushObstacleFaceSegment(out, obs, vMinX, vMaxX, vMinZ, vMaxZ);
  }

  if (insideBuilding) {
    pushBuildingVisionSegments(out, insideBuilding, vMinX, vMaxX, vMinZ, vMaxZ);
  }
  for (const building of buildings ?? []) {
    if (building === insideBuilding) continue;
    pushBuildingVisionSegments(out, building, vMinX, vMaxX, vMinZ, vMaxZ);
  }

  return out;
}

/** Foot-level origin — nudge off collision wall lips (inside or outside). */
export function resolveVisionOrigin(world, px, pz, insideBuilding = null) {
  const feetZ = playerSouthEdgeZ(px, pz);
  if (insideBuilding) {
    return {
      x: px,
      z: Math.max(pz - TILE * 0.06, Math.min(feetZ - TILE * 0.1, feetZ + TILE * 0.02)),
    };
  }

  let ox = px;
  let oz = feetZ - TILE * 0.1;

  const pad = TILE * 2.5;
  for (const obs of collectObstaclesInView(world, ox - pad, ox + pad, oz - pad, oz + pad)) {
    if (!obstacleBlocksVision(obs)) continue;
    const a = obsAabb(obs);
    if (!a || !rectContains(a.minX, a.minZ, a.maxX, a.maxZ, ox, oz)) continue;
    const nudged = nudgeOriginOutOfAabb(ox, oz, a);
    ox = nudged.x;
    oz = nudged.z;
  }

  const minOz = pz - TILE * 0.06;
  const maxOz = feetZ + TILE * 0.02;
  return { x: ox, z: Math.max(minOz, Math.min(maxOz, oz)) };
}

export function computeVisibilityPolygon(
  ox,
  oz,
  segments,
  viewMinX,
  viewMaxX,
  viewMinZ,
  viewMaxZ,
) {
  const angles = [];

  const addAngle = (x, z) => {
    const a = normAngle(angleTo(x, z, ox, oz));
    angles.push(normAngle(a - ANGLE_EPS), a, normAngle(a + ANGLE_EPS));
  };

  addAngle(viewMinX, viewMinZ);
  addAngle(viewMaxX, viewMinZ);
  addAngle(viewMaxX, viewMaxZ);
  addAngle(viewMinX, viewMaxZ);

  for (const seg of segments) {
    addAngle(seg.x1, seg.z1);
    addAngle(seg.x2, seg.z2);
  }

  for (let i = 0; i < VIEW_RAY_COUNT; i++) {
    angles.push((i / VIEW_RAY_COUNT) * TAU);
  }

  const sorted = dedupeAngles(angles.slice().sort((a, b) => a - b));

  const points = [];
  for (const a of sorted) {
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const viewDist = rayViewBoundsDist(ox, oz, dx, dz, viewMinX, viewMaxX, viewMinZ, viewMaxZ);
    let wallHit = Infinity;
    for (const seg of segments) {
      const t = raySegmentDist(ox, oz, dx, dz, seg.x1, seg.z1, seg.x2, seg.z2);
      if (t > 1e-6 && t < wallHit) wallHit = t;
    }
    let best = wallHit < Infinity ? wallHit : viewDist;
    if (wallHit >= Infinity && best < VISION_MIN_HIT) best = VISION_MIN_HIT;
    if (Number.isFinite(best)) {
      points.push({
        x: snapFloorArt(ox + dx * best),
        z: snapFloorArt(oz + dz * best),
      });
    }
  }

  return points;
}

export function pointInVisibilityPolygon(x, z, polygon) {
  if (!polygon?.length || polygon.length < 3) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    if (((zi > z) !== (zj > z))
      && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when any sample point on the world AABB lies inside the vision polygon. */
export function aabbTouchesVisibilityPolygon(minX, maxX, minZ, maxZ, polygon) {
  if (!polygon?.length || polygon.length < 3) return true;
  const mx = (minX + maxX) * 0.5;
  const mz = (minZ + maxZ) * 0.5;
  const samples = [
    [minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ],
    [mx, minZ], [mx, maxZ], [minX, mz], [maxX, mz], [mx, mz],
  ];
  for (const [x, z] of samples) {
    if (pointInVisibilityPolygon(x, z, polygon)) return true;
  }
  return false;
}

/**
 * Floor fog — evenodd polygon fill, verts snapped to floor art pixels (16×16 per tile).
 */
export function drawVisibilityOverlay(ctx, polygon, worldToScreen, width, height, alpha) {
  if (!polygon?.length || polygon.length < 3) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.rect(0, 0, width, height);

  const p0 = projectFogVertex(polygon[0].x, polygon[0].z, worldToScreen);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < polygon.length; i++) {
    const p = projectFogVertex(polygon[i].x, polygon[i].z, worldToScreen);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.restore();
}
