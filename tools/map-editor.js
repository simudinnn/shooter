import { loadMapCatalog } from './map-catalog.js';
import { canonicalAsset, canonicalGround, BASE_GRASS_ASSET, floorTileLayout, drawFloorTile } from '../js/assetPaths.js';
import { validateStructure } from '../js/structures.js';
import { ChestManager } from '../js/chests.js';
import { TILE as WORLD_TILE } from '../js/world.js';
import { AuthoredRaidWorld, MAP_FOG_TILES, MAP_PLANES, PLAYER_SPAWN_ASSET, isRaidLootAsset, isMapLayerAsset, mapAssetPath, isRoofAsset, isEdgeGrass, ROOF_ONLY_MARKER, mapLayerEntries, mapBrushes, mapCornerLayout, mapPropLayout, mapPropYSort, mapWallEastEdge } from '../js/authoredRaidMap.js';

const TILE = 16;
const MAX_SIZE = 256;
const layers = ['tiles', 'props', 'loot', 'indoor', 'roofs'];
const byId = (id) => document.getElementById(id);
const canvas = byId('map');
const ctx = canvas.getContext('2d', { alpha: false });
const status = byId('status');
const brushes = new Map();
const images = new Map();
let catalog;
let map;
let dirty = false;
let erasing = false;
let stroke = null;
let pendingDraw = false;
let showCollision = false;
let drag = null;
let selection = null;
let marquee = null;
let groupDrag = null;
const propHits = [];
const collisionHits = [];
const undo = [];
const redo = [];

function createMap(width, height, fillGrass = false) {
  const next = { version: 1, width, height, tileSize: TILE, defaultGround: fillGrass ? BASE_GRASS_ASSET : undefined,
    layers: Object.fromEntries(layers.map((layer) => [layer, new Map()])) };
  return next;
}

function resize() {
  canvas.width = map.width * TILE;
  canvas.height = map.height * TILE;
  ctx.imageSmoothingEnabled = false;
  const zoom = Number(byId('zoom').value);
  canvas.style.width = canvas.width * zoom + 'px';
  canvas.style.height = canvas.height * zoom + 'px';
  draw();
}

function imageFor(asset) {
  asset = mapAssetPath(asset);
  if (!images.has(asset)) {
    const image = new Image();
    image.onload = scheduleDraw;
    image.src = '../' + mapAssetPath(asset);
    images.set(asset, image);
  }
  return images.get(asset);
}

function scheduleDraw() {
  if (pendingDraw) return;
  pendingDraw = true;
  requestAnimationFrame(() => {
    pendingDraw = false;
    draw();
  });
}

