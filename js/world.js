import {
  TILE,
  CHUNK_TILES,
  CHUNK_WORLD,
  BASE_RADIUS,
  PLAYER_SPAWN_TOWN_CLEARANCE_TILES,
  FLOOR_KIND,
  generateChunk,
  populateChunkFoliage,
  worldToChunk,
  getBiome,
  isInBase,
  getFloorSpriteName,
  unpackTintGradient,
  isTintedFoliage,
  isYsortFoliage,
  isTreeFoliage,
  foliageIntersectsRect,
  isCanopyFoliage,
  getTerrainMapColorFromTile,
} from './worldGen.js';
import {
  bulletUsesFootLevel,
  bulletSouthWallTestZ,
  bulletWallCollisionZ,
  BULLET_FOOT_Z_OFF,
  obstacleBehindAlongAim,
} from './bulletCollision.js';
import { shapeOverlapsOpenDoorNavZone } from './buildingGen.js';
import {
  collectHighwayTilesInChunk,
  getRoadNetwork,
  chunkOverlapsWorldBounds,
  clampWorldPosition,
  getWorldBoundsWorld,
  getWorldBoundsTiles,
  isHighwayTile,
  isInWorldBoundsTile,
  ROAD_CLEARANCE_TILES,
  getNearbyTownAnchors,
  townHalf,
} from './highwayGen.js';

export { TILE, CHUNK_TILES, CHUNK_WORLD, BASE_RADIUS } from './worldGen.js';
export const PLAYER_RADIUS = 0.6;
export const BULLET_RADIUS = 0.15;

const BAKE_VERSION = 101;
const MAX_CACHED_CHUNKS = 256;

export class World {
  constructor() {
    this.chunks = new Map();
    this._oobChunks = new Map();
    this.obstacles = [];
    this.decor = [];
    this.dynamicObstacles = [];
    this._dynamicGrid = new Map();
    this._obstacleScratch = [];
    this._foliageBlocked = new Set();
    this._foliageReady = false;
    /** @type {Map<string, string>} */
    this._townFloorTiles = new Map();
    this._dirtPattern = null;
    this._dirtPatternPx = 0;
    this._foliageQueue = [];
    this._holdAllChunks = false;
    this._fullyPrewarmed = false;
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
    const b = getWorldBoundsWorld();
    return Math.max(Math.abs(b.minX), Math.abs(b.maxX));
  }

  get halfH() {
    const b = getWorldBoundsWorld();
    return Math.max(Math.abs(b.minZ), Math.abs(b.maxZ));
  }

  async build() {
    this.chunks.clear();
    this._oobChunks.clear();
    this.obstacles = [];
    this.decor = [];
    this.dynamicObstacles = [];
    this._dynamicGrid.clear();
    this._foliageBlocked.clear();
    this._townFloorTiles.clear();
    this._foliageQueue = [];
    this._holdAllChunks = false;
    this._fullyPrewarmed = false;
    this._foliageReady = true;
    this._cachedPlayerSpawn = null;
    this._touchChunk(0, 0);
  }

  _foliageSkipTile(tx, tz) {
    if (this._foliageBlocked.has(`${tx},${tz}`)) return true;
    if (this._townFloorTiles.has(`${tx},${tz}`)) return true;
    if (isHighwayTile(tx, tz)) return true;
    const tile = this.getTile(tx, tz);
    if (tile?.floorKind === 'road' || tile?.floorKind === 'path') return true;
    return false;
  }

