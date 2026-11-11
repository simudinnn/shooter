/**
 * Render the full world to a canvas for inspection / export.
 */

import { TILE, CHUNK_TILES, FLOOR_KIND, getFloorSpriteName, getTerrainMapColorFromTile, isTintedFoliage, isYsortFoliage, unpackTintGradient } from './worldGen.js';
import { getWorldBoundsTiles } from './highwayGen.js';

const MAP_MAX_PX = 8192;
const _mapBakeCanvas = document.createElement('canvas');
const _mapBakeCtx = _mapBakeCanvas.getContext('2d');

function bakeChunkForMap(chunk, sprites, tilePx) {
  const size = CHUNK_TILES * tilePx;
  if (_mapBakeCanvas.width !== size) {
    _mapBakeCanvas.width = size;
    _mapBakeCanvas.height = size;
  }
  const ctx = _mapBakeCtx;
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
      sprites.stampTile(ctx, spriteName, lx * tilePx, lz * tilePx, tilePx, null);
    } else {
      ctx.fillStyle = getTerrainMapColorFromTile(tile);
      ctx.fillRect(lx * tilePx, lz * tilePx, tilePx, tilePx);
    }
  }

  const ppu = tilePx / TILE;
  const half = tilePx * 0.5;
  const originPxX = chunk.cx * CHUNK_TILES * TILE * ppu;
  const originPxZ = chunk.cz * CHUNK_TILES * TILE * ppu;
  for (const f of chunk.foliage ?? []) {
    if (isYsortFoliage(f.kind)) continue;
    const fTint = isTintedFoliage(f.kind) && f.tintKey ? unpackTintGradient(f.tintKey) : null;
    const fx = Math.round(f.x * ppu) - originPxX - half;
    const fz = Math.round(f.z * ppu) - originPxZ - half;
    sprites.stampTile(ctx, f.sprite, fx, fz, tilePx, fTint);
  }

  return _mapBakeCanvas;
}

/**
 * Paint every in-bounds chunk into one canvas (does not alter runtime chunk bakes).
 * @returns {{ canvas: HTMLCanvasElement, ppu: number, bounds: object }}
 */
export async function renderWorldMap(world, sprites, opts = {}) {
  const bounds = getWorldBoundsTiles();
  const tileW = bounds.maxTx - bounds.minTx + 1;
  const tileH = bounds.maxTz - bounds.minTz + 1;

  let ppu = opts.ppu ?? 2;
  let outW = tileW * TILE * ppu;
  let outH = tileH * TILE * ppu;
  const maxPx = opts.maxPx ?? MAP_MAX_PX;
  if (outW > maxPx || outH > maxPx) {
    const scale = maxPx / Math.max(outW, outH);
    ppu *= scale;
    outW = Math.round(tileW * TILE * ppu);
    outH = Math.round(tileH * TILE * ppu);
  }

  const tilePx = TILE * ppu;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = getTerrainMapColorFromTile({ floorKind: FLOOR_KIND });
  ctx.fillRect(0, 0, outW, outH);

  const minCX = Math.floor(bounds.minTx / CHUNK_TILES);
  const maxCX = Math.floor(bounds.maxTx / CHUNK_TILES);
  const minCZ = Math.floor(bounds.minTz / CHUNK_TILES);
  const maxCZ = Math.floor(bounds.maxTz / CHUNK_TILES);
  const total = (maxCX - minCX + 1) * (maxCZ - minCZ + 1);
  let done = 0;

  for (let cz = minCZ; cz <= maxCZ; cz++) {
    for (let cx = minCX; cx <= maxCX; cx++) {
      const chunk = world.getChunk(cx, cz);
      if (chunk.outOfBounds) continue;
      const baked = bakeChunkForMap(chunk, sprites, tilePx);
      const dx = (chunk.cx * CHUNK_TILES - bounds.minTx) * tilePx;
      const dy = (chunk.cz * CHUNK_TILES - bounds.minTz) * tilePx;
      ctx.drawImage(baked, dx, dy);
      done++;
      if (opts.onProgress) {
        opts.onProgress(done / total);
        if (done % 8 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  return { canvas, ppu, bounds, width: outW, height: outH };
}

/** Trigger a PNG download of the world map in the browser. */
export async function downloadWorldMapPng(world, sprites, filename, opts = {}) {
  const { canvas } = await renderWorldMap(world, sprites, opts);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode world map PNG');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `world-map-seed-${Date.now()}.png`;
  a.click();
  URL.revokeObjectURL(url);
}
