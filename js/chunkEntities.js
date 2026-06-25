import { Robot, Scout, createGroundErupt, SCOUT_SPAWN_SHARE } from './enemies.js';
import { CHUNK_WORLD, hash01, isInBase } from './worldGen.js';
import { BUILDING_CHUNK_SPAWN_RATE, MAX_NEARBY_BUILDINGS } from './buildings.js';

/** Chunks around the player that stay populated with spiders/chests. */
export const ENTITY_CHUNK_RADIUS = 4;
/** World units — entities farther than this are removed. */
export const ENTITY_DESPAWN_DIST = ENTITY_CHUNK_RADIUS * CHUNK_WORLD + 40;

/** Soft caps within despawn range — keeps the world from flooding. */
export const MAX_NEARBY_SPIDERS = 18;
export const MAX_NEARBY_CHESTS = 10;
/** Per-chunk spawn chance when a chunk is first populated. */
export const SPIDER_CHUNK_CHANCE = 0.28;
export const BUILDING_CHUNK_CHANCE = BUILDING_CHUNK_SPAWN_RATE;

export class ChunkEntityManager {
  constructor(world, game) {
    this.world = world;
    this.game = game;
  }

  reset() {}

  update(player) {
    if (this.game.lan?.isClient) return;
    this._despawnFar(player);
    this._populateNearby(player);
  }

  _playerChunk(player) {
    return {
      cx: Math.floor(player.x / CHUNK_WORLD),
      cz: Math.floor(player.z / CHUNK_WORLD),
    };
  }

  _chunkCenter(cx, cz) {
    return {
      x: cx * CHUNK_WORLD + CHUNK_WORLD * 0.5,
      z: cz * CHUNK_WORLD + CHUNK_WORLD * 0.5,
    };
  }

  _chunkBounds(chunk) {
    return {
      minX: chunk.cx * CHUNK_WORLD,
      maxX: chunk.cx * CHUNK_WORLD + CHUNK_WORLD,
      minZ: chunk.cz * CHUNK_WORLD,
      maxZ: chunk.cz * CHUNK_WORLD + CHUNK_WORLD,
    };
  }

  _nearbyDist2(player, x, z) {
    const dx = x - player.x;
    const dz = z - player.z;
    return dx * dx + dz * dz;
  }

  _despawnDist2() {
    return ENTITY_DESPAWN_DIST * ENTITY_DESPAWN_DIST;
  }

  _livingRobots() {
    return this.game.robots.filter((r) => r.alive || r.emerging);
  }

  _countNearbySpiders(player) {
    const d2 = this._despawnDist2();
    return this._livingRobots().filter((r) => this._nearbyDist2(player, r.x, r.z) <= d2).length;
  }

  _countNearbyChests(player) {
    const d2 = this._despawnDist2();
    return this.game.chests.chests.filter(
      (c) => this._nearbyDist2(player, c.x, c.z) <= d2,
    ).length;
  }

  _getPlayerForward(player) {
    if (player.isMoving) {
      const len = Math.hypot(player.moveDirX, player.moveDirZ);
      if (len > 0.05) {
        return { fx: player.moveDirX / len, fz: player.moveDirZ / len };
      }
    }
    return { fx: Math.sin(player.angle), fz: Math.cos(player.angle) };
  }

