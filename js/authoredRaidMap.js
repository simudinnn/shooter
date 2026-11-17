import { moveColliderOverlapsRect } from './buildingGen.js';
import { World, TILE } from './world.js';
import { CHUNK_TILES, generateChunk } from './worldGen.js';
import { WEAPONS, MELEE_WEAPONS } from './player.js';
import { AMMO_TYPE_KEYS } from './ammo.js';
import { MATERIAL_KEYS } from './materials.js';
import { EQUIPMENT_ITEM_KEYS } from './equipment.js';
import { CONSUMABLE_KEYS } from './consumables.js';
import { THROWABLE_KEYS } from './throwables.js';
import { getItemIconSrc } from './loot.js';
import { OPEN_DOOR_ART_W } from './buildings.js';

export const FLOOR_GRASS_OVERLAP = 2;
export const MAP_FOG_TILES = 7;
export const MAP_PLANES = 3;
export const PLAYER_SPAWN_ASSET = 'marker:player-spawn';
export const FLOOR_GRASS_ASSET = 'assets/world/floor_grass.png';
export const isOverlappingFloorGrass = (asset) => asset === FLOOR_GRASS_ASSET;

const hatchAsset = 'assets/world/hatch_closed.png';
const sideWall = 'assets/buildings/walls/wall_ew.png';
const lootByAsset = new Map();
for (const [kind, keys] of [
  ['weapon', Object.keys(WEAPONS)], ['melee', Object.keys(MELEE_WEAPONS)],
  ['ammo', AMMO_TYPE_KEYS], ['material', MATERIAL_KEYS], ['equipment', EQUIPMENT_ITEM_KEYS],
  ['consumable', CONSUMABLE_KEYS], ['throwable', THROWABLE_KEYS],
]) {
  for (const key of keys) {
    const item = kind === 'ammo' ? { kind, ammoType: key } : { kind, key };
    const asset = getItemIconSrc(item);
    if (asset) lootByAsset.set(asset, item);
  }
}

export function mapPropYSort(entry) {
  return !/fol+iage.*(?:pebble|grass(?![^/]*tall))/i.test(entry.asset);
}

export function isRaidLootAsset(asset) { return lootByAsset.has(asset); }

export function mapAssetPath(asset) { return asset.split('#')[0]; }

export function mapBrushes(asset) {
  if (/\/walls\/wall_ew\.png$/i.test(asset)) return [asset + '#west', asset + '#east'];
  return [asset];
}

export function mapWallEastEdge(asset, westFloor, eastFloor) {
  return /\/wall_ew\.png$/i.test(asset)
    && westFloor?.includes('/buildings/floor/') && !eastFloor?.includes('/buildings/floor/');
}

function doorMatch(asset) {
  return asset.match(/^(.*\/doors\/)(open|closed)_(.+\.png)$/i);
}

export function mapPropLayout(asset, eastEdge = false) {
  const [path, brush] = asset.split('#');
  const door = doorMatch(path);
  if (door) {
    const width = door[2].toLowerCase() === 'open' ? OPEN_DOOR_ART_W : 16;
    return { x: 16 - width, y: 0, width, height: 16 };
  }
  if (brush === 'east' || brush === 'west' || /\/wall_ew\.png$/i.test(path)) {
    return { x: (brush ? brush === 'east' : eastEdge) ? 12 : 0, y: 0, width: 4, height: 16 };
  }
  if (path === hatchAsset) return { x: -8, y: -8, width: 32, height: 32 };
  if (/fol+iage.*tree/i.test(path)) return { x: -24, y: -48, width: 64, height: 64 };
  return null;
}

export function mapCornerLayout(asset) {
  const brush = asset.split('#')[1];
  return brush?.startsWith('corner-') ? { x: brush === 'corner-east' ? 12 : 0, y: 0, width: 4, height: 16, asset: sideWall } : null;
}

