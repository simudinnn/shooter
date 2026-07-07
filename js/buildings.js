import { TILE, CHUNK_WORLD, CHUNK_TILES, isInBase, snapWorldPoint } from './worldGen.js';
import { INTERNAL_W, INTERNAL_H } from './renderConfig.js';
import {
  BUILDING_MAX_W,
  BUILDING_MAX_H,
  rollBuildingStyle,
  rollBuildingSize,
  rollBuildingWidth,
  rollBuildingShape,
  rollLVariant,
  shapeHeightForWidth,
  generateBuildingCells,
} from './buildingTypes.js';
import {
  rollTownLayoutAtAnchor,
  paintTownStreets,
  repaintAllTownStreets,
  TOWN_BUILDING_GAP,
  BUILDING_ROLE,
  getTownFootprintTiles,
} from './townGen.js';
import { getTownsInChunk, getTownAnchorAtRegion, isHighwayTile } from './highwayGen.js';
import {
  BUILDING_ART_PX,
  CELL_DOOR,
  CELL_EMPTY,
  CELL_FLOOR,
  buildBuildingPieces,
  isInsideBuilding,
  entityFeetZ,
  playerSouthEdgeZ,
  buildBuildingDecor,
  buildBuildingInteriorProps,
  doorApproachExcludeTiles,
  barrelScreenSize,
  getBuildingFootprintRect,
  buildingFootprintsTooClose,
  BUILDING_MIN_GAP_TILES,
  buildingFoliageClearRects,
  foliageOverlapsBuildingInterior,
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
  wallSpriteId,
} from './buildingGen.js';

export { BUILDING_ART_PX } from './buildingGen.js';

/** Native pixel size for the open-door sheet (w×h). Right edge aligns to door tile. */
export const OPEN_DOOR_ART_W = 22;
export const OPEN_DOOR_ART_H = 16;

function applyLotDoor(cellData, lot) {
  if (lot.role === BUILDING_ROLE.HOUSE) return cellData;
  const { w, h, cells } = cellData;
  const doorTx = lot.doorTx;
  const doorTz = lot.doorTz;
  if (doorTx == null || doorTz == null) return cellData;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === CELL_DOOR) cells[i] = CELL_FLOOR;
  }
  if (doorTx >= 0 && doorTx < w && doorTz >= 0 && doorTz < h) {
    cells[doorTz * w + doorTx] = CELL_DOOR;
    cellData.doorTx = doorTx;
    cellData.doorTz = doorTz;
  }
  return cellData;
}

function generateTownLotCells(lot, seedA, seedB) {
  let cellData;
  if (lot.role !== BUILDING_ROLE.HOUSE) {
    cellData = generateBuildingCells(lot.w, lot.h, 'rect');
  } else {
    const shape = rollBuildingShape(seedA, seedB);
    if (shape === 'l') {
      cellData = generateBuildingCells(lot.w, lot.h, 'l', {
        lLeg: rollLVariant(seedA + 11, seedB + 13),
      });
    } else if (shape === 't') {
      cellData = generateBuildingCells(lot.w, lot.h, 't');
    } else {
      cellData = generateBuildingCells(lot.w, lot.h, 'rect');
    }
    cellData = applyLotDoor(cellData, lot);
  }
  return cellData;
}

/** Screen-space center + half extents for door interact hover (internal resolution). */
export function getDoorScreenHitBox(building, worldToScreen) {
  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorTz = building.doorTz ?? building.h - 1;
  const { originX, originZ } = building;
  const tl = worldToScreen(originX + doorTx * TILE, originZ + doorTz * TILE);
  const br = worldToScreen(originX + (doorTx + 1) * TILE, originZ + (doorTz + 1) * TILE);
  const tileX = Math.min(tl.x, br.x);
  const tileY = Math.min(tl.y, br.y);
  const tilePx = Math.max(2, Math.abs(br.x - tl.x) || 16);
  const drawW = building.doorOpen
    ? Math.round(tilePx * (OPEN_DOOR_ART_W / BUILDING_ART_PX))
    : tilePx;
  const drawH = tilePx;
  const x = building.doorOpen ? Math.round(tileX + tilePx - drawW) : tileX;
  const cx = x + drawW * 0.5;
  const cy = tileY + drawH * 0.5;
  return {
    x: cx,
    y: cy,
    halfW: drawW * 0.5 + 4,
    halfH: drawH * 0.5 + 6,
  };
}

export const BUILDING_CHUNK_SPAWN_RATE = 0.55;
export const TOWN_CLUSTER_CHANCE = 1;
export const MAX_NEARBY_BUILDINGS = 18;

const ROOF_FADE_SPEED = 4.5;
const ROOF_ALPHA_INSIDE = 0.06;
const ROOF_ALPHA_OUTSIDE = 1;

