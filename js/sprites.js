/**
 * Sprite loader — assets/{player,enemies,weapons,world,items,ui}/
 */

const PLAYER_ASSET_PATHS = {
  player_idle: 'assets/player/idle.png',
  player_walk: 'assets/player/walk.png',
  player_run: 'assets/player/run.png',
};

const GUN_SPRITES = ['glock', 'm16', 'm870', 'm24', 'uzi', 'revolver', 'famas', 'fal'];
/** Pump / bolt guns use a dedicated mid-fire cycle strip. */
const GUN_CYCLE_SPRITES = ['m870', 'm24'];
const MELEE_SPRITES = ['knife', 'fire_axe', 'wooden_bat', 'crowbar'];

const WEAPON_ASSET_PATHS = (() => {
  const paths = {};
  for (const base of GUN_SPRITES) {
    paths[base] = `assets/weapons/${base}.png`;
    paths[`${base}_shot`] = `assets/weapons/${base}_shot.png`;
    paths[`${base}_reload`] = `assets/weapons/${base}_reload.png`;
  }
  for (const base of GUN_CYCLE_SPRITES) {
    paths[`${base}_cycle`] = `assets/weapons/${base}_cycle.png`;
  }
  for (const base of MELEE_SPRITES) {
    paths[base] = `assets/weapons/${base}.png`;
  }
  return paths;
})();

const CORE_ASSETS = {
  spider: 'assets/enemies/spider.png',
  spider_walk: 'assets/enemies/spider_walk.png',
  wall: 'assets/world/wall.png',
  floor: 'assets/world/floor.png',
  floor2: 'assets/world/floor2.png',
  floor3: 'assets/world/floor3.png',
  floor4: 'assets/world/floor4.png',
  ammo: 'assets/items/ammo.png',
  bandage: 'assets/items/bandage.png',
  mystery: 'assets/items/mystery.png',
  mystery_weapon: 'assets/items/mystery_weapon.png',
  bullet: 'assets/items/bullet.png',
  casing: 'assets/items/casing.png',
  casing_red: 'assets/items/casing_red.png',
  particle_spark: 'assets/items/particle_spark.png',
  particle_smoke: 'assets/items/particle_smoke.png',
  particle_fire: 'assets/items/particle_fire.png',
  crate: 'assets/items/crate.png',
  crate2: 'assets/items/crate2.png',
  crate3: 'assets/items/crate3.png',
  crate4: 'assets/items/crate4.png',
  cursor: 'assets/ui/cursor.png',
  cursor_melee: 'assets/ui/cursor_melee.png',
  cursor_shotgun: 'assets/ui/cursor_shotgun.png',
};

/**
 * Flipbook animation settings — edit speeds here.
 * Sheets stack frames vertically (default): frame count = image height ÷ frameH.
 * If height is not divisible by frameH, strips are auto-detected from image width
 * (e.g. 16×160 = ten 16px-tall frames).
 *
 * fps — frames per second for time/elapsed playback (reload, cycle, idle loop).
 * frames — optional override if auto-detect is wrong.
 * frameW / frameH — pixel size of one frame (defaults: 24, or image width for thin strips).
 * duration — optional seconds to play a one-shot (overrides frames/fps).
 */
export const SPRITE_ANIM = {
  frameW: 24,
  frameH: 24,
  defaultFps: 8,
  sheets: {
    player_idle: { fps: 3, loop: true },
    player_walk: { fps: 10, loop: true },
    player_run: { fps: 14, loop: true },
    spider_walk: { fps: 10, loop: true },
    glock_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m16_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m870_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m870_cycle: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m24_reload: { fps: 6, loop: false, frameW: 24, frameH: 24 },
    m24_cycle: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    uzi_reload: { fps: 9, loop: false, frameW: 24, frameH: 24 },
    revolver_reload: { fps: 7, loop: false, frameW: 24, frameH: 24 },
    famas_reload: { fps: 8, loop: false, frameW: 24, frameH: 24 },
    fal_reload: { fps: 8, loop: false, frameW: 24, frameH: 24 },
    particle_smoke: { fps: 4, loop: false, frameW: 15, frameH: 15 },
    particle_spark: { fps: 5, loop: false, frameW: 15, frameH: 15 },
    particle_fire: { fps: 2, loop: false, frameW: 15, frameH: 15 }
  },
};

/** Populated when sprites load — used for play duration before draw. */
export const loadedSheetMeta = {};

export const ASSET_PATHS = {
  ...PLAYER_ASSET_PATHS,
  ...WEAPON_ASSET_PATHS,
  ...CORE_ASSETS,
};

