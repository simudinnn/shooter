const CACHE = 'robot-ruins-v95';

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
  const melees = ['knife', 'fire_axe', 'wooden_bat', 'crowbar'];
  const paths = [];
  for (const base of guns) {
    paths.push(`./assets/weapons/${base}.png`);
    paths.push(`./assets/weapons/${base}_shot.png`);
  }
  for (const base of melees) paths.push(`./assets/weapons/${base}.png`);
  for (const base of [...guns, ...melees]) paths.push(`./assets/items/${base}.png`);
  return paths;
}

const PLAYER_SPRITES = playerSprites();
const WEAPON_SPRITES = weaponSprites();

function worldSprites() {
  const floors = ['floor_grass', 'floor_dirt', 'floor_rock'];
  const foliage = ['foliage_grass', 'foliage_grass_tall', 'foliage_rock', 'foliage_tree', 'foliage_stump'];
  return [
    './assets/world/wall.png',
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
  './js/main.js',
  './js/player.js',
  './js/enemies.js',
  './js/chunkEntities.js',
  './js/chests.js',
  './js/loot.js',
  './js/audio.js',
  './js/minimap.js',
  './js/items.js',
  './js/ammo.js',
  './js/joystick.js',
  './js/inventory.js',
  './js/collision.js',
  './js/particles.js',
  './js/sprites.js',
  './js/world.js',
  './js/worldGen.js',
  './assets/fonts/ascii.png',
  './assets/fonts/game-pixel.woff2',
  './assets/fonts/game-pixel.ttf',
  './assets/ui/inventory.png',
  './assets/ui/inv_slot.png',
  './assets/ui/inv_cursor.png',
  './assets/ui/chest_inventory.png',
  './assets/items/lock.png',
  './assets/buildings/chest_wood.png',
  './assets/buildings/chest_metal.png',
  './assets/buildings/chest_rust.png',
  './assets/buildings/chest_moss.png',
];

const ASSETS = [
  ...PLAYER_SPRITES,
  ...WEAPON_SPRITES,
  ...WORLD_SPRITES,
  './assets/enemies/spider.png',
  './assets/enemies/spider_walk.png',
  './assets/items/ammo.png',
  './assets/items/pistol_ammo.png',
  './assets/items/rifle_ammo.png',
  './assets/items/shotgun_ammo.png',
  './assets/items/sniper_ammo.png',
  './assets/items/bandage.png',
  './assets/items/mystery.png',
  './assets/items/mystery_weapon.png',
  './assets/items/bullet.png',
  './assets/items/particle_spark.png',
  './assets/items/particle_smoke.png',
  './assets/items/particle_fire.png',
  './assets/ui/cursor.png',
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
