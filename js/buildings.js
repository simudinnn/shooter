import {
  TILE,
  CHUNK_WORLD,
  isInBase,
  snapWorldPoint,
} from './worldGen.js';
import { INTERNAL_W, INTERNAL_H } from './renderConfig.js';
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
  entityFeetZ,
  buildingFoliageClearRect,
  roofRaiseWorld,
  wallDrawsInFront,
  wallFrontDrawZ,
  doorLintelSortZ,
  doorSortZ,
  doorDrawsInFront,
  doorBackDrawZ,
  doorFrontDrawZ,
  buildDoorTileEdgeObstacles,
  getDoorWorldPos,
  isNearDoor,
  wouldClosingDoorTrapPlayer,
  DOOR_INTERACT_DIST,
} from './buildingGen.js';

export { SHACK_SPRITE_MANIFEST, BUILDING_ART_PX } from './buildingGen.js';

/** Native pixel size for the open-door sheet (w×h). Right edge aligns to door tile. */
export const OPEN_DOOR_ART_W = 22;
export const OPEN_DOOR_ART_H = 16;

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

/** Open door — 22×16 art; extra width extends west (left) from the door tile. */
function drawOpenDoorSprite(sprites, ctx, name, tileX, tileY, tilePx) {
  const img = sprites?.images?.[name];
  if (!img) return false;
  const drawW = Math.round(tilePx * (OPEN_DOOR_ART_W / BUILDING_ART_PX));
  const drawH = Math.round(tilePx);
  const x = Math.round(tileX + tilePx - drawW);
  const y = Math.round(tileY);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, drawW, drawH);
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
    for (let tz = 0; tz < h; tz++) {
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
    const s0 = worldToScreen(originX, originZ);
    const s1 = worldToScreen(originX + building.footprintW, originZ + building.footprintH);
    const x = Math.round(Math.min(s0.x, s1.x));
    const y = Math.round(Math.min(s0.y, s1.y));
    const fw = Math.round(Math.abs(s1.x - s0.x));
    const fh = Math.round(Math.abs(s1.y - s0.y));
    drawPlaceholderFloor(ctx, x, y, fw, fh);
  }

  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorTz = h - 1;
  const { x: doorX, y: doorY } = shackTileTopLeft(originX, originZ, doorTx, doorTz, worldToScreen);
  if (!sprites || !drawShackTile(sprites, ctx, 'shack_door_mat', doorX, doorY, tilePx)) {
    const matW = tilePx;
    const matH = tilePx;
    ctx.fillStyle = '#4a3828';
    ctx.fillRect(doorX, doorY, matW, matH);
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
  const doorTz = h - 1;
  const { x: tileX, y: tileY } = shackTileTopLeft(originX, originZ, doorTx, doorTz, worldToScreen);
  const lintelH = Math.round(tilePx * 0.5);
  if (sprites && drawSnappedWallSprite(sprites, ctx, 'shack_wall_door_top', tileX, tileY, tilePx, lintelH)) return;
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(tileX, tileY, tilePx, lintelH);
  ctx.fillStyle = '#6a5a4a';
  ctx.fillRect(tileX + 1, tileY + 1, Math.max(1, tilePx - 2), Math.max(1, lintelH - 2));
}

/** Door panel on the south entry tile (open or closed sprite). */
export function drawBuildingDoorPanel(ctx, building, worldToScreen, tilePx, sprites = null) {
  const { originX, originZ, h, doorTx } = building;
  const doorTz = h - 1;
  const { x: tileX, y: tileY } = shackTileTopLeft(originX, originZ, doorTx, doorTz, worldToScreen);
  if (building.doorOpen) {
    if (sprites && drawOpenDoorSprite(sprites, ctx, 'shack_door_open', tileX, tileY, tilePx)) return true;
  } else if (sprites && drawShackTile(sprites, ctx, 'shack_door_closed', tileX, tileY, tilePx)) {
    return true;
  }
  if (!building.doorOpen && sprites && drawShackTile(sprites, ctx, 'shack_wall_ns', tileX, tileY, tilePx)) return false;
  drawPlaceholderWall(
    ctx,
    { orient: 'ns', face: 'south', extendNorth: false },
    tileX,
    tileY,
    tilePx,
  );
  return false;
}

