import { Robot, Scout } from './enemies.js';
import { TILE } from './worldGen.js';

const LERP_RATE = 14;

function lerpVal(cur, target, dt, rate = LERP_RATE) {
  const t = Math.min(1, dt * rate);
  return cur + (target - cur) * t;
}

function lerpAngle(cur, target, dt, rate = LERP_RATE) {
  let da = target - cur;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return cur + da * Math.min(1, dt * rate);
}

/** Apply authoritative snapshot to client game (no local sim while online). */
export function applySnapshot(game, snap) {
  if (!snap) return;

  if (snap.dayNight) {
    game.dayNight.timeMinutes = snap.dayNight.timeMinutes;
    game.dayNight.day = snap.dayNight.day;
  }
  if (snap.kills != null) game.kills = snap.kills;

  applyPlayers(game, snap.players ?? []);
  applyEnemies(game, snap.enemies ?? []);
  applyBullets(game, snap.bullets ?? []);
  applyDrops(game, snap.drops ?? []);
}

function applyPlayers(game, players) {
  const localId = game.lan?.playerId;
  let localSnap = null;

  for (const p of players) {
    if (p.id === localId) {
      localSnap = p;
      continue;
    }
    let peer = game.lan.peers.get(p.id);
    if (!peer) {
      peer = {
        id: p.id,
        name: p.name,
        x: p.x,
        z: p.z,
        angle: p.angle,
        health: p.health,
        maxHealth: p.maxHealth,
        isMoving: false,
        isSprinting: false,
        moveDirX: 0,
        moveDirZ: 0,
        walkPhase: 0,
        _renderX: p.x,
        _renderZ: p.z,
        _renderAngle: p.angle,
      };
      game.lan.peers.set(p.id, peer);
    }
    peer.name = p.name;
    peer.x = p.x;
    peer.z = p.z;
    peer.angle = p.angle;
    peer.health = p.health;
    peer.maxHealth = p.maxHealth;
    peer.isMoving = !!p.isMoving;
    peer.isSprinting = !!p.isSprinting;
    peer.moveDirX = p.moveDirX ?? 0;
    peer.moveDirZ = p.moveDirZ ?? 0;
    peer.walkPhase = p.walkPhase ?? 0;
    if (peer._renderX == null) {
      peer._renderX = p.x;
      peer._renderZ = p.z;
      peer._renderAngle = p.angle;
    }
  }

  if (localSnap && game.player) {
    game.lan._localAuth = localSnap;
    const pl = game.player;
    pl.health = localSnap.health;
    pl.maxHealth = localSnap.maxHealth;
    if (localSnap.weaponKey) pl.weaponKey = localSnap.weaponKey;
    if (localSnap.ammo != null) pl.ammo = localSnap.ammo;
    pl.isMoving = !!localSnap.isMoving;
    pl.isSprinting = !!localSnap.isSprinting;
    pl.moveDirX = localSnap.moveDirX ?? 0;
    pl.moveDirZ = localSnap.moveDirZ ?? 0;
    pl.walkPhase = localSnap.walkPhase ?? 0;
    if (pl._netRenderX == null) {
      pl._netRenderX = localSnap.x;
      pl._netRenderZ = localSnap.z;
      pl._netRenderAngle = localSnap.angle;
    }
    pl._netTargetX = localSnap.x;
    pl._netTargetZ = localSnap.z;
    pl._netTargetAngle = localSnap.angle;
  }
}

function applyEnemies(game, enemies) {
  if (!game._netEnemyMap) game._netEnemyMap = new Map();
  const seen = new Set();

  for (const e of enemies) {
    seen.add(e.id);
    let r = game._netEnemyMap.get(e.id);
    if (!r) {
      r = e.type === 'scout'
        ? new Scout(e.x, e.z, e.wave ?? 1)
        : new Robot(e.x, e.z, e.wave ?? 1, e.type ?? 'spider');
      r.netId = e.id;
      game._netEnemyMap.set(e.id, r);
      game.robots.push(r);
    }
    r._netTargetX = e.x;
    r._netTargetZ = e.z;
    r._netTargetAngle = e.angle ?? 0;
    if (r._netRenderX == null) {
      r._netRenderX = e.x;
      r._netRenderZ = e.z;
    }
    r.x = r._netRenderX;
    r.z = r._netRenderZ;
    r.health = e.health;
    r.maxHealth = e.maxHealth ?? r.maxHealth;
    r.alive = e.alive !== false && r.health > 0;
    r.emerging = !!e.emerging;
    r.chasing = !!e.chasing;
    r.type = e.type ?? r.type;
  }

  game.robots = game.robots.filter((r) => {
    if (r.netId == null) return false;
    if (seen.has(r.netId)) return true;
    game._netEnemyMap.delete(r.netId);
    return false;
  });
}