export function isMapLayerAsset(layer, asset) {
  if (asset === PLAYER_SPAWN_ASSET) return layer === 'props';
  if (typeof asset !== 'string') return false;
  const [path, brush, extra] = asset.split('#');
  if (extra !== undefined || !/^assets\/(?:[\w -]+\/)+[\w .-]+\.png$/i.test(path)) return false;
  if (brush && (layer !== 'props' || !mapBrushes(path).includes(asset) && !(/^corner-(east|west)$/.test(brush) && /\/walls\//i.test(path)))) return false;
  if (layer === 'tiles') return /^assets\/(world\/floor|buildings\/floor\/)/i.test(path);
  if (layer === 'loot') return /^assets\/items\//i.test(path);
  return /^assets\/(?:world\/(?:fol+iage|hatch_closed\.png$)|buildings\/(?:walls|windows|doors|misc|chests|fol+iage)\/)/i.test(path);
}

export function parseRaidMap(data) {
  const size = (n) => Number.isInteger(n) && n >= 1 && n <= 256;
  if (data?.version !== 1 || data.tileSize !== 16 || !size(data.width) || !size(data.height)) {
    throw new Error('Expected a version 1 map from the map editor.');
  }
  const warnings = new Set();
  const layers = {};
  for (const layer of ['tiles', 'props', 'loot']) {
    const entries = data.layers?.[layer];
    if (!Array.isArray(entries) || entries.length > data.width * data.height * MAP_PLANES) throw new Error('Invalid map layer: ' + layer);
    const cells = new Set();
    layers[layer] = [];
    for (const entry of entries) {
      if (entry == null) continue;
      const { x, y, asset, quantity, plane = 0, offsetX = 0, offsetY = 0, collision, ySort } = entry;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= data.width || y >= data.height
        || !Number.isInteger(plane) || plane < 0 || plane >= (layer === 'loot' ? 1 : MAP_PLANES)
        || !isMapLayerAsset(layer, asset)) throw new Error('Invalid position or sprite in ' + layer + ': ' + asset);
      const cell = plane * data.width * data.height + y * data.width + x;
      if (cells.has(cell)) throw new Error('Duplicate cell in ' + layer);
      cells.add(cell);
      if (layer === 'props') {
        const validOffset = (value) => Number.isInteger(value) && value >= -8 && value <= 7;
        if (!validOffset(offsetX) || !validOffset(offsetY)
          || [collision, ySort].some((value) => value !== undefined && typeof value !== 'boolean')) {
          throw new Error('Invalid prop settings: ' + asset);
        }
        layers.props.push({ x, y, asset, plane, offsetX, offsetY, collision, ySort });
      } else if (layer === 'tiles') layers.tiles.push({ x, y, asset, plane });
      else if (!isRaidLootAsset(asset)) warnings.add('unsupported loot ' + asset.split('/').at(-1));
      else {
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('Invalid loot quantity.');
        layers.loot.push({ x, y, asset, item: { ...lootByAsset.get(asset), amount: quantity } });
      }
    }
  }
  return { width: data.width, height: data.height, layers, warnings };
}

function loadImage(asset) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = new URL('../' + asset, import.meta.url).href;
  });
}

function point({ x, y, offsetX = 0, offsetY = 0 }) {
  return { x: (x + 0.5 + offsetX / 16) * TILE, z: (y + 0.5 + offsetY / 16) * TILE };
}

export class AuthoredRaidWorld extends World {
  constructor(map, { bakeShadows = false } = {}) {
    super();
    this.raidMap = map;
    this.bakeShadows = bakeShadows;
    this.bounds = { minX: 0, minZ: 0, maxX: map.width * TILE, maxZ: map.height * TILE };
    this.mapProps = [];
    this.mapPropChunks = new Map();
    this.mapLightRevision = 0;
    this.mapChests = [];
    this.mapHatches = [];
    this.mapDoors = [];
    this.mapPlayerSpawns = [];
    this.mapWallObstacles = [];
    this.mapSideWalls = [];
    this.mapDecorCasters = [];
    this.mapTreeCasters = [];
    this.mapGround = new Map();
  }

