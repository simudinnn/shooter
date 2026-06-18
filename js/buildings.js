import {
  TILE,
  CHUNK_WORLD,
  isInBase,
  snapWorldPoint,
} from './worldGen.js';
import {
  SHACK_MAX_W,
  SHACK_MAX_H,
  BUILDING_ART_PX,
  CELL_DOOR,
  CELL_FLOOR,
  rollShackSize,
  generateShackCells,
  buildShackPieces,
  isInsideBuilding,
  roofRaiseWorld,
  wallDrawsInFront,
  wallFrontDrawZ,
  doorLintelSortZ,
} from './buildingGen.js';

export { SHACK_SPRITE_MANIFEST, BUILDING_ART_PX } from './buildingGen.js';

export const BUILDING_CHUNK_SPAWN_RATE = 0.42;
export const MAX_NEARBY_BUILDINGS = 5;

const ROOF_FADE_SPEED = 4.5;
const ROOF_ALPHA_INSIDE = 0.06;
const ROOF_ALPHA_OUTSIDE = 1;

function hasSprite(sprites, name) {
  const img = sprites?.images?.[name];
  return !!(img && (img.naturalWidth > 0 || img.width > 0));
}

function drawShackTile(sprites, ctx, name, x, y, tilePx) {
  const img = sprites?.images?.[name];
  if (!img) return false;
  const px = Math.round(tilePx);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(x), Math.round(y), px, px);
  return true;
}

function firstSprite(sprites, names) {
  for (const name of names) {
    if (hasSprite(sprites, name)) return name;
  }
  return null;
}

function drawBuildingArt(sprites, ctx, name, feetX, feetY, tilePx, artW = BUILDING_ART_PX, artH = BUILDING_ART_PX) {
  const img = sprites?.images?.[name];
  if (!img) return false;
  const drawW = Math.max(2, Math.round((artW / BUILDING_ART_PX) * tilePx));
  const drawH = Math.round((artH / BUILDING_ART_PX) * tilePx);
  const segH = Math.round(tilePx);
  const x = Math.round(feetX - drawW * 0.5);
  const y = Math.round(feetY - drawH + tilePx * 0.08);
  ctx.imageSmoothingEnabled = false;
  const segments = Math.max(1, Math.round(artH / BUILDING_ART_PX));
  if (segments > 1) {
    for (let i = 0; i < segments; i++) {
      const segY = y + (segments - 1 - i) * segH;
      ctx.drawImage(img, 0, 0, img.width, img.height, x, segY, drawW, segH);
    }
  } else {
    ctx.drawImage(img, x, y, drawW, drawH);
  }
  return true;
}

function shackTileTopLeft(originX, originZ, tx, tz, worldToScreen) {
  const corner = worldToScreen(originX + tx * TILE, originZ + tz * TILE);
  const next = worldToScreen(originX + (tx + 1) * TILE, originZ + (tz + 1) * TILE);
  return {
    x: Math.round(Math.min(corner.x, next.x)),
    y: Math.round(Math.min(corner.y, next.y)),
  };
}

function drawSnappedWallSprite(sprites, ctx, name, x, y, w, h) {
  const img = sprites?.images?.[name];
  if (!img) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  return true;
}
function drawPlaceholderFloor(ctx, x, y, w, h) {
  ctx.fillStyle = '#5a5048';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(70, 62, 56, 0.45)';
  ctx.fillRect(x + 1, y + 1, Math.max(1, w - 2), 1);
}

function drawPlaceholderWall(ctx, wall, tileX, tileY, tilePx) {
  const segH = Math.round(tilePx);
  const segments = wall.extendNorth ? 2 : 1;
  const h = segH * segments;
  let w;
  let x;
  if (wall.orient === 'ew') {
    w = Math.max(2, Math.round(tilePx / 4));
    x = wall.face === 'west' ? tileX : tileX + tilePx - w;
  } else {
    w = segH;
    x = tileX;
  }
  const y = tileY + tilePx - h;
  const face = wall.orient === 'ew' ? '#5a4e42' : '#6a5a4a';
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = face;
  ctx.fillRect(x + 1, y + 1, Math.max(2, w - 2), h - 2);
  ctx.strokeStyle = '#2a2218';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (wall.orient !== 'corner') {
    ctx.fillStyle = '#3a3028';
    ctx.fillRect(x + 2, y + h - 3, Math.max(1, w - 4), 2);
  }
}

