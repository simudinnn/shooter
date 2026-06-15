const CACHE = 'robot-ruins-v37';

function playerSprites() {
  const paths = [
    './assets/player/idle.png',
    './assets/player/roll.png',
    './assets/player/crouch.png',
    './assets/player/sneak.png',
    './assets/player/jump.png',
    './assets/player/walk.png',
    './assets/player/run.png',
  ];
  for (let i = 1; i <= 4; i++) {
    paths.push(`./assets/player/walk_${i}.png`);
    paths.push(`./assets/player/run_${i}.png`);
  }
  return paths;
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
  return paths;
}

const PLAYER_SPRITES = playerSprites();
const WEAPON_SPRITES = weaponSprites();

const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/player.js',
  './js/enemies.js',
  './js/waves.js',
  './js/audio.js',
  './js/minimap.js',
  './js/items.js',
  './js/joystick.js',
  './js/inventory.js',
  './js/collision.js',
  './js/particles.js',
  './js/sprites.js',
  './js/world.js',
  './js/imageMap.js',
  './assets/fonts/ascii.png',
  './assets/fonts/game-pixel.woff2',
  './assets/fonts/game-pixel.ttf',
  './assets/ui/inventory.png',
];

const ASSETS = [
  ...PLAYER_SPRITES,
  ...WEAPON_SPRITES,
  './assets/enemies/spider.png',
  './assets/enemies/spider_walk.png',
  './assets/world/wall.png',
  './assets/world/floor.png',
  './assets/world/floor2.png',
  './assets/world/floor3.png',
  './assets/world/floor4.png',
  './assets/world/map.png',
  './assets/world/map_collision.png',
  './assets/items/ammo.png',
  './assets/items/bandage.png',
  './assets/items/mystery.png',
  './assets/items/mystery_weapon.png',
  './assets/items/bullet.png',
  './assets/items/particle_spark.png',
  './assets/items/particle_smoke.png',
  './assets/items/particle_fire.png',
  './assets/items/crate.png',
  './assets/items/crate2.png',
  './assets/items/crate3.png',
  './assets/items/crate4.png',
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