  async build() {
    const { tiles, props } = this.raidMap.layers;
    const dirt = 'assets/world/floor_dirt.png';
    const assets = new Set([dirt, ...tiles.map(({ asset }) => asset)]);
    for (const { asset } of props) {
      if (asset === hatchAsset || asset === PLAYER_SPAWN_ASSET) continue;
      const path = mapAssetPath(asset);
      assets.add(path);
      if (mapCornerLayout(asset)) assets.add(sideWall);
      const door = doorMatch(path);
      if (door) assets.add(door[1] + (door[2].toLowerCase() === 'open' ? 'closed_' : 'open_') + door[3]);
    }
    const images = new Map(await Promise.all([...assets].map(async (asset) => [asset, await loadImage(asset)])));
    for (const [asset, image] of images) {
      if (!image) this.raidMap.warnings.add('missing ' + asset.split('/').at(-1));
    }
    const floor = images.get(dirt);
    const { width, height } = this.raidMap;
    for (let y = 0; y < height; y += CHUNK_TILES) {
      for (let x = 0; x < width; x += CHUNK_TILES) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(CHUNK_TILES, width - x) * 16;
        canvas.height = Math.min(CHUNK_TILES, height - y) * 16;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        if (floor) {
          for (let py = 0; py < canvas.height; py += 16) {
            for (let px = 0; px < canvas.width; px += 16) ctx.drawImage(floor, px, py, 16, 16);
          }
        }
        this.mapGround.set(this._chunkKey(x / CHUNK_TILES, y / CHUNK_TILES), { canvas, ctx });
      }
    }
    const floors = new Map();
    const orderedTiles = [...tiles].sort((a, b) => a.plane - b.plane
      || Number(isOverlappingFloorGrass(a.asset)) - Number(isOverlappingFloorGrass(b.asset)));
    for (const { x, y, asset } of orderedTiles) {
      const image = images.get(asset);
      if (!image) continue;
      floors.set(x + ',' + y, asset);
      const pad = isOverlappingFloorGrass(asset) ? FLOOR_GRASS_OVERLAP : 0;
      const left = x * 16 - pad;
      const top = y * 16 - pad;
      const size = 16 + pad * 2;
      const span = CHUNK_TILES * 16;
      for (let cz = Math.floor(top / span); cz <= Math.floor((top + size - 1) / span); cz++) {
        for (let cx = Math.floor(left / span); cx <= Math.floor((left + size - 1) / span); cx++) {
          this.mapGround.get(this._chunkKey(cx, cz))?.ctx.drawImage(image, left - cx * span, top - cz * span, size, size);
        }
      }
    }
    for (const entry of [...props].sort((a, b) => a.plane - b.plane)) {
      const { x, y, asset } = entry;
      this.addMapProp(entry, images, mapWallEastEdge(asset, floors.get((x - 1) + ',' + y), floors.get((x + 1) + ',' + y)));
    }
    if (this.bakeShadows) this._bakeGroundShadows();
  }

  _bakeGroundShadows() {
    const alphaByImage = new WeakMap();
    const span = CHUNK_TILES * 16;
    const scale = 16 / TILE;
    const stamp = (target, image, left, foot, width, height, compression, sideWall = false) => {
      if (!image) return;
      let source = alphaByImage.get(image);
      if (!source) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
        let bottom = image.height - 1;
        while (bottom >= 0 && !rgba.subarray(bottom * image.width * 4, (bottom + 1) * image.width * 4)
          .some((value, i) => i % 4 === 3 && value > 0)) bottom--;
        source = { rgba, bottom };
        alphaByImage.set(image, source);
      }
      const { rgba, bottom } = source;
      if (bottom < 0) return;
      const depth = sideWall ? height : Math.max(1, Math.round((bottom + 1) * height / image.height * compression));
      const ground = foot - height + Math.ceil((bottom + 1) * height / image.height) - 1;
      for (let row = 0; row < depth; row++) {
        const y = Math.round(sideWall ? foot - height : ground) + row;
        const cz = Math.floor(y / span);
        const localY = y - cz * span;
        const sourceY = sideWall ? Math.floor(row * image.height / height)
          : bottom - Math.floor(row * (bottom + 1) / depth);
        let edge = image.width - 1;
        if (sideWall) {
          while (edge >= 0 && rgba[(sourceY * image.width + edge) * 4 + 3] < 32) edge--;
          if (edge < 0) continue;
        }
        const projectedWidth = sideWall ? 6 : width;
        const rowX = Math.round(left + (sideWall ? Math.floor(edge * width / image.width) : row * 0.75));
        for (let col = 0; col < projectedWidth; col++) {
          const sourceX = sideWall ? edge : Math.floor(col * image.width / width);
          const alpha = rgba[(sourceY * image.width + sourceX) * 4 + 3];
          if (!alpha) continue;
          const x = rowX + col;
          const cx = Math.floor(x / span);
          const key = this._chunkKey(cx, cz);
          const chunk = this.mapGround.get(key);
          if (!chunk || localY >= chunk.canvas.height) continue;
          const localX = x - cx * span;
          if (localX >= chunk.canvas.width) continue;
          let pixels = target.get(key);
          if (!pixels) {
            pixels = new Uint8Array(chunk.canvas.width * chunk.canvas.height);
            target.set(key, pixels);
          }
          const index = localY * chunk.canvas.width + localX;
          pixels[index] = 255;
        }
      }
    };
    const staticMasks = new Map();
    const stampProp = (target, prop, art = prop) => {
      const { image, layout } = art;
      const size = prop.wall ? 16 / Math.max(image.width, image.height) : 1;
      const width = layout?.width ?? Math.round(image.width * size);
      const height = layout?.height ?? Math.round(image.height * size);
      const left = prop.x * scale + (layout ? layout.x - 8 : -width / 2);
      const barrel = /\/barrel[^/]*\.png$/i.test(prop.asset);
      const compression = prop.tree ? 0.62 : prop.wall ? 0.49 : barrel ? 0.33 : 0.46;
      stamp(target, image, left, prop.z * scale + 8, width, height, compression, prop.wall && layout?.width === 4);
    };
    for (const prop of this.mapProps) {
      if (prop.ySort === false) continue;
      if (prop.openArt) {
        const open = new Map();
        const closed = new Map();
        stampProp(open, prop, prop.openArt);
        stampProp(closed, prop, prop.closedArt);
        prop.shadowStates = { open, closed, keys: new Set([...open.keys(), ...closed.keys()]) };
        for (const key of prop.shadowStates.keys) {
          const chunk = this.mapGround.get(key);
          if (!chunk.shadowDoors) {
            chunk.shadowDoors = [];
            chunk.cleanGround = document.createElement('canvas');
            chunk.cleanGround.width = chunk.canvas.width;
            chunk.cleanGround.height = chunk.canvas.height;
            chunk.cleanGround.getContext('2d').drawImage(chunk.canvas, 0, 0);
          }
          chunk.shadowDoors.push(prop);
        }
      } else {
        stampProp(staticMasks, prop);
        if (prop.corner) {
          const { image, x, width, height } = prop.corner;
          stamp(staticMasks, image, prop.x * scale - 8 + x, prop.z * scale + 8, width, height, 0.5, true);
        }
      }
    }
    for (const chest of this.mapChests) {
      stamp(staticMasks, chest.image, chest.x * scale - 8, chest.z * scale + chest.spriteHeight - 8,
        chest.spriteWidth, chest.spriteHeight, 0.4);
    }
    for (const [key, chunk] of this.mapGround) {
      chunk.staticShadow = staticMasks.get(key);
      if (chunk.staticShadow || chunk.shadowDoors) this._composeShadowChunk(key, chunk);
    }
  }

  _composeShadowChunk(key, chunk) {
    const { canvas, ctx } = chunk;
    if (chunk.cleanGround) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(chunk.cleanGround, 0, 0);
    }
    const pixels = chunk.staticShadow?.slice() ?? new Uint8Array(canvas.width * canvas.height);
    for (const door of chunk.shadowDoors ?? []) {
      const mask = door.shadowStates[door.doorOpen ? 'open' : 'closed'].get(key);
      if (!mask) continue;
      for (let i = 0; i < pixels.length; i++) pixels[i] = Math.max(pixels[i], mask[i]);
    }
    chunk.shadowPixels = pixels;
    const maskCanvas = chunk.shadowCoverage ??= document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    const output = maskCtx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < pixels.length; i++) output.data[i * 4 + 3] = pixels[i];
    maskCtx.putImageData(output, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.restore();
  }

  isInBakedShadow(x, z) {
    const span = CHUNK_TILES * TILE;
    const cx = Math.floor(x / span);
    const cz = Math.floor(z / span);
    const chunk = this.mapGround.get(this._chunkKey(cx, cz));
    if (!chunk?.shadowPixels) return false;
    const px = Math.floor((x - cx * span) * 16 / TILE);
    const py = Math.floor((z - cz * span) * 16 / TILE);
    return px < chunk.canvas.width && py < chunk.canvas.height
      && chunk.shadowPixels[py * chunk.canvas.width + px] > 0;
  }

  toggleMapDoor(door, occupants) {
    const mat = { minX: door.x - TILE / 2, maxX: door.x + TILE / 2,
      minZ: door.z + TILE / 4, maxZ: door.z + TILE / 2 };
    if (occupants.some((entity) => moveColliderOverlapsRect(entity, mat))) return false;
    if (door.collision) {
      if (door.doorOpen) this.addDynamicObstacle(door.obstacle);
      else this.removeDynamicObstacle(door.obstacle);
    }
    door.doorOpen = !door.doorOpen;
    this.mapLightRevision++;
    const art = door.doorOpen ? door.openArt : door.closedArt;
    door.image = art.image;
    door.layout = art.layout;
    for (const key of door.shadowStates?.keys ?? []) this._composeShadowChunk(key, this.mapGround.get(key));
    return true;
  }

  addMapProp(entry, images, eastEdge) {
    const { asset } = entry;
    const position = point(entry);
    if (asset === PLAYER_SPAWN_ASSET) {
      this.mapPlayerSpawns.push(entry);
      return;
    }
    if (asset === hatchAsset) {
      this.mapHatches.push({ ...position, state: 'closed', remaining: 0 });
      return;
    }
    const path = mapAssetPath(asset);
    const image = images.get(path);
    if (!image) return;
    if (path.includes('/chests/')) {
      const variant = 'chest_' + path.split('/').at(-1).slice(0, -4);
      if (['chest_wood', 'chest_metal', 'chest_rust', 'chest_moss'].includes(variant)) {
        this.mapChests.push({ ...position, image, variant, spriteWidth: image.width, spriteHeight: image.height, collision: entry.collision, ySort: mapPropYSort(entry), plane: entry.plane });
        return;
      }
    }
    const layout = mapPropLayout(asset, eastEdge);
    const corner = mapCornerLayout(asset);
    const door = doorMatch(path);
    const tree = /fol+iage.*tree/i.test(path);
    const wall = /\/(walls|windows)\//i.test(path) || !!door;
    const collision = entry.collision ?? (tree || !(/fol+iage/i.test(path) && !/rock/i.test(path)
      || /\/doors\//i.test(path) && !door));
    const prop = { ...position, image, asset, layout, tree, wall, plane: entry.plane, collision, ySort: mapPropYSort(entry) };
    this.mapProps.push(prop);
    const span = CHUNK_TILES * TILE;
    const key = this._chunkKey(Math.floor(prop.x / span), Math.floor(prop.z / span));
    let bucket = this.mapPropChunks.get(key);
    if (!bucket) this.mapPropChunks.set(key, bucket = []);
    bucket.push(prop);
    if (tree && collision) {
      prop._obstacle = { kind: 'circle', x: position.x, z: position.z + TILE * 0.2, radius: 1 };
      this.addDynamicObstacle(prop._obstacle);
      this.mapTreeCasters.push(prop);
      return;
    }

    const vertical = wall && layout?.width === 4;
    const horizontal = wall && !vertical;
    const window = /\/windows\//i.test(path);
    const pixel = TILE / 16;
    const obstacle = {
      kind: 'aabb',
      x: position.x + (vertical ? (layout.x + 2 - 8) * TILE / 16 : 0),
      z: position.z + (horizontal ? TILE * 0.375 : wall ? 0 : TILE / 2 - image.height * pixel / 4),
      halfW: vertical ? TILE / 8 : wall ? TILE / 2 : image.width * pixel / 2,
      halfH: horizontal ? TILE / 8 : wall ? TILE / 2 : image.height * pixel / 4,
      blocksBullets: !window, blocksVision: !window,
    };
    if (vertical && collision) this.mapSideWalls.push(obstacle);
    if (window && horizontal && collision) {
      for (const side of [-1, 1]) {
        const jamb = { ...obstacle, x: position.x + side * TILE * 13 / 32,
          halfW: TILE * 3 / 32, blocksVision: true, blocksBullets: true };
        this.addDynamicObstacle(jamb);
        this.mapWallObstacles.push(jamb);
      }
    }
    if (corner) {
      prop.corner = { ...corner, image: images.get(corner.asset) ?? image };
      const edge = { ...obstacle, x: position.x + (corner.x + 2 - 8) * TILE / 16,
        z: position.z, halfW: TILE / 8, halfH: TILE / 2 };
      if (collision) {
        this.addDynamicObstacle(edge);
        this.mapWallObstacles.push(edge);
        this.mapSideWalls.push(edge);
      }
    }
    if (door) {
      prop.doorOpen = door[2].toLowerCase() === 'open';
      prop.obstacle = obstacle;
      const art = (state) => {
        const pathForState = door[1] + state + '_' + door[3];
        return { image: images.get(pathForState) ?? image, layout: mapPropLayout(pathForState) };
      };
      prop.openArt = art('open');
      prop.closedArt = art('closed');
      this.mapDoors.push(prop);
      if (!collision) return;
      for (const side of [-1, 1]) {
        const jamb = { ...obstacle, x: position.x + side * TILE * 13 / 32, halfW: TILE * 3 / 32 };
        this.addDynamicObstacle(jamb);
        this.mapWallObstacles.push(jamb);
      }
      if (!prop.doorOpen) this.addDynamicObstacle(obstacle);
      return;
    }
    if (!collision) return;
    this.addDynamicObstacle(obstacle);
    if (wall) this.mapWallObstacles.push(obstacle);
    else {
      prop.obstacle = obstacle;
      this.mapDecorCasters.push(prop);
    }
  }

  *mapPropsInView(view, pad) {
    const span = CHUNK_TILES * TILE;
    for (let z = Math.floor((view.minZ - pad) / span); z <= Math.floor((view.maxZ + pad) / span); z++) {
      for (let x = Math.floor((view.minX - pad) / span); x <= Math.floor((view.maxX + pad) / span); x++) {
        const bucket = this.mapPropChunks.get(this._chunkKey(x, z));
        if (bucket) yield* bucket;
      }
    }
  }

  getGunClipBounds(x, feetZ, reachZ = feetZ) {
    let minX = -Infinity;
    let maxX = Infinity;
    for (const wall of this.mapSideWalls) {
      if (Math.max(feetZ, reachZ) < wall.z - wall.halfH || Math.min(feetZ, reachZ) > wall.z + wall.halfH) continue;
      if (wall.x < x) minX = Math.max(minX, wall.x + wall.halfW);
      else maxX = Math.min(maxX, wall.x - wall.halfW);
    }
    return Number.isFinite(minX) || Number.isFinite(maxX)
      ? { minX: Number.isFinite(minX) ? minX : -10000,
        maxX: Number.isFinite(maxX) ? maxX : 10000, clipXOnly: true }
      : null;
  }

  isFoliageReadyAround() { return true; }

  _touchChunk(cx, cz) {
    const key = this._chunkKey(cx, cz);
    if (!this.mapGround.has(key)) return this._outOfBoundsChunk(cx, cz);
    if (!this.chunks.has(key)) {
      const chunk = generateChunk(cx, cz);
      chunk.foliagePopulated = true;
      chunk.buildingsSpawned = true;
      chunk.chestsSpawned = true;
      this.chunks.set(key, chunk);
    }
    return this.chunks.get(key);
  }

  _clampPos(x, z) {
    return { x: Math.max(0.5, Math.min(this.bounds.maxX - 0.5, x)),
      z: Math.max(0.5, Math.min(this.bounds.maxZ - 0.5, z)) };
  }

  eraseBakedShadowOverlap(ctx, view, project, pixelScale) {
    const span = CHUNK_TILES * TILE;
    for (let z = Math.floor(view.minZ / span); z <= Math.floor(view.maxZ / span); z++) {
      for (let x = Math.floor(view.minX / span); x <= Math.floor(view.maxX / span); x++) {
        const mask = this.mapGround.get(this._chunkKey(x, z))?.shadowCoverage;
        if (!mask) continue;
        const point = project(x * span, z * span);
        ctx.drawImage(mask, Math.round(point.x), Math.round(point.y), mask.width * pixelScale, mask.height * pixelScale);
      }
    }
  }

  drawGroundLayer(ctx, camTx, camTy, halfW, halfH, ppu, sprites, camX, camZ) {
    const span = CHUNK_TILES * TILE;
    const scale = TILE * ppu / 16;
    const pad = FLOOR_GRASS_OVERLAP * TILE / 16;
    const minX = Math.max(0, Math.floor((camX - halfW - pad) / span));
    const minZ = Math.max(0, Math.floor((camZ - halfH - pad) / span));
    const maxX = Math.min(Math.ceil(this.raidMap.width / CHUNK_TILES) - 1, Math.floor((camX + halfW + pad) / span));
    const maxZ = Math.min(Math.ceil(this.raidMap.height / CHUNK_TILES) - 1, Math.floor((camZ + halfH + pad) / span));
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const { canvas } = this.mapGround.get(this._chunkKey(x, z));
        ctx.drawImage(canvas, Math.round(camTx + x * span * ppu),
          Math.round(camTy + z * span * ppu), canvas.width * scale, canvas.height * scale);
      }
    }
  }

  _reachableCells(start) {
    const { width, height } = this.raidMap;
    const visited = new Uint8Array(width * height);
    const queue = [start];
    visited[start.y * width + start.x] = 1;
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      const origin = point(cell);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) continue;
        const index = next.y * width + next.x;
        if (visited[index]) continue;
        const end = point(next);
        if (this.checkCollision(end.x, end.z, 1)
          || this.checkCollision((origin.x + end.x) / 2, (origin.z + end.z) / 2, 1)) continue;
        visited[index] = 1;
        queue.push(next);
      }
    }
    return queue;
  }

  getPlayerSpawn() {
    const { width, height } = this.raidMap;
    const closedDoors = this.mapDoors.filter((door) => door.collision && !door.doorOpen);
    for (const door of closedDoors) this.removeDynamicObstacle(door.obstacle);
    try {
      const choices = this.mapPlayerSpawns.filter((cell) => {
        const p = point(cell);
        return !this.checkCollision(p.x, p.z, 1.4);
      });
      const marked = choices[Math.floor(Math.random() * choices.length)];
      const firstHatch = this.mapHatches[0];
      if (marked) {
        const reachable = this._reachableCells(marked);
        const reachableKeys = new Set(reachable.map(({ x, y }) => y * width + x));
        const hatches = this.mapHatches.filter(({ x, z }) =>
          reachableKeys.has(Math.floor(z / TILE) * width + Math.floor(x / TILE)));
        if (hatches.length) this.mapHatches = hatches;
        else {
          const farthest = reachable.reduce((best, cell) => {
            const distance = (p) => (p.x - marked.x) ** 2 + (p.y - marked.y) ** 2;
            return distance(cell) > distance(best) ? cell : best;
          }, marked);
          if (farthest === marked) throw new Error('Leave a clear route from the player spawn.');
          this.mapHatches = [{ ...point(farthest), state: 'closed', remaining: 0 }];
        }
        return point(marked);
      }
      let start = firstHatch ? { x: Math.floor(firstHatch.x / TILE), y: Math.floor(firstHatch.z / TILE) } : null;
      if (!start) {
        for (let y = height - 1; y >= 0 && !start; y--) {
          for (let x = width - 1; x >= 0; x--) {
            const candidate = point({ x, y });
            if (this.checkCollision(candidate.x, candidate.z, 1.4)) continue;
            start = { x, y };
            break;
          }
        }
      }
      if (!start) throw new Error('The map has no clear spawn or hatch tile.');
      let spawn = null;
      let farthest = 0;
      for (const cell of this._reachableCells(start)) {
        const distance = (cell.x - start.x) ** 2 + (cell.y - start.y) ** 2;
        if (distance <= farthest) continue;
        const candidate = point(cell);
        if (this.checkCollision(candidate.x, candidate.z, 1.4)) continue;
        spawn = candidate;
        farthest = distance;
      }
      if (!spawn) throw new Error('Leave a clear route from the hatch to a player spawn.');
      if (!firstHatch) this.mapHatches.push({ ...point(start), state: 'closed', remaining: 0 });
      return spawn;
    } finally {
      for (const door of closedDoors) this.addDynamicObstacle(door.obstacle);
    }
  }
}
