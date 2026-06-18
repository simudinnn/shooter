import {
  TILE,
  CHUNK_TILES,
  CHUNK_WORLD,
  BASE_RADIUS,
  generateChunk,
  worldToChunk,
  getBiome,
  isInBase,
  getFloorSpriteName,
  unpackTintGradient,
  isTintedFoliage,
  isYsortFoliage,
  foliageIntersectsRect,
  isCanopyFoliage,
} from './worldGen.js';

export { TILE, CHUNK_TILES, BASE_RADIUS } from './worldGen.js';
export const MAP_SIZE = 999999;
export const PLAYER_RADIUS = 0.6;
export const BULLET_RADIUS = 0.15;

const BAKE_VERSION = 29;
const MAX_CACHED_CHUNKS = 256;

export class World {
  constructor() {
    this.chunks = new Map();
    this.chunkOrder = [];
    this.obstacles = [];
    this.decor = [];
    this.dynamicObstacles = [];
  }

  addDynamicObstacle(obs) {
    this.dynamicObstacles.push(obs);
  }

  removeDynamicObstacle(obs) {
    const i = this.dynamicObstacles.indexOf(obs);
    if (i >= 0) this.dynamicObstacles.splice(i, 1);
  }

  get halfW() {
    return MAP_SIZE;
  }

  get halfH() {
    return MAP_SIZE;
  }

  async build() {
    this.chunks.clear();
    this.chunkOrder = [];
    this.obstacles = [];
    this.decor = [];
    this.dynamicObstacles = [];
    this._touchChunk(0, 0);
  }

  prewarmGround(sprites, ppu, radiusChunks = 2) {
    const tilePx = TILE * ppu;
    for (let cz = -radiusChunks; cz <= radiusChunks; cz++) {
      for (let cx = -radiusChunks; cx <= radiusChunks; cx++) {
        this._bakeChunkGround(this.getChunk(cx, cz), sprites, tilePx);
      }
    }
  }

  _chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  _touchChunk(cx, cz) {
    const key = this._chunkKey(cx, cz);
    if (this.chunks.has(key)) return this.chunks.get(key);

    const chunk = generateChunk(cx, cz);
    this.chunks.set(key, chunk);
    this.chunkOrder.push(key);
    if (this.chunkOrder.length > MAX_CACHED_CHUNKS) {
      const old = this.chunkOrder.shift();
      this.chunks.delete(old);
    }
    return chunk;
  }

  getChunk(cx, cz) {
    return this._touchChunk(cx, cz);
  }

  getBiomeAt(wx, wz) {
    return getBiome(wx, wz);
  }

  isBaseZone(wx, wz) {
    return isInBase(wx, wz);
  }

  getTile(tx, tz) {
    const cx = Math.floor(tx / CHUNK_TILES);
    const cz = Math.floor(tz / CHUNK_TILES);
    const lx = tx - cx * CHUNK_TILES;
    const lz = tz - cz * CHUNK_TILES;
    if (lx < 0 || lz < 0 || lx >= CHUNK_TILES || lz >= CHUNK_TILES) return null;
    return this.getChunk(cx, cz).tiles[lz * CHUNK_TILES + lx];
  }