export function drawBuildingFloors(ctx, building, worldToScreen, tilePx, sprites = null) {
  const { originX, originZ, w, h } = building;
  let drewArt = false;

  if (sprites) {
    for (let tz = 1; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        const tileName = (tx + tz) % 5 === 0 && hasSprite(sprites, 'shack_floor_wood_alt')
          ? 'shack_floor_wood_alt'
          : 'shack_floor_wood';
        if (!hasSprite(sprites, tileName)) continue;
        const corner = worldToScreen(originX + tx * TILE, originZ + tz * TILE);
        const next = worldToScreen(originX + (tx + 1) * TILE, originZ + (tz + 1) * TILE);
        const x = Math.round(Math.min(corner.x, next.x));
        const y = Math.round(Math.min(corner.y, next.y));
        drawShackTile(sprites, ctx, tileName, x, y, tilePx);
        drewArt = true;
      }
    }
  }

  if (!drewArt) {
    const s0 = worldToScreen(originX, originZ + TILE);
    const s1 = worldToScreen(originX + building.footprintW, originZ + building.footprintH);
    const x = Math.round(Math.min(s0.x, s1.x));
    const y = Math.round(Math.min(s0.y, s1.y));
    const fw = Math.round(Math.abs(s1.x - s0.x));
    const fh = Math.round(Math.abs(s1.y - s0.y));
    drawPlaceholderFloor(ctx, x, y, fw, fh);
  }

  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorS = worldToScreen(
    originX + (doorTx + 0.5) * TILE,
    originZ + h * TILE,
  );
  const matW = tilePx;
  const matH = Math.round(tilePx * 0.45);
  if (!sprites || !drawBuildingArt(sprites, ctx, 'shack_door_mat', doorS.x, doorS.y, tilePx, 16, 16)) {
    ctx.fillStyle = '#4a3828';
    ctx.fillRect(
      Math.round(doorS.x - matW * 0.5),
      Math.round(doorS.y - matH + tilePx * 0.08),
      matW,
      matH,
    );
  }
}

export function drawBuildingRoof(ctx, building, worldToScreen, tilePx, alpha, sprites = null) {
  if (alpha <= 0.01) return;
  const { roof, w, h } = building;
  ctx.save();
  ctx.globalAlpha = alpha;

  const raiseZ = roofRaiseWorld();
  const s0 = worldToScreen(roof.originX, roof.originZ - raiseZ);
  const s1 = worldToScreen(roof.originX + roof.w, roof.originZ + roof.h - raiseZ);
  const baseX = Math.round(Math.min(s0.x, s1.x));
  const baseY = Math.round(Math.min(s0.y, s1.y));
  const edgeRows = Math.floor(h / 2);
  const hasEdge = sprites && hasSprite(sprites, 'shack_roof_edge');
  const hasFill = sprites && hasSprite(sprites, 'shack_roof_fill');

  if (hasFill || hasEdge) {
    for (let tz = 0; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        const drawX = baseX + tx * tilePx;
        const drawY = baseY + tz * tilePx;
        if (tz < edgeRows && hasEdge) {
          drawShackTile(sprites, ctx, 'shack_roof_edge', drawX, drawY, tilePx);
        } else if (hasFill) {
          drawShackTile(sprites, ctx, 'shack_roof_fill', drawX, drawY, tilePx);
        } else if (hasEdge) {
          drawShackTile(sprites, ctx, 'shack_roof_edge', drawX, drawY, tilePx);
        }
      }
    }
  } else {
    const rw = Math.round(Math.abs(s1.x - s0.x));
    const rh = Math.round(Math.abs(s1.y - s0.y));
    ctx.fillStyle = '#6a3828';
    ctx.fillRect(baseX, baseY, rw, rh);
    ctx.fillStyle = '#8a4830';
    ctx.fillRect(baseX + 2, baseY + 2, Math.max(1, rw - 4), Math.max(1, rh * 0.35));
    ctx.strokeStyle = '#3a2018';
    ctx.lineWidth = 1;
    ctx.strokeRect(baseX + 0.5, baseY + 0.5, rw - 1, rh - 1);
  }
  ctx.restore();
}