function applyBullets(game, bullets) {
  if (!game._netBulletMap) game._netBulletMap = new Map();
  const seen = new Set();

  for (const b of bullets) {
    seen.add(b.id);
    let slot = game._netBulletMap.get(b.id);
    if (!slot) {
      slot = game.bullets.bullets.find((x) => !x.active && x.netId == null);
      if (!slot) slot = game.bullets.bullets.find((x) => !x.active);
      if (!slot) continue;
      slot.netId = b.id;
      game._netBulletMap.set(b.id, slot);
    }
    slot.active = true;
    slot.x = b.x;
    slot.z = b.z;
    slot.vx = b.vx;
    slot.vz = b.vz;
    slot.damage = b.damage ?? slot.damage;
    slot.fromPlayer = !!b.fromPlayer;
    slot.life = b.life ?? 2;
    slot._netRenderX = b.x;
    slot._netRenderZ = b.z;
  }

  for (const [id, slot] of game._netBulletMap) {
    if (!seen.has(id)) {
      slot.active = false;
      slot.netId = null;
      game._netBulletMap.delete(id);
    }
  }

  for (const b of game.bullets.bullets) {
    if (b.netId != null) continue;
    b.active = false;
  }
}

function applyDrops(game, drops) {
  if (!game._netDropMap) game._netDropMap = new Map();
  const seen = new Set();

  for (const d of drops) {
    seen.add(d.id);
    let drop = game._netDropMap.get(d.id);
    if (!drop) {
      drop = { id: d.id, x: d.x, z: d.z, item: d.item };
      game._netDropMap.set(d.id, drop);
      game.groundDrops.drops.push(drop);
    }
    drop.x = d.x;
    drop.z = d.z;
    drop.item = d.item;
  }

  game.groundDrops.drops = game.groundDrops.drops.filter((d) => {
    if (d.id == null) return false;
    if (seen.has(d.id)) return true;
    game._netDropMap.delete(d.id);
    return false;
  });
}

/** Smooth remote entities between snapshots. */
export function interpolateNetState(game, dt) {
  if (!game.lan?.isOnline) return;

  for (const peer of game.lan.peers.values()) {
    peer._renderX = lerpVal(peer._renderX, peer.x, dt);
    peer._renderZ = lerpVal(peer._renderZ, peer.z, dt);
    peer._renderAngle = lerpAngle(peer._renderAngle, peer.angle, dt);
  }

  const pl = game.player;
  if (pl && pl._netTargetX != null) {
    pl._netRenderX = lerpVal(pl._netRenderX, pl._netTargetX, dt);
    pl._netRenderZ = lerpVal(pl._netRenderZ, pl._netTargetZ, dt);
    pl._netRenderAngle = lerpAngle(pl._netRenderAngle, pl._netTargetAngle, dt);
    const dx = pl._netTargetX - pl.x;
    const dz = pl._netTargetZ - pl.z;
    const dist = Math.hypot(dx, dz);
    if (dist > TILE * 5) {
      pl.x = pl._netTargetX;
      pl.z = pl._netTargetZ;
      pl._netRenderX = pl._netTargetX;
      pl._netRenderZ = pl._netTargetZ;
    } else if (dist > 0.04) {
      pl.x += dx * 0.22;
      pl.z += dz * 0.22;
    }
    pl.angle = pl._netRenderAngle;
  }

  for (const r of game.robots) {
    if (r.netId == null || r._netTargetX == null) continue;
    r._netRenderX = lerpVal(r._netRenderX, r._netTargetX, dt);
    r._netRenderZ = lerpVal(r._netRenderZ, r._netTargetZ, dt);
    r.x = r._netRenderX;
    r.z = r._netRenderZ;
  }

  for (const b of game.bullets.bullets) {
    if (!b.active || b.netId == null) continue;
    if (b._netRenderX != null) {
      b._netRenderX = lerpVal(b._netRenderX, b.x, dt, 18);
      b._netRenderZ = lerpVal(b._netRenderZ, b.z, dt, 18);
      b.x = b._netRenderX;
      b.z = b._netRenderZ;
    }
  }
}

export function clearNetEntities(game) {
  game._netEnemyMap?.clear();
  game._netBulletMap?.clear();
  game._netDropMap?.clear();
  game.robots = [];
  for (const b of game.bullets?.bullets ?? []) {
    b.active = false;
    b.netId = null;
  }
  game.groundDrops.drops = [];
}