export const FLOOR_VARIANTS = ['floor', 'floor2', 'floor3', 'floor4'];
export const CRATE_VARIANTS = ['crate', 'crate2', 'crate3', 'crate4'];
export const ITEM_NATIVE_PX = 16;
export const CHAR_NATIVE_PX = 24;
export const WEAPON_NATIVE_PX = 24;
export const PARTICLE_FX_NATIVE_PX = 15;

export function getParticleFxSprite(kind) {
  if (kind === 'smoke') return 'particle_smoke';
  if (kind === 'fire') return 'particle_fire';
  return 'particle_spark';
}

/** Flipbook elapsed time from particle age (see withFxAnim in particles.js). */
export function getParticleFxAnim(p) {
  const max = p.lifeMax ?? p.life;
  return { elapsed: Math.max(0, max - p.life) + (p.animOffset ?? 0) };
}

export function spriteFeetOffset(nativePx, scale) {
  return nativePx * scale * 0.5;
}

export function weaponSpritePath(sprite) {
  return `assets/weapons/${sprite}.png`;
}

const FALLBACK_SIZE = 16;
const CHAR_SIZE = 24;

const WALK_LEGS = [
  [{ x: 6, y: 11, w: 5, h: 8 }, { x: 14, y: 11, w: 5, h: 8 }],
  [{ x: 5, y: 12, w: 5, h: 6 }, { x: 15, y: 9, w: 5, h: 9 }],
  [{ x: 8, y: 11, w: 5, h: 8 }, { x: 12, y: 11, w: 5, h: 8 }],
  [{ x: 15, y: 9, w: 5, h: 9 }, { x: 5, y: 12, w: 5, h: 6 }],
];

const RUN_LEGS = [
  [{ x: 4, y: 13, w: 5, h: 5 }, { x: 16, y: 8, w: 5, h: 10 }],
  [{ x: 6, y: 11, w: 5, h: 8 }, { x: 14, y: 11, w: 5, h: 8 }],
  [{ x: 16, y: 8, w: 5, h: 10 }, { x: 4, y: 13, w: 5, h: 5 }],
  [{ x: 8, y: 10, w: 5, h: 7 }, { x: 12, y: 12, w: 5, h: 7 }],
];

const PLAYER_ANIM_RE = /^player_(walk|run)_(\d+)$/;

function getAnimSpec(name) {
  return SPRITE_ANIM.sheets[name] || {};
}

function defaultFrameSize(name) {
  if (name.startsWith('particle_')) return 15;
  if (name.startsWith('player_') || name.startsWith('spider')) return CHAR_SIZE;
  if (GUN_SPRITES.some((b) => name === b || name.startsWith(`${b}_`))
    || MELEE_SPRITES.includes(name)) {
    return WEAPON_NATIVE_PX;
  }
  return SPRITE_ANIM.frameH;
}

/** Seconds to play a one-shot sheet (reload / cycle). */
export function getSheetPlayDuration(name) {
  const spec = getAnimSpec(name);
  if (spec.duration != null) return spec.duration;
  const loaded = loadedSheetMeta[name];
  const frames = loaded?.frameCount ?? spec.frames ?? 1;
  const fps = spec.fps ?? loaded?.fps ?? SPRITE_ANIM.defaultFps;
  return frames / fps;
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawPlayerFrame(g, leftLeg, rightLeg) {
  px(g, 8, 3, 9, 8, '#4a8090');
  px(g, 9, 1, 6, 3, '#d4a878');
  px(g, leftLeg.x, leftLeg.y, leftLeg.w, leftLeg.h, '#2a5060');
  px(g, rightLeg.x, rightLeg.y, rightLeg.w, rightLeg.h, '#2a5060');
  px(g, 9, 11, 6, 6, '#3a6070');
}

function drawSpiderFrame(g, leftLeg, rightLeg, leftArm, rightArm) {
  px(g, 8, 3, 9, 8, '#5a6068');
  px(g, 9, 1, 6, 3, '#707880');
  px(g, 8, 5, 3, 3, '#c03030');
  px(g, 14, 5, 3, 3, '#c03030');
  px(g, leftLeg.x, leftLeg.y, leftLeg.w, leftLeg.h, '#404850');
  px(g, rightLeg.x, rightLeg.y, rightLeg.w, rightLeg.h, '#404850');
  px(g, leftArm.x, leftArm.y, leftArm.w, leftArm.h, '#505860');
  px(g, rightArm.x, rightArm.y, rightArm.w, rightArm.h, '#505860');
}

function buildPlayerFallback(kind, frame) {
  const c = makeCanvas(CHAR_SIZE, CHAR_SIZE);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  let legs = WALK_LEGS[0];
  if (kind === 'walk') legs = WALK_LEGS[(frame - 1) % 4];
  else if (kind === 'run') legs = RUN_LEGS[(frame - 1) % 4];
  drawPlayerFrame(g, legs[0], legs[1]);
  px(g, CHAR_SIZE - 6, 1, 5, 5, '#e09030');
  return c;
}

function buildPlayerStripFallback(kind) {
  const frames = 4;
  const c = makeCanvas(CHAR_SIZE, CHAR_SIZE * frames);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let i = 0; i < frames; i++) {
    const frame = buildPlayerFallback(kind, i + 1);
    g.drawImage(frame, 0, i * CHAR_SIZE);
  }
  return c;
}

