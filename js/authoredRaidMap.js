import { isTieredItem } from './containers.js';
import { materialSpritePath } from './materials.js';
import { canonicalAsset, canonicalGround, BASE_GRASS_ASSET, GRASS_OVERLAY_ASSET, floorTileLayout, drawFloorTile } from './assetPaths.js';
import { doorAccessError } from './doorAccess.js';
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
export const FLOOR_GRASS_ASSET = GRASS_OVERLAY_ASSET;
export const isOverlappingFloorGrass = (asset) => canonicalAsset(asset) === FLOOR_GRASS_ASSET;

const hatchAsset = 'assets/buildings/misc/hatch_closed.png';
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
    if (isTieredItem(item)) {
      lootByAsset.set(materialSpritePath(key), { ...item, tier: 1 });
      for (const tier of [1, 2, 3]) {
        const variant = { ...item, tier };
        lootByAsset.set(getItemIconSrc(variant), variant);
      }
    }
  }
}

export const isRoofAsset = (asset) => /\/buildings\/roof\//i.test(asset);

export const ROOF_ONLY_MARKER = 'marker:roof-only';
export const isMapOverlay = asset => /\/buildings\/(?:masks\/|foliage\/edge_grass)/i.test(asset);
export const isEdgeGrass = asset => /\/edge_grass[^/]*\.png$/i.test(asset);

export function mapLayerEntries(layers, layer) {
  if (layer === 'roofs') {
    return [...(layers.props ?? []).filter(entry => entry && isRoofAsset(entry.asset)), ...(layers.roofs ?? [])];
  }
  if (layer === 'props') return layers.props.filter(entry => !entry || !isRoofAsset(entry.asset));
  return layers[layer] ?? [];
}

export function mapPropYSort(entry) {
  return !isRoofAsset(entry.asset) && !isMapOverlay(entry.asset) && !/fol+iage.*(?:pebble|grass(?![^/]*tall))|\/doors\/mat_/i.test(entry.asset);
}

export function isRaidLootAsset(asset) { return lootByAsset.has(asset); }

export function mapAssetPath(asset) { return canonicalAsset(asset).split('#')[0]; }

