import { tryLoadImageMap } from './imageMap.js';

export const MAP_SIZE = 90;
export const PLAYER_RADIUS = 0.6;
export const BULLET_RADIUS = 0.15;
export const TILE = 4;

export class World {
  constructor() {
    this.obstacles = [];
    this.decor = [];
    this.imageMap = null;
    this._rng = Math.random;
  }

  get halfW() {
    return this.imageMap?.loaded ? this.imageMap.halfW : MAP_SIZE;
  }

  get halfH() {
    return this.imageMap?.loaded ? this.imageMap.halfH : MAP_SIZE;
  }

  usesImageMap() {
    return !!this.imageMap?.loaded;
  }

  async build() {
    this.obstacles = [];
    this.decor = [];
    this.imageMap = await tryLoadImageMap();

    if (this.usesImageMap()) return;

    this._buildPerimeter();
    this._buildRandomInterior();
  }

  _addBox(x, z, halfW, halfD, rotY = 0, kind = 'wall') {
    this.obstacles.push({ kind: 'box', x, z, halfW, halfD, rotY });
    this.decor.push({ kind, x, z, halfW, halfD, rotY });
  }

  _addWallRun(axis, fixed, start, end, gapStart, gapEnd, halfThick, halfLen) {
    if (gapStart > start) {
      const len = gapStart - start;
      const mid = start + len / 2;
      if (axis === 'x') this._addBox(mid, fixed, len / 2, halfThick);
      else this._addBox(fixed, mid, halfThick, len / 2);
    }
    if (end > gapEnd) {
      const len = end - gapEnd;
      const mid = gapEnd + len / 2;
      if (axis === 'x') this._addBox(mid, fixed, len / 2, halfThick);
      else this._addBox(fixed, mid, halfThick, len / 2);
    }
  }

  _buildPerimeter() {
    const b = 62;
    const t = 0.85;
    const gateN = 8 + Math.floor(this._rng() * 6);
    const gateE = 8 + Math.floor(this._rng() * 6);
    const gateS = 8 + Math.floor(this._rng() * 6);
    const gateW = 8 + Math.floor(this._rng() * 6);
    this._addWallRun('x', -b, -b, b, -gateN, gateN, t, b);
    this._addWallRun('x', b, -b, b, -gateS, gateS, t, b);
    this._addWallRun('z', -b, -b, b, -gateW, gateW, t, b);
    this._addWallRun('z', b, -b, b, -gateE, gateE, t, b);
  }

