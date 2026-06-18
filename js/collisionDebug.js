/** Draw soft (red) and hard (green) collision AABBs for debugging. */
import { CHUNK_WORLD } from './worldGen.js';

function obsAabb(obs, soft) {
  const halfW = soft ? (obs.softHalfW ?? obs.halfW) : obs.halfW;
  const halfH = soft ? (obs.softHalfH ?? obs.halfH) : obs.halfH;
  if (!halfW || !halfH) return null;
  const x = soft ? (obs.softX ?? obs.x) : obs.x;
  const z = soft ? (obs.softZ ?? obs.z) : obs.z;
  return { minX: x - halfW, maxX: x + halfW, minZ: z - halfH, maxZ: z + halfH };
}

function obsInView(obs, minX, maxX, minZ, maxZ) {
  if (obs.kind === 'circle') {
    const r = obs.radius ?? 0;
    return obs.x + r >= minX && obs.x - r <= maxX && obs.z + r >= minZ && obs.z - r <= maxZ;
  }
  if (obs.kind === 'aabb') {
    const hard = obsAabb(obs, false);
    const soft = obsAabb(obs, true);
    const a = hard ?? soft;
    if (!a) return false;
    return a.maxX >= minX && a.minX <= maxX && a.maxZ >= minZ && a.minZ <= maxZ;
  }
  return false;
}

export function collectObstaclesInView(world, minX, maxX, minZ, maxZ) {
  const out = [];
  for (const obs of world.dynamicObstacles) {
    if (obsInView(obs, minX, maxX, minZ, maxZ)) out.push(obs);
  }
  const minCX = Math.floor(minX / CHUNK_WORLD);
  const maxCX = Math.floor(maxX / CHUNK_WORLD);
  const minCZ = Math.floor(minZ / CHUNK_WORLD);
  const maxCZ = Math.floor(maxZ / CHUNK_WORLD);
  for (let cz = minCZ; cz <= maxCZ; cz++) {
    for (let cx = minCX; cx <= maxCX; cx++) {
      const chunk = world.chunks.get(`${cx},${cz}`);
      if (!chunk) continue;
      for (const obs of chunk.obstacles) {
        if (obsInView(obs, minX, maxX, minZ, maxZ)) out.push(obs);
      }
    }
  }
  return out;
}

export function drawCollisionDebug(ctx, world, worldToScreen, minX, maxX, minZ, maxZ) {
  const obstacles = collectObstaclesInView(world, minX, maxX, minZ, maxZ);

  const drawAabb = (a, stroke, fill) => {
    const tl = worldToScreen(a.minX, a.minZ);
    const br = worldToScreen(a.maxX, a.maxZ);
    const x = Math.min(tl.x, br.x);
    const y = Math.min(tl.y, br.y);
    const w = Math.abs(br.x - tl.x);
    const h = Math.abs(br.y - tl.y);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };

  for (const obs of obstacles) {
    if (obs.kind !== 'aabb') {
      if (obs.kind === 'circle') {
        const s = worldToScreen(obs.x, obs.z);
        const r = (obs.radius ?? 0.5) * 8;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80, 255, 120, 0.35)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(80, 255, 120, 0.9)';
        ctx.stroke();
      }
      continue;
    }
    const hard = obsAabb(obs, false);
    const soft = obsAabb(obs, true);
    if (soft) drawAabb(soft, 'rgba(255, 60, 60, 0.95)', 'rgba(255, 40, 40, 0.22)');
    if (hard && hard !== soft) drawAabb(hard, 'rgba(60, 255, 100, 0.85)', 'rgba(60, 255, 100, 0.12)');
  }
}