  /** True when a tile is on or within ROAD_CLEARANCE_TILES of any road/path surface. */
  isNearRoadSurface(tx, tz, clearance = ROAD_CLEARANCE_TILES) {
    for (let dz = -clearance; dz <= clearance; dz++) {
      for (let dx = -clearance; dx <= clearance; dx++) {
        const ntx = tx + dx;
        const ntz = tz + dz;
        if (isHighwayTile(ntx, ntz)) return true;
        if (this._townFloorTiles.has(`${ntx},${ntz}`)) return true;
        const cx = Math.floor(ntx / CHUNK_TILES);
        const cz = Math.floor(ntz / CHUNK_TILES);
        const chunk = this.chunks.get(this._chunkKey(cx, cz));
        if (!chunk || chunk.outOfBounds) continue;
        const lx = ((ntx % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
        const lz = ((ntz % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
        const tile = chunk.tiles[lz * CHUNK_TILES + lx];
        if (tile?.floorKind === 'road' || tile?.floorKind === 'path') return true;
      }
    }
    return false;
  }

  /** Persist town roads/paths so they survive chunk eviction. */
  registerTownFloorTiles(tiles) {
    for (const { tx, tz, kind } of tiles) {
      this._townFloorTiles.set(`${tx},${tz}`, kind);
      this._foliageBlocked.add(`${tx},${tz}`);
    }
  }

  /** Reserve tiles before foliage generation (building footprints, paths, etc.). */
  markFoliageBlockedTiles(tiles) {
    for (const { tx, tz } of tiles) {
      this._foliageBlocked.add(`${tx},${tz}`);
    }
  }

  _applyTownFloorToChunk(chunk) {
    if (!chunk || chunk.outOfBounds || this._townFloorTiles.size === 0) return;
    let dirty = false;
    let foliageDirty = false;
    for (const tile of chunk.tiles) {
      const kind = this._townFloorTiles.get(`${tile.tx},${tile.tz}`);
      if (!kind) continue;
      if (tile.floorKind !== kind) {
        tile.floorKind = kind;
        dirty = true;
      }
      if (kind !== FLOOR_KIND) chunk.hasOverlayFloors = true;
      if (chunk.foliagePopulated && kind !== FLOOR_KIND) {
        const minX = tile.tx * TILE;
        const minZ = tile.tz * TILE;
        const before = chunk.foliage.length;
        this.clearFoliageInRect(minX, minX + TILE, minZ, minZ + TILE, { markBlocked: false });
        if (chunk.foliage.length !== before) foliageDirty = true;
      }
    }
    if (dirty) chunk.bakedLayer = null;
    if (foliageDirty) this.syncFoliageObstacles();
  }

  populateFoliageForChunk(chunk) {
    if (!chunk || chunk.foliagePopulated || chunk.outOfBounds) return;
    populateChunkFoliage(chunk, (tx, tz) => this._foliageSkipTile(tx, tz));
    this._pruneFoliageWithoutSprites(chunk);
    this._onFoliagePopulated?.(chunk);
  }

  /** Optional hook — e.g. clear foliage around buildings after chunk regen. */
  setFoliagePopulatedHook(fn) {
    this._onFoliagePopulated = fn ?? null;
  }

  setSpriteBank(sprites) {
    this._spriteBank = sprites;
  }

  _pruneFoliageWithoutSprites(chunk) {
    const sprites = this._spriteBank;
    if (!sprites?.ensureSprite) return;
    for (const f of chunk.foliage) {
      sprites.ensureSprite(f.sprite);
    }
  }

  /** Drop tree props whose art failed to load (collision-only stumps). */
  pruneAllTreesWithoutSprites() {
    if (!this._spriteBank?.hasSprite) return;
    for (const chunk of this.chunks.values()) {
      if (chunk.outOfBounds) continue;
      this._pruneFoliageWithoutSprites(chunk);
    }
    this.syncFoliageObstacles();
  }

  /** Spread foliage gen across frames — avoids movement hitches. */
  queueFoliageForChunk(chunk) {
    if (!chunk || chunk.foliagePopulated || chunk.outOfBounds || chunk._foliageQueued) return;
    chunk._foliageQueued = true;
    this._foliageQueue.push(chunk);
  }

  drainFoliageQueue(maxPerFrame = 2) {
    if (this._fullyPrewarmed) return;
    let n = 0;
    while (n < maxPerFrame && this._foliageQueue.length > 0) {
      const chunk = this._foliageQueue.shift();
      if (!chunk || chunk.foliagePopulated) continue;
      chunk._foliageQueued = false;
      this.populateFoliageForChunk(chunk);
      n++;
    }
  }

  /** Eagerly fill foliage for chunks around a world point (spawn reveal). */
  populateFoliageAround(wx, wz, radiusChunks = 4) {
    const { cx: pcx, cz: pcz } = worldToChunk(wx, wz);
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const chunk = this.getChunk(pcx + dx, pcz + dz);
        if (chunk.outOfBounds) continue;
        if (!chunk.foliagePopulated) {
          chunk._foliageQueued = false;
          this.populateFoliageForChunk(chunk);
        }
      }
    }
    this._foliageQueue = this._foliageQueue.filter((c) => c?.foliagePopulated);
  }

  /** Remove foliage that landed on roads, paths, or other blocked floor tiles. */
  stripFoliageFromSurfaceTilesAround(wx, wz, radiusChunks = 4) {
    const { cx: pcx, cz: pcz } = worldToChunk(wx, wz);
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const chunk = this.getChunk(pcx + dx, pcz + dz);
        if (chunk.outOfBounds) continue;
        for (let lz = 0; lz < CHUNK_TILES; lz++) {
          for (let lx = 0; lx < CHUNK_TILES; lx++) {
            const tx = chunk.cx * CHUNK_TILES + lx;
            const tz = chunk.cz * CHUNK_TILES + lz;
            if (!this._foliageSkipTile(tx, tz)) continue;
            const minX = tx * TILE;
            const minZ = tz * TILE;
            this.clearFoliageInRect(minX, minX + TILE, minZ, minZ + TILE);
          }
        }
      }
    }
    this.syncFoliageObstacles();
  }