  _buildRandomInterior() {
    const t = 0.68;
    const centerClear = 26;
    const outerMin = 34;
    const outerMax = 56;

    const pickOuter = () => {
      for (let i = 0; i < 40; i++) {
        const a = this._rng() * Math.PI * 2;
        const d = outerMin + this._rng() * (outerMax - outerMin);
        const x = Math.sin(a) * d;
        const z = Math.cos(a) * d;
        if (x * x + z * z >= centerClear ** 2) return { x, z };
      }
      const a = this._rng() * Math.PI * 2;
      return { x: Math.sin(a) * outerMin, z: Math.cos(a) * outerMin };
    };

    const clusters = 6 + Math.floor(this._rng() * 3);
    for (let i = 0; i < clusters; i++) {
      const { x: rx, z: rz } = pickOuter();
      const hw = 5 + this._rng() * 6;
      const hd = 5 + this._rng() * 6;
      const door = 3 + this._rng() * 2;
      const openSide = Math.floor(this._rng() * 4);

      if (openSide !== 0) this._addBox(rx, rz - hd, hw, t, 0, 'room');
      if (openSide !== 1) this._addBox(rx - hw, rz, t, hd, 0, 'room');
      if (openSide !== 2) this._addBox(rx + hw, rz, t, hd, 0, 'room');
      if (openSide !== 3) {
        const gapX = rx + (this._rng() - 0.5) * hw * 0.4;
        this._addWallRun('x', rz + hd, rx - hw, rx + hw, gapX - door / 2, gapX + door / 2, t, hw);
      } else {
        const gapZ = rz + (this._rng() - 0.5) * hd * 0.4;
        this._addWallRun('z', rx - hw, rz - hd, rz + hd, gapZ - door / 2, gapZ + door / 2, t, hd);
      }
    }

    const edgeWalls = 4 + Math.floor(this._rng() * 3);
    for (let i = 0; i < edgeWalls; i++) {
      const horizontal = this._rng() > 0.5;
      const pos = pickOuter();
      const len = 10 + this._rng() * 14;
      const gap = 4 + this._rng() * 3;
      const gapCenter = (this._rng() - 0.5) * len * 0.35;
      if (horizontal) {
        this._addWallRun('x', pos.z, pos.x - len / 2, pos.x + len / 2, pos.x + gapCenter - gap / 2, pos.x + gapCenter + gap / 2, t, len / 2);
      } else {
        this._addWallRun('z', pos.x, pos.z - len / 2, pos.z + len / 2, pos.z + gapCenter - gap / 2, pos.z + gapCenter + gap / 2, t, len / 2);
      }
    }

    const coverCount = 8 + Math.floor(this._rng() * 6);
    for (let i = 0; i < coverCount; i++) {
      const { x, z } = pickOuter();
      if (this.checkCollision(x, z, 1.2)) continue;
      const rotY = this._rng() * Math.PI;
      const hw = 2 + this._rng() * 3.5;
      const hd = 0.55 + this._rng() * 0.25;
      this._addBox(x, z, hw, hd, rotY, 'cover');
    }

    const corners = 2 + Math.floor(this._rng() * 2);
    for (let i = 0; i < corners; i++) {
      const { x: cx, z: cz } = pickOuter();
      const arm = 4 + this._rng() * 5;
      const flipX = this._rng() > 0.5 ? 1 : -1;
      const flipZ = this._rng() > 0.5 ? 1 : -1;
      this._addBox(cx, cz + flipZ * arm / 2, arm / 2, t, 0, 'wall');
      this._addBox(cx + flipX * arm / 2, cz, t, arm / 2, 0, 'wall');
    }
  }

  randomMapPoint(minDistFromCenter = 0) {
    return this._randomMapPoint(minDistFromCenter);
  }

  _randomMapPoint(minDistFromCenter = 0) {
    const hw = this.halfW * 0.85;
    const hh = this.halfH * 0.85;
    const x = (this._rng() - 0.5) * hw * 2;
    const z = (this._rng() - 0.5) * hh * 2;
    if (x * x + z * z < minDistFromCenter ** 2) return null;
    return { x, z };
  }

  getPlayerSpawn() {
    if (this.usesImageMap()) {
      return this.imageMap.findWalkableNear(0, 0, 12);
    }
    return { x: 0, z: 0 };
  }

  _circleHit(px, pz, pr, ox, oz, or) {
    const dx = px - ox;
    const dz = pz - oz;
    return dx * dx + dz * dz < (pr + or) ** 2;
  }

