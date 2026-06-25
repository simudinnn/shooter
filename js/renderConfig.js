/**
 * Single render scale for the whole game — tiles, sprites, particles, camera.
 * PPU must be a multiple of 4 so TILE(4) × PPU is a whole 16px-art upscale (8 → 32px tiles).
 */
export const PPU = 8;

/** Internal framebuffer (logical pixels). Wider than 480×270 = more world at same PPU. */
export const INTERNAL_W = 960;
export const INTERNAL_H = 540;

/** Supersample buffer for sharper fullscreen upscale. */
export const RENDER_SCALE = 2;

/** One screen pixel in world units. */
export const PIXEL_STEP = 1 / PPU;

/** Foliage art grid — TILE/16; at PPU 8 each step is 2 screen pixels. */
export const FOLIAGE_SNAP_STEP = 0.25;

export function snapAxis(v, step = FOLIAGE_SNAP_STEP) {
  return Math.round(v / step) * step;
}

export function snapPoint(x, z) {
  return { x: snapAxis(x), z: snapAxis(z) };
}

export function snapCamLean(v) {
  return Math.round(v * PPU) / PPU;
}

/** World position → screen pixels (integer). */
export function worldToScreen(wx, wz, camPxX, camPxZ, leanPxX, leanPxZ) {
  return {
    x: Math.round(wx * PPU) - camPxX - leanPxX + (INTERNAL_W >> 1),
    y: Math.round(wz * PPU) - camPxZ - leanPxZ + (INTERNAL_H >> 1),
  };
}

export function camPixelsFromPlayer(px, pz) {
  return {
    x: Math.round(px * PPU),
    z: Math.round(pz * PPU),
  };
}

export function leanPixelsFromOffset(offX, offZ) {
  return {
    x: Math.round(offX * PPU),
    z: Math.round(offZ * PPU),
  };
}

/** Snap a screen axis to the floor-tile pixel grid (tilePx / 16). */
export function snapScreenAxis(v, tilePx) {
  const step = Math.max(1, tilePx >> 4);
  return Math.round(v / step) * step;
}

const _shadowStampCache = new Map();
const _shadowStampOrder = [];
const SHADOW_STAMP_MAX = 48;
const SHADOW_BANDS = 4;
const SHADOW_BAND_ALPHA = [108, 82, 58, 36];

function _getShadowStamp(rx, ry) {
  const key = `${rx},${ry}`;
  const hit = _shadowStampCache.get(key);
  if (hit) return hit;

  const w = rx * 2;
  const h = ry * 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  const img = c.createImageData(w, h);
  const px = img.data;
  for (let y = 0; y < h; y++) {
    const py = y - ry + 0.5;
    const dz = py / ry;
    for (let x = 0; x < w; x++) {
      const pdx = x - rx + 0.5;
      const dx = pdx / rx;
      const dist2 = dx * dx + dz * dz;
      let a = 0;
      if (dist2 < 1) {
        const t = Math.sqrt(dist2);
        const band = Math.min(SHADOW_BANDS - 1, Math.floor(t * SHADOW_BANDS));
        a = SHADOW_BAND_ALPHA[band] ?? 0;
      }
      const i = (y * w + x) * 4;
      px[i + 3] = a;
    }
  }
  c.putImageData(img, 0, 0);

  if (!_shadowStampCache.has(key)) {
    _shadowStampOrder.push(key);
    if (_shadowStampOrder.length > SHADOW_STAMP_MAX) {
      _shadowStampCache.delete(_shadowStampOrder.shift());
    }
  }
  _shadowStampCache.set(key, canvas);
  return canvas;
}

/** Soft ellipse shadow drawn on the tile pixel grid — crisp pixels, no vector blur. */
export function drawPixelEllipseShadow(ctx, cx, cy, rx, ry, tilePx) {
  const step = Math.max(1, tilePx >> 4);
  const srx = Math.max(step * 3, Math.round(rx / step) * step);
  const sry = Math.max(step * 2, Math.round(ry / step) * step);
  const sx = snapScreenAxis(cx, tilePx);
  const sy = snapScreenAxis(cy, tilePx);
  const stamp = _getShadowStamp(srx, sry);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stamp, sx - srx, sy - sry);
  ctx.imageSmoothingEnabled = prev;
}
