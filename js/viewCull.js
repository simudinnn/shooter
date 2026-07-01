import { INTERNAL_W, INTERNAL_H, PPU } from './renderConfig.js';
import { TILE } from './worldGen.js';

/** Extra tiles beyond the screen edge (accounts for internal resolution). */
export const VIEW_MARGIN_TILES = 2;
/** World-unit pad for tall sprites (trees, roofs, enemies). */
export const VIEW_SPRITE_PAD = TILE * 6;

export function computeViewBounds(camX, camZ, marginTiles = VIEW_MARGIN_TILES) {
  const margin = marginTiles * TILE;
  const halfW = INTERNAL_W / PPU / 2 + margin;
  const halfH = INTERNAL_H / PPU / 2 + margin;
  return {
    minX: camX - halfW,
    maxX: camX + halfW,
    minZ: camZ - halfH,
    maxZ: camZ + halfH,
  };
}

export function pointInViewBounds(bounds, x, z, pad = 0) {
  return x >= bounds.minX - pad
    && x <= bounds.maxX + pad
    && z >= bounds.minZ - pad
    && z <= bounds.maxZ + pad;
}

export function aabbInViewBounds(bounds, minX, maxX, minZ, maxZ, pad = 0) {
  return minX <= bounds.maxX + pad
    && maxX >= bounds.minX - pad
    && minZ <= bounds.maxZ + pad
    && maxZ >= bounds.minZ - pad;
}