  _worldToLocal(dx, dz, rotY) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c };
  }

  _localToWorld(lx, lz, rotY) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    return { x: lx * c + lz * s, z: -lx * s + lz * c };
  }

  _boxHit(px, pz, pr, obs) {
    const { lx, lz } = this._worldToLocal(px - obs.x, pz - obs.z, obs.rotY || 0);
    return Math.abs(lx) < obs.halfW + pr && Math.abs(lz) < obs.halfD + pr;
  }

  _pushOutCircle(px, pz, pr, obs) {
    const dx = px - obs.x;
    const dz = pz - obs.z;
    const distSq = dx * dx + dz * dz;
    const minDist = pr + obs.radius;
    if (distSq >= minDist * minDist || distSq < 1e-8) return { x: px, z: pz };
    const dist = Math.sqrt(distSq);
    const push = (minDist - dist) / dist;
    return { x: px + dx * push, z: pz + dz * push };
  }

  _pushOutBox(px, pz, pr, obs) {
    const { lx, lz } = this._worldToLocal(px - obs.x, pz - obs.z, obs.rotY || 0);
    const hw = obs.halfW + pr;
    const hd = obs.halfD + pr;
    if (Math.abs(lx) >= hw || Math.abs(lz) >= hd) return { x: px, z: pz };
    const penX = hw - Math.abs(lx);
    const penZ = hd - Math.abs(lz);
    let nlx = lx;
    let nlz = lz;
    if (penX < penZ) nlx = Math.sign(lx || 1) * hw;
    else nlz = Math.sign(lz || 1) * hd;
    const w = this._localToWorld(nlx, nlz, obs.rotY || 0);
    return { x: obs.x + w.x, z: obs.z + w.z };
  }

  _checkObstacleCollision(x, z, radius) {
    for (const obs of this.obstacles) {
      if (obs.kind === 'box') {
        if (this._boxHit(x, z, radius, obs)) return true;
      } else if (this._circleHit(x, z, radius, obs.x, obs.z, obs.radius)) {
        return true;
      }
    }
    return false;
  }

  checkCollision(x, z, radius) {
    if (this.usesImageMap()) {
      if (this.imageMap.checkCollision(x, z, radius)) return true;
      return this._checkObstacleCollision(x, z, radius);
    }

    const half = MAP_SIZE - radius - 0.5;
    if (Math.abs(x) > half || Math.abs(z) > half) return true;
    return this._checkObstacleCollision(x, z, radius);
  }

  segmentBlocked(x0, z0, x1, z1, radius = BULLET_RADIUS) {
    if (this.usesImageMap()) {
      if (this.imageMap.segmentBlocked(x0, z0, x1, z1, radius)) return true;
    } else {
      const dist = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.max(2, Math.ceil(dist / 0.2));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        if (this.checkCollision(x, z, radius)) return true;
      }
      return false;
    }

    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(2, Math.ceil(dist / 0.2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (this._checkObstacleCollision(x, z, radius)) return true;
    }
    return false;
  }

  hasLineOfSight(x0, z0, x1, z1, radius = 0.25) {
    if (this.usesImageMap()) {
      if (!this.imageMap.hasLineOfSight(x0, z0, x1, z1, radius)) return false;
    } else {
      const dist = Math.hypot(x1 - x0, z1 - z0);
      if (dist < 0.5) return true;
      const steps = Math.max(4, Math.ceil(dist / 0.45));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        if (this.checkCollision(x, z, radius)) return false;
      }
      return true;
    }

    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(4, Math.ceil(dist / 0.35));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (this._checkObstacleCollision(x, z, radius)) return false;
    }
    return true;
  }

  resolveMovement(oldX, oldZ, newX, newZ, radius) {
    let x = newX;
    let z = newZ;
    const halfW = this.halfW - radius - 0.5;
    const halfH = this.halfH - radius - 0.5;
    x = Math.max(-halfW, Math.min(halfW, x));
    z = Math.max(-halfH, Math.min(halfH, z));

    for (let i = 0; i < 5; i++) {
      for (const obs of this.obstacles) {
        if (obs.kind === 'box' && this._boxHit(x, z, radius, obs)) {
          const p = this._pushOutBox(x, z, radius, obs);
          x = p.x; z = p.z;
        } else if (obs.kind === 'circle' && this._circleHit(x, z, radius, obs.x, obs.z, obs.radius)) {
          const p = this._pushOutCircle(x, z, radius, obs);
          x = p.x; z = p.z;
        }
      }
    }

    if (!this.checkCollision(x, z, radius)) return { x, z };
    if (!this.checkCollision(newX, oldZ, radius)) return { x: newX, z: oldZ };
    if (!this.checkCollision(oldX, newZ, radius)) return { x: oldX, z: newZ };
    return { x: oldX, z: oldZ };
  }

  moveAxis(x, z, dx, dz, radius) {
    if (dx !== 0) {
      const r = this.resolveMovement(x, z, x + dx, z, radius);
      x = r.x; z = r.z;
    }
    if (dz !== 0) {
      const r = this.resolveMovement(x, z, x, z + dz, radius);
      x = r.x; z = r.z;
    }
    return { x, z };
  }
}