function draw() {
  ctx.fillStyle = '#252b22';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (map.defaultGround) {
    const ground = imageFor(map.defaultGround);
    if (ground.naturalWidth) {
      ctx.save();
      const tile=document.createElement('canvas');tile.width=tile.height=16;
      drawFloorTile(tile.getContext('2d'),ground,map.defaultGround,0,0);
      ctx.fillStyle=ctx.createPattern(tile,'repeat');
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }
  const tiles = [...map.layers.tiles.values()].sort((a, b) => a.plane - b.plane
    || Number(floorTileLayout(imageFor(a.asset),a.asset).width>16||floorTileLayout(imageFor(a.asset),a.asset).height>16)-Number(floorTileLayout(imageFor(b.asset),b.asset).width>16||floorTileLayout(imageFor(b.asset),b.asset).height>16));
  propHits.length = 0;
  collisionHits.length = 0;
  const props = [...map.layers.props.values()].map((entry) => entry === drag?.before && drag.preview ? drag.preview : entry);
  props.sort((a, b) => Number(isRoofAsset(a.asset)) - Number(isRoofAsset(b.asset)) || Number(mapPropYSort(a)) - Number(mapPropYSort(b))
    || (mapPropYSort(a) ? (a.y * TILE + (a.offsetY ?? 0)) - (b.y * TILE + (b.offsetY ?? 0)) : 0)
    || a.plane - b.plane);
  const hitBox = (entry, x, y, width, height) => propHits.push({ entry, x, y, width, height });
  for (const [layer, entries] of [['tiles', tiles], ['props', props.filter(entry => !isEdgeGrass(entry.asset))], ['loot', map.layers.loot.values()], ['roofs', byId('show-roofs').checked ? map.layers.roofs.values() : []], ['props', props.filter(entry => isEdgeGrass(entry.asset))]]) {
    for (const entry of entries) {
      const x = entry.x * TILE + (layer === 'roofs' ? 0 : entry.offsetX ?? 0);
      const y = entry.y * TILE + (layer === 'roofs' ? 0 : entry.offsetY ?? 0);
      if (entry.asset === PLAYER_SPAWN_ASSET) continue;
      const image = imageFor(entry.asset);
      if (image.naturalWidth) {
        if (layer==='tiles') {drawFloorTile(ctx,image,entry.asset,x,y);continue;}
        const floorAt = (column) => column >= 0 && column < map.width
          ? (map.layers.tiles.get(2 * map.width * map.height + entry.y * map.width + column)
            ?? map.layers.tiles.get(map.width * map.height + entry.y * map.width + column)
            ?? map.layers.tiles.get(entry.y * map.width + column))?.asset : null;
        const eastEdge = layer === 'props' && mapWallEastEdge(entry.asset, floorAt(entry.x - 1), floorAt(entry.x + 1));
        const layout = layer === 'props' || layer === 'roofs' ? mapPropLayout(entry.asset, eastEdge) : null;
        if (layout) {
          ctx.drawImage(image, x + layout.x, y + layout.y, layout.width, layout.height);
          if (layer === 'props') hitBox(entry, x + layout.x, y + layout.y, layout.width, layout.height);
          const corner = mapCornerLayout(entry.asset);
          if (corner) {
            const edge = imageFor(corner.asset);
            if (edge.naturalWidth) ctx.drawImage(edge, x + corner.x, y + corner.y, corner.width, corner.height);
          }
          continue;
        }
        const scale = layer === 'props' && !/\/(walls|windows|doors|chests|fences)\//i.test(entry.asset)
          ? 1 : TILE / Math.max(image.naturalWidth, image.naturalHeight);
        const w = Math.round(image.naturalWidth * scale);
        const h = Math.round(image.naturalHeight * scale);
        ctx.drawImage(image, x + Math.floor((TILE - w) / 2), y + TILE - h, w, h);
        if (layer === 'props') hitBox(entry, x + Math.floor((TILE - w) / 2), y + TILE - h, w, h);
        const corner = layer === 'props' ? mapCornerLayout(entry.asset) : null;
        if (corner) {
          const edge = imageFor(corner.asset);
          ctx.drawImage(edge.naturalWidth ? edge : image, x + corner.x, y, corner.width, corner.height);
        }
      }
      if (entry.quantity > 1) {
        ctx.font = '8px monospace';
        ctx.textAlign = 'right';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.strokeText(entry.quantity, x + 15, y + 15);
        ctx.fillStyle = '#fff';
        ctx.fillText(entry.quantity, x + 15, y + 15);
      }
    }
  }

  if (byId('fog').checked && map.type!=='structure') {
    const edge = MAP_FOG_TILES * TILE;
    ctx.fillStyle = '#91a6bd35';
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    if (canvas.width > edge * 2 && canvas.height > edge * 2) {
      ctx.rect(edge, edge, canvas.width - edge * 2, canvas.height - edge * 2);
    }
    ctx.fill('evenodd');
  }
  for (const entry of props) {
    if (entry.asset !== PLAYER_SPAWN_ASSET) continue;
    const x = entry.x * TILE + (entry.offsetX ?? 0);
    const y = entry.y * TILE + (entry.offsetY ?? 0);
    ctx.fillStyle = '#143731';
    ctx.fillRect(x + 2, y + 2, 12, 12);
    ctx.strokeStyle = '#70ffd5';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2.5, y + 2.5, 11, 11);
    ctx.fillStyle = '#d4fff1';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('P', x + 8, y + 12);
    hitBox(entry, x + 2, y + 2, 12, 12);
  }
  if(byId('layer').value==='indoor'){
    for(const entry of map.layers.indoor.values()){ctx.fillStyle=entry.asset===ROOF_ONLY_MARKER?'#e86d9366':entry.asset==='marker:indoor-passive'?'#ad78ef66':entry.asset==='marker:indoor-detection'?'#e8b34d66':'#58b9e955';ctx.fillRect(entry.x*TILE,entry.y*TILE,TILE,TILE);}
  }
  if (showCollision) drawCollisions(props);
  const box = marquee ? rectBetween(marquee.start, marquee.end) : selection?.box;
  if (box) {
    ctx.strokeStyle = '#7cffe1';
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }
  if (!byId('grid').checked) return;
  ctx.fillStyle = '#ffffff29';
  for (let x = 0; x < canvas.width; x += TILE) ctx.fillRect(x, 0, 1, canvas.height);
  for (let y = 0; y < canvas.height; y += TILE) ctx.fillRect(0, y, canvas.width, 1);
}