export function drawBuildingDoorLintel(ctx, building, worldToScreen, tilePx, sprites = null) {
  const { originX, originZ, h, doorTx } = building;
  const feetX = originX + (doorTx + 0.5) * TILE;
  const feetZ = originZ + h * TILE;
  const s = worldToScreen(feetX, feetZ);
  if (sprites && drawBuildingArt(sprites, ctx, 'shack_wall_door_top', s.x, s.y, tilePx, 16, 8)) return;
  const w = Math.round(tilePx);
  const lintelH = Math.round(tilePx * 0.28);
  const x = Math.round(s.x - w * 0.5);
  const y = Math.round(s.y - lintelH - tilePx * 0.32);
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(x, y, w, lintelH);
  ctx.fillStyle = '#6a5a4a';
  ctx.fillRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, lintelH - 2));
}

export function drawBuildingWall(ctx, wall, building, worldToScreen, tilePx, sprites = null) {
  const { originX, originZ } = building;
  const { tx, tz, orient } = wall;
  const { x: tileX, y: tileY } = shackTileTopLeft(originX, originZ, tx, tz, worldToScreen);
  const segH = Math.round(tilePx);
  const ewDrawW = Math.max(2, Math.round(tilePx / 4));

  if (sprites) {
    const candidates = orient === 'ew'
      ? ['shack_wall_ew', 'shack_wall_ns']
      : orient === 'corner'
        ? ['shack_wall_corner', 'shack_wall_ns']
        : ['shack_wall_ns'];
    const sprite = firstSprite(sprites, candidates);
    if (sprite) {
      if (orient === 'ew') {
        const drawX = wall.face === 'west' ? tileX : tileX + tilePx - ewDrawW;
        const segments = wall.extendNorth ? 2 : 1;
        const drawH = segH * segments;
        const drawY = tileY + tilePx - drawH;
        if (sprite === 'shack_wall_ns') {
          drawSnappedWallSprite(sprites, ctx, sprite, drawX, drawY, ewDrawW, drawH);
        } else {
          for (let i = 0; i < segments; i++) {
            const segY = drawY + (segments - 1 - i) * segH;
            drawSnappedWallSprite(sprites, ctx, sprite, drawX, segY, ewDrawW, segH);
          }
        }
      } else {
        drawShackTile(sprites, ctx, sprite, tileX, tileY, tilePx);
      }
      return;
    }
  }
  drawPlaceholderWall(ctx, wall, tileX, tileY, tilePx);
}

export class BuildingManager {
  constructor(world, chests = null) {
    this.world = world;
    this.chests = chests;
    this.buildings = [];
    this.roofAlpha = ROOF_ALPHA_OUTSIDE;
    this.insideBuilding = null;
    /** Keeps fading the last shack roof after exit until alpha reaches outside. */
    this.roofFadeBuilding = null;
  }

  update(player, dt) {
    const inside = this.getBuildingAt(player.x, player.z);
    if (inside) this.roofFadeBuilding = inside;
    else if (this.roofFadeBuilding && Math.abs(this.roofAlpha - ROOF_ALPHA_OUTSIDE) < 0.02) {
      this.roofFadeBuilding = null;
    }
    this.insideBuilding = inside;
    const target = inside ? ROOF_ALPHA_INSIDE : ROOF_ALPHA_OUTSIDE;
    const fade = 1 - Math.exp(-ROOF_FADE_SPEED * dt);
    this.roofAlpha += (target - this.roofAlpha) * fade;
  }

  /** Roof draw alpha — lerps while entering or leaving a building. */
  roofAlphaFor(building) {
    if (building === this.insideBuilding || building === this.roofFadeBuilding) {
      return this.roofAlpha;
    }
    return ROOF_ALPHA_OUTSIDE;
  }

  getBuildingAt(px, pz) {
    for (const b of this.buildings) {
      if (isInsideBuilding(b, px, pz)) return b;
    }
    return null;
  }

  collectInView(minX, maxX, minZ, maxZ) {
    return this.buildings.filter((b) => {
      const maxBx = b.originX + b.footprintW;
      const maxBz = b.originZ + b.footprintH;
      return b.originX <= maxX && maxBx >= minX && b.originZ <= maxZ && maxBz >= minZ;
    });
  }

