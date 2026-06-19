/** Draw collision AABBs for debugging (single box per obstacle). */
import { CHUNK_WORLD } from './worldGen.js';

export function obsAabb(obs) {
  const halfW = obs.halfW;
  const halfH = obs.halfH;
  if (!halfW || !halfH) return null;
  return { minX: obs.x - halfW, maxX: obs.x + halfW, minZ: obs.z - halfH, maxZ: obs.z + halfH };
}

function obsInView(obs, minX, maxX, minZ, maxZ) {
  if (obs.kind === 'circle') {
    const r = obs.radius ?? 0;
    return obs.x + r >= minX && obs.x - r <= maxX && obs.z + r >= minZ && obs.z - r <= maxZ;
  }
  if (obs.kind === 'aabb') {
    const a = obsAabb(obs);
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
    const hard = obsAabb(obs);
    if (hard) drawAabb(hard, 'rgba(255, 60, 60, 0.95)', 'rgba(255, 40, 40, 0.22)');
  }
}