function buildSpiderWalkStripFallback() {
  const frames = [
    [
      { x: 5, y: 12, w: 5, h: 6 }, { x: 15, y: 9, w: 5, h: 9 },
      { x: 3, y: 9, w: 3, h: 5 }, { x: 18, y: 6, w: 3, h: 8 },
    ],
    [
      { x: 8, y: 11, w: 5, h: 8 }, { x: 12, y: 11, w: 5, h: 8 },
      { x: 5, y: 8, w: 3, h: 6 }, { x: 17, y: 8, w: 3, h: 6 },
    ],
    [
      { x: 15, y: 9, w: 5, h: 9 }, { x: 5, y: 12, w: 5, h: 6 },
      { x: 18, y: 6, w: 3, h: 8 }, { x: 3, y: 9, w: 3, h: 5 },
    ],
    [
      { x: 8, y: 10, w: 5, h: 7 }, { x: 12, y: 12, w: 5, h: 7 },
      { x: 6, y: 7, w: 3, h: 7 }, { x: 16, y: 9, w: 3, h: 6 },
    ],
  ];
  const c = makeCanvas(CHAR_SIZE, CHAR_SIZE * frames.length);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let i = 0; i < frames.length; i++) {
    const fc = makeCanvas(CHAR_SIZE, CHAR_SIZE);
    const fg = fc.getContext('2d');
    fg.imageSmoothingEnabled = false;
    const f = frames[i];
    drawSpiderFrame(fg, f[0], f[1], f[2], f[3]);
    g.drawImage(fc, 0, i * CHAR_SIZE);
  }
  return c;
}

function buildCharFallback(name) {
  if (name === 'player_idle') return buildPlayerFallback('idle', 1);
  if (name === 'player_walk') return buildPlayerStripFallback('walk');
  if (name === 'player_run') return buildPlayerStripFallback('run');
  if (name === 'spider_walk') return buildSpiderWalkStripFallback();

  const animMatch = name.match(PLAYER_ANIM_RE);
  if (animMatch) {
    return buildPlayerFallback(animMatch[1], Number(animMatch[2]));
  }

  const c = makeCanvas(CHAR_SIZE, CHAR_SIZE);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  switch (name) {
    case 'spider':
      drawSpiderFrame(g,
        { x: 6, y: 11, w: 5, h: 8 }, { x: 14, y: 11, w: 5, h: 8 },
        { x: 5, y: 8, w: 3, h: 6 }, { x: 17, y: 8, w: 3, h: 6 });
      break;
    case 'spider_walk1':
      drawSpiderFrame(g,
        { x: 5, y: 12, w: 5, h: 6 }, { x: 15, y: 9, w: 5, h: 9 },
        { x: 3, y: 9, w: 3, h: 5 }, { x: 18, y: 6, w: 3, h: 8 });
      break;
    case 'spider_walk2':
      drawSpiderFrame(g,
        { x: 8, y: 11, w: 5, h: 8 }, { x: 12, y: 11, w: 5, h: 8 },
        { x: 5, y: 8, w: 3, h: 6 }, { x: 17, y: 8, w: 3, h: 6 });
      break;
    case 'spider_walk3':
      drawSpiderFrame(g,
        { x: 15, y: 9, w: 5, h: 9 }, { x: 5, y: 12, w: 5, h: 6 },
        { x: 18, y: 6, w: 3, h: 8 }, { x: 3, y: 9, w: 3, h: 5 });
      break;
    case 'spider_walk4':
      drawSpiderFrame(g,
        { x: 8, y: 10, w: 5, h: 7 }, { x: 12, y: 12, w: 5, h: 7 },
        { x: 6, y: 7, w: 3, h: 7 }, { x: 16, y: 9, w: 3, h: 6 });
      break;
    default:
      px(g, 0, 0, CHAR_SIZE, CHAR_SIZE, '#ff00ff');
  }
  return c;
}

function addMuzzleFlash(g, o) {
  px(g, 9 + o, 1 + o, 2, 2, '#ffe060');
  px(g, 8 + o, 2 + o, 4, 2, '#ff9030');
  px(g, 10 + o, 0 + o, 2, 2, '#ffffff');
}

