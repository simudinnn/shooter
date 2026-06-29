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
import {
  bulletUsesFootLevel,
  bulletSouthWallTestZ,
  bulletWallCollisionZ,
  BULLET_FOOT_Z_OFF,
  obstacleBehindAlongAim,
} from './bulletCollision.js';
import { shapeOverlapsOpenDoorNavZone } from './buildingGen.js';

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
    this._dynamicGrid = new Map();
    this._obstacleScratch = [];
  }

  addDynamicObstacle(obs) {
    this.dynamicObstacles.push(obs);
    const cx = Math.floor(obs.x / CHUNK_WORLD);
    const cz = Math.floor(obs.z / CHUNK_WORLD);
    const key = `${cx},${cz}`;
    let bucket = this._dynamicGrid.get(key);
    if (!bucket) {
      bucket = [];
      this._dynamicGrid.set(key, bucket);
    }
    bucket.push(obs);
  }

  removeDynamicObstacle(obs) {
    const i = this.dynamicObstacles.indexOf(obs);
    if (i >= 0) this.dynamicObstacles.splice(i, 1);
    const cx = Math.floor(obs.x / CHUNK_WORLD);
    const cz = Math.floor(obs.z / CHUNK_WORLD);
    const bucket = this._dynamicGrid.get(`${cx},${cz}`);
    if (bucket) {
      const j = bucket.indexOf(obs);
      if (j >= 0) bucket.splice(j, 1);
    }
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
    this._dynamicGrid.clear();
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
    const out = this._obstacleScratch;
    out.length = 0;
    const { cx: ccx, cz: ccz } = worldToChunk(x, z);
    const reach = Math.ceil(radius / CHUNK_WORLD) + 1;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const chunk = this.chunks.get(this._chunkKey(ccx + dx, ccz + dz));
        if (!chunk) continue;
        for (const obs of chunk.obstacles) out.push(obs);
      }
    }
    const pad = radius + 8;
    const minCX = Math.floor((x - pad) / CHUNK_WORLD);
    const maxCX = Math.floor((x + pad) / CHUNK_WORLD);
    const minCZ = Math.floor((z - pad) / CHUNK_WORLD);
    const maxCZ = Math.floor((z + pad) / CHUNK_WORLD);
    for (let gcz = minCZ; gcz <= maxCZ; gcz++) {
      for (let gcx = minCX; gcx <= maxCX; gcx++) {
        const bucket = this._dynamicGrid.get(`${gcx},${gcz}`);
        if (!bucket) continue;
        for (const obs of bucket) {
          if (Math.abs(obs.x - x) <= pad && Math.abs(obs.z - z) <= pad) out.push(obs);
        }
      }
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

  _bulletHugsSouthExterior(obs, bulletCtx) {
    const feetZ = bulletCtx?.ownerFeetZ;
    if (feetZ == null) return false;
    const { halfH } = this._aabbHalfExtents(obs, false);
    const { z: oz } = this._aabbCenter(obs, false);
    return feetZ > oz + halfH * 0.5;
  }

  _circleAabbHit(px, pz, pr, obs, soft = false, forBullets = false, bulletCtx = null) {
    const { halfW, halfH } = this._aabbHalfExtents(obs, soft);
    const { x: ox, z: oz } = this._aabbCenter(obs, soft);
    if (forBullets && bulletUsesFootLevel(obs)) {
      if (this._bulletHugsSouthExterior(obs, bulletCtx)
        && (bulletCtx?.segDz == null || bulletCtx.segDz >= -0.02)) {
        return false;
      }
      if (pz + pr < oz - halfH || pz - pr > oz + halfH) return false;
      return px + pr >= ox - halfW && px - pr <= ox + halfW;
    }
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

  /** Nav pathfinding — walls, doors, props, trees, rocks, chests. */
  _navObstacleBlocks(obs) {
    if (obs.isCorpse) return false;
    if (obs.doorSeal || obs.floorEdge) return true;
    if (obs.isDecor) return true;
    if (obs.kind === 'circle' && (obs.radius ?? 0) > 0.2) return true;
    if (obs.kind === 'aabb' && this._aabbHardEnabled(obs)) return true;
    return false;
  }

  _ignoreObstacleInDoorway(obs, px, pz, shape, buildings) {
    if (!buildings || (!obs.floorEdge && !obs.doorSeal)) return false;
    return shapeOverlapsOpenDoorNavZone(buildings, px, pz, shape);
  }

  _bulletTestZ(z, obs, bulletCtx) {
    if (bulletUsesFootLevel(obs)) {
      const aim = bulletCtx?.aimAngle;
      if (aim != null) return bulletWallCollisionZ(z, aim);
      return bulletSouthWallTestZ(z);
    }
    return z;
  }

  _pointExteriorOfFloorEdge(obs, x, z) {
    if (!obs.floorEdge || !obs.edgeDir) return false;
    switch (obs.edgeDir) {
      case 's': return z >= obs.z - obs.halfH * 0.35;
      case 'n': return z <= obs.z + obs.halfH * 0.35;
      case 'e': return x >= obs.x - obs.halfW * 0.35;
      case 'w': return x <= obs.x + obs.halfW * 0.35;
      default: return false;
    }
  }

  _losIgnoresFloorEdge(obs, losSeg) {
    if (!losSeg || !obs.floorEdge) return false;
    const z0 = losSeg.feetZ0 ?? losSeg.z0;
    const z1 = losSeg.feetZ1 ?? losSeg.z1;
    const aExt = this._pointExteriorOfFloorEdge(obs, losSeg.x0, z0);
    const bExt = this._pointExteriorOfFloorEdge(obs, losSeg.x1, z1);
    return aExt === bExt;
  }

  _checkObstacleCollision(x, z, radius, obstacles, forBullets = false, soft = false, _wallSoft = null, bulletCtx = null, forNav = false, buildings = null, shape = null) {
    for (const obs of obstacles) {
      if (forBullets && obs.blocksBullets === false) continue;
      if (this._losIgnoresFloorEdge(obs, bulletCtx?.losSeg)) continue;
      if (forBullets && bulletCtx?.shooterX != null && bulletCtx?.aimAngle != null
        && obstacleBehindAlongAim(obs, bulletCtx.shooterX, bulletCtx.shooterZ, bulletCtx.aimAngle)) {
        continue;
      }
      if (this._ignoreObstacleInDoorway(obs, x, z, shape, buildings)) continue;
      if (forNav && !this._navObstacleBlocks(obs)) continue;
      const testZ = forBullets ? this._bulletTestZ(z, obs, bulletCtx) : z;
      if (obs.kind === 'circle' && this._circleHit(x, testZ, radius, obs.x, obs.z, obs.radius)) {
        return true;
      }
      if (obs.kind === 'aabb') {
        if (!soft && !this._aabbHardEnabled(obs)) continue;
        if (this._circleAabbHit(x, testZ, radius, obs, soft, forBullets, bulletCtx)) return true;
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

  _checkShapeCollision(px, pz, shape, obstacles, soft = false, forNav = false, buildings = null) {
    if (!shape || shape.kind === 'circle') {
      return this._checkObstacleCollision(
        px, pz, shape?.radius ?? 0, obstacles, false, soft, null, null, forNav, buildings, shape,
      );
    }
    const acx = px;
    const acz = pz + shape.zOff;
    for (const obs of obstacles) {
      if (this._ignoreObstacleInDoorway(obs, px, pz, shape, buildings)) continue;
      if (forNav && !this._navObstacleBlocks(obs)) continue;
      if (obs.kind === 'circle' && this._aabbCircleHit(acx, acz, shape.halfW, shape.halfH, obs.x, obs.z, obs.radius)) {
        return true;
      }
      if (obs.kind === 'aabb') {
        if (!soft && !this._aabbHardEnabled(obs)) continue;
        if (this._aabbAabbHit(acx, acz, shape.halfW, shape.halfH, obs, soft)) return true;
      }
    }
    return false;
  }

  checkCollisionShape(px, pz, shape, soft = false, opts = {}) {
    const forNav = opts.forNav ?? false;
    const buildings = opts.buildings ?? null;
    const obstacles = this.collectObstaclesNear(px, pz, this._shapeReach(shape));
    return this._checkShapeCollision(px, pz, shape, obstacles, soft, forNav, buildings);
  }

  checkCollision(x, z, radius) {
    return this.checkCollisionShape(x, z, { kind: 'circle', radius }, false);
  }

  /** Bullet spawn — ignores walls behind the player along the aim ray. */
  checkBulletSpawnCollision(shooterX, shooterZ, x, z, radius, aimAngle, opts = null) {
    const pad = radius + 3 + BULLET_FOOT_Z_OFF;
    const obstacles = this.collectObstaclesNear(x, z, pad);
    return this._checkObstacleCollision(x, z, radius, obstacles, true, true, null, {
      shooterX,
      shooterZ,
      aimAngle,
      ...(opts?.ownerFeetZ != null ? { ownerFeetZ: opts.ownerFeetZ } : {}),
      segDz: z - shooterZ,
    });
  }

  segmentBlocked(x0, z0, x1, z1, radius = BULLET_RADIUS, soft = true, aimAngle = null, opts = null) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(2, Math.ceil(dist / 0.25));
    const midX = (x0 + x1) * 0.5;
    const midZ = (z0 + z1) * 0.5;
    const collectPad = dist * 0.5 + 2 + (aimAngle != null ? BULLET_FOOT_Z_OFF + 1 : 0);
    const obstacles = this.collectObstaclesNear(midX, midZ, collectPad);
    const minStep = opts?.forwardOnly ? Math.max(1, Math.ceil(steps * 0.12)) : 1;
    const forBullets = aimAngle != null || !!opts?.forwardOnly;
    const bulletCtx = {
      ...(opts?.shooterX != null && aimAngle != null
        ? { shooterX: opts.shooterX, shooterZ: opts.shooterZ, aimAngle }
        : {}),
      ...(opts?.ownerFeetZ != null ? { ownerFeetZ: opts.ownerFeetZ } : {}),
      ...(opts?.losSeg ? { losSeg: opts.losSeg } : {}),
      ...(forBullets ? { segDz: z1 - z0 } : {}),
    };
    const ctx = Object.keys(bulletCtx).length ? bulletCtx : null;
    for (let i = minStep; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (this._checkObstacleCollision(x, z, radius, obstacles, forBullets, soft, null, ctx)) return true;
    }
    if (opts?.forwardOnly && steps > 1) {
      if (this._checkObstacleCollision(x1, z1, radius, obstacles, forBullets, soft, null, ctx)) return true;
    }
    return false;
  }

  hasLineOfSight(x0, z0, x1, z1, radius = 0.25, feetZ0 = null, feetZ1 = null) {
    return !this.segmentBlocked(x0, z0, x1, z1, radius, false, null, {
      losSeg: {
        x0, z0, x1, z1,
        feetZ0: feetZ0 ?? z0,
        feetZ1: feetZ1 ?? z1,
      },
    });
  }

  resolveMovementShape(oldX, oldZ, newX, newZ, shape, opts = {}) {
    if (!shape || shape.kind === 'circle') {
      return this.resolveMovement(oldX, oldZ, newX, newZ, shape?.radius ?? 0);
    }

    const buildings = opts.buildings ?? null;
    let x = newX;
    let z = newZ;
    const obstacles = this.collectObstaclesNear(x, z, this._shapeReach(shape));

    for (let i = 0; i < 4; i++) {
      for (const obs of obstacles) {
        if (this._ignoreObstacleInDoorway(obs, x, z, shape, buildings)) continue;
        let acx = x;
        let acz = z + shape.zOff;
        if (obs.kind === 'circle') {
          if (!this._aabbCircleHit(acx, acz, shape.halfW, shape.halfH, obs.x, obs.z, obs.radius)) continue;
          const pushed = this._pushAabbFromCircle(acx, acz, shape.halfW, shape.halfH, obs);
          x = pushed.cx;
          z = pushed.cz - shape.zOff;
        } else if (obs.kind === 'aabb') {
          if (!this._aabbHardEnabled(obs)) continue;
          if (!this._aabbAabbHit(acx, acz, shape.halfW, shape.halfH, obs, false)) continue;
          const pushed = this._pushAabbFromAabb(acx, acz, shape.halfW, shape.halfH, obs, false);
          x = pushed.cx;
          z = pushed.cz - shape.zOff;
        }
      }
    }

    if (!this._checkShapeCollision(x, z, shape, obstacles, false, false, buildings)) return { x, z };
    if (!this._checkShapeCollision(newX, oldZ, shape, obstacles, false, false, buildings)) return { x: newX, z: oldZ };
    if (!this._checkShapeCollision(oldX, newZ, shape, obstacles, false, false, buildings)) return { x: oldX, z: newZ };
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

  /** Push an entity out of overlapping world obstacles (barrels, tables, …). */
  depenetrateShape(x, z, shape, maxIter = 8) {
    if (!shape || shape.kind === 'circle') {
      let px = x;
      let pz = z;
      const pr = shape?.radius ?? 0;
      for (let n = 0; n < maxIter; n++) {
        if (!this.checkCollisionShape(px, pz, shape, false)) return { x: px, z: pz };
        const obstacles = this.collectObstaclesNear(px, pz, pr + 3);
        let pushed = false;
        for (const obs of obstacles) {
          if (obs.kind === 'circle' && this._circleHit(px, pz, pr, obs.x, obs.z, obs.radius)) {
            const p = this._pushOutCircle(px, pz, pr, obs);
            px = p.x;
            pz = p.z;
            pushed = true;
          } else if (obs.kind === 'aabb' && this._aabbHardEnabled(obs)
            && this._circleAabbHit(px, pz, pr, obs)) {
            const p = this._pushCircleFromAabb(px, pz, pr, obs);
            px = p.x;
            pz = p.z;
            pushed = true;
          }
        }
        if (!pushed) break;
      }
      return { x: px, z: pz };
    }

    let px = x;
    let pz = z;
    for (let n = 0; n < maxIter; n++) {
      if (!this.checkCollisionShape(px, pz, shape, false)) return { x: px, z: pz };
      const obstacles = this.collectObstaclesNear(px, pz, this._shapeReach(shape));
      let acx = px;
      let acz = pz + shape.zOff;
      let moved = false;
      for (const obs of obstacles) {
        if (obs.kind === 'circle') {
          if (!this._aabbCircleHit(acx, acz, shape.halfW, shape.halfH, obs.x, obs.z, obs.radius)) continue;
          const pushed = this._pushAabbFromCircle(acx, acz, shape.halfW, shape.halfH, obs);
          acx = pushed.cx;
          acz = pushed.cz;
          moved = true;
        } else if (obs.kind === 'aabb' && this._aabbHardEnabled(obs)) {
          if (!this._aabbAabbHit(acx, acz, shape.halfW, shape.halfH, obs, false)) continue;
          const pushed = this._pushAabbFromAabb(acx, acz, shape.halfW, shape.halfH, obs, false);
          acx = pushed.cx;
          acz = pushed.cz;
          moved = true;
        }
      }
      if (!moved) break;
      px = acx;
      pz = acz - shape.zOff;
    }
    return { x: px, z: pz };
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

  /** Vertical first, then horizontal — alternate slide order at corners. */
  moveAxisShapeZX(x, z, dx, dz, shape, opts = {}) {
    if (dz !== 0) {
      const r = this.resolveMovementShape(x, z, x, z + dz, shape, opts);
      x = r.x;
      z = r.z;
    }
    if (dx !== 0) {
      const r = this.resolveMovementShape(x, z, x + dx, z, shape, opts);
      x = r.x;
      z = r.z;
    }
    return { x, z };
  }
}