  _shouldPopulateChunk(chunk, player, fx, fz) {
    if (!player.isMoving) return true;
    const center = this._chunkCenter(chunk.cx, chunk.cz);
    const dx = center.x - player.x;
    const dz = center.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < CHUNK_WORLD * 0.45) return true;
    return (dx / dist) * fx + (dz / dist) * fz > -0.25;
  }

  _isAheadOfPlayer(player, x, z, fx, fz, minAhead = 3) {
    return (x - player.x) * fx + (z - player.z) * fz >= minAhead;
  }

  _offScreenForSpawn(x, z) {
    if (typeof this.game.isWorldPointOnScreen !== 'function') return true;
    return !this.game.isWorldPointOnScreen(x, z, 10);
  }

  _despawnFar(player) {
    const d2 = this._despawnDist2();
    const clearedSpiderChunks = new Set();
    const clearedChestChunks = new Set();
    const clearedBuildingChunks = new Set();

    this.game.robots = this.game.robots.filter((r) => {
      if (!r.alive && !r.emerging) return false;
      if (this._nearbyDist2(player, r.x, r.z) <= d2) return true;
      if (r.homeCx !== undefined && r.homeCz !== undefined) {
        clearedSpiderChunks.add(`${r.homeCx},${r.homeCz}`);
      }
      return false;
    });

    // Avoid mutating this.game.chests.chests inside Array.filter (can desync visual vs collision).
    const nextChests = [];
    for (const chest of this.game.chests.chests) {
      if (this._nearbyDist2(player, chest.x, chest.z) <= d2) {
        nextChests.push(chest);
        continue;
      }
      if (chest.homeCx !== undefined && chest.homeCz !== undefined) {
        clearedChestChunks.add(`${chest.homeCx},${chest.homeCz}`);
      }
      // Unregister obstacle, but don't splice while iterating.
      this.game.chests._unregisterObstacle(chest);
    }
    this.game.chests.chests = nextChests;

    const nextBuildings = [];
    for (const building of this.game.buildings.buildings) {
      const cx = building.originX + building.footprintW * 0.5;
      const cz = building.originZ + building.footprintH * 0.5;
      if (this._nearbyDist2(player, cx, cz) <= d2) {
        nextBuildings.push(building);
        continue;
      }
      if (building.homeCx !== undefined && building.homeCz !== undefined) {
        clearedBuildingChunks.add(`${building.homeCx},${building.homeCz}`);
      }
      if (building.chests?.length) {
        for (const chest of building.chests) this.game.chests.remove(chest);
      } else if (building.chest) {
        this.game.chests.remove(building.chest);
      }
      this.game.buildings._unregisterObstacles(building);
    }
    this.game.buildings.buildings = nextBuildings;

    for (const key of clearedSpiderChunks) {
      const chunk = this.world.chunks.get(key);
      if (!chunk) continue;
      const hasLocal = this.game.robots.some(
        (r) => r.homeCx === chunk.cx && r.homeCz === chunk.cz && (r.alive || r.emerging),
      );
      if (!hasLocal) chunk.spidersSpawned = false;
    }

    for (const key of clearedChestChunks) {
      const chunk = this.world.chunks.get(key);
      if (!chunk) continue;
      const hasLocal = this.game.chests.chests.some(
        (c) => c.homeCx === chunk.cx && c.homeCz === chunk.cz,
      );
      if (!hasLocal) chunk.chestsSpawned = false;
    }

    for (const key of clearedBuildingChunks) {
      const chunk = this.world.chunks.get(key);
      if (!chunk) continue;
      const hasLocal = this.game.buildings.buildings.some(
        (b) => b.homeCx === chunk.cx && b.homeCz === chunk.cz,
      );
      if (!hasLocal) chunk.buildingsSpawned = false;
    }
  }

  _countNearbyBuildings(player) {
    const d2 = this._despawnDist2();
    return this.game.buildings.buildings.filter((b) => {
      const cx = b.originX + b.footprintW * 0.5;
      const cz = b.originZ + b.footprintH * 0.5;
      return this._nearbyDist2(player, cx, cz) <= d2;
    }).length;
  }

  _populateNearby(player) {
    const { fx, fz } = this._getPlayerForward(player);
    const { cx: pcx, cz: pcz } = this._playerChunk(player);
    const chunks = [];
    for (let cz = pcz - ENTITY_CHUNK_RADIUS; cz <= pcz + ENTITY_CHUNK_RADIUS; cz++) {
      for (let cx = pcx - ENTITY_CHUNK_RADIUS; cx <= pcx + ENTITY_CHUNK_RADIUS; cx++) {
        const chunk = this.world.getChunk(cx, cz);
        if (!this._shouldPopulateChunk(chunk, player, fx, fz)) continue;
        const center = this._chunkCenter(cx, cz);
        const ahead = (center.x - player.x) * fx + (center.z - player.z) * fz;
        chunks.push({ chunk, ahead });
      }
    }
    chunks.sort((a, b) => b.ahead - a.ahead);

    for (const { chunk } of chunks) {
      if (!chunk.spidersSpawned) this._spawnChunkSpiders(chunk, player, fx, fz);
      if (!chunk.buildingsSpawned) this._spawnChunkBuildings(chunk, player, fx, fz);
    }
  }

  _spawnChunkBuildings(chunk, player, fx, fz) {
    this.game.buildings.spawnInChunk(
      chunk,
      this.world,
      player,
      () => this._countNearbyBuildings(player) < MAX_NEARBY_BUILDINGS,
      {
        fx,
        fz,
        isOffScreen: (x, z) => this._offScreenForSpawn(x, z),
      },
    );
  }

  _spawnChunkSpiders(chunk, player, fx, fz) {
    const center = this._chunkCenter(chunk.cx, chunk.cz);
    if (isInBase(center.x, center.z)) {
      chunk.spidersSpawned = true;
      return;
    }

    const roll = hash01(chunk.cx * 7 + 13, chunk.cz * 11 + 29);
    if (roll >= SPIDER_CHUNK_CHANCE) {
      chunk.spidersSpawned = true;
      return;
    }

    if (this._countNearbySpiders(player) >= MAX_NEARBY_SPIDERS) return;

    const typeRoll = hash01(chunk.cx * 31 + 47, chunk.cz * 41 + 53);
    const useScout = typeRoll < SCOUT_SPAWN_SHARE;
    const spawnR = useScout ? 1.0 : 0.85;

    const pos = this._findChunkPoint(chunk, 3, player, this._livingRobots(), fx, fz, spawnR);
    if (!pos) return;

    const robot = useScout
      ? Scout.createEmerging(pos.x, pos.z, 1, this.world)
      : Robot.createEmerging(pos.x, pos.z, 1, this.world, 'spider');
    robot.homeCx = chunk.cx;
    robot.homeCz = chunk.cz;
    this.game.robots.push(robot);
    this.game.particles.push(...createGroundErupt(pos.x, pos.z));
    chunk.spidersSpawned = true;
  }

  _chunkEdgePoints(chunk) {
    const b = this._chunkBounds(chunk);
    const pad = 2.5;
    const midX = (b.minX + b.maxX) * 0.5;
    const midZ = (b.minZ + b.maxZ) * 0.5;
    return [
      [b.minX + pad, b.minZ + pad],
      [b.maxX - pad, b.minZ + pad],
      [b.minX + pad, b.maxZ - pad],
      [b.maxX - pad, b.maxZ - pad],
      [midX, b.minZ + pad],
      [midX, b.maxZ - pad],
      [b.minX + pad, midZ],
      [b.maxX - pad, midZ],
    ];
  }

  _findChunkPoint(chunk, salt, player, existing, fx, fz, spawnR = 0.85) {
    const minX = chunk.cx * CHUNK_WORLD + 1.2;
    const minZ = chunk.cz * CHUNK_WORLD + 1.2;
    const span = CHUNK_WORLD - 2.4;
    const edges = this._chunkEdgePoints(chunk);
    const tries = edges.map(([x, z]) => [x, z]);
    for (let i = 0; i < 32; i++) {
      const h1 = hash01(chunk.cx * 13 + salt + i * 5, chunk.cz * 17 + i * 3);
      const h2 = hash01(chunk.cx * 23 + i * 7, chunk.cz * 31 + salt + i * 11);
      tries.push([minX + h1 * span, minZ + h2 * span]);
    }

    tries.sort((a, b) => {
      const aheadA = (a[0] - player.x) * fx + (a[1] - player.z) * fz;
      const aheadB = (b[0] - player.x) * fx + (b[1] - player.z) * fz;
      return aheadB - aheadA;
    });

    const tryPoint = (requireAhead) => {
      for (const [x, z] of tries) {
        if (isInBase(x, z)) continue;
        if (!this._offScreenForSpawn(x, z)) continue;
        if (requireAhead && !this._isAheadOfPlayer(player, x, z, fx, fz)) continue;
        if (Robot._isValidSpawn(
          this.world,
          x,
          z,
          spawnR,
          existing,
          player,
          2.5,
        )) {
          return { x, z };
        }
      }
      return null;
    };

    return tryPoint(true) || tryPoint(false);
  }
}
