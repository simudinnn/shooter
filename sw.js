const CACHE = 'robot-ruins-v315';

function shackSprites() {
  return [
    './assets/buildings/shack/floor_wood.png',
    './assets/buildings/shack/floor_wood_alt.png',
    './assets/buildings/shack/floor_wood2.png',
    './assets/buildings/shack/floor_wood_alt2.png',
    './assets/buildings/shack/door_mat.png',
    './assets/buildings/shack/door_closed.png',
    './assets/buildings/shack/door_open.png',
    './assets/buildings/shack/wall_ns.png',
    './assets/buildings/shack/wall_ns2.png',
    './assets/buildings/shack/wall_ew.png',
    './assets/buildings/shack/wall_door_top.png',
    './assets/buildings/shack/roof_fill.png',
    './assets/buildings/shack/roof_fill2.png',
    './assets/buildings/shack/roof_edge.png',
    './assets/buildings/shack/roof_edge2.png',
  ];
}

function buildingKitSprites() {
  return [
    './assets/buildings/floor/wood.png',
    './assets/buildings/floor/wood_alt.png',
    './assets/buildings/floor/parket.png',
    './assets/buildings/floor/parket_alt.png',
    './assets/buildings/floor/tiles.png',
    './assets/buildings/floor/tiles_alt.png',
    './assets/buildings/walls/wood.png',
    './assets/buildings/walls/brick.png',
    './assets/buildings/walls/gray.png',
    './assets/buildings/walls/blue.png',
    './assets/buildings/walls/white_wood.png',
    './assets/buildings/walls/wall_ew.png',
    './assets/buildings/roof/brown.png',
    './assets/buildings/roof/brown_edge.png',
    './assets/buildings/roof/red.png',
    './assets/buildings/roof/red_edge.png',
    './assets/buildings/roof/blue.png',
    './assets/buildings/roof/blue_edge.png',
    './assets/buildings/doors/mat_wood.png',
    './assets/buildings/doors/closed_wood.png',
    './assets/buildings/doors/open_wood.png',
    './assets/buildings/misc/barrel_blue.png',
    './assets/buildings/misc/barrel_green.png',
    './assets/buildings/misc/barrel_red.png',
    './assets/buildings/misc/table.png',
    './assets/buildings/misc/fridge.png',
    './assets/buildings/chests/wood.png',
    './assets/buildings/chests/metal.png',
    './assets/buildings/chests/rust.png',
    './assets/buildings/chests/moss.png',
  ];
}

const SHACK_SPRITES = shackSprites();
const BUILDING_KIT_SPRITES = buildingKitSprites();

function playerSprites() {
  // Only precache sprites that exist in assets/player/.
  return [
    './assets/player/idle.png',
    './assets/player/walk.png',
    './assets/player/run.png',
  ];
}

function weaponSprites() {
  const guns = ['glock', 'm16', 'm870', 'm24', 'uzi', 'revolver', 'famas', 'fal'];
  const melees = ['knife', 'fire_axe', 'wooden_bat', 'crowbar', 'hand'];
  const paths = [];
  for (const base of guns) {
    paths.push(`./assets/weapons/${base}.png`);
    paths.push(`./assets/weapons/${base}_shot.png`);
  }
  for (const base of melees) paths.push(`./assets/weapons/${base}.png`);
  for (const base of [...guns, ...melees]) paths.push(`./assets/items/weapons/${base}.png`);
  return paths;
}

const PLAYER_SPRITES = playerSprites();
const WEAPON_SPRITES = weaponSprites();

function worldSprites() {
  const floors = ['floor_grass', 'floor_dirt', 'floor_rock'];
  const foliage = [
    'foliage_grass', 'foliage_grass2', 'foliage_grass3', 'foliage_grass4',
    'foliage_grass_tall', 'foliage_grass_tall2', 'foliage_pebble', 'foliage_pebble2', 'foliage_rock',
    'foliage_bush', 'foliage_bush2', 'foliage_tree', 'foliage_tree2', 'foliage_tree3', 'foliage_stump',
  ];
  return [
    ...floors.map((n) => `./assets/world/${n}.png`),
    ...foliage.map((n) => `./assets/world/${n}.png`),
  ];
}

const WORLD_SPRITES = worldSprites();

