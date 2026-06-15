/** Push a circle out of overlapping entities (player / robots). */
export function resolveEntityPosition(x, z, radius, entities, exclude = null) {
  let nx = x;
  let nz = z;

  for (let pass = 0; pass < 4; pass++) {
    for (const ent of entities) {
      if (ent === exclude) continue;
      if (ent.alive === false) continue;
      if (ent.emerging) continue;

      const otherR = ent.radius ?? 0;
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

export function moveWithEntityCollision(world, x, z, dx, dz, entityRadius, worldRadius, targets, exclude = null) {
  const moved = world.moveAxis(x, z, dx, dz, worldRadius);
  let pos = resolveEntityPosition(moved.x, moved.z, entityRadius, targets, exclude);
  if (world.checkCollision(pos.x, pos.z, worldRadius)) pos = moved;
  return pos;
}