function drawGunArt(g, base, o) {
  switch (base) {
    case 'glock':
      px(g, 4 + o, 6 + o, 8, 3, '#606870');
      px(g, 9 + o, 5 + o, 4, 4, '#4a3828');
      px(g, 3 + o, 8 + o, 3, 4, '#5a4030');
      break;
    case 'm16':
    case 'famas':
      px(g, 2 + o, 6 + o, 12, 3, '#707880');
      px(g, 10 + o, 5 + o, 4, 2, '#3a4048');
      px(g, 1 + o, 7 + o, 4, 5, '#5a4030');
      if (base === 'famas') px(g, 3 + o, 5 + o, 10, 2, '#4a6850');
      break;
    case 'fal':
      px(g, 1 + o, 6 + o, 13, 3, '#686868');
      px(g, 11 + o, 5 + o, 4, 2, '#3a4048');
      px(g, 1 + o, 7 + o, 5, 5, '#6a4830');
      break;
    case 'm870':
      px(g, 1 + o, 6 + o, 13, 4, '#6a5038');
      px(g, 3 + o, 5 + o, 10, 2, '#3a3028');
      px(g, 11 + o, 6 + o, 3, 2, '#909098');
      break;
    case 'm24':
      px(g, 0 + o, 6 + o, 15, 2, '#3a4048');
      px(g, 4 + o, 4 + o, 6, 3, '#2a3038');
      px(g, 12 + o, 5 + o, 3, 2, '#f0a030');
      break;
    case 'uzi':
      px(g, 4 + o, 7 + o, 8, 4, '#505860');
      px(g, 6 + o, 5 + o, 5, 3, '#3a4048');
      px(g, 5 + o, 10 + o, 4, 3, '#5a4030');
      break;
    case 'revolver':
      px(g, 5 + o, 6 + o, 7, 3, '#606870');
      px(g, 8 + o, 5 + o, 5, 5, '#4a3828');
      px(g, 6 + o, 9 + o, 4, 4, '#5a4030');
      break;
    default:
      px(g, 2 + o, 6 + o, 12, 3, '#707880');
      px(g, 1 + o, 7 + o, 4, 5, '#5a4030');
  }
}

function buildWeaponAnimStripFallback(name) {
  const reloadMatch = name.match(/^(.+)_reload$/);
  const cycleMatch = name.match(/^(.+)_cycle$/);
  const base = reloadMatch?.[1] || cycleMatch?.[1] || 'm16';
  const frames = 3;
  const c = makeCanvas(CHAR_SIZE, CHAR_SIZE * frames);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const o = 4;
  for (let i = 0; i < frames; i++) {
    const fc = makeCanvas(CHAR_SIZE, CHAR_SIZE);
    const fg = fc.getContext('2d');
    fg.imageSmoothingEnabled = false;
    drawGunArt(fg, base, o);
    if (reloadMatch) {
      px(fg, 8 + o, 10 + o + i, 3, 4 - i, '#d4b030');
      px(fg, 1 + o, 10 + o, 4, 3 + i, '#5a4030');
    }
    if (cycleMatch) {
      const pump = i === 1 ? 2 : i === 2 ? 0 : 1;
      px(fg, 1 + o, 4 + o + pump, 5, 3, '#8a6848');
    }
    g.drawImage(fc, 0, i * CHAR_SIZE);
  }
  return c;
}

function buildWeaponFallback(name) {
  if (name.endsWith('_reload') || name.endsWith('_cycle')) {
    return buildWeaponAnimStripFallback(name);
  }
  const c = makeCanvas(CHAR_SIZE, CHAR_SIZE);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const o = 4;
  const isShot = name.endsWith('_shot');
  const base = isShot ? name.slice(0, -5) : name;
  drawGunArt(g, base, o);
  if (isShot) addMuzzleFlash(g, o);
  return c;
}

function buildMeleeFallback(name) {
  const c = makeCanvas(CHAR_SIZE, CHAR_SIZE);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const o = 4;

  switch (name) {
    case 'knife':
      px(g, 8 + o, 4 + o, 2, 9, '#c0c4cc');
      px(g, 7 + o, 11 + o, 4, 3, '#5a4030');
      px(g, 8 + o, 3 + o, 2, 2, '#e8ecf0');
      break;
    case 'fire_axe':
      px(g, 6 + o, 3 + o, 8, 5, '#a03028');
      px(g, 7 + o, 2 + o, 6, 2, '#c84838');
      px(g, 9 + o, 8 + o, 2, 10, '#5a4030');
      break;
    case 'wooden_bat':
      px(g, 9 + o, 2 + o, 3, 14, '#8a6840');
      px(g, 8 + o, 3 + o, 5, 12, '#6a5030');
      px(g, 10 + o, 15 + o, 2, 3, '#4a3828');
      break;
    case 'crowbar':
      px(g, 9 + o, 2 + o, 2, 13, '#707880');
      px(g, 7 + o, 2 + o, 4, 3, '#9098a0');
      px(g, 8 + o, 14 + o, 4, 2, '#606870');
      break;
    default:
      px(g, 0, 0, CHAR_SIZE, CHAR_SIZE, '#ff00ff');
  }
  return c;
}