const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/font-load.js',
  './js/renderConfig.js',
  './js/dayNight.js',
  './js/lanSession.js',
  './js/netProtocol.js',
  './js/netState.js',
  './js/supabaseConfig.js',
  './js/rooms.js',
  './js/main.js',
  './js/player.js',
  './js/bulletCollision.js',
  './js/enemies.js',
  './js/enemyNav.js',
  './js/chunkEntities.js',
  './js/chests.js',
  './js/corpses.js',
  './js/groundDrops.js',
  './js/materials.js',
  './js/buildingGen.js',
  './js/buildingTypes.js',
  './js/buildings.js',
  './js/loot.js',
  './js/audio.js',
  './js/items.js',
  './js/ammo.js',
  './js/joystick.js',
  './js/inventory.js',
  './js/collision.js',
  './js/particles.js',
  './js/sprites.js',
  './js/world.js',
  './js/worldGen.js',
  './js/saveGame.js',
  './js/visibility.js',
  './js/collisionDebug.js',
  './assets/fonts/game-pixel.woff2',
  './assets/fonts/game-pixel.ttf',
  './assets/ui/inventory.png',
  './assets/ui/inv_slot.png',
  './assets/ui/inv_cursor.png',
  './assets/ui/chest_inventory.png',
  './assets/items/misc/lock.png',
];

const ASSETS = [
  ...PLAYER_SPRITES,
  ...WEAPON_SPRITES,
  ...WORLD_SPRITES,
  ...SHACK_SPRITES,
  ...BUILDING_KIT_SPRITES,
  './assets/enemies/spider.png',
  './assets/enemies/spider_walk.png',
  './assets/enemies/scout.png',
  './assets/enemies/scout_walk.png',
  './assets/enemies/charge.png',
  './assets/enemies/spider_dead.png',
  './assets/enemies/scout_dead.png',
  './assets/items/materials/adhesive.png',
  './assets/items/materials/battery.png',
  './assets/items/materials/blueprint.png',
  './assets/items/materials/blueprint_old.png',
  './assets/items/materials/chemicals.png',
  './assets/items/materials/cloth.png',
  './assets/items/materials/copper_coil.png',
  './assets/items/materials/electrical_comp.png',
  './assets/items/materials/electrical_trans.png',
  './assets/items/materials/fabric.png',
  './assets/items/materials/fuel.png',
  './assets/items/materials/glass.png',
  './assets/items/materials/glass_bottle.png',
  './assets/items/materials/gun_parts.png',
  './assets/items/materials/mechanical_comp.png',
  './assets/items/materials/metal.png',
  './assets/items/materials/metal_pipe.png',
  './assets/items/materials/metal_sheet.png',
  './assets/items/materials/microchip.png',
  './assets/items/materials/military_comp.png',
  './assets/items/materials/nails.png',
  './assets/items/materials/plank.png',
  './assets/items/materials/plastic.png',
  './assets/items/materials/repair_kit.png',
  './assets/items/materials/rope.png',
  './assets/items/materials/rubber.png',
  './assets/items/materials/sewing_kit.png',
  './assets/items/materials/splint_kit.png',
  './assets/items/materials/spring.png',
  './assets/items/materials/stick.png',
  './assets/items/materials/tape.png',
  './assets/items/materials/upgrade_kit.png',
  './assets/items/materials/wires.png',
  './assets/items/materials/wood.png',
  './assets/items/weapons/pistol_ammo.png',
  './assets/items/weapons/rifle_ammo.png',
  './assets/items/weapons/shotgun_ammo.png',
  './assets/items/weapons/sniper_ammo.png',
  './assets/items/consumable/bandage.png',
  './assets/items/weapons/bullet.png',
  './assets/items/particles/casing.png',
  './assets/items/particles/casing_red.png',
  './assets/items/particles/particle_spark.png',
  './assets/items/particles/particle_smoke.png',
  './assets/items/particles/particle_fire.png',
  './assets/ui/cursor.png',
  './assets/ui/enemy_aggro.png',
  './assets/ui/enemy_search.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

async function cacheUrl(cache, url) {
  try {
    const res = await fetch(url, { cache: 'reload' });
    if (res.ok) await cache.put(url, res);
  } catch {
    /* optional file — skip */
  }
}

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all([...SHELL, ...ASSETS].map((url) => cacheUrl(cache, url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function matchCached(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  if (request.mode !== 'navigate') return null;
  for (const url of ['./index.html', './', '/index.html', '/']) {
    const nav = await caches.match(url);
    if (nav) return nav;
  }
  return null;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!isSameOrigin(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await matchCached(event.request);

      if (cached) {
        fetch(event.request)
          .then((res) => { if (res.ok) cache.put(event.request, res.clone()); })
          .catch(() => {});
        return cached;
      }

      try {
        const res = await fetch(event.request);
        if (res.ok) await cache.put(event.request, res.clone());
        return res;
      } catch {
        const fallback = await matchCached(event.request);
        if (fallback) return fallback;
        return new Response('Offline — open this page once while online to cache it.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })(),
  );
});