  /** Remove ground foliage + blocking props overlapping a world-space rectangle. */
  clearFoliageInRect(minX, maxX, minZ, maxZ) {
    const minCX = Math.floor(minX / CHUNK_WORLD);
    const maxCX = Math.floor(maxX / CHUNK_WORLD);
    const minCZ = Math.floor(minZ / CHUNK_WORLD);
    const maxCZ = Math.floor(maxZ / CHUNK_WORLD);
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const chunk = this.getChunk(cx, cz);
        const before = chunk.foliage.length;
        chunk.foliage = chunk.foliage.filter(
          (f) => !foliageIntersectsRect(f, minX, maxX, minZ, maxZ),
        );
        chunk.obstacles = chunk.obstacles.filter((obs) => {
          if (obs.kind !== 'circle') return true;
          const r = obs.radius ?? 0;
          return !(
            obs.x + r >= minX && obs.x - r <= maxX
            && obs.z + r >= minZ && obs.z - r <= maxZ
          );
        });
        if (chunk.foliage.length !== before) {
          chunk.bakedLayer = null;
        }
      }
    }
  }

  _bakeChunkGround(chunk, sprites, tilePx) {
    if (chunk.bakedLayer && chunk.bakedTilePx === tilePx && chunk.bakeVersion === BAKE_VERSION) {
      return chunk.bakedLayer;
    }

    const px = tilePx;
    const size = CHUNK_TILES * px;
    if (!chunk._bakeCanvas) {
      chunk._bakeCanvas = document.createElement('canvas');
      chunk._bakeCtx = chunk._bakeCanvas.getContext('2d');
    }
    const canvas = chunk._bakeCanvas;
    const ctx = chunk._bakeCtx;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    const originTX = chunk.cx * CHUNK_TILES;
    const originTZ = chunk.cz * CHUNK_TILES;

    for (const tile of chunk.tiles) {
      const lx = tile.tx - originTX;
      const lz = tile.tz - originTZ;
      const tint = tile.tintKey ? unpackTintGradient(tile.tintKey) : null;
      sprites.stampTile(
        ctx,
        getFloorSpriteName(tile.floorKind),
        lx * px,
        lz * px,
        px,
        tile.floorKind === 'grass' ? tint : null,
      );
    }

    const originX = chunk.cx * CHUNK_WORLD;
    const originZ = chunk.cz * CHUNK_WORLD;
    const ppu = px / TILE;
    const half = px * 0.5;
    const originPxX = originX * ppu;
    const originPxZ = originZ * ppu;
    for (const f of chunk.foliage) {
      if (isYsortFoliage(f.kind)) continue;
      const fTint = isTintedFoliage(f.kind) && f.tintKey ? unpackTintGradient(f.tintKey) : null;
      const fx = Math.round(f.x * ppu) - originPxX - half;
      const fz = Math.round(f.z * ppu) - originPxZ - half;
      sprites.stampTile(ctx, f.sprite, fx, fz, px, fTint);
    }

    chunk.bakedLayer = canvas;
    chunk.bakedTilePx = tilePx;
    chunk.bakeVersion = BAKE_VERSION;
    return canvas;
  }

  drawGroundLayer(ctx, camTx, camTy, viewHalfW, viewHalfH, ppu, sprites, camX, camZ) {
    const tilePx = TILE * ppu;
    const chunkPx = CHUNK_TILES * tilePx;
    const minTX = Math.floor((camX - viewHalfW) / TILE);
    const maxTX = Math.ceil((camX + viewHalfW) / TILE);
    const minTZ = Math.floor((camZ - viewHalfH) / TILE);
    const maxTZ = Math.ceil((camZ + viewHalfH) / TILE);
    const minCX = Math.floor(minTX / CHUNK_TILES);
    const maxCX = Math.floor(maxTX / CHUNK_TILES);
    const minCZ = Math.floor(minTZ / CHUNK_TILES);
    const maxCZ = Math.floor(maxTZ / CHUNK_TILES);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(camTx, camTy);
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const chunk = this.getChunk(cx, cz);
        const layer = this._bakeChunkGround(chunk, sprites, tilePx);
        ctx.drawImage(layer, Math.round(cx * CHUNK_WORLD * ppu), Math.round(cz * CHUNK_WORLD * ppu), chunkPx, chunkPx);
      }
    }
    ctx.restore();
  }

  forEachChunkInRect(minTX, maxTX, minTZ, maxTZ, fn) {
    const minCX = Math.floor(minTX / CHUNK_TILES);
    const maxCX = Math.floor(maxTX / CHUNK_TILES);
    const minCZ = Math.floor(minTZ / CHUNK_TILES);
    const maxCZ = Math.floor(maxTZ / CHUNK_TILES);
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        fn(this.getChunk(cx, cz));
      }
    }
  }

  collectYsortFoliage(minX, maxX, minZ, maxZ) {
    const pad = TILE * 4;
    const minTX = Math.floor((minX - pad) / TILE);
    const maxTX = Math.ceil((maxX + pad) / TILE);
    const minTZ = Math.floor((minZ - pad) / TILE);
    const maxTZ = Math.ceil((maxZ + pad) / TILE);
    const out = [];
    this.forEachChunkInRect(minTX, maxTX, minTZ, maxTZ, (chunk) => {
      for (const f of chunk.foliage) {
        if (!isYsortFoliage(f.kind)) continue;
        if (foliageIntersectsRect(f, minX, maxX, minZ, maxZ)) out.push(f);
      }
    });
    return out;
  }

  /** @deprecated use collectYsortFoliage */
  collectCanopyFoliage(minX, maxX, minZ, maxZ) {
    return this.collectYsortFoliage(minX, maxX, minZ, maxZ);
  }

  collectFoliage(minX, maxX, minZ, maxZ) {
    const minTX = Math.floor(minX / TILE);
    const maxTX = Math.ceil(maxX / TILE);
    const minTZ = Math.floor(minZ / TILE);
    const maxTZ = Math.ceil(maxZ / TILE);
    const out = [];
    this.forEachChunkInRect(minTX, maxTX, minTZ, maxTZ, (chunk) => {
      for (const f of chunk.foliage) {
        if (f.x >= minX && f.x <= maxX && f.z >= minZ && f.z <= maxZ) out.push(f);
      }
    });
    return out;
  }

  collectObstaclesNear(x, z, radius) {
    const { cx: ccx, cz: ccz } = worldToChunk(x, z);
    const reach = Math.ceil(radius / (CHUNK_TILES * TILE)) + 1;
    const out = [];
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const chunk = this.getChunk(ccx + dx, ccz + dz);
        for (const obs of chunk.obstacles) out.push(obs);
      }
    }
    const pad = radius + 8;
    for (const obs of this.dynamicObstacles) {
      if (Math.abs(obs.x - x) <= pad && Math.abs(obs.z - z) <= pad) out.push(obs);
    }
    return out;
  }

  randomMapPoint(minDistFromCenter = BASE_RADIUS + 8) {
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDistFromCenter + Math.random() * 120;
      const x = Math.sin(angle) * dist;
      const z = Math.cos(angle) * dist;
      if (!this.checkCollision(x, z, 0.5)) return { x, z };
    }
    return { x: minDistFromCenter, z: 0 };
  }

  getPlayerSpawn() {
    return { x: 0, z: 0 };
  }

  _circleHit(px, pz, pr, ox, oz, or) {
    const dx = px - ox;
    const dz = pz - oz;
    return dx * dx + dz * dz < (pr + or) ** 2;
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

  _aabbHalfExtents(obs, soft = false) {
    if (soft && obs.softHalfW != null) {
      return { halfW: obs.softHalfW, halfH: obs.softHalfH };
    }
    return { halfW: obs.halfW, halfH: obs.halfH };
  }

  _aabbCenter(obs, soft = false) {
    if (soft && obs.softZ != null) {
      return { x: obs.softX ?? obs.x, z: obs.softZ };
    }
    return { x: obs.x, z: obs.z };
  }

  _circleAabbHit(px, pz, pr, obs, soft = false, forBullets = false) {
    if (forBullets && obs.bulletZ != null) {
      const halfW = obs.softHalfW ?? obs.halfW;
      const halfH = obs.bulletHalfH ?? obs.halfH;
      const ox = obs.softX ?? obs.x;
      const oz = obs.bulletZ;
      const cx = Math.max(ox - halfW, Math.min(px, ox + halfW));
      const cz = Math.max(oz - halfH, Math.min(pz, oz + halfH));
      const dx = px - cx;
      const dz = pz - cz;
      return dx * dx + dz * dz < pr * pr;
    }
    const { halfW, halfH } = this._aabbHalfExtents(obs, soft);
    const { x: ox, z: oz } = this._aabbCenter(obs, soft);
    const cx = Math.max(ox - halfW, Math.min(px, ox + halfW));
    const cz = Math.max(oz - halfH, Math.min(pz, oz + halfH));
    const dx = px - cx;
    const dz = pz - cz;
    return dx * dx + dz * dz < pr * pr;
  }

  _pushCircleFromAabb(px, pz, pr, obs, soft = false) {
    const { halfW, halfH } = this._aabbHalfExtents(obs, soft);
    const { x: ox, z: oz } = this._aabbCenter(obs, soft);
    const cx = Math.max(ox - halfW, Math.min(px, ox + halfW));
    const cz = Math.max(oz - halfH, Math.min(pz, oz + halfH));
    const dx = px - cx;
    const dz = pz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= pr * pr) return { x: px, z: pz };
    if (distSq < 1e-8) {
      const ox2 = px - ox;
      const oz2 = pz - oz;
      if (Math.abs(ox2) > Math.abs(oz2)) {
        return { x: px + Math.sign(ox2 || 1) * pr, z: pz };
      }
      return { x: px, z: pz + Math.sign(oz2 || 1) * pr };
    }
    const dist = Math.sqrt(distSq);
    const push = (pr - dist) / dist;
    return { x: px + dx * push, z: pz + dz * push };
  }

  _aabbAabbHit(acx, acz, halfW, halfH, obs, soft = false) {
    const ext = this._aabbHalfExtents(obs, soft);
    const { x: ox, z: oz } = this._aabbCenter(obs, soft);
    return Math.abs(acx - ox) < halfW + ext.halfW
      && Math.abs(acz - oz) < halfH + ext.halfH;
  }

  _pushAabbFromAabb(acx, acz, halfW, halfH, obs, soft = false) {
    const ext = this._aabbHalfExtents(obs, soft);
    const { x: ox, z: oz } = this._aabbCenter(obs, soft);
    const overlapX = halfW + ext.halfW - Math.abs(acx - ox);
    const overlapZ = halfH + ext.halfH - Math.abs(acz - oz);
    if (overlapX <= 0 || overlapZ <= 0) return { cx: acx, cz: acz };
    if (overlapX < overlapZ) {
      const dir = acx < ox ? -1 : 1;
      return { cx: acx + dir * overlapX, cz: acz };
    }
    const dir = acz < oz ? -1 : 1;
    return { cx: acx, cz: acz + dir * overlapZ };
  }

  _aabbHardEnabled(obs) {
    return obs.halfW > 0 && obs.halfH > 0;
  }

  /** @param {'exterior'|'interior'|null} wallSoft — which building wall soft layer applies. */
  _wallSoftMatches(obs, wallSoft) {
    if (!obs.wallSoft) return true;
    if (!wallSoft) return obs.wallSoft === 'exterior';
    return obs.wallSoft === wallSoft;
  }

  _checkObstacleCollision(x, z, radius, obstacles, forBullets = false, soft = false, wallSoft = null) {
    for (const obs of obstacles) {
      if (forBullets && obs.blocksBullets === false) continue;
      if (soft && !this._wallSoftMatches(obs, wallSoft)) continue;
      if (obs.kind === 'circle' && this._circleHit(x, z, radius, obs.x, obs.z, obs.radius)) {
        return true;
      }
      if (obs.kind === 'aabb') {
        if (!soft && !this._aabbHardEnabled(obs)) continue;
        if (soft && obs.softHalfW == null) continue;
        if (this._circleAabbHit(x, z, radius, obs, soft, forBullets)) return true;
      }
    }
    return false;
  }

  _shapeReach(shape) {
    if (!shape || shape.kind === 'circle') return (shape?.radius ?? 0) + 2;
    return Math.hypot(shape.halfW, shape.halfH) + Math.abs(shape.zOff ?? 0) + 2;
  }

  _aabbCircleHit(acx, acz, halfW, halfH, ox, oz, or) {
    const closestX = Math.max(acx - halfW, Math.min(ox, acx + halfW));
    const closestZ = Math.max(acz - halfH, Math.min(oz, acz + halfH));
    const dx = ox - closestX;
    const dz = oz - closestZ;
    return dx * dx + dz * dz < or * or;
  }

  _pushAabbFromCircle(acx, acz, halfW, halfH, obs) {
    const closestX = Math.max(acx - halfW, Math.min(obs.x, acx + halfW));
    const closestZ = Math.max(acz - halfH, Math.min(obs.z, acz + halfH));
    const nx = closestX - obs.x;
    const nz = closestZ - obs.z;
    const distSq = nx * nx + nz * nz;
    if (distSq >= obs.radius * obs.radius) return { cx: acx, cz: acz };
    if (distSq < 1e-8) return { cx: acx + obs.radius, cz: acz };
    const dist = Math.sqrt(distSq);
    const overlap = obs.radius - dist;
    return { cx: acx + (nx / dist) * overlap, cz: acz + (nz / dist) * overlap };
  }

  _checkShapeCollision(px, pz, shape, obstacles, soft = false, wallSoft = null) {
    if (!shape || shape.kind === 'circle') {
      return this._checkObstacleCollision(px, pz, shape?.radius ?? 0, obstacles, false, soft, wallSoft);
    }
    const acx = px;
    const acz = pz + shape.zOff;
    for (const obs of obstacles) {
      if (soft && !this._wallSoftMatches(obs, wallSoft)) continue;
      if (obs.kind === 'circle' && this._aabbCircleHit(acx, acz, shape.halfW, shape.halfH, obs.x, obs.z, obs.radius)) {
        return true;
      }
      if (obs.kind === 'aabb') {
        if (!soft && !this._aabbHardEnabled(obs)) continue;
        if (soft && obs.softHalfW == null) continue;
        if (this._aabbAabbHit(acx, acz, shape.halfW, shape.halfH, obs, soft)) return true;
      }
    }
    return false;
  }

  checkCollisionShape(px, pz, shape, soft = false, opts = {}) {
    const wallSoft = opts.wallSoft ?? null;
    const obstacles = this.collectObstaclesNear(px, pz, this._shapeReach(shape));
    return this._checkShapeCollision(px, pz, shape, obstacles, soft, wallSoft);
  }

  checkCollision(x, z, radius) {
    return this.checkCollisionShape(x, z, { kind: 'circle', radius }, false);
  }

  segmentBlocked(x0, z0, x1, z1, radius = BULLET_RADIUS, soft = true) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(2, Math.ceil(dist / 0.25));
    const midX = (x0 + x1) * 0.5;
    const midZ = (z0 + z1) * 0.5;
    const obstacles = this.collectObstaclesNear(midX, midZ, dist * 0.5 + 2);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (this._checkObstacleCollision(x, z, radius, obstacles, true, soft)) return true;
    }
    return false;
  }

  hasLineOfSight(x0, z0, x1, z1, radius = 0.25) {
    return !this.segmentBlocked(x0, z0, x1, z1, radius, false);
  }

  resolveMovementShape(oldX, oldZ, newX, newZ, shape, opts = {}) {
    if (!shape || shape.kind === 'circle') {
      return this.resolveMovement(oldX, oldZ, newX, newZ, shape?.radius ?? 0);
    }

    const wallSoft = opts.wallSoft ?? null;
    let x = newX;
    let z = newZ;
    const obstacles = this.collectObstaclesNear(x, z, this._shapeReach(shape));

    for (let i = 0; i < 4; i++) {
      for (const obs of obstacles) {
        let acx = x;
        let acz = z + shape.zOff;
        if (obs.kind === 'circle') {
          if (!this._aabbCircleHit(acx, acz, shape.halfW, shape.halfH, obs.x, obs.z, obs.radius)) continue;
          const pushed = this._pushAabbFromCircle(acx, acz, shape.halfW, shape.halfH, obs);
          x = pushed.cx;
          z = pushed.cz - shape.zOff;
        } else if (obs.kind === 'aabb') {
          if (obs.softHalfW == null) continue;
          if (!this._wallSoftMatches(obs, wallSoft)) continue;
          if (!this._aabbAabbHit(acx, acz, shape.halfW, shape.halfH, obs, true)) continue;
          const pushed = this._pushAabbFromAabb(acx, acz, shape.halfW, shape.halfH, obs, true);
          x = pushed.cx;
          z = pushed.cz - shape.zOff;
        }
      }
    }

    if (!this._checkShapeCollision(x, z, shape, obstacles, true, wallSoft)) return { x, z };
    if (!this._checkShapeCollision(newX, oldZ, shape, obstacles, true, wallSoft)) return { x: newX, z: oldZ };
    if (!this._checkShapeCollision(oldX, newZ, shape, obstacles, true, wallSoft)) return { x: oldX, z: newZ };
    return { x: oldX, z: oldZ };
  }

  resolveMovement(oldX, oldZ, newX, newZ, radius) {
    let x = newX;
    let z = newZ;
    const obstacles = this.collectObstaclesNear(x, z, radius + 3);

    for (let i = 0; i < 4; i++) {
      for (const obs of obstacles) {
        if (obs.kind === 'circle' && this._circleHit(x, z, radius, obs.x, obs.z, obs.radius)) {
          const p = this._pushOutCircle(x, z, radius, obs);
          x = p.x;
          z = p.z;
        } else if (obs.kind === 'aabb') {
          if (!this._aabbHardEnabled(obs)) continue;
          if (this._circleAabbHit(x, z, radius, obs)) {
            const p = this._pushCircleFromAabb(x, z, radius, obs);
            x = p.x;
            z = p.z;
          }
        }
      }
    }

    if (!this._checkObstacleCollision(x, z, radius, obstacles)) return { x, z };
    if (!this._checkObstacleCollision(newX, oldZ, radius, obstacles)) return { x: newX, z: oldZ };
    if (!this._checkObstacleCollision(oldX, newZ, radius, obstacles)) return { x: oldX, z: newZ };
    return { x: oldX, z: oldZ };
  }

  moveAxis(x, z, dx, dz, radius) {
    if (dx !== 0) {
      const r = this.resolveMovement(x, z, x + dx, z, radius);
      x = r.x;
      z = r.z;
    }
    if (dz !== 0) {
      const r = this.resolveMovement(x, z, x, z + dz, radius);
      x = r.x;
      z = r.z;
    }
    return { x, z };
  }

  moveAxisShape(x, z, dx, dz, shape, opts = {}) {
    if (dx !== 0) {
      const r = this.resolveMovementShape(x, z, x + dx, z, shape, opts);
      x = r.x;
      z = r.z;
    }
    if (dz !== 0) {
      const r = this.resolveMovementShape(x, z, x, z + dz, shape, opts);
      x = r.x;
      z = r.z;
    }
    return { x, z };
  }
}