function drawCollisions(props) {
  const world = new AuthoredRaidWorld(map);
  const chests = new ChestManager(world);
  for (const entry of props) {
    if (entry.asset !== PLAYER_SPAWN_ASSET) imageFor(entry.asset);
    const planeSize = map.width * map.height;
    const floorAt = (column) => {
      if (column < 0 || column >= map.width) return undefined;
      const key = entry.y * map.width + column;
      for (let plane = MAP_PLANES - 1; plane >= 0; plane--) {
        const tile = map.layers.tiles.get(key + plane * planeSize);
        if (tile) return tile.asset;
      }
    };
    const obstacleCount = world.dynamicObstacles.length;
    const chestCount = world.mapChests.length;
    world.addMapProp(entry, images, mapWallEastEdge(entry.asset, floorAt(entry.x - 1), floorAt(entry.x + 1)));
    if (world.mapChests.length > chestCount) {
      const chest = world.mapChests.at(-1);
      chests.restoreInBuilding({ ...chest, slots: [] }, {}, chest);
    }
    for (let i = obstacleCount; i < world.dynamicObstacles.length; i++) {
      collisionHits.push({ entry, box: world.dynamicObstacles[i] });
    }
  }
  const scale = TILE / WORLD_TILE;
  ctx.fillStyle = '#ff32294d';
  ctx.strokeStyle = '#ff493f';
  ctx.lineWidth = 1;
  for (const box of world.dynamicObstacles) {
    ctx.beginPath();
    if (box.kind === 'circle') ctx.arc(box.x * scale, box.z * scale, box.radius * scale, 0, Math.PI * 2);
    else ctx.rect((box.x - box.halfW) * scale, (box.z - box.halfH) * scale, box.halfW * 2 * scale, box.halfH * 2 * scale);
    ctx.fill();
    ctx.stroke();
  }
}

function spriteName(asset) {
  if(asset===ROOF_ONLY_MARKER)return 'Samo krovovi (2 tilea)';
  if(asset==='marker:indoor-detection')return 'Indoor samo detekcija';
  if(asset==='marker:indoor')return 'Indoor';
  if(asset==='marker:indoor-passive')return 'Indoor bez promjene zone';
  if (asset === PLAYER_SPAWN_ASSET) return 'Player spawn';
  const [path, brush] = asset.split('#');
  const name = path.split('/').at(-1).replace(/\.png$/i, '');
  if (brush === 'east' || brush === 'west') return 'wall_' + brush;
  return (brush ? name + ' ' + brush : name).replaceAll('_', ' ');
}

function renderPalette() {
  const layer = byId('layer').value;
  byId('quantity-row').hidden = layer !== 'loot';
  const selected = brushes.get(layer);
  byId('selection').textContent = erasing ? 'Gumica' : selected ? spriteName(selected) : 'Odaberi sprite';
  const filter = byId('search').value.trim().toLowerCase();
  const buttons = [];
  const assets = catalog[layer];
  const ordered = layer === 'props'
    ? [PLAYER_SPAWN_ASSET, ...assets.filter((asset) => asset.includes('/misc/')), ...assets.filter((asset) => !asset.includes('/misc/'))]
    : assets;
  for (const asset of ordered.flatMap(mapBrushes)) {
    if (layer === 'loot' && !isRaidLootAsset(asset)) continue;
    const name = spriteName(asset);
    if (!name.includes(filter) && !asset.toLowerCase().includes(filter)) continue;
    const button = document.createElement('button');
    button.title = name;
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-pressed', String(!erasing && selected === asset));
    const image = document.createElement('img');
    if(asset===ROOF_ONLY_MARKER)button.textContent='Samo krovovi (2 tilea)';
    else if(asset==='marker:indoor-detection')button.textContent='Samo detekcija';
    else if(asset==='marker:indoor-passive')button.textContent='Maska bez detekcije';
    else if(asset==='marker:indoor')button.textContent='Indoor';
    else if (asset === PLAYER_SPAWN_ASSET) button.textContent = 'Spawn';
    else {
      image.src = '../' + mapAssetPath(asset);
      image.alt = '';
      button.append(image);
    }
    if (asset.includes('#')) {
      const label = document.createElement('small');
      label.textContent = asset.split('#')[1];
      button.append(label);
    }
    button.addEventListener('click', () => {
      brushes.set(layer, asset);
      setEraser(false);
    });
    buttons.push(button);
  }
  byId('palette').replaceChildren(...buttons);
}