function hasSprite(sprites, name) {
  const img = sprites?.images?.[name];
  return !!(img && (img.naturalWidth > 0 || img.width > 0));
}

function drawBuildingTile(sprites, ctx, name, x, y, tilePx) {
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

function buildingTileTopLeft(originX, originZ, tx, tz, worldToScreen) {
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

function buildingStyle(building) {
  return building.style ?? {
    floor: ['bld_floor_wood', 'bld_floor_wood_alt'],
    wallNs: 'bld_wall_wood',
    wallEw: 'bld_wall_ew',
    wallCorner: 'bld_wall_wood',
    doorMat: 'bld_door_mat_wood',
    doorClosed: 'bld_door_closed_wood',
    doorOpen: 'bld_door_open_wood',
    doorLintel: 'bld_wall_wood',
    roofFill: 'bld_roof_brown',
    roofEdge: 'bld_roof_brown_edge',
  };
}

function isFloorCell(building, tx, tz) {
  const cell = building.cells[tz * building.w + tx];
  return cell === CELL_FLOOR || cell === CELL_DOOR;
}

export function drawBuildingFloors(ctx, building, worldToScreen, tilePx, sprites = null) {
  const { originX, originZ, w, h } = building;
  const style = buildingStyle(building);
  let drewArt = false;

  if (sprites) {
    for (let tz = 0; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        if (!isFloorCell(building, tx, tz)) continue;
        const tileName = (tx + tz) % 4 === 0 && hasSprite(sprites, style.floor[1])
          ? style.floor[1]
          : style.floor[0];
        if (!hasSprite(sprites, tileName)) continue;
        const corner = worldToScreen(originX + tx * TILE, originZ + tz * TILE);
        const next = worldToScreen(originX + (tx + 1) * TILE, originZ + (tz + 1) * TILE);
        const x = Math.round(Math.min(corner.x, next.x));
        const y = Math.round(Math.min(corner.y, next.y));
        drawBuildingTile(sprites, ctx, tileName, x, y, tilePx);
        drewArt = true;
      }
    }
  }

  if (!drewArt) {
    const interior = building.interior;
    const s0 = worldToScreen(interior.minX, interior.minZ);
    const s1 = worldToScreen(interior.maxX, interior.maxZ);
    const x = Math.round(Math.min(s0.x, s1.x));
    const y = Math.round(Math.min(s0.y, s1.y));
    const fw = Math.round(Math.abs(s1.x - s0.x));
    const fh = Math.round(Math.abs(s1.y - s0.y));
    drawPlaceholderFloor(ctx, x, y, fw, fh);
  }

  const doorTx = building.doorTx ?? Math.floor(building.w / 2);
  const doorTz = building.doorTz ?? building.h - 1;
  const { x: doorX, y: doorY } = buildingTileTopLeft(originX, originZ, doorTx, doorTz, worldToScreen);
  const matName = buildingStyle(building).doorMat;
  if (!sprites || !drawBuildingTile(sprites, ctx, matName, doorX, doorY, tilePx)) {
    ctx.fillStyle = '#4a3828';
    ctx.fillRect(doorX, doorY, tilePx, tilePx);
  }
}

export function drawBuildingRoof(ctx, building, worldToScreen, tilePx, alpha, sprites = null) {
  if (alpha <= 0.01) return;
  const { roof, w, h, cells } = building;
  const style = buildingStyle(building);
  ctx.save();
  ctx.globalAlpha = alpha;

  const raiseZ = roofRaiseWorld();
  const s0 = worldToScreen(roof.originX, roof.originZ - raiseZ);
  const s1 = worldToScreen(roof.originX + roof.w, roof.originZ + roof.h - raiseZ);
  const baseX = Math.round(Math.min(s0.x, s1.x));
  const baseY = Math.round(Math.min(s0.y, s1.y));
  const edgeRows = Math.floor(h / 2);
  const hasEdge = sprites && hasSprite(sprites, style.roofEdge);
  const hasFill = sprites && hasSprite(sprites, style.roofFill);

  if (hasFill || hasEdge) {
    for (let tz = 0; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        if (cells && cells[tz * w + tx] === CELL_EMPTY) continue;
        const drawX = baseX + tx * tilePx;
        const drawY = baseY + tz * tilePx;
        if (tz < edgeRows && hasEdge) {
          drawBuildingTile(sprites, ctx, style.roofEdge, drawX, drawY, tilePx);
        } else if (hasFill) {
          drawBuildingTile(sprites, ctx, style.roofFill, drawX, drawY, tilePx);
        } else if (hasEdge) {
          drawBuildingTile(sprites, ctx, style.roofEdge, drawX, drawY, tilePx);
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
  const { originX, originZ, doorTx } = building;
  const doorTz = building.doorTz ?? building.h - 1;
  const lintelName = buildingStyle(building).doorLintel;
  const { x: tileX, y: tileY } = buildingTileTopLeft(originX, originZ, doorTx, doorTz, worldToScreen);
  const lintelH = Math.round(tilePx * 0.5);
  if (sprites && drawSnappedWallSprite(sprites, ctx, lintelName, tileX, tileY, tilePx, lintelH)) return;
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(tileX, tileY, tilePx, lintelH);
  ctx.fillStyle = '#6a5a4a';
  ctx.fillRect(tileX + 1, tileY + 1, Math.max(1, tilePx - 2), Math.max(1, lintelH - 2));
}

/** Door panel on the south entry tile (open or closed sprite). */
export function drawBuildingDoorPanel(ctx, building, worldToScreen, tilePx, sprites = null) {
  const { originX, originZ, doorTx } = building;
  const doorTz = building.doorTz ?? building.h - 1;
  const style = buildingStyle(building);
  const { x: tileX, y: tileY } = buildingTileTopLeft(originX, originZ, doorTx, doorTz, worldToScreen);
  if (building.doorOpen) {
    if (sprites && drawOpenDoorSprite(sprites, ctx, style.doorOpen, tileX, tileY, tilePx)) return true;
  } else if (sprites && drawBuildingTile(sprites, ctx, style.doorClosed, tileX, tileY, tilePx)) {
    return true;
  }
  if (!building.doorOpen && sprites && drawBuildingTile(sprites, ctx, style.wallNs, tileX, tileY, tilePx)) return false;
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

/** Darken the viewport outside walkable floor while the player is inside. */
export function drawExteriorDimWhenInside(ctx, building, worldToScreen, alpha = 0.58) {
  const { originX, originZ, w, h, cells } = building;
  ctx.save();
  ctx.fillStyle = `rgba(2, 4, 8, ${alpha})`;
  ctx.beginPath();
  ctx.rect(0, 0, INTERNAL_W, INTERNAL_H);
  for (let tz = 0; tz < h; tz++) {
    for (let tx = 0; tx < w; tx++) {
      const cell = cells[tz * w + tx];
      if (cell !== CELL_FLOOR && cell !== CELL_DOOR) continue;
      const wx0 = originX + tx * TILE;
      const wz0 = originZ + tz * TILE;
      const wx1 = wx0 + TILE;
      const wz1 = wz0 + TILE;
      const tl = worldToScreen(wx0, wz0);
      const br = worldToScreen(wx1, wz1);
      const x = Math.min(tl.x, br.x);
      const y = Math.min(tl.y, br.y);
      const rw = Math.abs(br.x - tl.x);
      const rh = Math.abs(br.y - tl.y);
      ctx.rect(x, y, rw, rh);
    }
  }
  ctx.fill('evenodd');
  ctx.restore();
}

export function drawBuildingWall(ctx, wall, building, worldToScreen, tilePx, sprites = null) {
  const { originX, originZ } = building;
  const { tx, tz, orient } = wall;
  const style = buildingStyle(building);
  const { x: tileX, y: tileY } = buildingTileTopLeft(originX, originZ, tx, tz, worldToScreen);
  const segH = Math.round(tilePx);
  const ewDrawW = Math.max(2, Math.round(tilePx / 4));

  if (sprites) {
    const primary = wallSpriteId(style, orient);
    const candidates = orient === 'ew'
      ? [primary, 'bld_wall_ew']
      : orient === 'corner'
        ? [style.wallCorner ?? primary, primary]
        : [primary];
    const sprite = firstSprite(sprites, candidates);
    if (sprite) {
      if (orient === 'ew') {
        const drawX = wall.face === 'west' ? tileX : tileX + tilePx - ewDrawW;
        const segments = wall.extendNorth ? 2 : 1;
        const drawH = segH * segments;
        const drawY = tileY + tilePx - drawH;
        for (let i = 0; i < segments; i++) {
          const segY = drawY + (segments - 1 - i) * segH;
          drawSnappedWallSprite(sprites, ctx, sprite, drawX, segY, ewDrawW, segH);
        }
      } else {
        drawBuildingTile(sprites, ctx, sprite, tileX, tileY, tilePx);
      }
      return;
    }
  }
  drawPlaceholderWall(ctx, wall, tileX, tileY, tilePx);
}

export function drawDecorPiece(ctx, sprites, piece, tilePx, worldToScreen) {
  if (!sprites || !piece.sprite) return;
  if (!sprites.ensureSprite(piece.sprite)) return;

  const anchorX = piece.obstacle?.x ?? piece.x;
  const anchorZ = piece.obstacle?.z ?? piece.z;
  const ss = worldToScreen(anchorX, anchorZ);

  if (piece.interior) {
    const img = sprites.images[piece.sprite];
    const nativeH = img?.naturalHeight || img?.height || 16;
    const drawH = Math.round((nativeH / 16) * tilePx);
    sprites.drawPropSprite(ctx, piece.sprite, Math.round(ss.x), Math.round(ss.y), drawH, {
      anchor: 'center',
    });
    return;
  }

  const { drawH } = barrelScreenSize(tilePx);
  sprites.drawPropSprite(ctx, piece.sprite, Math.round(ss.x), Math.round(ss.y), drawH, {
    anchor: 'center',
  });
}

export function drawBuildingDecor(ctx, building, worldToScreen, tilePx, sprites = null) {
  if (!building.decor?.length || !sprites) return;
  for (const piece of building.decor) {
    drawDecorPiece(ctx, sprites, piece, tilePx, worldToScreen);
  }
}

export class BuildingManager {
  constructor(world, chests = null) {
    this.world = world;
    this.chests = chests;
    this.buildings = [];
    this.roofAlpha = ROOF_ALPHA_OUTSIDE;
    this.insideBuilding = null;
    /** Keeps fading the last building roof after exit until alpha reaches outside. */
    this.roofFadeBuilding = null;
  }

  update(player, dt) {
    const col = player.getMoveCollider?.(8);
    const feetZ = playerSouthEdgeZ(player.x, player.z);
    const inside = col
      ? this.getBuildingAt(player.x, player.z, col, feetZ)
      : this.getBuildingAt(player.x, player.z, feetZ);
    if (inside) this.roofFadeBuilding = inside;
    else if (this.roofFadeBuilding && Math.abs(this.roofAlpha - ROOF_ALPHA_OUTSIDE) < 0.02) {
      this.roofFadeBuilding = null;
    }
    this.insideBuilding = inside;
    const target = inside ? ROOF_ALPHA_INSIDE : ROOF_ALPHA_OUTSIDE;
    const fade = 1 - Math.exp(-ROOF_FADE_SPEED * dt);
    this.roofAlpha += (target - this.roofAlpha) * fade;
  }

  ensureDecorSprites(sprites) {
    if (!sprites?.ensureSprite) return;
    for (const building of this.buildings) {
      this._ensureBuildingDecorSprites(building, sprites);
    }
  }

  _ensureBuildingDecorSprites(building, sprites) {
    this._repairMissingInteriorDecor(building);
    if (!sprites?.ensureSprite) return;
    for (const piece of building.decor ?? []) {
      if (piece?.sprite) sprites.ensureSprite(piece.sprite);
    }
  }

  _repairMissingInteriorDecor(building) {
    if (!building?.cells?.length || !building.w || !building.h) return;
    const decor = building.decor ?? [];
    const hasFridge = decor.some((p) => p.sprite === 'bld_fridge');
    const hasTable = decor.some((p) => p.sprite === 'bld_table');
    if (hasFridge && hasTable) return;

    const reserved = [...(building.chestTiles ?? (building.chestTile ? [building.chestTile] : []))];
    const doorFacing = building.doorFacing ?? 'south';
    reserved.push(...doorApproachExcludeTiles(
      building.doorTx,
      building.doorTz ?? building.h - 1,
      doorFacing,
    ));
    const interiorProps = buildBuildingInteriorProps(
      building.originX,
      building.originZ,
      building.w,
      building.h,
      building.cells,
      building.doorTx,
      building.doorTz,
      reserved,
      building.originX * 0.29,
      building.originZ * 0.31,
    );
    if (!interiorProps.length) return;

    const exterior = decor.filter((p) => !p.interior && p.sprite !== 'bld_fridge' && p.sprite !== 'bld_table');
    building.decor = [...interiorProps, ...exterior];
    this._unregisterInteriorDecorObstacles(building);
    for (const piece of interiorProps) {
      if (!piece.obstacle) continue;
      const entry = { ...piece.obstacle, building, decorPiece: piece };
      if (!building.decorObstacles) building.decorObstacles = [];
      building.decorObstacles.push(entry);
      this.world.addDynamicObstacle(entry);
    }
  }

  _unregisterInteriorDecorObstacles(building) {
    if (!building.decorObstacles?.length) return;
    const keep = [];
    for (const obs of building.decorObstacles) {
      if (obs.decorPiece?.interior) {
        this.world.removeDynamicObstacle(obs);
        continue;
      }
      keep.push(obs);
    }
    building.decorObstacles = keep;
  }

  /** @deprecated — decor is never removed; sprites use procedural fallbacks. */
  pruneDecorWithoutSprites(sprites) {
    this.ensureDecorSprites(sprites);
  }

  _pruneBuildingDecor(building, sprites) {
    this._ensureBuildingDecorSprites(building, sprites);
  }

  /** Roof draw alpha — lerps while entering or leaving a building. */
  roofAlphaFor(building) {
    if (building === this.insideBuilding || building === this.roofFadeBuilding) {
      return this.roofAlpha;
    }
    return ROOF_ALPHA_OUTSIDE;
  }

  getBuildingAt(px, pz, collider = null, feetZOverride = null) {
    for (const b of this.buildings) {
      if (isInsideBuilding(b, px, pz, collider, feetZOverride)) return b;
    }
    return null;
  }

  getEntityBuildingAt(entity) {
    if (!entity) return null;
    const col = entity.getMoveCollider?.();
    const feetZ = entityFeetZ(entity);
    if (col) return this.getBuildingAt(entity.x, entity.z, col, feetZ);
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

  isInDoorInteractRange(player, building, maxDist = DOOR_INTERACT_DIST) {
    return isNearDoor(building, player.x, player.z, maxDist);
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
      building.doorTz ?? building.h - 1,
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
    const anchors = getTownsInChunk(chunk.cx, chunk.cz);
    if (anchors.length === 0) {
      chunk.buildingsSpawned = true;
      return;
    }

    if (!this._townAnchorsSpawned) this._townAnchorsSpawned = new Set();

    if (anchors.every((a) => this._townAnchorsSpawned.has(a.id))) {
      chunk.buildingsSpawned = true;
      return;
    }

    if (canSpawn && !canSpawn()) {
      const pending = anchors.filter((a) => !this._townAnchorsSpawned?.has(a.id));
      if (pending.length === 0) {
        chunk.buildingsSpawned = true;
        return;
      }
    }

    for (const anchor of anchors) {
      if (this._townAnchorsSpawned.has(anchor.id)) continue;
      if (this._spawnTownAtAnchor(anchor, chunk, world, player, null, spawnBias)) {
        this._townAnchorsSpawned.add(anchor.id);
        chunk.buildingsSpawned = true;
        return;
      }
    }
    chunk.buildingsSpawned = true;
  }

  /** @deprecated towns spawn as chunks load — kept for save restore compatibility. */
  spawnAllTowns(world) {
    if (!this._townAnchorsSpawned) this._townAnchorsSpawned = new Set();
    const anchor = getTownAnchorAtRegion(0, 0);
    if (anchor && !this._townAnchorsSpawned.has(anchor.id)) {
      const chunk = world.getChunk(Math.floor(anchor.tx / CHUNK_TILES), Math.floor(anchor.tz / CHUNK_TILES));
      if (this._spawnTownAtAnchor(anchor, chunk, world, null, null, null, { boot: true })) {
        this._townAnchorsSpawned.add(anchor.id);
      }
    }
  }

  _markTownChunksSpawned(world, layout) {
    const minCX = Math.floor(layout.originTileX * TILE / CHUNK_WORLD);
    const maxCX = Math.floor((layout.originTileX + layout.townW) * TILE / CHUNK_WORLD);
    const minCZ = Math.floor(layout.originTileZ * TILE / CHUNK_WORLD);
    const maxCZ = Math.floor((layout.originTileZ + layout.townDepth) * TILE / CHUNK_WORLD);
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const chunk = world.getChunk(cx, cz);
        chunk.buildingsSpawned = true;
      }
    }
  }

  _finalizeBuilding(building, chunk, world) {
    building.homeCx = chunk.cx;
    building.homeCz = chunk.cz;
    building.obstacleDefs = building.obstacles;
    building.obstacles = [];
    this._registerObstacles(building);
    this._syncDoorObstacle(building);
    this._clearFoliageForBuilding(world, building);
    this.buildings.push(building);
    this.chests?.spawnInBuilding(building, chunk);
    const reserved = [...(building.chestTiles ?? (building.chestTile ? [building.chestTile] : []))];
    const doorFacing = building.doorFacing ?? 'south';
    reserved.push(...doorApproachExcludeTiles(
      building.doorTx,
      building.doorTz ?? building.h - 1,
      doorFacing,
    ));
    const interiorProps = buildBuildingInteriorProps(
      building.originX,
      building.originZ,
      building.w,
      building.h,
      building.cells,
      building.doorTx,
      building.doorTz,
      reserved,
      building.originX * 0.29,
      building.originZ * 0.31,
    );
    building.decor = [
      ...interiorProps,
      ...buildBuildingDecor(
        building.originX,
        building.originZ,
        building.w,
        building.h,
        building.cells,
        building.doorTx,
        building.doorTz,
        building.originX * 0.17,
        building.originZ * 0.23,
        reserved,
        doorFacing,
      ),
    ];
    this._stripDecorOffRoads(world, building);
    this._registerDecorObstacles(building);
    this._ensureBuildingDecorSprites(building, world._spriteBank);
    return building;
  }

  _stripDecorOffRoads(world, building) {
    building.decor = (building.decor ?? []).filter((piece) => {
      if (!piece.exterior) return true;
      const tx = Math.floor(piece.x / TILE);
      const tz = Math.floor(piece.z / TILE);
      const tile = world.getTile(tx, tz);
      if (tile?.floorKind === 'road' || tile?.floorKind === 'path') return false;
      if (world._townFloorTiles?.has(`${tx},${tz}`)) return false;
      return true;
    });
  }

  _unregisterExteriorDecorObstacles(building) {
    if (!building.decorObstacles?.length) return;
    const keep = [];
    for (const obs of building.decorObstacles) {
      if (obs.decorPiece?.exterior) {
        this.world.removeDynamicObstacle(obs);
        continue;
      }
      keep.push(obs);
    }
    building.decorObstacles = keep;
  }

  /** Re-filter exterior props after town streets are painted (roads did not exist at finalize time). */
  _refreshExteriorDecorOnRoads(world, building) {
    this._unregisterExteriorDecorObstacles(building);
    this._stripDecorOffRoads(world, building);
    for (const piece of building.decor ?? []) {
      if (!piece.exterior || !piece.obstacle) continue;
      const entry = { ...piece.obstacle, building, decorPiece: piece };
      building.decorObstacles.push(entry);
      this.world.addDynamicObstacle(entry);
    }
  }

  _registerDecorObstacles(building) {
    building.decorObstacles = [];
    for (const piece of building.decor ?? []) {
      if (!piece.obstacle) continue;
      const entry = { ...piece.obstacle, building, decorPiece: piece };
      building.decorObstacles.push(entry);
      this.world.addDynamicObstacle(entry);
    }
  }

  _spawnSingleInChunk(chunk, world, player, canSpawn, spawnBias) {
    const shape = rollBuildingShape(chunk.cx * 31 + 7, chunk.cz * 37 + 11);
    const layout = this._findChunkOrigin(chunk, world, player, spawnBias, shape);
    if (!layout) return false;

    const style = rollBuildingStyle(
      Math.floor(layout.x * 0.41),
      Math.floor(layout.z * 0.53),
    );
    const building = buildBuildingPieces(layout.x, layout.z, layout.cellData, style);
    this._finalizeBuilding(building, chunk, world);
    return true;
  }

  _spawnTownAtAnchor(anchor, chunk, world, player, canSpawn, spawnBias, opts = {}) {
    const layout = rollTownLayoutAtAnchor(anchor, anchor.tx * 41, anchor.tz * 43);
    if (layout.lots.length === 0) return false;

    const ox = layout.originTileX * TILE;
    const oz = layout.originTileZ * TILE;

    const placedBuildings = [];
    for (let i = 0; i < layout.lots.length; i++) {
      if (!opts.boot && canSpawn && !canSpawn()) break;
      const lot = layout.lots[i];
      const bx = ox + lot.ox * TILE;
      const bz = oz + lot.oz * TILE;
      const cellData = generateTownLotCells(
        lot,
        Math.floor(bx * 0.31 + i * 13),
        Math.floor(bz * 0.37 + i * 17),
      );

      if (!this._fitsAt(world, bx, bz, lot.w, lot.h, cellData.cells, {
        allowInBase: true,
        ignoreTownPavement: true,
        footprintGapTiles: TOWN_BUILDING_GAP,
      })) {
        continue;
      }

      const style = rollBuildingStyle(Math.floor(bx * 0.41 + i * 7), Math.floor(bz * 0.53 + i * 11));
      const building = buildBuildingPieces(bx, bz, cellData, style);
      building.doorTx = cellData.doorTx;
      building.doorTz = cellData.doorTz;
      building.doorFacing = 'south';
      building.townId = `town@${anchor.id}`;
      building.persistentTown = true;
      building.townAnchorId = anchor.id;
      building.townAnchorTx = anchor.tx;
      building.townAnchorTz = anchor.tz;
      building.buildingRole = lot.role;
      this._finalizeBuilding(building, chunk, world);
      placedBuildings.push(building);
    }

    paintTownStreets(world, layout, placedBuildings);
    for (const b of placedBuildings) this._refreshExteriorDecorOnRoads(world, b);
    world.markFoliageBlockedTiles(getTownFootprintTiles(layout));
    if (placedBuildings.length >= 1) {
      this._markTownChunksSpawned(world, layout);
      return true;
    }
    for (const b of placedBuildings) this.remove(b);
    return false;
  }

  _spawnTownInChunk(chunk, world, player, canSpawn, spawnBias) {
    const anchors = getTownsInChunk(chunk.cx, chunk.cz);
    for (const anchor of anchors) {
      if (this._spawnTownAtAnchor(anchor, chunk, world, player, canSpawn, spawnBias)) return true;
    }
    return false;
  }

  _clearFoliageForBuilding(world, building) {
    for (const rect of buildingFoliageClearRects(building)) {
      world.clearFoliageInRect(rect.minX, rect.maxX, rect.minZ, rect.maxZ, { markBlocked: true });
    }
    world.removeFoliageWhere((f) => foliageOverlapsBuildingInterior(building, f));
  }

  remove(building) {
    this.chests?.removeAllFromBuilding(building);
    this._unregisterObstacles(building);
    const i = this.buildings.indexOf(building);
    if (i >= 0) this.buildings.splice(i, 1);
  }

  /** Rebuild one saved building (geometry, decor, door, chest). */
  restoreFromSave(saved, world) {
    const chunk = world.getChunk(saved.homeCx, saved.homeCz);
    chunk.buildingsSpawned = true;

    const cellData = {
      w: saved.w,
      h: saved.h,
      cells: saved.cells,
      doorTx: saved.doorTx,
      doorTz: saved.doorTz,
      shape: saved.shape ?? 'rect',
    };
    const building = buildBuildingPieces(saved.originX, saved.originZ, cellData, saved.style);
    building.doorOpen = !!saved.doorOpen;
    building.homeCx = saved.homeCx;
    building.homeCz = saved.homeCz;
    building.townId = saved.townId ?? null;
    building.townAnchorId = saved.townAnchorId ?? null;
    building.townAnchorTx = saved.townAnchorTx ?? null;
    building.townAnchorTz = saved.townAnchorTz ?? null;
    building.buildingRole = saved.buildingRole ?? null;
    building.obstacleDefs = building.obstacles;
    building.obstacles = [];
    this._registerObstacles(building);
    this._syncDoorObstacle(building);
    this._clearFoliageForBuilding(world, building);

    if (saved.chestTiles?.length) {
      building.chestTiles = saved.chestTiles.map((t) => ({ ...t }));
      building.chestTile = building.chestTiles[0];
    } else if (saved.chestTile) {
      building.chestTiles = [{ ...saved.chestTile }];
      building.chestTile = building.chestTiles[0];
    }
    const reserved = [...(building.chestTiles ?? [])];
    const doorFacing = building.doorFacing ?? 'south';
    reserved.push(...doorApproachExcludeTiles(
      building.doorTx,
      building.doorTz ?? building.h - 1,
      doorFacing,
    ));
    const interiorProps = buildBuildingInteriorProps(
      building.originX,
      building.originZ,
      building.w,
      building.h,
      building.cells,
      building.doorTx,
      building.doorTz,
      reserved,
      building.originX * 0.29,
      building.originZ * 0.31,
    );
    building.decor = [
      ...interiorProps,
      ...buildBuildingDecor(
        building.originX,
        building.originZ,
        building.w,
        building.h,
        building.cells,
        building.doorTx,
        building.doorTz,
        building.originX * 0.17,
        building.originZ * 0.23,
        reserved,
        doorFacing,
      ),
    ];
    this._stripDecorOffRoads(world, building);
    this._registerDecorObstacles(building);
    this._ensureBuildingDecorSprites(building, world._spriteBank);
    this.buildings.push(building);

    const savedChests = saved.chests?.length
      ? saved.chests
      : (saved.chest ? [saved.chest] : []);
    for (const chestSave of savedChests) {
      this.chests?.restoreInBuilding(chestSave, building);
    }
    if (savedChests.length) chunk.chestsSpawned = true;
    return building;
  }

  restoreAllFromSave(saves, world) {
    if (!this._townAnchorsSpawned) this._townAnchorsSpawned = new Set();
    for (const saved of saves ?? []) {
      this.restoreFromSave(saved, world);
      if (saved.townAnchorTx != null) this._townAnchorsSpawned.add(saved.townAnchorTx);
      if (saved.townAnchorId != null) this._townAnchorsSpawned.add(saved.townAnchorId);
    }
    repaintAllTownStreets(world, this.buildings);
    for (const b of this.buildings) this._refreshExteriorDecorOnRoads(world, b);
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
    if (building.decorObstacles?.length) {
      for (const obs of building.decorObstacles) {
        this.world.removeDynamicObstacle(obs);
      }
      building.decorObstacles = null;
    }
    for (const obs of building.obstacles ?? []) {
      this.world.removeDynamicObstacle(obs);
    }
    building.obstacles = [];
  }

  _fitsAt(world, originX, originZ, w, h, cells = null, {
    allowInBase = false,
    ignoreTownPavement = false,
    footprintGapTiles = BUILDING_MIN_GAP_TILES,
  } = {}) {
    const footprintW = w * TILE;
    const footprintH = h * TILE;
    if (!allowInBase && isInBase(originX + footprintW * 0.5, originZ + footprintH * 0.5)) return false;

    const candidateFootprint = getBuildingFootprintRect(originX, originZ, w, h);

    for (const other of this.buildings) {
      const otherFootprint = getBuildingFootprintRect(
        other.originX,
        other.originZ,
        other.w,
        other.h,
      );
      if (buildingFootprintsTooClose(candidateFootprint, otherFootprint, footprintGapTiles)) return false;
    }

    for (let tz = 0; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        if (cells) {
          const cell = cells[tz * w + tx];
          if (cell !== CELL_FLOOR && cell !== CELL_DOOR) continue;
        }
        const worldTx = Math.floor(originX / TILE) + tx;
        const worldTz = Math.floor(originZ / TILE) + tz;
        if (isHighwayTile(worldTx, worldTz)) return false;
        if (!ignoreTownPavement) {
          const floorTile = world.getTile(worldTx, worldTz);
          if (floorTile?.floorKind === 'road' || floorTile?.floorKind === 'path') return false;
        }
        const cx = originX + (tx + 0.5) * TILE;
        const cz = originZ + (tz + 0.5) * TILE;
        if (world.checkCollision(cx, cz, 0.45)) return false;
      }
    }
    return true;
  }

  _fitsTownAt(world, ox, oz, layout, player, requireAhead, spawnBias, opts = {}) {
    const lots = layout.lots;
    const townW = layout.townW * TILE;
    const townH = layout.townDepth * TILE;
    const cx = ox + townW * 0.5;
    const cz = oz + townH * 0.5;
    const fx = spawnBias?.fx ?? 0;
    const fz = spawnBias?.fz ?? 1;
    if (!opts.boot && requireAhead && spawnBias) {
      if ((cx - player.x) * fx + (cz - player.z) * fz < 2) return false;
    }
    if (!opts.boot && spawnBias?.isOffScreen && requireAhead && !spawnBias.isOffScreen(cx, cz)) return false;
    if (player && !opts.boot) {
      const pdx = cx - player.x;
      const pdz = cz - player.z;
      if (pdx * pdx + pdz * pdz < 6) return false;
    }

    const lotFootprints = [];
    for (const lot of lots) {
      const bx = ox + lot.ox * TILE;
      const bz = oz + lot.oz * TILE;
      const cellData = generateBuildingCells(lot.w, lot.h, 'rect');
      const footprint = getBuildingFootprintRect(bx, bz, lot.w, lot.h);
      for (const prev of lotFootprints) {
        if (buildingFootprintsTooClose(footprint, prev)) return false;
      }
      lotFootprints.push(footprint);
      if (!this._fitsAt(world, bx, bz, lot.w, lot.h, cellData.cells, { allowInBase: true })) return false;
    }
    return true;
  }

  _findChunkOrigin(chunk, world, player, spawnBias = null, shape = 'rect') {
    const minX = chunk.cx * CHUNK_WORLD + TILE;
    const minZ = chunk.cz * CHUNK_WORLD + TILE;
    const spanX = CHUNK_WORLD - BUILDING_MAX_W * TILE - TILE;
    const spanZ = CHUNK_WORLD - BUILDING_MAX_H * TILE - TILE;
    const fx = spawnBias?.fx ?? 0;
    const fz = spawnBias?.fz ?? 1;

    const tries = [];
    for (let i = 0; i < 24; i++) {
      let cellData;
      if (shape === 'rect') {
        const size = rollBuildingSize(chunk.cx * 17 + i * 3, chunk.cz * 23 + i * 5);
        cellData = generateBuildingCells(size.w, size.h, 'rect');
      } else {
        const w = rollBuildingWidth(chunk.cx * 17 + i * 3, chunk.cz * 23 + i * 5);
        const lLeg = shape === 'l'
          ? rollLVariant(chunk.cx * 17 + i * 7, chunk.cz * 23 + i * 11)
          : undefined;
        const bh = shapeHeightForWidth(w);
        cellData = generateBuildingCells(w, bh, shape, { lLeg });
      }
      tries.push({
        cellData,
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
        const { w, h, cells } = t.cellData;
        if (isValid(ox, oz, w, h, cells, passAhead)) {
          return { x: ox, z: oz, cellData: t.cellData };
        }
      }
    }
    return null;
  }
}
