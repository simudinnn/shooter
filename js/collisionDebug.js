/** Draw collision AABBs for debugging (F3). */
import { TILE, CHUNK_WORLD } from './worldGen.js';
import { CELL_DOOR, CELL_FLOOR, getBuildingCellAtWorld, isNavBlockedBuildingCell } from './buildingGen.js';
import { PPU } from './renderConfig.js';
import { getTileFlowFieldDebug, getPlayerBuilding } from './enemyNav.js';

const FLOW_UNREACHABLE = 32767;

export function obsAabb(obs) {
  const halfW = obs.halfW;
  const halfH = obs.halfH;
  if (!halfW || !halfH) return null;
  return { minX: obs.x - halfW, maxX: obs.x + halfW, minZ: obs.z - halfH, maxZ: obs.z + halfH };
}

function obsSoftAabb(obs) {
  const halfW = obs.softHalfW ?? obs.halfW;
  const halfH = obs.softHalfH ?? obs.halfH;
  if (!halfW || !halfH) return null;
  const cx = obs.softX ?? obs.x;
  const cz = obs.softZ ?? obs.z;
  return { minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfH, maxZ: cz + halfH };
}

function shapeWorldAabb(wx, wz, shape) {
  if (!shape || shape.kind !== 'aabb') return null;
  const acz = wz + (shape.zOff ?? 0);
  return {
    minX: wx - shape.halfW,
    maxX: wx + shape.halfW,
    minZ: acz - shape.halfH,
    maxZ: acz + shape.halfH,
  };
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

function drawWorldAabb(ctx, a, worldToScreen, stroke, fill) {
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
}

function drawEntitySoftColliders(ctx, ent, worldToScreen, ppu = PPU) {
  if (!ent?.alive && !ent.emerging) return;

  const moveShape = ent.getMoveCollider?.(ppu);
  const moveBox = moveShape ? shapeWorldAabb(ent.x, ent.z, moveShape) : null;
  if (moveBox) {
    drawWorldAabb(
      ctx,
      moveBox,
      worldToScreen,
      'rgba(255, 210, 60, 0.95)',
      'rgba(255, 220, 80, 0.18)',
    );
  }

  const s = worldToScreen(ent.x, ent.z);
  const r = (ent.radius ?? 0.5) * ppu;
  ctx.beginPath();
  ctx.arc(s.x, s.y, Math.max(2, r), 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawCollisionDebug(ctx, world, worldToScreen, minX, maxX, minZ, maxZ, game = null) {
  const obstacles = collectObstaclesInView(world, minX, maxX, minZ, maxZ);

  for (const obs of obstacles) {
    if (obs.kind === 'circle') {
      const s = worldToScreen(obs.x, obs.z);
      const r = (obs.radius ?? 0.5) * PPU;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(80, 255, 120, 0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 255, 120, 0.9)';
      ctx.stroke();
      continue;
    }
    if (obs.kind !== 'aabb') continue;

    const soft = obsSoftAabb(obs);
    if (soft && (obs.softHalfW != null || obs.softHalfH != null)) {
      drawWorldAabb(
        ctx,
        soft,
        worldToScreen,
        'rgba(80, 200, 255, 0.85)',
        'rgba(80, 200, 255, 0.12)',
      );
    }

    const hard = obsAabb(obs);
    if (hard) {
      drawWorldAabb(
        ctx,
        hard,
        worldToScreen,
        'rgba(255, 60, 60, 0.95)',
        'rgba(255, 40, 40, 0.22)',
      );
    }
  }

  if (!game) return;

  if (game.player?.alive) {
    drawEntitySoftColliders(ctx, game.player, worldToScreen, PPU);
  }
  for (const robot of game.robots ?? []) {
    drawEntitySoftColliders(ctx, robot, worldToScreen, PPU);
  }

  drawFlowFieldDebug(ctx, worldToScreen, minX, maxX, minZ, maxZ, game);
}

function flowTileIdx(field, tx, tz) {
  return (tz - field.minTz) * field.gw + (tx - field.minTx);
}

function distHeatColor(d, maxReach) {
  if (maxReach <= 0) return 'rgba(100, 180, 255, 0.28)';
  const t = Math.min(1, d / maxReach);
  const r = Math.round(80 + t * 120);
  const g = Math.round(220 - t * 140);
  const b = Math.round(255 - t * 80);
  const a = 0.14 + (1 - t) * 0.22;
  return `rgba(${r},${g},${b},${a})`;
}

/** Tile flow-field overlay — arrows toward lower cost, heat by distance from goal. */
export function drawFlowFieldDebug(ctx, worldToScreen, minX, maxX, minZ, maxZ, game = null) {
  const snap = getTileFlowFieldDebug();
  if (!snap?.active) {
    ctx.save();
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255, 180, 80, 0.95)';
    ctx.fillText('Flow field: inactive (no nearby aggro)', 6, 12);
    ctx.restore();
    return;
  }

  const splitMode = snap.mode === 'split';
  const extField = splitMode ? snap.exterior : snap.field;
  if (!extField?.dist) return;

  const intField = splitMode ? snap.interior : null;
  const { minTx, minTz, gw, gh } = extField;
  const layerMask = snap.layerMask;
  const stats = snap.stats ?? extField;
  const maxReach = stats.maxReach || 1;
  const reachCount = stats.reachCount ?? 0;
  const blockCount = stats.blockCount ?? 0;

  const extGoalSet = new Set(extField.goalKeys ?? []);
  const intGoalSet = intField ? new Set(intField.goalKeys ?? []) : extGoalSet;
  const playerBld = game?.buildings && game?.player
    ? getPlayerBuilding(game.buildings, game.player)
    : null;

  const tileMinTx = Math.max(minTx, Math.floor(minX / TILE));
  const tileMaxTx = Math.min(minTx + gw - 1, Math.ceil(maxX / TILE));
  const tileMinTz = Math.max(minTz, Math.floor(minZ / TILE));
  const tileMaxTz = Math.min(minTz + gh - 1, Math.ceil(maxZ / TILE));

  for (let tz = tileMinTz; tz <= tileMaxTz; tz++) {
    for (let tx = tileMinTx; tx <= tileMaxTx; tx++) {
      const layerIdx = layerMask ? layerMask[(tz - minTz) * gw + (tx - minTx)] : 0;
      const layer = layerIdx ? intField : extField;
      if (!layer?.dist) continue;

      const wx0 = tx * TILE;
      const wz0 = tz * TILE;
      const wx1 = wx0 + TILE;
      const wz1 = wz0 + TILE;

      if (game?.buildings && game?.player) {
        const info = getBuildingCellAtWorld(game.buildings, wx0 + TILE * 0.5, wz0 + TILE * 0.5);
        if (info && isNavBlockedBuildingCell(info.building, info.tx, info.tz) && playerBld !== info.building) {
          continue;
        }
        if (info && info.cell === CELL_FLOOR && playerBld !== info.building) continue;
        if (info && info.cell === CELL_DOOR && playerBld !== info.building && !info.building.doorOpen) continue;
      }

      const idx = flowTileIdx(layer, tx, tz);
      const dist = layer.dist;
      const flowDx = layer.flowDx;
      const flowDz = layer.flowDz;
      const goalSet = layerIdx ? intGoalSet : extGoalSet;

      const d = dist[idx];
      const tl = worldToScreen(wx0, wz0);
      const br = worldToScreen(wx1, wz1);
      const x = Math.min(tl.x, br.x);
      const y = Math.min(tl.y, br.y);
      const w = Math.abs(br.x - tl.x);
      const h = Math.abs(br.y - tl.y);

      if (d >= FLOW_UNREACHABLE) {
        ctx.fillStyle = 'rgba(40, 20, 20, 0.45)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(255, 70, 70, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        continue;
      }

      const isGoal = goalSet.has(`${tx},${tz}`);
      ctx.fillStyle = isGoal ? 'rgba(255, 240, 80, 0.42)' : distHeatColor(d, maxReach);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = isGoal ? 'rgba(255, 255, 120, 0.95)' : 'rgba(120, 200, 255, 0.35)';
      ctx.lineWidth = isGoal ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      const fdx = flowDx[idx];
      const fdz = flowDz[idx];
      if (fdx === 0 && fdz === 0) continue;

      const cx = (tx + 0.5) * TILE;
      const cz = (tz + 0.5) * TILE;
      const center = worldToScreen(cx, cz);
      const tip = worldToScreen(cx + fdx * TILE * 0.38, cz + fdz * TILE * 0.38);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.strokeStyle = isGoal ? 'rgba(255, 255, 200, 0.95)' : 'rgba(255, 255, 255, 0.82)';
      ctx.lineWidth = isGoal ? 2 : 1.25;
      ctx.stroke();

      const ang = Math.atan2(tip.y - center.y, tip.x - center.x);
      const head = 3.5;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(
        tip.x - head * Math.cos(ang - 0.55),
        tip.y - head * Math.sin(ang - 0.55),
      );
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(
        tip.x - head * Math.cos(ang + 0.55),
        tip.y - head * Math.sin(ang + 0.55),
      );
      ctx.stroke();
    }
  }

  const age = ((performance.now() / 1000) - (snap.builtAt ?? 0)).toFixed(1);
  ctx.save();
  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(220, 240, 255, 0.95)';
  ctx.fillText(
    `Flow ${splitMode ? 'split (ext→door, int→player)' : 'unified'}  reachable ${reachCount}  blocked ${blockCount}  age ${age}s`,
    6,
    12,
  );
  ctx.fillStyle = 'rgba(180, 220, 255, 0.85)';
  ctx.fillText('Yellow = goals for that region  Arrows = path in that region', 6, 22);
  ctx.restore();
}