function buildParticleFxFallback(name) {
  const s = 8;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (name === 'particle_spark') {
    px(g, 3, 0, 2, 8, '#fff8c0');
    px(g, 0, 3, 8, 2, '#ffe880');
    px(g, 3, 3, 2, 2, '#ffffff');
    px(g, 1, 1, 2, 2, '#68d8ff');
    px(g, 5, 5, 2, 2, '#fff4a0');
  } else if (name === 'particle_smoke') {
    px(g, 1, 2, 6, 5, '#686870');
    px(g, 2, 1, 4, 6, '#787880');
    px(g, 2, 3, 4, 3, '#505860');
    px(g, 0, 3, 2, 3, '#606870');
    px(g, 6, 3, 2, 3, '#606870');
  } else if (name === 'particle_fire') {
    px(g, 3, 0, 2, 2, '#ffe060');
    px(g, 2, 2, 4, 3, '#ffc030');
    px(g, 3, 2, 2, 2, '#fff8a0');
    px(g, 2, 4, 4, 2, '#ff9040');
    px(g, 3, 5, 2, 3, '#ff6020');
    px(g, 1, 5, 2, 2, '#ff3018');
    px(g, 5, 5, 2, 2, '#ff3018');
  }
  return c;
}

function buildFallback(name) {
  if (name.startsWith('player_') || name.startsWith('spider')) {
    return buildCharFallback(name);
  }
  if (name.startsWith('particle_')) {
    return buildParticleFxFallback(name);
  }
  if (GUN_SPRITES.some((b) => name === b || name.startsWith(`${b}_`))
    || MELEE_SPRITES.includes(name)) {
    return buildWeaponFallback(name);
  }
  if (MELEE_SPRITES.includes(name)) {
    return buildMeleeFallback(name);
  }

  const c = makeCanvas(FALLBACK_SIZE, FALLBACK_SIZE);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  switch (name) {
    case 'wall':
      px(g, 0, 0, 16, 16, '#8a8580');
      px(g, 1, 1, 14, 2, '#f0a030');
      px(g, 2, 4, 12, 10, '#6a6560');
      break;
    case 'floor':
      px(g, 0, 0, 16, 16, '#4a6a52');
      px(g, 0, 0, 7, 7, '#3a5a42');
      px(g, 9, 9, 7, 7, '#5a7a62');
      break;
    case 'floor2':
      px(g, 0, 0, 16, 16, '#456248');
      px(g, 2, 2, 6, 6, '#3a5540');
      px(g, 10, 8, 6, 6, '#567a58');
      break;
    case 'floor3':
      px(g, 0, 0, 16, 16, '#526a50');
      px(g, 8, 0, 8, 8, '#425a40');
      px(g, 0, 8, 8, 8, '#627a60');
      break;
    case 'floor4':
      px(g, 0, 0, 16, 16, '#3e5a46');
      px(g, 4, 4, 8, 8, '#4d6b52');
      px(g, 0, 0, 4, 16, '#354f3c');
      break;
    case 'ammo':
      px(g, 3, 4, 10, 9, '#3a8a44');
      px(g, 5, 6, 6, 4, '#ffee44');
      break;
    case 'bandage':
      px(g, 2, 2, 12, 12, '#f0ece8');
      px(g, 6, 4, 4, 8, '#ff3030');
      px(g, 4, 6, 8, 4, '#ff3030');
      break;
    case 'mystery':
      px(g, 2, 2, 12, 12, '#7744cc');
      px(g, 4, 4, 8, 8, '#aa66ff');
      px(g, 6, 6, 4, 4, '#ffee88');
      break;
    case 'mystery_weapon':
      px(g, 2, 3, 12, 10, '#cc8822');
      px(g, 4, 5, 8, 6, '#ffaa22');
      px(g, 6, 6, 4, 3, '#ffffff');
      break;
    case 'bullet':
      px(g, 7, 4, 2, 8, '#ffe040');
      break;
    case 'casing':
      px(g, 4, 6, 8, 4, '#d4b030');
      px(g, 5, 5, 6, 1, '#e8cc50');
      px(g, 4, 10, 8, 1, '#a08018');
      px(g, 11, 7, 1, 2, '#806010');
      break;
    case 'casing_red':
      px(g, 4, 6, 8, 4, '#c83828');
      px(g, 5, 5, 6, 1, '#e85040');
      px(g, 4, 10, 8, 1, '#8a2018');
      px(g, 11, 7, 1, 2, '#601010');
      break;
    case 'crate':
      px(g, 2, 4, 12, 10, '#9a7048');
      px(g, 3, 5, 10, 2, '#7a5038');
      break;
    case 'crate2':
      px(g, 2, 4, 12, 10, '#8a6040');
      px(g, 3, 5, 10, 2, '#6a4828');
      px(g, 5, 7, 6, 4, '#a07850');
      break;
    case 'crate3':
      px(g, 1, 3, 14, 11, '#7a5838');
      px(g, 2, 4, 12, 2, '#5a4028');
      px(g, 4, 8, 8, 4, '#9a7858');
      break;
    case 'crate4':
      px(g, 3, 5, 10, 9, '#6a5030');
      px(g, 4, 6, 8, 3, '#4a3820');
      px(g, 2, 3, 3, 3, '#8a6848');
      break;
    case 'cursor':
      px(g, 7, 2, 2, 12, '#f0a030');
      px(g, 2, 7, 12, 2, '#f0a030');
      px(g, 6, 6, 4, 4, '#ffe880');
      break;
    case 'cursor_melee':
      px(g, 7, 1, 2, 14, '#e85050');
      px(g, 3, 7, 10, 2, '#e85050');
      px(g, 6, 6, 4, 4, '#ff9090');
      px(g, 2, 2, 3, 3, '#c03030');
      px(g, 11, 2, 3, 3, '#c03030');
      px(g, 2, 11, 3, 3, '#c03030');
      px(g, 11, 11, 3, 3, '#c03030');
      break;
    case 'cursor_shotgun':
      px(g, 7, 1, 2, 14, '#f0a030');
      px(g, 1, 7, 14, 2, '#f0a030');
      px(g, 5, 5, 6, 6, '#ffe880');
      px(g, 3, 3, 2, 2, '#c88828');
      px(g, 11, 3, 2, 2, '#c88828');
      px(g, 3, 11, 2, 2, '#c88828');
      px(g, 11, 11, 2, 2, '#c88828');
      break;
    default:
      px(g, 0, 0, 16, 16, '#ff00ff');
  }
  return c;
}