export function mapBrushes(asset) {
  if (/\/doors\/closed_wood\.png$/i.test(asset)) return [asset,asset+'#locked'];
  if (/\/doors\/(?:closed|open)_keycard\.png$/i.test(asset)) return [asset,asset+'#tier1',asset+'#tier2',asset+'#tier3'];
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
  const [path, brush] = canonicalAsset(asset).split('#');
  const door = doorMatch(path);
  if (door) {
    const width = door[2].toLowerCase() === 'open' ? OPEN_DOOR_ART_W : 16;
    return { x: 16 - width, y: -4, width, height: 20 };
  }
  if (brush === 'east' || brush === 'west' || /\/wall_ew\.png$/i.test(path)) {
    return { x: (brush ? brush === 'east' : eastEdge) ? 12 : 0, y: -4, width: 4, height: 20 };
  }
  if (isRoofAsset(path)) return { x: 0, y: 0, width: 16, height: 16 };
  if (/\/buildings\/(walls|windows)\//i.test(path)) return { x: 0, y: -4, width: 16, height: 20 };
  if (path === hatchAsset) return { x: -8, y: -8, width: 32, height: 32 };
  if (/fol+iage.*tree/i.test(path)) return { x: -24, y: -48, width: 64, height: 64 };
  return null;
}

export function mapCornerLayout(asset) {
  const brush = asset.split('#')[1];
  return brush?.startsWith('corner-') ? { x: brush === 'corner-east' ? 12 : 0, y: 0, width: 4, height: 20, asset: sideWall } : null;
}

export function isMapLayerAsset(layer, asset) {
  asset=canonicalAsset(asset);
  if(layer==='indoor')return ['marker:indoor','marker:indoor-passive','marker:indoor-detection',ROOF_ONLY_MARKER].includes(asset);
  if (asset === PLAYER_SPAWN_ASSET) return layer === 'props';
  if (typeof asset !== 'string') return false;
  const [path, brush, extra] = asset.split('#');
  if (extra !== undefined || !/^assets\/(?:[\w -]+\/)+[\w .-]+\.png$/i.test(path)) return false;
  if (brush && (layer !== 'props' || !mapBrushes(path).includes(asset) && !(/^corner-(east|west)$/.test(brush) && /\/walls\//i.test(path)))) return false;
  if (layer === 'tiles') return /^assets\/(world\/floor|buildings\/floor\/)/i.test(path);
  if (layer === 'roofs') return isRoofAsset(path);
  if (layer === 'loot') return /^assets\/items\//i.test(path);
  return /^assets\/(?:world\/(?:fol+iage|hatch_closed\.png$)|buildings\/(?:walls|windows|doors|misc|chests|fences|masks|fol+iage)\/)/i.test(path);
}

export function parseRaidMap(data) {
  const size = (n) => Number.isInteger(n) && n >= 1 && n <= 256;
  if (data?.version !== 1 || data.tileSize !== 16 || !size(data.width) || !size(data.height)) {
    throw new Error('Expected a version 1 map from the map editor.');
  }
  const defaultGround = canonicalGround(data.defaultGround);
  if (!isMapLayerAsset('tiles', defaultGround)) throw new Error('Invalid default ground.');
  const warnings = new Set();
  const layers = {};
  for (const layer of ['tiles', 'props', 'loot', 'indoor', 'roofs']) {
    const entries = data.layers?.[layer] ?? (['indoor','roofs'].includes(layer)?[]:undefined);
    if (!Array.isArray(entries) || entries.length > data.width * data.height * MAP_PLANES) throw new Error('Invalid map layer: ' + layer);
    const cells = new Set();
    layers[layer] = [];
    for (const entry of mapLayerEntries(data.layers, layer)) {
      if (entry == null) continue;
      const { x, y, quantity, plane = 0, offsetX = 0, offsetY = 0, collision, ySort } = entry;
      const asset=canonicalAsset(entry.asset);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= data.width || y >= data.height
        || !Number.isInteger(plane) || plane < 0 || plane >= (layer === 'loot' ? 1 : MAP_PLANES)
        || !isMapLayerAsset(layer, asset)) throw new Error('Invalid position or sprite in ' + layer + ': ' + asset);
      const cell = plane * data.width * data.height + y * data.width + x;
      if (cells.has(cell)) throw new Error('Duplicate cell in ' + layer);
      cells.add(cell);
      if (layer === 'props' || layer === 'roofs') {
        const validOffset = (value) => Number.isInteger(value) && value >= -8 && value <= 7;
        if (!validOffset(offsetX) || !validOffset(offsetY)
          || [collision, ySort].some((value) => value !== undefined && typeof value !== 'boolean')) {
          throw new Error('Invalid prop settings: ' + asset);
        }
        layers[layer].push({ x, y, asset, plane, offsetX, offsetY, collision, ySort });
      } else if (layer === 'indoor') layers.indoor.push({x,y,asset,plane:0});
      else if (layer === 'tiles') layers.tiles.push({ x, y, asset, plane });
      else if (!isRaidLootAsset(asset)) warnings.add('unsupported loot ' + asset.split('/').at(-1));
      else {
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('Invalid loot quantity.');
        layers.loot.push({ x, y, asset, item: { ...lootByAsset.get(asset), amount: quantity } });
      }
    }
  }
  return { width: data.width, height: data.height, defaultGround, layers, warnings };
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
    const indoorEntries=map.layers.indoor instanceof Map?[...map.layers.indoor.values()]:(map.layers.indoor??[]);
    const cellIndex = ({ x, y }) => y * map.width + x;
    this.indoorCells = new Set(indoorEntries.filter(e => e.asset !== 'marker:indoor-passive' && e.asset !== ROOF_ONLY_MARKER).map(cellIndex));
    this.indoorShadeCells = new Set(indoorEntries.filter(e => e.asset !== 'marker:indoor-detection' && e.asset !== ROOF_ONLY_MARKER).map(cellIndex));
    this.roofOnlyCells = new Set(indoorEntries.filter(e => e.asset === ROOF_ONLY_MARKER).map(cellIndex));
    this.indoorRooms = new Map();
    for (const start of this.indoorCells) {
      if (this.indoorRooms.has(start)) continue;
      const queue = [start];
      this.indoorRooms.set(start, start);
      for (const cell of queue) {
        const column = cell % map.width;
        const neighbors = [cell - map.width, cell + map.width];
        if (column > 0) neighbors.push(cell - 1);
        if (column + 1 < map.width) neighbors.push(cell + 1);
        for (const next of neighbors) {
          if (!this.indoorCells.has(next) || this.indoorRooms.has(next)) continue;
          this.indoorRooms.set(next, start);
          queue.push(next);
        }
      }
    }
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
    this.floorOverlapPixels=0;
  }

  async build() {
    const { tiles, props, roofs = [] } = this.raidMap.layers;
    const objects = [...props, ...roofs];
    const dirt = this.raidMap.defaultGround;
    const assets = new Set([dirt, ...tiles.map(({ asset }) => asset)]);
    for (const { asset } of objects) {
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
            for (let px = 0; px < canvas.width; px += 16) drawFloorTile(ctx,floor,dirt,px,py);
          }
        }
        this.mapGround.set(this._chunkKey(x / CHUNK_TILES, y / CHUNK_TILES), { canvas, ctx });
      }
    }
    const floors = new Map();
    const orderedTiles = [...tiles].sort((a, b) => a.plane - b.plane
      || Number(floorTileLayout(images.get(a.asset)||{},a.asset).width>16||floorTileLayout(images.get(a.asset)||{},a.asset).height>16)-Number(floorTileLayout(images.get(b.asset)||{},b.asset).width>16||floorTileLayout(images.get(b.asset)||{},b.asset).height>16));
    for (const { x, y, asset } of orderedTiles) {
      const image = images.get(asset);
      if (!image) continue;
      floors.set(x + ',' + y, asset);
      const tile=floorTileLayout(image,asset);
      this.floorOverlapPixels=Math.max(this.floorOverlapPixels,-tile.x,-tile.y);
      const left=x*16+tile.x,top=y*16+tile.y;
      const span = CHUNK_TILES * 16;
      for (let cz = Math.floor(top / span); cz <= Math.ceil((top + tile.height) / span)-1; cz++) {
        for (let cx = Math.floor(left / span); cx <= Math.ceil((left + tile.width) / span)-1; cx++) {
          this.mapGround.get(this._chunkKey(cx, cz))?.ctx.drawImage(image,tile.sx,tile.sy,tile.sw,tile.sh,left-cx*span,top-cz*span,tile.width,tile.height);
        }
      }
    }
    for (const entry of objects.sort((a, b) => a.plane - b.plane)) {
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
      const ground = foot - height + Math.ceil((bottom + 1) * height / image.height) - 1;
      const put = (x, y) => {
        const cx = Math.floor(x / span);
        const cz = Math.floor(y / span);
        const key = this._chunkKey(cx, cz);
        const chunk = this.mapGround.get(key);
        if (!chunk) return;
        const localX = x - cx * span;
        const localY = y - cz * span;
        if (localX >= chunk.canvas.width || localY >= chunk.canvas.height) return;
        let pixels = target.get(key);
        if (!pixels) {
          pixels = new Uint8Array(chunk.canvas.width * chunk.canvas.height);
          target.set(key, pixels);
        }
        pixels[localY * chunk.canvas.width + localX] = 255;
      };
      if (sideWall) {
        // A side wall extends along the ground. Sweep its PNG along the same sun ray as the front wall.
        const depth = Math.max(1, Math.round(16 * compression));
        for (let row = 0; row < height; row++) {
          const sy = Math.floor(row * image.height / height);
          for (let col = 0; col < width; col++) {
            const sx = Math.floor(col * image.width / width);
            if (rgba[(sy * image.width + sx) * 4 + 3] < 32) continue;
            for (let distance = 0; distance <= depth; distance++) {
              put(Math.round(left + col + distance * 0.75), Math.round(foot - height + row + distance));
            }
          }
        }
      } else {
        // Forward-project every opaque sprite pixel so thin details survive the flattening.
        const stretchX = width / image.width;
        const stretchY = height / image.height;
        for (let sy = 0; sy <= bottom; sy++) {
          const distance = (bottom - sy) * stretchY * compression;
          const y = Math.round(ground + distance);
          for (let sx = 0; sx < image.width; sx++) {
            if (rgba[(sy * image.width + sx) * 4 + 3] < 32) continue;
            const x = Math.round(left + sx * stretchX + distance * 0.75);
            for (let dy = 0; dy < Math.max(1, Math.ceil(stretchY * compression)); dy++) {
              for (let dx = 0; dx < Math.max(1, Math.ceil(stretchX)); dx++) put(x + dx, y + dy);
            }
          }
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
      const compression = prop.tree ? 0.62 : prop.wall ? 0.49 : 0.62;
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

  indoorRoomAt(x, z) {
    if (!this.isIndoorAt(x, z)) return undefined;
    return this.indoorRooms.get(Math.floor(z / TILE) * this.raidMap.width + Math.floor(x / TILE));
  }

  roofOnlyAt(x, z) {
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    if (tx < 0 || tx >= this.raidMap.width || ty < 0 || ty >= this.raidMap.height) return undefined;
    const cell = ty * this.raidMap.width + tx;
    if (this.roofOnlyCells.has(cell)) return 'roof:' + cell;
  }

  roofRoomAt(x, z) {
    const room = this.indoorRoomAt(x, z);
    if (room !== undefined) return room;
    for (const [dx, dz] of [[0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const adjacent = this.indoorRoomAt(x + dx * TILE, z + dz * TILE);
      if (adjacent !== undefined) return adjacent;
    }
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
        const adjacent = this.indoorRoomAt(x + dx * TILE, z + dz * TILE);
        if (adjacent !== undefined) return adjacent;
      }
    }
  }

  isIndoorAt(x,z) {
    const tx=Math.floor(x/TILE),ty=Math.floor(z/TILE);
    return tx>=0&&ty>=0&&tx<this.raidMap.width&&ty<this.raidMap.height&&this.indoorCells.has(ty*this.raidMap.width+tx);
  }

  toggleMapDoor(door, occupants = [], actor = null) {
    if(door.permanentOpen)return false;
    if(doorAccessError(door,actor))return false;
    const mat = { minX: door.x - TILE / 2, maxX: door.x + TILE / 2,
      minZ: door.z + TILE / 4, maxZ: door.z + TILE / 2 };
    if (door.doorOpen && door.collision && door.obstacle) {
      const { x, z, halfW, halfH } = door.obstacle;
      const margin = TILE / 16;
      mat.minX = Math.min(mat.minX, x - halfW - margin);
      mat.maxX = Math.max(mat.maxX, x + halfW + margin);
      mat.minZ = Math.min(mat.minZ, z - halfH - margin);
      mat.maxZ = Math.max(mat.maxZ, z + halfH + margin);
    }
    if (occupants.some((entity) => moveColliderOverlapsRect(entity, mat))) return false;
    if (door.collision) {
      if (door.doorOpen) this.addDynamicObstacle(door.obstacle);
      else this.removeDynamicObstacle(door.obstacle);
    }
    if(door.lockType&&!door.unlocked){
      const index=actor?._doorCredentialIndex,item=actor?.itemSlots?.[index];
      if(!item)return false;
      actor.itemSlots[index]=(item.amount??1)>1?{...item,amount:item.amount-1}:null;
      door.permanentOpen=true;
    }
    door.unlocked=true;
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
      if (['chest_wood', 'chest_metal', 'chest_rust', 'chest_moss','chest_crate','chest_millitary','chest_military'].includes(variant)) {
        this.mapChests.push({ ...position, image, variant, spriteWidth: image.width, spriteHeight: image.height, collision: entry.collision, ySort: mapPropYSort(entry), plane: entry.plane });
        return;
      }
    }
    const layout = mapPropLayout(asset, eastEdge);
    const corner = mapCornerLayout(asset);
    const door = doorMatch(path);
    const tree = /fol+iage.*tree/i.test(path);
    const fence=/\/fences\//i.test(path);
    const wall = /\/(walls|windows)\//i.test(path) || !!door || fence;
    const collision = entry.collision ?? (tree || !(/fol+iage/i.test(path) && !/rock/i.test(path)
      || /\/doors\//i.test(path) && !door));
    const prop = { ...position, image, asset, layout, tree, wall, plane: entry.plane, collision, ySort: mapPropYSort(entry) };
    this.mapProps.push(prop);
    const span = CHUNK_TILES * TILE;
    const key = this._chunkKey(Math.floor(prop.x / span), Math.floor(prop.z / span));
    let bucket = this.mapPropChunks.get(key);
    if (!bucket) this.mapPropChunks.set(key, bucket = []);
    bucket.push(prop);
    if (isRoofAsset(asset)) {
      prop.roofCell = { x: entry.x, y: entry.y };
      prop.roofOnly = [];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const marker = this.roofOnlyAt((entry.x + dx + 0.5) * TILE, (entry.y + dy + 0.5) * TILE);
          if (marker !== undefined) prop.roofOnly.push(marker);
        }
      }
      prop.room = this.roofRoomAt((entry.x + 0.5) * TILE, (entry.y + 0.5) * TILE);
      return;
    }
    if (isMapOverlay(asset)) return;
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
      z: position.z + (horizontal ? (fence ? TILE * 0.4375 : TILE * 0.25) : vertical ? -TILE / 8 : wall ? 0 : TILE / 2 - image.height * pixel / 4),
      halfW: vertical ? TILE / 8 : wall ? TILE / 2 : image.width * pixel / 2,
      halfH: horizontal ? (fence ? TILE / 16 : TILE / 4) : vertical ? TILE * 5 / 8 : wall ? TILE / 2 : image.height * pixel / 4,
      blocksBullets: !window&&!fence, blocksVision: !window&&!fence,
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
        z: position.z - TILE / 8, halfW: TILE / 8, halfH: TILE * 5 / 8 };
      if (collision) {
        this.addDynamicObstacle(edge);
        this.mapWallObstacles.push(edge);
        this.mapSideWalls.push(edge);
      }
    }
    if (door) {
      prop.lockType=/keycard/i.test(path)?'keycard':asset.endsWith('#locked')?'key':null;
      prop.lockTier=Number(asset.match(/#tier([123])$/)?.[1]??1);
      prop.unlocked=false;
      prop.doorOpen = door[2].toLowerCase() === 'open';
      if(prop.doorOpen)prop.unlocked=true;
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
        ctx.drawImage(mask, point.x, point.y, mask.width * pixelScale, mask.height * pixelScale);
      }
    }
  }

  drawGroundLayer(ctx, camTx, camTy, halfW, halfH, ppu, sprites, camX, camZ) {
    const span = CHUNK_TILES * TILE;
    const scale = TILE * ppu / 16;
    const pad = this.floorOverlapPixels * TILE / 16;
    const minX = Math.max(0, Math.floor((camX - halfW - pad) / span));
    const minZ = Math.max(0, Math.floor((camZ - halfH - pad) / span));
    const maxX = Math.min(Math.ceil(this.raidMap.width / CHUNK_TILES) - 1, Math.floor((camX + halfW + pad) / span));
    const maxZ = Math.min(Math.ceil(this.raidMap.height / CHUNK_TILES) - 1, Math.floor((camZ + halfH + pad) / span));
    const showShadows = localStorage.getItem('raid-shadows') !== 'off';
    const key = [minX, minZ, maxX, maxZ, this.mapLightRevision, showShadows].join(',');
    if (this._terrainView?.key !== key) {
      const canvas = this._terrainView?.canvas ?? document.createElement('canvas');
      const chunkPx = CHUNK_TILES * 16;
      canvas.width = Math.max(1, (maxX - minX + 1) * chunkPx);
      canvas.height = Math.max(1, (maxZ - minZ + 1) * chunkPx);
      const g = canvas.getContext('2d');
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const chunk = this.mapGround.get(this._chunkKey(x, z));
          if (chunk) g.drawImage(!showShadows && chunk.cleanGround ? chunk.cleanGround : chunk.canvas, (x - minX) * chunkPx, (z - minZ) * chunkPx);
        }
      }
      this._terrainView = { key, canvas };
    }
    ctx.drawImage(this._terrainView.canvas, camTx + minX * span * ppu,
      camTy + minZ * span * ppu, this._terrainView.canvas.width * scale, this._terrainView.canvas.height * scale);
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
