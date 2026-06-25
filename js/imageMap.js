/** World units per image pixel (4px = 1 unit). */
export const PIXELS_PER_UNIT = 4;

export const MAP_IMAGE_PATH = 'assets/world/map.png';
export const MAP_COLLISION_PATH = 'assets/world/map_collision.png';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/** Red pixels block; blue (and everything else) is walkable. */
function isRedPixel(r, g, b) {
  return r >= 160 && r > g + 50 && r > b + 50;
}

export class ImageMap {
  constructor() {
    this.mapImage = null;
    this.collisionGrid = null;
    this.width = 0;
    this.height = 0;
    this.halfW = 0;
    this.halfH = 0;
    this.loaded = false;
  }

  async load() {
    const mapImage = await loadImage(MAP_IMAGE_PATH);
    const collisionImage = await loadImage(MAP_COLLISION_PATH);

    if (mapImage.width !== collisionImage.width || mapImage.height !== collisionImage.height) {
      throw new Error('map.png and map_collision.png must be the same size');
    }

    this.width = mapImage.width;
    this.height = mapImage.height;
    this.halfW = this.width / PIXELS_PER_UNIT / 2;
    this.halfH = this.height / PIXELS_PER_UNIT / 2;
    this.mapImage = mapImage;

    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(collisionImage, 0, 0);
    const pixels = ctx.getImageData(0, 0, this.width, this.height).data;

    this.collisionGrid = new Uint8Array(this.width * this.height);
    for (let i = 0; i < this.width * this.height; i++) {
      const o = i * 4;
      this.collisionGrid[i] = isRedPixel(pixels[o], pixels[o + 1], pixels[o + 2]) ? 1 : 0;
    }

    this.loaded = true;
  }

  worldToPixel(x, z) {
    const u = (x + this.halfW) / (this.halfW * 2);
    const v = (z + this.halfH) / (this.halfH * 2);
    return {
      px: Math.floor(u * this.width),
      py: Math.floor(v * this.height),
    };
  }

  pixelBlocked(px, py) {
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return true;
    return this.collisionGrid[py * this.width + px] === 1;
  }

  pointBlocked(x, z) {
    const { px, py } = this.worldToPixel(x, z);
    return this.pixelBlocked(px, py);
  }

  checkCollision(x, z, radius) {
    if (Math.abs(x) > this.halfW - radius || Math.abs(z) > this.halfH - radius) return true;
    if (this.pointBlocked(x, z)) return true;

    const samples = 8;
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const sx = x + Math.sin(a) * radius;
      const sz = z + Math.cos(a) * radius;
      if (this.pointBlocked(sx, sz)) return true;
    }
    return false;
  }

  segmentBlocked(x0, z0, x1, z1, radius = 0.15) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(2, Math.ceil(dist / 0.15));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (this.checkCollision(x, z, radius)) return true;
    }
    return false;
  }

  hasLineOfSight(x0, z0, x1, z1, radius = 0.25) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    if (dist < 0.5) return true;
    const steps = Math.max(4, Math.ceil(dist / 0.35));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (this.checkCollision(x, z, radius)) return false;
    }
    return true;
  }

  findWalkableNear(x, z, maxRadius = 8) {
    if (!this.checkCollision(x, z, 0.5)) return { x, z };
    for (let r = 1; r <= maxRadius; r += 0.5) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const nx = x + Math.sin(a) * r;
        const nz = z + Math.cos(a) * r;
        if (!this.checkCollision(nx, nz, 0.5)) return { x: nx, z: nz };
      }
    }
    return { x: 0, z: 0 };
  }

  draw(ctx, worldToScreen) {
    if (!this.loaded || !this.mapImage) return;
    const tl = worldToScreen(-this.halfW, -this.halfH);
    const br = worldToScreen(this.halfW, this.halfH);
    ctx.drawImage(this.mapImage, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  }
}

export async function tryLoadImageMap() {
  try {
    const map = new ImageMap();
    await map.load();
    return map;
  } catch {
    return null;
  }
}