export function isLookingRight(angle) {
  return Math.sin(angle) >= 0;
}

function getMoveSide(moveDirX) {
  if (moveDirX < -0.12) return 'l';
  if (moveDirX > 0.12) return 'r';
  return null;
}

export function isMovingForward(player) {
  const moveSide = getMoveSide(player.moveDirX ?? 0);
  if (!moveSide) return true;
  const lookRight = isLookingRight(player.angle);
  return (lookRight && moveSide === 'r') || (!lookRight && moveSide === 'l');
}

export function getFlipXFromAngle(angle) {
  return !isLookingRight(angle);
}

export function getPlayerFlipX(player) {
  return getFlipXFromAngle(player.angle);
}

export function getPlayerSheet(player) {
  if (!player.isMoving) return 'player_idle';
  return player.isSprinting ? 'player_run' : 'player_walk';
}

/** @deprecated use getPlayerSheet + getPlayerAnim */
export function getPlayerSprite(player) {
  return getPlayerSheet(player);
}

/** Animation state for flipbook player sheets. */
export function getPlayerAnim(player, time = 0) {
  if (!player.isMoving) return { time };
  return {
    phase: player.walkPhase,
    reverse: !isMovingForward(player),
  };
}

/** Vertical screen offset (negative = up) — snappy step: quick lift, harsh landing. */
export function getWalkBounceY(walkPhase, moving, amp = 1.8) {
  if (!moving) return 0;
  const t = (walkPhase % 2) / 2;
  if (t < 0.22) {
    return -Math.pow(t / 0.22, 0.55) * amp;
  }
  const u = (t - 0.22) / 0.78;
  return -amp + amp * Math.pow(u, 2.8);
}

export function getPlayerBounceY(player) {
  const amp = player.isSprinting ? 2.8 : 1.8;
  return getWalkBounceY(player.walkPhase, player.isMoving, amp);
}

/** Subtle idle bob for held weapon — syncs with standing/breathing (screen px, negative = up). */
export const IDLE_BREATH_AMP = 1.1;
export const IDLE_BREATH_HZ = 0.42;

export function getPlayerIdleBreathY(player, time = 0) {
  if (player.isMoving || player.isMeleeAnimating?.(time)) return 0;
  const phase = time * Math.PI * 2 * IDLE_BREATH_HZ;
  // Cosine — zero velocity at inhale/exhale peaks (smoother than raw sine steps).
  return -Math.cos(phase) * IDLE_BREATH_AMP;
}