  /** True when every in-bounds chunk near wx/wz has finished foliage generation. */
  isFoliageReadyAround(wx, wz, radiusChunks = 4) {
    const { cx: pcx, cz: pcz } = worldToChunk(wx, wz);
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const chunk = this.chunks.get(this._chunkKey(cx, cz));
        if (!chunk || chunk.outOfBounds) continue;
        if (!chunk.foliagePopulated) return false;
      }
    }
    for (const chunk of this._foliageQueue) {
      if (!chunk) continue;
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (Math.abs(dx) <= radiusChunks && Math.abs(dz) <= radiusChunks) return false;
    }
    return true;
  }

  /** True when foliage and nearby building chunks have finished generating. */
  isSpawnAreaReadyAround(wx, wz, radiusChunks = 4) {
    if (!this.isFoliageReadyAround(wx, wz, radiusChunks)) return false;
    const { cx: pcx, cz: pcz } = worldToChunk(wx, wz);
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const chunk = this.chunks.get(this._chunkKey(cx, cz));
        if (!chunk || chunk.outOfBounds) continue;
        if (!chunk.buildingsSpawned) return false;
      }
    }
    return true;
  }

  /** Load every in-bounds chunk — call during the loading screen before gameplay. */
  async preloadAllChunks(onProgress = null) {
    const b = getWorldBoundsTiles();
    const minCX = Math.floor(b.minTx / CHUNK_TILES);
    const maxCX = Math.floor(b.maxTx / CHUNK_TILES);
    const minCZ = Math.floor(b.minTz / CHUNK_TILES);
    const maxCZ = Math.floor(b.maxTz / CHUNK_TILES);
    const total = (maxCX - minCX + 1) * (maxCZ - minCZ + 1);
    let done = 0;
    this._holdAllChunks = true;

    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        if (chunkOverlapsWorldBounds(cx, cz)) this.getChunk(cx, cz);
        done++;
        if (onProgress && (done % 3 === 0 || done === total)) {
          onProgress(done / total);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
  }

  /** Fill foliage for every loaded chunk — call after towns/roads are placed. */
  async finalizeWorldGeneration(onProgress = null) {
    const pending = [];
    for (const chunk of this.chunks.values()) {
      if (!chunk.outOfBounds && !chunk.foliagePopulated) pending.push(chunk);
    }
    for (let i = 0; i < pending.length; i++) {
      this.populateFoliageForChunk(pending[i]);
      if (onProgress && (i % 2 === 0 || i === pending.length - 1)) {
        onProgress((i + 1) / pending.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    this.syncFoliageObstacles();
    this._foliageReady = true;
    this._fullyPrewarmed = true;
  }

  prewarmGround(wx, wz, radiusChunks = 4) {
    const { cx: pcx, cz: pcz } = worldToChunk(wx, wz);
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        this.getChunk(pcx + dx, pcz + dz);
      }
    }
  }

  /** Keep terrain/foliage/spawn state warm around a moving focus point. */
  touchChunksAround(wx, wz, radiusChunks = 5, opts = {}) {
    const eager = !!opts.eager;
    const { cx: pcx, cz: pcz } = worldToChunk(wx, wz);
    const toLoad = [];
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = this._chunkKey(cx, cz);
        if (this.chunks.has(key)) {
          this._bumpChunk(key);
        } else {
          toLoad.push({ cx, cz, d: dx * dx + dz * dz });
        }
      }
    }
    toLoad.sort((a, b) => a.d - b.d);
    const budget = eager ? toLoad.length : 4;
    for (let i = 0; i < Math.min(budget, toLoad.length); i++) {
      this.getChunk(toLoad[i].cx, toLoad[i].cz);
    }
  }

  /** Paint highway tiles — only touches chunks that contain road. */
  async bootstrapWorld(onProgress = null) {
    const { roadTileSet } = getRoadNetwork();
    const byChunk = new Map();
    for (const key of roadTileSet) {
      const [tx, tz] = key.split(',').map(Number);
      const ck = this._chunkKey(
        Math.floor(tx / CHUNK_TILES),
        Math.floor(tz / CHUNK_TILES),
      );
      let list = byChunk.get(ck);
      if (!list) {
        list = [];
        byChunk.set(ck, list);
      }
      list.push({ tx, tz, kind: 'road' });
    }

    const entries = [...byChunk.entries()];
    const total = entries.length;
    for (let i = 0; i < entries.length; i++) {
      const [ck, tiles] = entries[i];
      const [cx, cz] = ck.split(',').map(Number);
      if (!chunkOverlapsWorldBounds(cx, cz)) continue;
      this.getChunk(cx, cz);
      this.paintFloorWorldTiles(tiles);
      if (onProgress && (i % 4 === 0 || i === total - 1)) {
        onProgress((i + 1) / total, 'Loading roads…');
        if (i % 16 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  /** Bake ground sprites for the full finite world. */
  async prewarmAllGround(sprites, ppu, onProgress = null) {
    const tilePx = TILE * ppu;
    const b = getWorldBoundsTiles();
    const minCX = Math.floor(b.minTx / CHUNK_TILES);
    const maxCX = Math.floor(b.maxTx / CHUNK_TILES);
    const minCZ = Math.floor(b.minTz / CHUNK_TILES);
    const maxCZ = Math.floor(b.maxTz / CHUNK_TILES);
    const total = (maxCX - minCX + 1) * (maxCZ - minCZ + 1);
    let done = 0;

    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        this._bakeChunkGround(this.getChunk(cx, cz), sprites, tilePx);
        done++;
        if (onProgress && (done % 2 === 0 || done === total)) {
          onProgress(done / total);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
  }

  _chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  _bumpChunk(key) {
    if (!this.chunks.has(key)) return;
    const chunk = this.chunks.get(key);
    this.chunks.delete(key);
    this.chunks.set(key, chunk);
  }

  _evictOldestChunk() {
    const oldest = this.chunks.keys().next().value;
    if (oldest != null) this.chunks.delete(oldest);
  }

  _outOfBoundsChunk(cx, cz) {
    const key = this._chunkKey(cx, cz);
    if (this._oobChunks.has(key)) return this._oobChunks.get(key);
    const chunk = generateChunk(cx, cz);
    chunk.outOfBounds = true;
    chunk.foliagePopulated = true;
    this._oobChunks.set(key, chunk);
    return chunk;
  }

  _touchChunk(cx, cz) {
    const key = this._chunkKey(cx, cz);
    if (this.chunks.has(key)) {
      this._bumpChunk(key);
      return this.chunks.get(key);
    }

    const chunk = generateChunk(cx, cz);
    this.chunks.set(key, chunk);
    if (this._foliageReady && !chunk.foliagePopulated) {
      this.populateFoliageForChunk(chunk);
    }
    this.paintHighwayInChunk(cx, cz);
    this._applyTownFloorToChunk(chunk);
    while (!this._holdAllChunks && this.chunks.size > MAX_CACHED_CHUNKS) this._evictOldestChunk();
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
    const lx = ((tx % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
    const lz = ((tz % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
    return this.getChunk(cx, cz).tiles[lz * CHUNK_TILES + lx];
  }

  paintHighwayInChunk(cx, cz) {
    const tiles = collectHighwayTilesInChunk(cx, cz);
    if (tiles.length) this.paintFloorWorldTiles(tiles);
  }

  /** Paint floor kinds at absolute world tile coordinates. */
  paintFloorWorldTiles(tiles) {
    const touched = new Set();
    for (const { tx, tz, kind } of tiles) {
      const tile = this.getTile(tx, tz);
      if (!tile) continue;
      if (kind === 'path' && tile.floorKind === 'road') continue;
      tile.floorKind = kind;
      this._foliageBlocked.add(`${tx},${tz}`);
      const minX = tx * TILE;
      const minZ = tz * TILE;
      this.clearFoliageInRect(minX, minX + TILE, minZ, minZ + TILE, { markBlocked: false });
      const key = this._chunkKey(
        Math.floor(tx / CHUNK_TILES),
        Math.floor(tz / CHUNK_TILES),
      );
      touched.add(key);
      if (kind !== FLOOR_KIND) {
        const chunk = this.chunks.get(key);
        if (chunk) chunk.hasOverlayFloors = true;
      }
    }
    for (const key of touched) {
      const chunk = this.chunks.get(key);
      if (chunk) chunk.bakedLayer = null;
    }
  }

  /** Paint world floor tiles (roads, paths) relative to a town origin tile. */
  paintFloorRects(rects, kind, originTileX, originTileZ) {
    const touched = new Set();
    for (const r of rects) {
      for (let tz = r.oz; tz < r.oz + r.h; tz++) {
        for (let tx = r.ox; tx < r.ox + r.w; tx++) {
          const worldTx = originTileX + tx;
          const worldTz = originTileZ + tz;
          const tile = this.getTile(worldTx, worldTz);
          if (!tile) continue;
          tile.floorKind = kind;
          this._foliageBlocked.add(`${worldTx},${worldTz}`);
          touched.add(this._chunkKey(
            Math.floor(worldTx / CHUNK_TILES),
            Math.floor(worldTz / CHUNK_TILES),
          ));
        }
      }
      const minX = (originTileX + r.ox) * TILE;
      const maxX = (originTileX + r.ox + r.w) * TILE;
      const minZ = (originTileZ + r.oz) * TILE;
      const maxZ = (originTileZ + r.oz + r.h) * TILE;
      this.clearFoliageInRect(minX, maxX, minZ, maxZ, { markBlocked: false });
    }
    for (const key of touched) {
      const chunk = this.chunks.get(key);
      if (chunk) {
        chunk.bakedLayer = null;
        if (kind !== FLOOR_KIND) chunk.hasOverlayFloors = true;
      }
    }
  }

  /** Remove y-sort foliage matching predicate; also drops linked circle obstacles. */
  removeFoliageWhere(predicate) {
    for (const chunk of this.chunks.values()) {
      const dropObs = new Set();
      const before = chunk.foliage.length;
      chunk.foliage = chunk.foliage.filter((f) => {
        if (!predicate(f)) return true;
        if (f._obstacle) dropObs.add(f._obstacle);
        return false;
      });
      if (chunk.foliage.length === before && dropObs.size === 0) continue;
      if (dropObs.size) {
        chunk.obstacles = chunk.obstacles.filter((obs) => !dropObs.has(obs));
      }
      chunk.bakedLayer = null;
    }
  }

  /** Drop circle obstacles whose foliage entry was removed. */
  syncFoliageObstacles() {
    for (const chunk of this.chunks.values()) {
      const live = new Set(chunk.foliage);
      const before = chunk.obstacles.length;
      chunk.obstacles = chunk.obstacles.filter((obs) => {
        if (!obs._foliage) return true;
        return live.has(obs._foliage);
      });
      if (chunk.obstacles.length !== before) chunk.bakedLayer = null;
    }
  }

  /** Remove ground foliage + blocking props overlapping a world-space rectangle. */
  clearFoliageInRect(minX, maxX, minZ, maxZ, { markBlocked = false, predicate = null } = {}) {
    const minCX = Math.floor(minX / CHUNK_WORLD);
    const maxCX = Math.floor(maxX / CHUNK_WORLD);
    const minCZ = Math.floor(minZ / CHUNK_WORLD);
    const maxCZ = Math.floor(maxZ / CHUNK_WORLD);
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const chunk = this.chunks.get(this._chunkKey(cx, cz));
        if (!chunk || chunk.outOfBounds) continue;
        const before = chunk.foliage.length;
        const dropObs = new Set();
        chunk.foliage = chunk.foliage.filter((f) => {
          if (predicate && !predicate(f)) return true;
          const hit = foliageIntersectsRect(f, minX, maxX, minZ, maxZ);
          if (hit && f._obstacle) dropObs.add(f._obstacle);
          return !hit;
        });
        chunk.obstacles = chunk.obstacles.filter((obs) => {
          if (dropObs.has(obs)) return false;
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
    if (markBlocked) {
      const minTx = Math.floor(minX / TILE);
      const maxTx = Math.floor(maxX / TILE);
      const minTz = Math.floor(minZ / TILE);
      const maxTz = Math.floor(maxZ / TILE);
      for (let tz = minTz; tz <= maxTz; tz++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          this._foliageBlocked.add(`${tx},${tz}`);
        }
      }
    }
  }

  clearFoliageOnTile(tx, tz, markBlocked = true) {
    const minX = tx * TILE;
    const minZ = tz * TILE;
    this.clearFoliageInRect(minX, minX + TILE, minZ, minZ + TILE, { markBlocked });
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
      const spriteName = getFloorSpriteName(tile.floorKind);
      const img = sprites.images?.[spriteName];
      const hasArt = img && (img.naturalWidth > 0 || img.width > 0);
      if (hasArt) {
        sprites.stampTile(ctx, spriteName, lx * px, lz * px, px, null);
      } else {
        ctx.fillStyle = getTerrainMapColorFromTile(tile);
        ctx.fillRect(lx * px, lz * px, px, px);
      }
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

  _fillDirtPlane(ctx, sprites, tilePx, ppu, minWX, minWZ, maxWX, maxWZ) {
    const left = Math.floor(minWX * ppu);
    const top = Math.floor(minWZ * ppu);
    const right = Math.ceil(maxWX * ppu);
    const bottom = Math.ceil(maxWZ * ppu);
    const w = right - left;
    const h = bottom - top;

    const tileOriginX = Math.floor(minWX / TILE) * TILE;
    const tileOriginZ = Math.floor(minWZ / TILE) * TILE;
    const pxOriginX = Math.round(tileOriginX * ppu);
    const pxOriginZ = Math.round(tileOriginZ * ppu);

    const bmp = sprites.getTileBitmap('floor_dirt', tilePx, null);
    if (bmp) {
      if (!this._dirtPattern || this._dirtPatternPx !== tilePx) {
        this._dirtPattern = ctx.createPattern(bmp, 'repeat');
        this._dirtPatternPx = tilePx;
      }
      if (this._dirtPattern) {
        ctx.save();
        ctx.translate(pxOriginX, pxOriginZ);
        ctx.fillStyle = this._dirtPattern;
        ctx.fillRect(left - pxOriginX, top - pxOriginZ, w, h);
        ctx.restore();
        return;
      }
    }
    ctx.fillStyle = getTerrainMapColorFromTile({ floorKind: FLOOR_KIND });
    ctx.fillRect(left, top, w, h);
  }

  drawGroundLayer(ctx, camTx, camTy, viewHalfW, viewHalfH, ppu, sprites, camX, camZ) {
    const tilePx = TILE * ppu;
    const minWX = camX - viewHalfW;
    const maxWX = camX + viewHalfW;
    const minWZ = camZ - viewHalfH;
    const maxWZ = camZ + viewHalfH;
    const minTX = Math.floor(minWX / TILE);
    const maxTX = Math.ceil(maxWX / TILE);
    const minTZ = Math.floor(minWZ / TILE);
    const maxTZ = Math.ceil(maxWZ / TILE);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(camTx, camTy);

    const left = Math.floor(minWX * ppu);
    const top = Math.floor(minWZ * ppu);
    const right = Math.ceil(maxWX * ppu);
    const bottom = Math.ceil(maxWZ * ppu);

    if (this._fullyPrewarmed) {
      ctx.fillStyle = getTerrainMapColorFromTile({ floorKind: FLOOR_KIND });
      ctx.fillRect(left, top, right - left, bottom - top);
    } else {
      this._fillDirtPlane(ctx, sprites, tilePx, ppu, minWX, minWZ, maxWX, maxWZ);
    }

    const drawOpts = { loadMissing: this._fullyPrewarmed, touchLru: false };
    this.forEachChunkInRect(minTX, maxTX, minTZ, maxTZ, (chunk) => {
      if (
        chunk.bakedLayer
        && chunk.bakedTilePx === tilePx
        && chunk.bakeVersion === BAKE_VERSION
      ) {
        const originPxX = Math.round(chunk.cx * CHUNK_WORLD * ppu);
        const originPxZ = Math.round(chunk.cz * CHUNK_WORLD * ppu);
        ctx.drawImage(chunk.bakedLayer, originPxX, originPxZ);
        return;
      }

      const half = tilePx * 0.5;
      for (const tile of chunk.tiles) {
        if (tile.floorKind === FLOOR_KIND) continue;
        const px = Math.round(tile.tx * TILE * ppu);
        const pz = Math.round(tile.tz * TILE * ppu);
        sprites.stampTile(ctx, getFloorSpriteName(tile.floorKind), px, pz, tilePx);
      }
      if (!chunk.foliage?.length) return;
      for (const f of chunk.foliage) {
        if (isYsortFoliage(f.kind)) continue;
        if (f.x < minWX - TILE || f.x > maxWX + TILE || f.z < minWZ - TILE || f.z > maxWZ + TILE) continue;
        const fTint = isTintedFoliage(f.kind) && f.tintKey ? unpackTintGradient(f.tintKey) : null;
        const fx = Math.round(f.x * ppu - half);
        const fz = Math.round(f.z * ppu - half);
        sprites.stampTile(ctx, f.sprite, fx, fz, tilePx, fTint);
      }
    }, drawOpts);

    ctx.restore();
  }

  forEachChunkInRect(minTX, maxTX, minTZ, maxTZ, fn, { loadMissing = true, touchLru = true } = {}) {
    const minCX = Math.floor(minTX / CHUNK_TILES);
    const maxCX = Math.floor(maxTX / CHUNK_TILES);
    const minCZ = Math.floor(minTZ / CHUNK_TILES);
    const maxCZ = Math.floor(maxTZ / CHUNK_TILES);
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = this._chunkKey(cx, cz);
        let chunk = this.chunks.get(key);
        if (!chunk) {
          if (!loadMissing) continue;
          chunk = this.getChunk(cx, cz);
        } else if (touchLru) {
          this._bumpChunk(key);
        }
        if (chunk.outOfBounds) continue;
        fn(chunk);
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
        if (isTreeFoliage(f.kind) && this._spriteBank) {
          this._spriteBank.ensureSprite(f.sprite);
        }
        if (foliageIntersectsRect(f, minX, maxX, minZ, maxZ)) out.push(f);
      }
    }, { loadMissing: false });
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

  _tooCloseToTownAnchor(x, z) {
    const tx = Math.floor(x / TILE);
    const tz = Math.floor(z / TILE);
    const anchors = getNearbyTownAnchors(tx, tz, 3);
    const pad = PLAYER_SPAWN_TOWN_CLEARANCE_TILES * TILE;
    for (const anchor of anchors) {
      const ax = anchor.tx * TILE + TILE * 0.5;
      const az = anchor.tz * TILE + TILE * 0.5;
      const extent = (townHalf(anchor) * 2 + 24) * TILE + pad;
      const dx = Math.abs(x - ax);
      const dz = Math.abs(z - az);
      if (dx < extent && dz < extent) return true;
    }
    return false;
  }

  _isValidPlayerSpawn(x, z) {
    if (this.checkCollision(x, z, PLAYER_RADIUS)) return false;
    if (this._tooCloseToTownAnchor(x, z)) return false;
    const tx = Math.floor(x / TILE);
    const tz = Math.floor(z / TILE);
    if (isHighwayTile(tx, tz)) return false;
    const tile = this.getTile(tx, tz);
    if (tile?.floorKind === 'road' || tile?.floorKind === 'path') return false;
    return true;
  }

  /** Nudge spawn point out of walls/buildings after nearby chunks finish generating. */
  ensureClearSpawnPosition(x, z, radius = PLAYER_RADIUS) {
    if (!this.checkCollision(x, z, radius) && this._isValidPlayerSpawn(x, z)) {
      return { x, z };
    }
    for (let ring = 1; ring <= 24; ring++) {
      const dist = ring * (TILE * 0.75);
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const nx = x + Math.sin(angle) * dist;
        const nz = z + Math.cos(angle) * dist;
        if (!this.checkCollision(nx, nz, radius) && this._isValidPlayerSpawn(nx, nz)) {
          return { x: nx, z: nz };
        }
      }
    }
    return { x, z };
  }

  _pickPlayerSpawn() {
    const minDist = BASE_RADIUS + 48;
    for (let i = 0; i < 140; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * 120;
      const x = Math.sin(angle) * dist;
      const z = Math.cos(angle) * dist;
      if (this._isValidPlayerSpawn(x, z)) return { x, z };
    }
    for (let i = 0; i < 80; i++) {
      const angle = (i / 80) * Math.PI * 2;
      const dist = minDist + 40 + (i % 12) * 18;
      const x = Math.sin(angle) * dist;
      const z = Math.cos(angle) * dist;
      if (this._isValidPlayerSpawn(x, z)) return { x, z };
    }
    return { x: minDist + 80, z: 0 };
  }

  getPlayerSpawn() {
    if (this._cachedPlayerSpawn) return this._cachedPlayerSpawn;
    this._cachedPlayerSpawn = this._pickPlayerSpawn();
    return this._cachedPlayerSpawn;
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
    if (!shape || shape.kind === 'circle') {
      return (shape?.radius ?? 0) + Math.abs(shape?.zOff ?? 0) + 2;
    }
    return Math.hypot(shape.halfW, shape.halfH) + Math.abs(shape.zOff ?? 0) + 2;
  }

  _shapeCenter(px, pz, shape) {
    return { x: px, z: pz + (shape?.zOff ?? 0) };
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
      const center = this._shapeCenter(px, pz, shape);
      return this._checkObstacleCollision(
        center.x, center.z, shape?.radius ?? 0, obstacles, false, soft, null, null, forNav, buildings, shape,
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
      const buildings = opts.buildings ?? null;
      const radius = shape?.radius ?? 0;
      const zOff = shape?.zOff ?? 0;
      let x = newX;
      let z = newZ;
      const obstacles = this.collectObstaclesNear(x, z, this._shapeReach(shape));

      for (let i = 0; i < 4; i++) {
        const center = this._shapeCenter(x, z, shape);
        for (const obs of obstacles) {
          if (this._ignoreObstacleInDoorway(obs, x, z, shape, buildings)) continue;
          if (obs.kind === 'circle' && this._circleHit(center.x, center.z, radius, obs.x, obs.z, obs.radius)) {
            const p = this._pushOutCircle(center.x, center.z, radius, obs);
            x = p.x;
            z = p.z - zOff;
          } else if (obs.kind === 'aabb' && this._aabbHardEnabled(obs)
            && this._circleAabbHit(center.x, center.z, radius, obs)) {
            const p = this._pushCircleFromAabb(center.x, center.z, radius, obs);
            x = p.x;
            z = p.z - zOff;
          }
        }
      }

      if (!this._checkShapeCollision(x, z, shape, obstacles, false, false, buildings)) return this._clampPos(x, z);
      if (!this._checkShapeCollision(newX, oldZ, shape, obstacles, false, false, buildings)) return this._clampPos(newX, oldZ);
      if (!this._checkShapeCollision(oldX, newZ, shape, obstacles, false, false, buildings)) return this._clampPos(oldX, newZ);
      return this._clampPos(oldX, oldZ);
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

    if (!this._checkShapeCollision(x, z, shape, obstacles, false, false, buildings)) return this._clampPos(x, z);
    if (!this._checkShapeCollision(newX, oldZ, shape, obstacles, false, false, buildings)) return this._clampPos(newX, oldZ);
    if (!this._checkShapeCollision(oldX, newZ, shape, obstacles, false, false, buildings)) return this._clampPos(oldX, newZ);
    return this._clampPos(oldX, oldZ);
  }

  _clampPos(x, z) {
    return clampWorldPosition(x, z);
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

    if (!this._checkObstacleCollision(x, z, radius, obstacles)) return this._clampPos(x, z);
    if (!this._checkObstacleCollision(newX, oldZ, radius, obstacles)) return this._clampPos(newX, oldZ);
    if (!this._checkObstacleCollision(oldX, newZ, radius, obstacles)) return this._clampPos(oldX, newZ);
    return this._clampPos(oldX, oldZ);
  }

  /** Push an entity out of overlapping world obstacles (barrels, tables, …). */
  depenetrateShape(x, z, shape, maxIter = 8) {
    if (!shape || shape.kind === 'circle') {
      let px = x;
      let pz = z;
      const pr = shape?.radius ?? 0;
      const zOff = shape?.zOff ?? 0;
      for (let n = 0; n < maxIter; n++) {
        if (!this.checkCollisionShape(px, pz, shape, false)) return { x: px, z: pz };
        const obstacles = this.collectObstaclesNear(px, pz, this._shapeReach(shape));
        let pushed = false;
        const center = this._shapeCenter(px, pz, shape);
        for (const obs of obstacles) {
          if (obs.kind === 'circle' && this._circleHit(center.x, center.z, pr, obs.x, obs.z, obs.radius)) {
            const p = this._pushOutCircle(center.x, center.z, pr, obs);
            px = p.x;
            pz = p.z - zOff;
            pushed = true;
          } else if (obs.kind === 'aabb' && this._aabbHardEnabled(obs)
            && this._circleAabbHit(center.x, center.z, pr, obs)) {
            const p = this._pushCircleFromAabb(center.x, center.z, pr, obs);
            px = p.x;
            pz = p.z - zOff;
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