function setEraser(value) {
  erasing = value;
  byId('erase').setAttribute('aria-pressed', String(value));
  renderPalette();
}

function cellAt(event) {
  const bounds = canvas.getBoundingClientRect();
  const px = Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width);
  const py = Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height);
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  return { x, y, px, py, offsetX: px - x * TILE - 8, offsetY: py - y * TILE - 8 };
}

function stackKeys(layer, x, y) {
  const base = y * map.width + x;
  const count = ['loot','indoor'].includes(layer) ? 1 : MAP_PLANES;
  return Array.from({ length: count }, (_, plane) => base + plane * map.width * map.height);
}

function updateHistoryButtons() {
  byId('undo').disabled = !undo.length;
  byId('redo').disabled = !redo.length;
}

function commit(layer, changes) {
  if (!changes.size) return;
  undo.push({ layer, changes });
  redo.length = 0;
  dirty = true;
  updateHistoryButtons();
  scheduleDraw();
}

function replay(from, to, direction) {
  if (stroke || drag || marquee || groupDrag || !from.length) return;
  const action = from.pop();
  if (action.snapshot) {
    map = structuredClone(action[direction]);
    selection = null;
    byId('width').value = map.width;
    byId('height').value = map.height;
    resize();
  }
  const changesByLayer = action.snapshot ? [] : action.layer
    ? [[action.layer, action.changes]] : action.layers;
  for (const [layer, changes] of changesByLayer) {
  const entries = map.layers[layer];
  for (const [key, change] of changes) {
    if (change[direction]) entries.set(key, change[direction]);
    else entries.delete(key);
  }
  }
  selection = null;
  to.push(action);
  dirty = true;
  updateHistoryButtons();
  scheduleDraw();
}

function paint(x, y, offsetX, offsetY) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  const keys = stackKeys(stroke.layer, x, y);
  if (stroke.visited.has(keys[0])) return;
  stroke.visited.add(keys[0]);
  const entries = map.layers[stroke.layer];
  const top = keys.findLastIndex((key) => entries.has(key));
  const plane = stroke.erase ? top : ['loot','indoor'].includes(stroke.layer) ? 0 : top + 1;
  if (plane < 0 || plane >= keys.length || (!stroke.erase && !stroke.asset)) return;
  const key = keys[plane];
  const before = entries.get(key);
  let after;
  if (stroke.erase) entries.delete(key);
  else {
    const hash = Math.imul(x ^ stroke.seed, 0x45d9f3b) ^ Math.imul(y + 1, 0x119de1f3);
    const index = (hash ^ (hash >>> 16)) >>> 0;
    const asset = stroke.variants[index % stroke.variants.length];
    after = { x, y, asset, plane };
    if (stroke.layer === 'loot') after.quantity = stroke.quantity;
    if (stroke.layer === 'props') Object.assign(after, { offsetX, offsetY });
    entries.set(key, after);
  }
  stroke.changes.set(key, { before, after });
  scheduleDraw();
}

function stamp(x, y, offsetX, offsetY) {
  const offset = Math.floor((stroke.size - 1) / 2);
  for (let dy = 0; dy < stroke.size; dy++) {
    for (let dx = 0; dx < stroke.size; dx++) paint(x + dx - offset, y + dy - offset, offsetX, offsetY);
  }
}
function brushVariants(layer, asset) {
  if (!asset || asset.includes('#') || asset === PLAYER_SPAWN_ASSET || !byId('random-brush').checked) return [asset];
  const family = (path) => path.replace(/\d*(?=\.png$)/i, '');
  return catalog[layer].filter((candidate) => family(candidate) === family(asset));
}

function paintTo(cell, snap) {
  // Interpolate across cells so fast drags do not leave gaps.
  const start = stroke.last;
  const dx = cell.x - start.x;
  const dy = cell.y - start.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 1; i <= steps; i++) {
    stamp(Math.round(start.x + dx * i / steps), Math.round(start.y + dy * i / steps), snap ? 0 : cell.offsetX, snap ? 0 : cell.offsetY);
  }
  stroke.last = cell;
}