/** Reload pose — barrel raised while magging. */
export const RELOAD_AIM_ANGLE = -Math.PI / 4;
export const RELOAD_AIM_RAISE_SEC = 0.22;
export const RELOAD_AIM_LOWER_SEC = 0.12;
/** Screen pixels in front of player center while reloading (follows facing). */
export const RELOAD_HOLD_FORWARD_PX = 10;

function easeOutCubic(t) {
  const p = Math.max(0, Math.min(1, t));
  return 1 - (1 - p) ** 3;
}

/** Reload hold anchor — slightly in front of the player sprite. */
export function getReloadHoldScreenX(playerCenterX, flipX) {
  return playerCenterX + (flipX ? -RELOAD_HOLD_FORWARD_PX : RELOAD_HOLD_FORWARD_PX);
}

/** Gun tilts up/down; flips horizontally when aiming left. */
export function gunAimTransform(worldAngle) {
  const flipX = Math.sin(worldAngle) < 0;
  const angle = Math.asin(Math.max(-1, Math.min(1, Math.cos(worldAngle))));
  return { angle, flipX };
}

/** Vertical aim shifts hold point — up = forward, down = back (world units). */
export const GUN_PIVOT_TILT_SHIFT = 1;

export function gunPivotHoldOffset(aimAngle) {
  const t = aimAngle / (Math.PI / 2);
  return -t * GUN_PIVOT_TILT_SHIFT;
}

function reloadTiltAtFull() {
  return RELOAD_AIM_ANGLE;
}

/**
 * Reload pose blend — animates gun to player center + fixed tilt, then back.
 * blend: 0 = normal hold offset, 1 = centered reload pose.
 */
export function getReloadPoseBlend(player, time = 0) {
  if (player.isMeleeActive()) return null;
  const ra = player.reloadAim;
  if (!ra) return null;
  const aim = gunAimTransform(player.angle);
  const reloadTilt = reloadTiltAtFull();

  if (player.weapon?.reloading) {
    const t = easeOutCubic(Math.min(1, (time - player.weapon.reloadStart) / RELOAD_AIM_RAISE_SEC));
    return {
      blend: t,
      angle: ra.fromAngle + (reloadTilt - ra.fromAngle) * t,
      flipX: aim.flipX,
    };
  }

  if (ra.phase === 'lower') {
    const t = easeOutCubic(Math.min(1, (time - ra.lowerStart) / RELOAD_AIM_LOWER_SEC));
    if (t >= 1) ra.phase = 'idle';
    return {
      blend: 1 - t,
      angle: reloadTilt + (aim.angle - reloadTilt) * t,
      flipX: aim.flipX,
    };
  }

  return null;
}

/** @deprecated use getReloadPoseBlend */
export function getHeldWeaponAim(player, time = 0) {
  const aim = gunAimTransform(player.angle);
  const pose = getReloadPoseBlend(player, time);
  if (pose) return { angle: pose.angle, flipX: pose.flipX };
  return aim;
}

export function getFloorVariant(tx, tz) {
  const n = Math.sin(tx * 12.9898 + tz * 78.233) * 43758.5453;
  const n2 = Math.sin(tx * 39.346 + tz * 11.135) * 15731.743;
  const h = (n - Math.floor(n) + n2 - Math.floor(n2)) * 0.5;
  if (h < 0.58) return 'floor';
  if (h < 0.76) return 'floor2';
  if (h < 0.88) return 'floor3';
  return 'floor4';
}

export function getCrateVariant(x, z) {
  const h = (Math.round(x * 10) * 83492791) ^ (Math.round(z * 10) * 19349669);
  return CRATE_VARIANTS[Math.abs(h) % CRATE_VARIANTS.length];
}

export function getWalkSheet(base, moving) {
  if (!moving) return base;
  return `${base}_walk`;
}

/** Time-based flipbook anim for walk sheets (respects SPRITE_ANIM fps). */
export function getWalkAnim(moving, time = 0) {
  if (!moving) return null;
  return { time };
}

/** @deprecated use getWalkSheet + getWalkAnim */
export function getWalkSprite(base, phase, moving) {
  return getWalkSheet(base, moving);
}

/** Bullet sprite points toward +Z at rotation 0; flip 180 if art faces the other way. */
export function velToSpriteAngle(vx, vz) {
  if (Math.abs(vx) < 1e-6 && Math.abs(vz) < 1e-6) return 0;
  return Math.atan2(vx, vz) + Math.PI;
}

export class SpriteBank {
  constructor() {
    this.images = {};
    this.flipbooks = {};
    this.ready = false;
  }

