function pushAabbFromCircle(acx, acz, halfW, halfH, ox, oz, or) {
  const closestX = Math.max(acx - halfW, Math.min(ox, acx + halfW));
  const closestZ = Math.max(acz - halfH, Math.min(oz, acz + halfH));
  const nx = closestX - ox;
  const nz = closestZ - oz;
  const distSq = nx * nx + nz * nz;
  if (distSq >= or * or) return { cx: acx, cz: acz };

  if (distSq < 1e-8) {
    return { cx: acx + or, cz: acz };
  }

  const dist = Math.sqrt(distSq);
  const overlap = or - dist;
  return {
    cx: acx + (nx / dist) * overlap,
    cz: acz + (nz / dist) * overlap,
  };
}

/** Radius used for entity–entity push separation (feet-level when getPushCollider exists). */
export function entityPushRadius(ent, ppu = 8) {
  const shape = ent?.getPushCollider?.(ppu);
  if (shape?.kind === 'circle' && shape.radius != null) return shape.radius;
  return ent?.radius ?? 0;
}

/** Push a circle out of overlapping entities (player / robots). */
export function resolveEntityPosition(x, z, radius, entities, exclude = null, ppu = 8) {
  let nx = x;
  let nz = z;

  for (let pass = 0; pass < 4; pass++) {
    for (const ent of entities) {
      if (ent === exclude) continue;
      if (ent.alive === false) continue;
      if (ent.emerging) continue;

      const otherR = entityPushRadius(ent, ppu);
      const dx = nx - ent.x;
      const dz = nz - ent.z;
      const distSq = dx * dx + dz * dz;
      const minDist = radius + otherR;
      if (distSq >= minDist * minDist) continue;

      if (distSq < 1e-8) {
        const a = Math.random() * Math.PI * 2;
        nx += Math.sin(a) * minDist;
        nz += Math.cos(a) * minDist;
        continue;
      }

      const dist = Math.sqrt(distSq);
      const push = minDist - dist;
      nx += (dx / dist) * push;
      nz += (dz / dist) * push;
    }
  }

  return { x: nx, z: nz };
}

export function resolveEntityPositionShape(x, z, shape, entities, exclude = null, ppu = 8) {
  if (!shape || shape.kind === 'circle') {
    return resolveEntityPosition(x, z, shape?.radius ?? 0, entities, exclude, ppu);
  }

  let acx = x;
  let acz = z + shape.zOff;

  for (let pass = 0; pass < 4; pass++) {
    for (const ent of entities) {
      if (ent === exclude) continue;
      if (ent.alive === false) continue;
      if (ent.emerging) continue;

      const pushed = pushAabbFromCircle(acx, acz, shape.halfW, shape.halfH, ent.x, ent.z, entityPushRadius(ent, ppu));
      acx = pushed.cx;
      acz = pushed.cz;
    }
  }

  return { x: acx, z: acz - shape.zOff };
}

export function collectCollisionTargets({ player, robots, exclude = null }) {
  const out = [];
  if (player?.alive && player !== exclude) out.push(player);
  for (const r of robots) {
    if (r === exclude) continue;
    if (!r.alive || r.emerging) continue;
    out.push(r);
  }
  return out;
}

/** Push other entities when moving into them (fraction of overlap). */
export function applyApproachPush(mover, prevX, prevZ, newX, newZ, moverRadius, targets, strength = 0.36, world = null, ppu = 8) {
  const vx = newX - prevX;
  const vz = newZ - prevZ;
  const vlen = Math.hypot(vx, vz);
  if (vlen < 1e-7) return;
  const nx = vx / vlen;
  const nz = vz / vlen;

  for (const ent of targets) {
    if (ent === mover) continue;
    if (ent.alive === false) continue;
    if (ent.emerging) continue;

    const dx = ent.x - newX;
    const dz = ent.z - newZ;
    const dist = Math.hypot(dx, dz) || 0.001;
    const minDist = moverRadius + entityPushRadius(ent, ppu);
    const overlap = minDist - dist;
    if (overlap <= 0) continue;

    const ux = dx / dist;
    const uz = dz / dist;
    const approach = nx * ux + nz * uz;
    if (approach < 0.18) continue;

    const push = overlap * strength * approach;
    const nextX = ent.x + ux * push;
    const nextZ = ent.z + uz * push;
    if (world && typeof ent.getMoveCollider === 'function') {
      const shape = ent.getMoveCollider(ppu);
      const resolved = world.resolveMovementShape(ent.x, ent.z, nextX, nextZ, shape);
      ent.x = resolved.x;
      ent.z = resolved.z;
    } else {
      ent.x = nextX;
      ent.z = nextZ;
    }
  }
}

export function moveWithEntityCollision(world, x, z, dx, dz, entityShape, worldShape, targets, exclude = null, opts = {}) {
  let moved;
  if (opts.axisSlide) {
    moved = world.moveAxisShape(x, z, dx, dz, worldShape, opts);
    const movedLen = Math.hypot(moved.x - x, moved.z - z);
    if (movedLen < 1e-5 && Math.abs(dx) > 1e-5 && Math.abs(dz) > 1e-5) {
      const alt = world.moveAxisShapeZX(x, z, dx, dz, worldShape, opts);
      if (Math.hypot(alt.x - x, alt.z - z) > movedLen) moved = alt;
    }
  } else if (Math.abs(dx) > 1e-5 && Math.abs(dz) > 1e-5) {
    const diag = world.resolveMovementShape(x, z, x + dx, z + dz, worldShape, opts);
    const axis = world.moveAxisShape(x, z, dx, dz, worldShape, opts);
    const diagLen = Math.hypot(diag.x - x, diag.z - z);
    const axisLen = Math.hypot(axis.x - x, axis.z - z);
    moved = diagLen >= axisLen * 0.92 ? diag : axis;
  } else {
    moved = world.moveAxisShape(x, z, dx, dz, worldShape, opts);
  }
  let pos = resolveEntityPositionShape(moved.x, moved.z, entityShape, targets, exclude, opts.ppu ?? 8);
  if (world.checkCollisionShape(pos.x, pos.z, worldShape, false, opts)) pos = moved;
  return pos;
}

/** Minimum world displacement before walk / footstep animation plays. */
export const MOTION_IDLE_EPS = 0.0008;

/** Fraction along walk→sprint speed range before run animation plays. */
export const SPRINT_ANIM_BLEND = 0.55;

export function didDisplace(px, pz, x, z, eps = MOTION_IDLE_EPS) {
  return Math.hypot(x - px, z - pz) > eps;
}

export function motionSpeed(px, pz, x, z, dt) {
  if (dt <= 0) return 0;
  return Math.hypot(x - px, z - pz) / dt;
}

export function updateLocomotion(px, pz, x, z, dt, eps = MOTION_IDLE_EPS) {
  const moving = didDisplace(px, pz, x, z, eps);
  return { moving, speed: moving ? motionSpeed(px, pz, x, z, dt) : 0 };
}

export function isSprintAnimSpeed(actualSpeed, walkSpeed, sprintSpeed, blend = SPRINT_ANIM_BLEND) {
  if (actualSpeed <= 0.01 || sprintSpeed <= walkSpeed) return false;
  return actualSpeed >= walkSpeed + (sprintSpeed - walkSpeed) * blend;
}
