const ANGLE_OFFSET = 0.00015;
const TAU = Math.PI * 2;

export function collectWallOccluders(buildings, view) {
  const boxes = [];
  for (const building of buildings) {
    for (const wall of [...(building.obstacles ?? []), ...(building.doorEdgeObstacles ?? []), ...(building.rearDoor?.doorEdgeObstacles ?? [])]) {
      if (wall.kind !== 'aabb' || wall.blocksVision === false) continue;
      const { halfW, halfH } = wall;
      const minX = wall.x - halfW;
      const maxX = wall.x + halfW;
      const minZ = wall.z - halfH;
      const maxZ = wall.z + halfH;
      if (maxX < view.minX || minX > view.maxX || maxZ < view.minZ || minZ > view.maxZ) continue;
      boxes.push({ minX, maxX, minZ, maxZ });
    }
  }
  return boxes;
}

export function collectPropOccluders(buildings, foliage, view, playerX, playerZ) {
  const candidates = [];
  function add(obstacle, halfW, halfH, source) {
    const { x, z } = obstacle;
    const box = { minX: x - halfW, maxX: x + halfW, minZ: z - halfH, maxZ: z + halfH };
    if (box.maxX < view.minX || box.minX > view.maxX || box.maxZ < view.minZ || box.minZ > view.maxZ) return;
    Object.defineProperty(box, 'source', { value: source });
    candidates.push({ box, distanceSq: (x - playerX) ** 2 + (z - playerZ) ** 2 });
  }
  for (const entry of foliage) {
    const obstacle = entry._obstacle;
    if (obstacle?.radius > 0) add(obstacle, obstacle.radius * 0.8, obstacle.radius * 0.6, entry);
  }
  for (const building of buildings) {
    for (const piece of building.decor ?? []) {
      const obstacle = piece.obstacle;
      if (obstacle?.kind === 'aabb' && obstacle.blocksVision !== false) {
        add(obstacle, obstacle.halfW * 0.75, obstacle.halfH * 0.75, piece);
      }
    }
  }
  // The visibility sweep checks every ray against every caster. Bound the cost in dense areas.
  return candidates.sort((a, b) => a.distanceSq - b.distanceSq).slice(0, 12).map(({ box }) => box);
}

export function resolveWallLightOrigin(x, z, playerX, playerZ, boxes) {
  const inset = 0.001;
  for (let pass = 0; pass < 4; pass++) {
    const box = boxes.find((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
    if (!box) break;
    const faces = [
      { x: box.minX - inset, z, distance: playerX - box.minX },
      { x: box.maxX + inset, z, distance: box.maxX - playerX },
      { x, z: box.minZ - inset, distance: playerZ - box.minZ },
      { x, z: box.maxZ + inset, distance: box.maxZ - playerZ },
    ];
    const face = faces.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
    ({ x, z } = face);
  }
  return { x, z };
}

function rayEntry(box, x, z, dx, dz) {
  if ((dx === 0 && (x < box.minX || x > box.maxX))
    || (dz === 0 && (z < box.minZ || z > box.maxZ))) return Infinity;
  const ax = dx === 0 ? -Infinity : (box.minX - x) / dx;
  const bx = dx === 0 ? Infinity : (box.maxX - x) / dx;
  const az = dz === 0 ? -Infinity : (box.minZ - z) / dz;
  const bz = dz === 0 ? Infinity : (box.maxZ - z) / dz;
  const entry = Math.max(Math.min(ax, bx), Math.min(az, bz));
  const exit = Math.min(Math.max(ax, bx), Math.max(az, bz));
  return entry >= 0 && entry <= exit ? entry : Infinity;
}

export function computeWallVisibility(x, z, view, boxes, withoutCaster = null) {
  if (!boxes.length) return null;
  const angles = new Set();
  const addCorners = (box) => {
    for (const cx of [box.minX, box.maxX]) {
      for (const cz of [box.minZ, box.maxZ]) {
        const angle = Math.atan2(cz - z, cx - x);
        for (const offset of [-ANGLE_OFFSET, 0, ANGLE_OFFSET]) {
          angles.add((angle + offset + TAU) % TAU);
        }
      }
    }
  };
  addCorners(view);
  for (const box of boxes) addCorners(box);
  if (withoutCaster) {
    for (const box of boxes) if (box.source) withoutCaster.set(box.source, []);
  }
  return [...angles].sort((a, b) => a - b).map((angle) => {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let distance = Math.min(
      ((dx < 0 ? view.minX : view.maxX) - x) / dx,
      ((dz < 0 ? view.minZ : view.maxZ) - z) / dz,
    );
    let nextDistance = distance;
    let nearest = null;
    for (const box of boxes) {
      const hit = rayEntry(box, x, z, dx, dz);
      if (hit < distance) {
        nextDistance = distance;
        distance = hit;
        nearest = box;
      } else if (hit < nextDistance) nextDistance = hit;
    }
    const point = { x: x + dx * distance, z: z + dz * distance };
    if (withoutCaster) {
      for (const [source, polygon] of withoutCaster) {
        polygon.push(source === nearest?.source
          ? { x: x + dx * nextDistance, z: z + dz * nextDistance } : point);
      }
    }
    return point;
  });
}

export function pointInWallLight(polygon, x, z) {
  if (!polygon) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function makeWallLightPath(polygon, project) {
  const path = new Path2D();
  for (const [i, point] of polygon.entries()) {
    const p = project(point.x, point.z);
    if (i === 0) path.moveTo(p.x, p.y);
    else path.lineTo(p.x, p.y);
  }
  path.closePath();
  return path;
}

/** Rasterize the polygon once per lighting update, at one pixel per floor-art pixel. */
export function rasterizeWallShadow(canvas, polygon, view, step) {
  const width = Math.ceil((view.maxX - view.minX) / step);
  const height = Math.ceil((view.maxZ - view.minZ) / step);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill(makeWallLightPath(polygon, (x, z) => ({ x: (x - view.minX) / step, y: (z - view.minZ) / step })));
  ctx.globalCompositeOperation = 'source-over';
}