export function drawBuildingDoor(ctx, building, worldToScreen, tilePx, sprites = null) {
  const hasDoorArt = drawBuildingDoorPanel(ctx, building, worldToScreen, tilePx, sprites);
  if (!hasDoorArt && !building.doorOpen) {
    drawBuildingDoorLintel(ctx, building, worldToScreen, tilePx, sprites);
  }
}

/** Darken the viewport outside the interior while the player is inside. */
export function drawExteriorDimWhenInside(ctx, building, worldToScreen, alpha = 0.58) {
  const { minX, maxX, minZ, maxZ } = building.interior;
  const tl = worldToScreen(minX, minZ);
  const tr = worldToScreen(maxX, minZ);
  const br = worldToScreen(maxX, maxZ);
  const bl = worldToScreen(minX, maxZ);
  ctx.save();
  ctx.fillStyle = `rgba(2, 4, 8, ${alpha})`;
  ctx.beginPath();
  ctx.rect(0, 0, INTERNAL_W, INTERNAL_H);
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.restore();
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

  getBuildingAt(px, pz, feetZ = null) {
    for (const b of this.buildings) {
      if (isInsideBuilding(b, px, pz, feetZ)) return b;
    }
    return null;
  }

  getEntityBuildingAt(entity) {
    if (!entity) return null;
    const feetZ = entityFeetZ(entity);
    return this.getBuildingAt(entity.x, entity.z, feetZ);
  }

  getNearbyDoor(player, maxDist = DOOR_INTERACT_DIST) {
    let best = null;
    let bestD = maxDist + (player.radius ?? 0);
    for (const building of this.buildings) {
      if (!isNearDoor(building, player.x, player.z, maxDist)) continue;
      const pos = getDoorWorldPos(building);
      const d = Math.hypot(player.x - pos.x, player.z - pos.z);
      if (d <= bestD) {
        bestD = d;
        best = building;
      }
    }
    return best;
  }

  toggleDoor(building, player = null) {
    if (!building) return false;
    if (building.doorOpen && player && wouldClosingDoorTrapPlayer(building, player)) {
      return false;
    }
    building.doorOpen = !building.doorOpen;
    this._syncDoorObstacle(building);
    return true;
  }

  _syncDoorObstacle(building) {
    if (building.doorEdgeObstacles?.length) {
      for (const obs of building.doorEdgeObstacles) {
        this.world.removeDynamicObstacle(obs);
      }
      building.doorEdgeObstacles = null;
    }
    if (building.doorOpen) return;

    const defs = buildDoorTileEdgeObstacles(
      building.originX,
      building.originZ,
      building.w,
      building.h,
      building.cells,
      building.doorTx,
    );
    building.doorEdgeObstacles = [];
    for (const obs of defs) {
      const entry = { ...obs, building };
      building.doorEdgeObstacles.push(entry);
      this.world.addDynamicObstacle(entry);
    }
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
    this._syncDoorObstacle(building);
    this._clearFoliageForBuilding(world, building);
    this.buildings.push(building);
    this.chests?.spawnInBuilding(building, chunk);
  }

  _clearFoliageForBuilding(world, building) {
    const rect = buildingFoliageClearRect(building);
    world.clearFoliageInRect(rect.minX, rect.maxX, rect.minZ, rect.maxZ);
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
    if (building.doorEdgeObstacles?.length) {
      for (const obs of building.doorEdgeObstacles) {
        this.world.removeDynamicObstacle(obs);
      }
      building.doorEdgeObstacles = null;
    }
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