function updateDrag(cell, snap) {
  const { before, start, key } = drag;
  const px = before.x * TILE + 8 + (before.offsetX ?? 0) + cell.px - start.px;
  const py = before.y * TILE + 8 + (before.offsetY ?? 0) + cell.py - start.py;
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  drag.preview = null;
  if (x >= 0 && y >= 0 && x < map.width && y < map.height) {
    const keys = stackKeys('props', x, y);
    const sameCell = x === before.x && y === before.y;
    const plane = sameCell ? before.plane : keys.findLastIndex((slot) => map.layers.props.has(slot)) + 1;
    const offsetX = snap ? 0 : px - x * TILE - 8;
    const offsetY = snap ? 0 : py - y * TILE - 8;
    if (plane < keys.length && (!sameCell || offsetX !== (before.offsetX ?? 0) || offsetY !== (before.offsetY ?? 0))) {
      drag.destination = sameCell ? key : keys[plane];
      drag.preview = { ...before, x, y, plane, offsetX, offsetY };
    }
  }
  scheduleDraw();
}

function rectBetween(a, b) {
  return { x: Math.min(a.px,b.px), y: Math.min(a.py,b.py),
    width: Math.abs(a.px-b.px), height: Math.abs(a.py-b.py) };
}

function moveSelection(dx, dy) {
  if (!selection || (!dx && !dy)) return;
  const next = structuredClone(map.layers);
  for (const {layer,key} of selection.items) next[layer].delete(key);
  const moved = [];
  for (const {layer,entry} of selection.items) {
    const x = entry.x + dx, y = entry.y + dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
      status.textContent = 'Odabir prelazi granice mape.'; return;
    }
    const keys = stackKeys(layer,x,y);
    const preferred = keys[entry.plane ?? 0];
    const key = !next[layer].has(preferred) ? preferred : keys.find((key) => !next[layer].has(key));
    if (key === undefined) { status.textContent = 'Na odredištu su već tri sloja.'; return; }
    const after = {...entry,x,y,plane:Math.floor(key/(map.width*map.height))};
    next[layer].set(key,after);
    moved.push({layer,key,entry:after});
  }
  const changes = [];
  for (const layer of layers) {
    const diff = new Map();
    for (const key of new Set([...map.layers[layer].keys(),...next[layer].keys()])) {
      const before=map.layers[layer].get(key), after=next[layer].get(key);
      if (JSON.stringify(before)!==JSON.stringify(after)) diff.set(key,{before,after});
    }
    if (diff.size) changes.push([layer,diff]);
  }
  map.layers=next;
  undo.push({layers:changes}); redo.length=0; dirty=true;
  selection={items:moved,box:{...selection.box,x:selection.box.x+dx*TILE,y:selection.box.y+dy*TILE}};
  updateHistoryButtons(); scheduleDraw();
}

function readMap(data) {
  const validSize = (size) => Number.isInteger(size) && size >= 1 && size <= MAX_SIZE;
  if (data?.version !== 1 || data.tileSize !== TILE || !validSize(data.width) || !validSize(data.height)) {
    throw new Error('Nepodržan format ili veličina mape.');
  }
  const imported = createMap(data.width, data.height);
  imported.defaultGround = data.type==='structure'&&!data.defaultGround?undefined:canonicalGround(data.defaultGround);
  imported.type=data.type;imported.name=data.name;imported.weight=data.weight;
  for (const layer of layers) {
    if (!['indoor','roofs'].includes(layer)&&!Array.isArray(data.layers?.[layer])) throw new Error('Nedostaje sloj ' + layer + '.');
    for (const entry of mapLayerEntries(data.layers, layer)) {
      if (entry == null) continue;
      const { x, y, quantity, plane = 0, offsetX = 0, offsetY = 0, collision, ySort } = entry;
      const asset=canonicalAsset(entry.asset);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0
        || x >= data.width || y >= data.height || !Number.isInteger(plane) || plane < 0 || plane >= (layer === 'loot' ? 1 : MAP_PLANES)
        || !isMapLayerAsset(layer, asset)
        || (layer === 'loot' && (!Number.isInteger(quantity) || quantity < 1 || quantity > 999))) {
        throw new Error('Neispravan unos u sloju ' + layer + '.');
      }
      imported.layers[layer].set(plane * data.width * data.height + y * data.width + x,
        layer === 'loot' ? { x, y, asset, quantity } : layer === 'props' || layer === 'roofs'
          ? { x, y, asset, plane, offsetX, offsetY, collision, ySort } : { x, y, asset, plane });
    }
  }
  for (const [key, entry] of imported.layers.tiles) {
    if (entry.plane === 0 && entry.asset === imported.defaultGround) imported.layers.tiles.delete(key);
  }
  return imported;
}