  spawnInChunk(chunk, world, player, canSpawn = null, spawnBias = null) {
    const centerX = chunk.cx * CHUNK_WORLD + CHUNK_WORLD * 0.5;
    const centerZ = chunk.cz * CHUNK_WORLD + CHUNK_WORLD * 0.5;
    if (isInBase(centerX, centerZ)) {
      chunk.buildingsSpawned = true;
      return;
    }

    if (Math.random() >= BUILDING_CHUNK_SPAWN_RATE) {
      chunk.buildingsSpawned = true;
      return;
    }

    if (canSpawn && !canSpawn()) return;

    const layout = this._findChunkOrigin(chunk, world, player, spawnBias);
    if (!layout) return;

    chunk.buildingsSpawned = true;
    const { w, h, cells } = generateShackCells(layout.w, layout.h);
    const building = buildShackPieces(layout.x, layout.z, w, h, cells);
    building.homeCx = chunk.cx;
    building.homeCz = chunk.cz;
    building.obstacleDefs = building.obstacles;
    building.obstacles = [];
    this._registerObstacles(building);
    this._clearFoliageForBuilding(world, building);
    this.buildings.push(building);
    this.chests?.spawnInBuilding(building, chunk);
  }

  _clearFoliageForBuilding(world, building) {
    world.clearFoliageInRect(
      building.originX,
      building.originX + building.footprintW,
      building.originZ,
      building.originZ + building.footprintH,
    );
  }

  remove(building) {
    if (building.chest) this.chests?.remove(building.chest);
    this._unregisterObstacles(building);
    const i = this.buildings.indexOf(building);
    if (i >= 0) this.buildings.splice(i, 1);
  }

  _registerObstacles(building) {
    for (const obs of building.obstacleDefs ?? []) {
      const entry = { ...obs, building };
      building.obstacles.push(entry);
      this.world.addDynamicObstacle(entry);
    }
  }

  _unregisterObstacles(building) {
    for (const obs of building.obstacles ?? []) {
      this.world.removeDynamicObstacle(obs);
    }
    building.obstacles = [];
  }

  _fitsAt(world, originX, originZ, w, h, cells) {
    const footprintW = w * TILE;
    const footprintH = h * TILE;
    if (isInBase(originX + footprintW * 0.5, originZ + footprintH * 0.5)) return false;

    for (const other of this.buildings) {
      if (
        originX < other.originX + other.footprintW
        && originX + footprintW > other.originX
        && originZ < other.originZ + other.footprintH
        && originZ + footprintH > other.originZ
      ) return false;
    }

    for (let tz = 0; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        const cx = originX + (tx + 0.5) * TILE;
        const cz = originZ + (tz + 0.5) * TILE;
        if (world.checkCollision(cx, cz, 0.45)) return false;
      }
    }
    return true;
  }

  _findChunkOrigin(chunk, world, player, spawnBias = null) {
    const minX = chunk.cx * CHUNK_WORLD + TILE;
    const minZ = chunk.cz * CHUNK_WORLD + TILE;
    const spanX = CHUNK_WORLD - SHACK_MAX_W * TILE - TILE;
    const spanZ = CHUNK_WORLD - SHACK_MAX_H * TILE - TILE;
    const fx = spawnBias?.fx ?? 0;
    const fz = spawnBias?.fz ?? 1;

    const tries = [];
    for (let i = 0; i < 24; i++) {
      const size = rollShackSize(chunk.cx * 17 + i * 3, chunk.cz * 23 + i * 5);
      tries.push({
        size,
        x: minX + Math.random() * spanX,
        z: minZ + Math.random() * spanZ,
      });
    }

    if (spawnBias) {
      tries.sort((a, b) => {
        const aheadA = (a.x - player.x) * fx + (a.z - player.z) * fz;
        const aheadB = (b.x - player.x) * fx + (b.z - player.z) * fz;
        return aheadB - aheadA;
      });
    }

    const isValid = (ox, oz, w, h, cells, requireAhead) => {
      const cx = ox + w * TILE * 0.5;
      const cz = oz + h * TILE * 0.5;
      if (requireAhead && spawnBias) {
        if ((cx - player.x) * fx + (cz - player.z) * fz < 4) return false;
      }
      if (spawnBias?.isOffScreen && !spawnBias.isOffScreen(cx, cz)) return false;
      if (player) {
        const pdx = cx - player.x;
        const pdz = cz - player.z;
        if (pdx * pdx + pdz * pdz < 6) return false;
      }
      return this._fitsAt(world, ox, oz, w, h, cells);
    };

    for (const passAhead of [true, false]) {
      for (const t of tries) {
        const snapped = snapWorldPoint(t.x, t.z);
        const ox = Math.floor(snapped.x / TILE) * TILE;
        const oz = Math.floor(snapped.z / TILE) * TILE;
        const { w, h, cells } = generateShackCells(t.size.w, t.size.h);
        if (isValid(ox, oz, w, h, cells, passAhead)) {
          return { x: ox, z: oz, w, h };
        }
      }
    }
    return null;
  }
}