  async loadAll() {
    const entries = Object.entries(ASSET_PATHS);
    await Promise.all(entries.map(([name, path]) => this._loadOne(name, path)));
    this.ready = true;
  }

  _parseFlipbook(name, img) {
    const spec = getAnimSpec(name);
    let frameW = spec.frameW ?? SPRITE_ANIM.frameW ?? defaultFrameSize(name);
    let frameH = spec.frameH ?? SPRITE_ANIM.frameH ?? defaultFrameSize(name);
    const axis = spec.axis ?? 'y';
    const w = img.width || frameW;
    const h = img.height || frameH;
    let frameCount = spec.frames ?? 1;

    if (!spec.frames) {
      if (axis === 'y' && frameH > 0 && h > frameH && h % frameH === 0) {
        frameCount = h / frameH;
      } else if (axis === 'x' && frameW > 0 && w > frameW && w % frameW === 0) {
        frameCount = w / frameW;
      } else if (h > w && w > 0 && h % w === 0) {
        frameW = w;
        frameH = w;
        frameCount = h / w;
      } else if (w > h && h > 0 && w % h === 0) {
        frameW = h;
        frameH = h;
        frameCount = w / h;
      }
    }

    const meta = {
      frameW,
      frameH,
      frameCount,
      axis,
      fps: spec.fps ?? SPRITE_ANIM.defaultFps,
      loop: spec.loop !== false,
    };
    this.flipbooks[name] = meta;
    loadedSheetMeta[name] = meta;
  }

  _resolveFrame(fb, anim) {
    if (!fb || fb.frameCount <= 1) return 0;
    if (!anim) return 0;

    if (anim.frame != null) {
      return Math.max(0, Math.min(fb.frameCount - 1, anim.frame | 0));
    }
    if (anim.elapsed != null) {
      const idx = Math.floor(Math.max(0, anim.elapsed) * fb.fps);
      return Math.min(idx, fb.frameCount - 1);
    }
    if (anim.progress != null) {
      const p = Math.max(0, Math.min(1, anim.progress));
      return Math.max(0, Math.min(fb.frameCount - 1, Math.floor(p * fb.frameCount)));
    }
    if (anim.phase != null) {
      let p = Math.floor(anim.phase) % fb.frameCount;
      if (anim.reverse) p = fb.frameCount - 1 - p;
      return p;
    }
    if (anim.time != null) {
      const idx = Math.floor(anim.time * fb.fps);
      return fb.loop ? idx % fb.frameCount : Math.min(idx, fb.frameCount - 1);
    }
    return 0;
  }

  _loadOne(name, path) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images[name] = img;
        this._parseFlipbook(name, img);
        resolve();
      };
      img.onerror = () => {
        const fallback = buildFallback(name);
        this.images[name] = fallback;
        this._parseFlipbook(name, fallback);
        resolve();
      };
      img.src = path;
    });
  }

  draw(ctx, name, sx, sy, scale = 2, angle = 0, flipX = false, pivot = 'center', chopTilt = 0, anim = null) {
    const img = this.images[name];
    if (!img) return;
    const fb = this.flipbooks[name];
    const frameIdx = this._resolveFrame(fb, anim);
    const fw = (fb?.frameW ?? img.width) || FALLBACK_SIZE;
    const fh = (fb?.frameH ?? img.height) || FALLBACK_SIZE;
    let srcX = 0;
    let srcY = 0;
    if (fb && fb.frameCount > 1) {
      if (fb.axis === 'x') srcX = frameIdx * fw;
      else srcY = frameIdx * fh;
    }
    let pivotX;
    let pivotY;
    if (pivot === 'shoulder') {
      pivotX = fw * 0.5;
      pivotY = fh * 0.78;
    } else if (pivot === 'handle') {
      pivotX = fw * 0.5;
      pivotY = fh;
    } else {
      pivotX = fw * 0.5;
      pivotY = fh * 0.5;
    }
    if (flipX) pivotX = fw - pivotX;
    const dw = Math.round(fw * scale);
    const dh = Math.round(fh * scale);
    const ox = Math.round(pivotX * scale);
    const oy = Math.round(pivotY * scale);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(sx), sy);
    if (flipX) ctx.scale(-1, 1);
    if (angle) ctx.rotate(angle);
    if (chopTilt) ctx.rotate(chopTilt);
    ctx.drawImage(img, srcX, srcY, fw, fh, -ox, -oy, dw, dh);
    ctx.restore();
  }

  drawTile(ctx, name, sx, sy, tilePx) {
    const img = this.images[name];
    if (!img) return;
    const px = Math.round(tilePx);
    ctx.drawImage(img, Math.round(sx), Math.round(sy), px, px);
  }
}