function setMap(next) {
  map = next;
  byId('document-mode').value=map.type==='structure'?'structure':'map';
  byId('structure-name-row').hidden=byId('structure-weight-row').hidden=map.type!=='structure';
  byId('structure-name').value=map.name??'nova-gradjevina';byId('structure-weight').value=map.weight??1;
  byId('fog').disabled=map.type==='structure';
  selection = null;
  undo.length = redo.length = 0;
  updateHistoryButtons();
  dirty = false;
  byId('width').value = map.width;
  byId('height').value = map.height;
  resize();
  byId('viewport').scrollTo(0, 0);
}

async function init() {
  const loadedCatalog=await loadMapCatalog();
  catalog=loadedCatalog.catalog;
  catalog.roofs = catalog.props.filter(isRoofAsset);
  catalog.props = catalog.props.filter(asset => !isRoofAsset(asset));
  catalog.indoor=['marker:indoor','marker:indoor-detection','marker:indoor-passive',ROOF_ONLY_MARKER];brushes.set('indoor','marker:indoor');

  byId('layer').addEventListener('change', () => {
    byId('search').value = '';
    renderPalette();scheduleDraw();
  });
  byId('search').addEventListener('input', renderPalette);
  byId('erase').addEventListener('click', () => setEraser(!erasing));
  byId('grid').addEventListener('change', scheduleDraw);
  byId('fog').addEventListener('change', scheduleDraw);
  byId('zoom').addEventListener('change', resize);
  byId('undo').addEventListener('click', () => replay(undo, redo, 'before'));
  byId('redo').addEventListener('click', () => replay(redo, undo, 'after'));
  window.addEventListener('keydown', (event) => {
    if (event.code === 'F3') {
      event.preventDefault();
      if (!event.repeat) showCollision = !showCollision;
      scheduleDraw();
    } else if ((event.ctrlKey || event.metaKey) && !event.target.matches('input, select, textarea')) {
      if (event.code === 'KeyZ' || event.code === 'KeyY') {
        event.preventDefault();
        if (event.code === 'KeyY' || event.shiftKey) replay(redo, undo, 'after');
        else replay(undo, redo, 'before');
      }
    }
  });
  const viewport = byId('viewport');
  const zoomControl = byId('zoom');
  let pan = null;
  viewport.addEventListener('wheel', (event) => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    if (stroke || drag || pan) return;
    const next = zoomControl.selectedIndex + (event.deltaY < 0 ? 1 : -1);
    if (next < 0 || next >= zoomControl.options.length) return;
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const previous = Number(zoomControl.value);
    zoomControl.selectedIndex = next;
    const ratio = Number(zoomControl.value) / previous;
    const left = viewport.scrollLeft + x * (ratio - 1);
    const top = viewport.scrollTop + y * (ratio - 1);
    resize();
    viewport.scrollTo(left, top);
  }, { passive: false });
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 1 || stroke || drag) return;
    event.preventDefault();
    pan = { pointer: event.pointerId, x: event.clientX, y: event.clientY,
      left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-panning');
  });
  viewport.addEventListener('pointermove', (event) => {
    if (pan?.pointer !== event.pointerId) return;
    viewport.scrollLeft = pan.left + pan.x - event.clientX;
    viewport.scrollTop = pan.top + pan.y - event.clientY;
  });
  viewport.addEventListener('lostpointercapture', (event) => {
    if (pan?.pointer !== event.pointerId) return;
    pan = null;
    viewport.classList.remove('is-panning');
  });
  viewport.addEventListener('auxclick', (event) => {
    if (event.button === 1) event.preventDefault();
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (stroke || drag || marquee || groupDrag || (event.button !== 0 && event.button !== 2)) return;
    const layer = byId('layer').value;
    const cell = cellAt(event);
    if (event.button === 0 && event.altKey) {
      marquee = { pointer: event.pointerId, start: cell, end: cell };
      selection = null;
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 0 && selection && cell.px >= selection.box.x && cell.py >= selection.box.y
      && cell.px <= selection.box.x + selection.box.width && cell.py <= selection.box.y + selection.box.height) {
      groupDrag = { pointer: event.pointerId, start: cell };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    selection = null;
    if (showCollision && event.button === 2) {
      const scale = WORLD_TILE / TILE;
      const hit = collisionHits.findLast(({ box }) => {
        const dx = cell.px * scale - box.x;
        const dz = cell.py * scale - box.z;
        return box.kind === 'circle' ? dx * dx + dz * dz <= box.radius * box.radius
          : Math.abs(dx) <= box.halfW && Math.abs(dz) <= box.halfH;
      });
      if (hit) {
        const before = hit.entry;
        const key = stackKeys('props', before.x, before.y)[before.plane];
        const after = { ...before, collision: false };
        map.layers.props.set(key, after);
        commit('props', new Map([[key, { before, after }]]));
      }
      return;
    }
    if (layer === 'props' && event.button === 0 && !erasing && !event.altKey) {
      const hit = propHits.findLast(({ x, y, width, height }) =>
        cell.px >= x && cell.px < x + width && cell.py >= y && cell.py < y + height);
      if (hit) {
        const before = hit.entry;
        const key = stackKeys('props', before.x, before.y)[before.plane];
        drag = { pointer: event.pointerId, start: cell, before, key };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    }
    const asset = brushes.get(layer);
    const size = Math.min(15, Math.max(1, Math.trunc(Number(byId('brush-size').value)) || 1));
    stroke = { pointer: event.pointerId, layer, last: cell, asset,
      visited: new Set(), changes: new Map(),
      size: asset === PLAYER_SPAWN_ASSET ? 1 : size,
      seed: Number(byId('brush-seed').value) | 0,
      variants: brushVariants(layer, asset),
      erase: erasing || event.button === 2,
      quantity: Math.min(999, Math.max(1, Math.trunc(Number(byId('quantity').value)) || 1)) };
    canvas.setPointerCapture(event.pointerId);
    stamp(cell.x, cell.y, event.shiftKey ? 0 : cell.offsetX, event.shiftKey ? 0 : cell.offsetY);
  });
  canvas.addEventListener('pointermove', (event) => {
    const cell = cellAt(event);
    byId('position').textContent = cell.x + ', ' + cell.y;
    if (marquee?.pointer === event.pointerId) { marquee.end = cell; scheduleDraw(); }
    if (groupDrag?.pointer === event.pointerId) {
      status.textContent = 'Pomak ' + (cell.x - groupDrag.start.x) + ', ' + (cell.y - groupDrag.start.y);
    }
    if (stroke?.pointer === event.pointerId) paintTo(cell, event.shiftKey);
    if (drag?.pointer === event.pointerId) updateDrag(cell, event.shiftKey);
  });
  canvas.addEventListener('pointerup', (event) => {
    const end = cellAt(event);
    if (marquee?.pointer === event.pointerId) {
      const box = rectBetween(marquee.start, end);
      const items = [];
      for (const layer of layers) {
        for (const [key, entry] of map.layers[layer]) {
          const x = (entry.x + 0.5) * TILE + (entry.offsetX ?? 0);
          const y = (entry.y + 0.5) * TILE + (entry.offsetY ?? 0);
          if (x >= box.x && y >= box.y && x <= box.x + box.width && y <= box.y + box.height) items.push({layer,key,entry});
        }
      }
      selection = items.length ? { box, items } : null;
      marquee = null;
      status.textContent = 'Odabrano ' + items.length;
      scheduleDraw();
      return;
    }
    if (groupDrag?.pointer === event.pointerId) {
      moveSelection(end.x - groupDrag.start.x, end.y - groupDrag.start.y);
      groupDrag = null;
      return;
    }
    if (drag?.pointer !== event.pointerId) return;
    updateDrag(cellAt(event), event.shiftKey);
    const { key, before, preview, destination } = drag;
    drag = null;
    if (!preview) {
      scheduleDraw();
      return;
    }
    const entries = map.layers.props;
    entries.delete(key);
    entries.set(destination, preview);
    const changes = destination === key
      ? new Map([[key, { before, after: preview }]])
      : new Map([[key, { before }], [destination, { after: preview }]]);
    commit('props', changes);
  });
  canvas.addEventListener('lostpointercapture', (event) => {
    if (marquee?.pointer === event.pointerId) marquee = null;
    if (groupDrag?.pointer === event.pointerId) groupDrag = null;
    if (drag?.pointer === event.pointerId) {
      drag = null;
      scheduleDraw();
    }
    if (stroke?.pointer !== event.pointerId) return;
    commit(stroke.layer, stroke.changes);
    stroke = null;
  });
  byId('resize-map').addEventListener('click', () => {
    if (!byId('new-map').reportValidity()) return;
    const width = Number(byId('width').value);
    const height = Number(byId('height').value);
    if (width === map.width && height === map.height) return;
    const entries = layers.flatMap((layer) => [...map.layers[layer].values()]);
    if (entries.some((e) => e.x >= width || e.y >= height)
      && !confirm('Smanjivanje će ukloniti elemente izvan novih granica. Nastaviti?')) return;
    const before = structuredClone(map);
    const next = createMap(width, height);
    next.defaultGround = map.defaultGround;
    next.type=map.type;next.name=map.name;next.weight=map.weight;
    for (const layer of layers) for (const entry of map.layers[layer].values()) {
      if (entry.x >= width || entry.y >= height) continue;
      next.layers[layer].set((entry.plane ?? 0) * width * height + entry.y * width + entry.x, entry);
    }
    map = next;
    selection = null;
    undo.push({ snapshot: true, before, after: structuredClone(next) });
    redo.length = 0;
    dirty = true;
    updateHistoryButtons();
    resize();
  });
  byId('new-map').addEventListener('submit', (event) => {
    event.preventDefault();
    if (dirty && !confirm('Zamijeniti mapu s nespremljenim izmjenama?')) return;
    const structure=byId('document-mode').value==='structure';
    const next=createMap(Number(byId('width').value),Number(byId('height').value),!structure);if(structure)next.type='structure';setMap(next);
    status.textContent = 'Nova mapa.';
  });
  byId('document-mode').addEventListener('change',()=>{
    const structure=byId('document-mode').value==='structure';
    byId('structure-name-row').hidden=byId('structure-weight-row').hidden=!structure;byId('fog').disabled=structure;
    if(!dirty&&structure&&layers.every(layer=>map.layers[layer].size===0)){const next=createMap(12,12,false);next.type='structure';setMap(next);}else{map.type=structure?'structure':undefined;dirty=true;}
    status.textContent=structure?'Građevina: do 64 × 64 tilea. Alt + povlačenje označava dio mape za izvoz kao zasebnu građevinu.':'Uređivanje cijele mape.';scheduleDraw();
  });
  byId('open').addEventListener('click', () => byId('file').click());
  byId('file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || (dirty && !confirm('Zamijeniti mapu s nespremljenim izmjenama?'))) return;
    try {
      setMap(readMap(JSON.parse(await file.text())));
      status.textContent = 'Učitano ' + file.name;
    } catch (error) {
      status.textContent = 'Mapa se nije učitala. ' + error.message;
    }
  });
  byId('show-roofs').addEventListener('change', scheduleDraw);
  byId('save').addEventListener('click', async () => {
    const data = { ...map, layers: Object.fromEntries(layers.map((layer) =>
      [layer, Array.from(map.layers[layer].values()).filter((entry) =>
        layer !== 'tiles' || entry.plane !== 0 || entry.asset !== map.defaultGround)])) };
    if(byId('document-mode').value==='structure'){
      try{
        const name=byId('structure-name').value.trim();if(!/^[a-z0-9_-]+$/i.test(name))throw Error('Naziv smije sadržavati slova, brojeve, crticu i donju crtu.');
        if(selection?.items.length){
          const entries=selection.items,minX=Math.min(...entries.map(e=>e.entry.x)),minY=Math.min(...entries.map(e=>e.entry.y));
          data.width=Math.max(...entries.map(e=>e.entry.x))-minX+1;data.height=Math.max(...entries.map(e=>e.entry.y))-minY+1;
          data.layers=Object.fromEntries(layers.map(layer=>[layer,entries.filter(e=>e.layer===layer).map(e=>({...e.entry,x:e.entry.x-minX,y:e.entry.y-minY}))]));
        }
        data.type='structure';data.name=name;data.weight=Math.max(.1,Number(byId('structure-weight').value)||1);delete data.defaultGround;validateStructure(data);
        const response=await fetch('../structures/'+encodeURIComponent(name)+'.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        if(!response.ok)throw Error('Pokreni npm start za spremanje izravno u structures. '+await response.text());
        map.type='structure';map.name=name;map.weight=data.weight;dirty=false;status.textContent='Spremljeno structures/'+name+'.json. Nova građevina koristit će se u idućem proceduralnom raidu.';
      }catch(error){status.textContent=error.message;}
      return;
    }
    const json = JSON.stringify(data, null, 2);
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const file = await window.showSaveFilePicker({
          suggestedName: 'raid-map.json',
          types: [{ description: 'JSON mapa', accept: { 'application/json': ['.json'] } }],
        });
        const output = await file.createWritable();
        await output.write(json);
        await output.close();
        dirty = false;
        status.textContent = 'Spremljeno ' + file.name;
      } catch (error) {
        if (error.name !== 'AbortError') status.textContent = 'Spremanje nije uspjelo. ' + error.message;
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'raid-map.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    dirty = false;
    status.textContent = 'Izvezen raid-map.json.';
  });

  setMap(createMap(125, 125, true));
  renderPalette();
  if(loadedCatalog.fallback)status.textContent='Paleta učitana iz spremljenog popisa asseta.';
}

init().catch((error) => { status.textContent = error.message; });
