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
/** 16×16 inventory / GUI icons — weapon only, no hands (assets/items/{name}.png). */
export const ITEM_WEAPON_SPRITES = [...GUN_SPRITES, ...MELEE_SPRITES];

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

const ITEM_WEAPON_ASSET_PATHS = Object.fromEntries(
  ITEM_WEAPON_SPRITES.map((base) => [`item_${base}`, `assets/items/${base}.png`]),
);

const WORLD_FLOOR_SPRITES = ['floor_grass', 'floor_dirt', 'floor_rock'];

const WORLD_FOLIAGE_SPRITES = [
  'foliage_grass', 'foliage_grass2', 'foliage_grass3', 'foliage_grass4',
  'foliage_grass_tall', 'foliage_grass_tall2', 'foliage_pebble', 'foliage_pebble2', 'foliage_rock',
  'foliage_bush', 'foliage_bush2', 'foliage_tree', 'foliage_tree2', 'foliage_tree3', 'foliage_stump',
];

const WORLD_ASSET_PATHS = Object.fromEntries([
  ...WORLD_FLOOR_SPRITES.map((n) => [n, `assets/world/${n}.png`]),
  ...WORLD_FOLIAGE_SPRITES.map((n) => [n, `assets/world/${n}.png`]),
]);

const BUILDING_ASSET_PATHS = Object.fromEntries([
  ['chest_wood', 'assets/buildings/chests/wood.png'],
  ['chest_metal', 'assets/buildings/chests/metal.png'],
  ['chest_rust', 'assets/buildings/chests/rust.png'],
  ['chest_moss', 'assets/buildings/chests/moss.png'],
  ['bld_floor_wood', 'assets/buildings/floor/wood.png'],
  ['bld_floor_wood_alt', 'assets/buildings/floor/wood_alt.png'],
  ['bld_floor_parket', 'assets/buildings/floor/parket.png'],
  ['bld_floor_parket_alt', 'assets/buildings/floor/parket_alt.png'],
  ['bld_floor_tiles', 'assets/buildings/floor/tiles.png'],
  ['bld_floor_tiles_alt', 'assets/buildings/floor/tiles_alt.png'],
  ['bld_wall_wood', 'assets/buildings/walls/wood.png'],
  ['bld_wall_brick', 'assets/buildings/walls/brick.png'],
  ['bld_wall_gray', 'assets/buildings/walls/gray.png'],
  ['bld_wall_blue', 'assets/buildings/walls/blue.png'],
  ['bld_wall_white_wood', 'assets/buildings/walls/white_wood.png'],
  ['bld_wall_ew', 'assets/buildings/walls/wall_ew.png'],
  ['bld_roof_brown', 'assets/buildings/roof/brown.png'],
  ['bld_roof_brown_edge', 'assets/buildings/roof/brown_edge.png'],
  ['bld_roof_red', 'assets/buildings/roof/red.png'],
  ['bld_roof_red_edge', 'assets/buildings/roof/red_edge.png'],
  ['bld_roof_blue', 'assets/buildings/roof/blue.png'],
  ['bld_roof_blue_edge', 'assets/buildings/roof/blue_edge.png'],
  ['bld_door_mat_wood', 'assets/buildings/doors/mat_wood.png'],
  ['bld_door_closed_wood', 'assets/buildings/doors/closed_wood.png'],
  ['bld_door_open_wood', 'assets/buildings/doors/open_wood.png'],
  ['bld_barrel_blue', 'assets/buildings/misc/barrel_blue.png'],
  ['bld_barrel_green', 'assets/buildings/misc/barrel_green.png'],
  ['bld_barrel_red', 'assets/buildings/misc/barrel_red.png'],
  ['bld_table', 'assets/buildings/misc/table.png'],
  ['bld_fridge', 'assets/buildings/misc/fridge.png'],
]);

const SHACK_ASSET_PATHS = {
  shack_floor_wood: 'assets/buildings/shack/floor_wood.png',
  shack_floor_wood_alt: 'assets/buildings/shack/floor_wood_alt.png',
  shack_floor_wood2: 'assets/buildings/shack/floor_wood2.png',
  shack_floor_wood_alt2: 'assets/buildings/shack/floor_wood_alt2.png',
  shack_door_mat: 'assets/buildings/shack/door_mat.png',
  shack_door_closed: 'assets/buildings/shack/door_closed.png',
  shack_door_open: 'assets/buildings/shack/door_open.png',
  shack_wall_ns: 'assets/buildings/shack/wall_ns.png',
  shack_wall_ns2: 'assets/buildings/shack/wall_ns2.png',
  shack_wall_ew: 'assets/buildings/shack/wall_ew.png',
  shack_wall_corner: 'assets/buildings/shack/wall_corner.png',
  shack_wall_door_top: 'assets/buildings/shack/wall_door_top.png',
  shack_roof_fill: 'assets/buildings/shack/roof_fill.png',
  shack_roof_fill2: 'assets/buildings/shack/roof_fill2.png',
  shack_roof_edge: 'assets/buildings/shack/roof_edge.png',
  shack_roof_edge2: 'assets/buildings/shack/roof_edge2.png',
};

const CORE_ASSETS = {
  spider: 'assets/enemies/spider.png',
  spider_walk: 'assets/enemies/spider_walk.png',
  scout: 'assets/enemies/scout.png',
  scout_walk: 'assets/enemies/scout_walk.png',
  scout_charge: 'assets/enemies/charge.png',
  ...WORLD_ASSET_PATHS,
  ...BUILDING_ASSET_PATHS,
  ...SHACK_ASSET_PATHS,
  ammo: 'assets/items/ammo.png',
  pistol_ammo: 'assets/items/pistol_ammo.png',
  rifle_ammo: 'assets/items/rifle_ammo.png',
  shotgun_ammo: 'assets/items/shotgun_ammo.png',
  sniper_ammo: 'assets/items/sniper_ammo.png',
  bandage: 'assets/items/bandage.png',
  inv_lock: 'assets/items/lock.png',
  mystery: 'assets/items/mystery.png',
  mystery_weapon: 'assets/items/mystery_weapon.png',
  bullet: 'assets/items/bullet.png',
  casing: 'assets/items/casing.png',
  casing_red: 'assets/items/casing_red.png',
  particle_spark: 'assets/items/particle_spark.png',
  particle_smoke: 'assets/items/particle_smoke.png',
  particle_fire: 'assets/items/particle_fire.png',
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
    player_roll: { fps: 14, loop: true },
    player_crouch: { fps: 4, loop: true },
    player_sneak: { fps: 7, loop: true },
    player_jump: { fps: 12, loop: false },
    spider_walk: { fps: 10, loop: true },
    scout_walk: { fps: 6, loop: true, frameW: 32, frameH: 32 },
    scout_charge: { fps: 10, loop: false, frameW: 32, frameH: 32 },
    glock_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m16_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m870_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m870_cycle: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m24_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    m24_cycle: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    uzi_reload: { fps: 9, loop: false, frameW: 24, frameH: 24 },
    revolver_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    famas_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    fal_reload: { fps: 10, loop: false, frameW: 24, frameH: 24 },
    particle_smoke: { fps: 4, loop: false, frameW: 15, frameH: 15 },
    particle_spark: { fps: 5, loop: false, frameW: 15, frameH: 15 },
    particle_fire: { fps: 2, loop: false, frameW: 15, frameH: 15 },
    casing: { frameW: 4, frameH: 4, frames: 1 },
    casing_red: { frameW: 4, frameH: 4, frames: 1 },
    cursor: { frameW: 15, frameH: 15, frames: 1 },
    cursor_melee: { frameW: 15, frameH: 15, frames: 1 },
    cursor_shotgun: { frameW: 15, frameH: 15, frames: 1 },
    ...Object.fromEntries(
      ITEM_WEAPON_SPRITES.map((base) => [`item_${base}`, { frameW: 16, frameH: 16, frames: 1 }]),
    ),
  },
};

/** Populated when sprites load — used for play duration before draw. */
export const loadedSheetMeta = {};

export const ASSET_PATHS = {
  ...PLAYER_ASSET_PATHS,
  ...WEAPON_ASSET_PATHS,
  ...ITEM_WEAPON_ASSET_PATHS,
  ...CORE_ASSETS,
};

export const FLOOR_VARIANTS = ['floor', 'floor2', 'floor3', 'floor4'];
export const CRATE_VARIANTS = ['crate', 'crate2', 'crate3', 'crate4'];
export const ITEM_NATIVE_PX = 16;
export const CASING_NATIVE_PX = 4;
export const CHAR_NATIVE_PX = 24;
export const SCOUT_NATIVE_PX = 32;
export const ENEMY_DRAW_SCALE = {
  spider: 1.45,
  /** Match spider on-screen size: 24px art × 1.45 ≈ 32px art × this scale (slightly smaller). */
  scout: 1.6
};

export const SCOUT_WALK_FPS = 6;

export function getEnemyNativePx(type) {
  return type === 'scout' ? SCOUT_NATIVE_PX : CHAR_NATIVE_PX;
}

export function getEnemyDrawScale(type) {
  return ENEMY_DRAW_SCALE[type] ?? 1.45;
}
export const WEAPON_NATIVE_PX = 24;
export const PARTICLE_FX_NATIVE_PX = 15;
export const CURSOR_NATIVE_PX = 15;
/** Draw scale for ~21px on-screen cursor (15px art × 1.4). */
export const CURSOR_DRAW_SCALE = 1.4;

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

export function weaponHoldSpritePath(sprite) {
  return `assets/weapons/${sprite}.png`;
}

/** 16×16 item icon for inventory / GUI / back-carry (no hands). */
export function weaponItemSpritePath(sprite) {
  return `assets/items/${sprite}.png`;
}

/** SpriteBank key for a weapon item icon. */
export function weaponItemSpriteKey(sprite) {
  return `item_${sprite}`;
}

/** @deprecated use weaponHoldSpritePath for in-hand sprites */
export function weaponSpritePath(sprite) {
  return weaponHoldSpritePath(sprite);
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

const SNEAK_LEGS = [
  [{ x: 6, y: 16, w: 4, h: 4 }, { x: 14, y: 16, w: 4, h: 4 }],
  [{ x: 5, y: 17, w: 4, h: 3 }, { x: 15, y: 15, w: 4, h: 5 }],
  [{ x: 8, y: 16, w: 4, h: 4 }, { x: 12, y: 16, w: 4, h: 4 }],
  [{ x: 15, y: 15, w: 4, h: 5 }, { x: 5, y: 17, w: 4, h: 3 }],
];

const PLAYER_ANIM_RE = /^player_(walk|run)_(\d+)$/;

function getAnimSpec(name) {
  return SPRITE_ANIM.sheets[name] || {};
}

function defaultFrameSize(name) {
  if (name.startsWith('item_')) return ITEM_NATIVE_PX;
  if (name === 'casing' || name === 'casing_red') return CASING_NATIVE_PX;
  if (name.startsWith('particle_')) return 15;
  if (name.startsWith('scout')) return SCOUT_NATIVE_PX;
  if (name.startsWith('player_') || name.startsWith('spider')) return CHAR_SIZE;
  if (GUN_SPRITES.some((b) => name === b || name.startsWith(`${b}_`))
    || MELEE_SPRITES.includes(name)) {
    return WEAPON_NATIVE_PX;
  }
  return SPRITE_ANIM.frameH;
}

/** 0-based frame index (4th frame on the revolver reload strip). */
export const REVOLVER_RELOAD_CASING_EJECT_FRAME = 3;

/** Current flipbook frame for a one-shot reload sheet from elapsed seconds. */
export function getReloadAnimFrame(sprite, elapsed) {
  const sheetName = `${sprite}_reload`;
  const meta = loadedSheetMeta[sheetName];
  const fps = meta?.fps ?? getAnimSpec(sheetName).fps ?? SPRITE_ANIM.defaultFps;
  const frameCount = meta?.frameCount ?? 12;
  const idx = Math.floor(Math.max(0, elapsed) * fps);
  return Math.min(idx, frameCount - 1);
}

/** Per-shell reload loop frames (1-based frame numbers from art sheets). */
export const INCREMENTAL_RELOAD_LOOP = {
  m870: { loop: [9, 10, 11, 12], shellSec: 0.5 },
  m24: { loop: [8, 9, 10], shellSec: 0.45 },
};

export function isIncrementalReloadSprite(sprite) {
  return sprite in INCREMENTAL_RELOAD_LOOP;
}

export function getIncrementalReloadSpec(sprite) {
  const cfg = INCREMENTAL_RELOAD_LOOP[sprite];
  if (!cfg) return null;
  const sheetName = `${sprite}_reload`;
  const meta = loadedSheetMeta[sheetName];
  const fps = meta?.fps ?? getAnimSpec(sheetName).fps ?? SPRITE_ANIM.defaultFps;
  const frameCount = meta?.frameCount ?? 12;
  const loop = cfg.loop.map((f) => Math.min(frameCount - 1, Math.max(0, f)));
  const loopStart = loop[0];
  const loopEnd = loop[loop.length - 1];
  return {
    loop,
    shellSec: cfg.shellSec,
    fps,
    frameCount,
    introEnd: Math.min(loopStart - 1, frameCount - 1),
    outroStart: Math.min(loopEnd + 1, frameCount - 1),
    outroEnd: frameCount - 1,
    hasIntro: loopStart > 0,
    hasOutro: loopEnd + 1 < frameCount,
  };
}

/** Resolve reload strip frame for incremental weapons. */
export function getIncrementalReloadFrame(sprite, inc, time) {
  if (!inc) return 0;
  const spec = getIncrementalReloadSpec(sprite);
  if (!spec) return 0;

  if (inc.phase === 'intro') {
    if (!spec.hasIntro) return 0;
    const introFrames = spec.introEnd + 1;
    const introDur = introFrames / spec.fps;
    const t = introDur > 0 ? Math.min(1, (time - inc.phaseStart) / introDur) : 1;
    return Math.min(spec.introEnd, Math.floor(t * introFrames));
  }

  if (inc.phase === 'loop') {
    const shellT = Math.max(0, Math.min(0.999, (time - inc.shellStart) / spec.shellSec));
    const idx = Math.min(spec.loop.length - 1, Math.floor(shellT * spec.loop.length));
    return spec.loop[idx];
  }

  if (inc.phase === 'outro') {
    if (!spec.hasOutro) return spec.loop[spec.loop.length - 1];
    const outroFrames = spec.outroEnd - spec.outroStart + 1;
    const outroDur = outroFrames / spec.fps;
    const t = outroDur > 0 ? Math.min(1, (time - inc.phaseStart) / outroDur) : 1;
    return spec.outroStart + Math.min(outroFrames - 1, Math.floor(t * outroFrames));
  }

  return 0;
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

function drawPlayerRollFrame(g, frame = 1) {
  const skid = frame > 1 ? 2 : 0;
  px(g, 2 + skid, 12, 5, 4, '#d4a878');
  px(g, 6 + skid, 11, 14, 6, '#3a6070');
  px(g, 5 + skid, 12, 12, 5, '#4a8090');
  px(g, 18 + skid, 13, 5, 3, '#2a5060');
  px(g, 1, 14, 5 + skid, 2, '#2a5060');
}

function drawPlayerCrouchFrame(g) {
  px(g, 9, 9, 6, 3, '#d4a878');
  px(g, 7, 12, 10, 7, '#3a6070');
  px(g, 8, 13, 8, 5, '#4a8090');
  px(g, 6, 18, 4, 2, '#2a5060');
  px(g, 14, 18, 4, 2, '#2a5060');
}

function drawPlayerSneakFrame(g, frame = 1) {
  const legs = SNEAK_LEGS[(frame - 1) % 4];
  px(g, 9, 10, 6, 3, '#d4a878');
  px(g, 7, 13, 10, 6, '#3a6070');
  px(g, 8, 14, 8, 4, '#4a8090');
  px(g, legs[0].x, legs[0].y, legs[0].w, legs[0].h, '#2a5060');
  px(g, legs[1].x, legs[1].y, legs[1].w, legs[1].h, '#2a5060');
}

function drawPlayerJumpFrame(g, frame = 1) {
  const tuck = frame > 1 ? 1 : 0;
  px(g, 9, 4 + tuck, 6, 3, '#d4a878');
  px(g, 8, 7 + tuck, 8, 7, '#4a8090');
  px(g, 7, 11 + tuck, 4, 5, '#2a5060');
  px(g, 13, 10 + tuck, 4, 5, '#2a5060');
}

function buildPlayerFallback(kind, frame) {
  const c = makeCanvas(CHAR_SIZE, CHAR_SIZE);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (kind === 'roll') {
    drawPlayerRollFrame(g, frame);
    return c;
  }
  if (kind === 'crouch') {
    drawPlayerCrouchFrame(g);
    return c;
  }
  if (kind === 'sneak') {
    drawPlayerSneakFrame(g, frame);
    return c;
  }
  if (kind === 'jump') {
    drawPlayerJumpFrame(g, frame);
    return c;
  }
  let legs = WALK_LEGS[0];
  if (kind === 'walk') legs = WALK_LEGS[(frame - 1) % 4];
  else if (kind === 'run') legs = RUN_LEGS[(frame - 1) % 4];
  drawPlayerFrame(g, legs[0], legs[1]);
  px(g, CHAR_SIZE - 6, 1, 5, 5, '#e09030');
  return c;
}

function buildPlayerStripFallback(kind) {
  const frames = (kind === 'roll' || kind === 'jump') ? 2 : (kind === 'crouch' ? 1 : 4);
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
  if (name === 'player_roll') return buildPlayerStripFallback('roll');
  if (name === 'player_crouch') return buildPlayerStripFallback('crouch');
  if (name === 'player_sneak') return buildPlayerStripFallback('sneak');
  if (name === 'player_jump') return buildPlayerStripFallback('jump');
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
  const inc = reloadMatch && INCREMENTAL_RELOAD_LOOP[base];
  const frames = inc ? Math.max(14, inc.loop[inc.loop.length - 1] + 2) : 3;
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

function buildWeaponItemFallback(sprite) {
  const c = makeCanvas(ITEM_NATIVE_PX, ITEM_NATIVE_PX);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const o = 1;
  if (GUN_SPRITES.includes(sprite)) {
    drawGunArt(g, sprite, o);
  } else if (MELEE_SPRITES.includes(sprite)) {
    switch (sprite) {
      case 'knife':
        px(g, 7 + o, 2 + o, 2, 9, '#c0c4cc');
        px(g, 6 + o, 9 + o, 4, 3, '#5a4030');
        px(g, 7 + o, 1 + o, 2, 2, '#e8ecf0');
        break;
      case 'fire_axe':
        px(g, 4 + o, 1 + o, 8, 5, '#a03028');
        px(g, 5 + o, 0 + o, 6, 2, '#c84838');
        px(g, 7 + o, 6 + o, 2, 9, '#5a4030');
        break;
      case 'wooden_bat':
        px(g, 7 + o, 0 + o, 3, 13, '#8a6840');
        px(g, 6 + o, 1 + o, 5, 11, '#6a5030');
        px(g, 8 + o, 12 + o, 2, 2, '#4a3828');
        break;
      case 'crowbar':
        px(g, 7 + o, 0 + o, 2, 12, '#707880');
        px(g, 5 + o, 0 + o, 4, 3, '#9098a0');
        px(g, 6 + o, 11 + o, 4, 2, '#606870');
        break;
      default:
        px(g, 0, 0, ITEM_NATIVE_PX, ITEM_NATIVE_PX, '#ff00ff');
    }
  } else {
    px(g, 0, 0, ITEM_NATIVE_PX, ITEM_NATIVE_PX, '#ff00ff');
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
  if (name.startsWith('item_')) {
    return buildWeaponItemFallback(name.slice(5));
  }
  if (name.startsWith('floor_') || name.startsWith('foliage_') || name.startsWith('shack_')) return null;
  if (name.startsWith('player_') || name.startsWith('spider') || name.startsWith('scout')) {
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

/** Roll direction opposite to where the player is aiming. */
export function isRollingBackward(player) {
  if (!player?.roll?.active) return false;
  const fx = Math.sin(player.angle ?? 0);
  const fz = Math.cos(player.angle ?? 0);
  const dot = (player.roll.dirX ?? 0) * fx + (player.roll.dirZ ?? 0) * fz;
  return dot < -0.12;
}

export function getFlipXFromAngle(angle) {
  return !isLookingRight(angle);
}

export function getPlayerFlipX(player) {
  return getFlipXFromAngle(player.angle);
}

/** Melee held horizontal — east when facing right, west when flipped left; ignores aim pitch. */
export const MELEE_HOLD_ANGLE = Math.PI / 2;
export const MELEE_SIDE_HOLD_DIST = 0.64;

export function getMeleeHoldPose(player, lunge = 0) {
  const flipX = getPlayerFlipX(player);
  const sideAngle = flipX ? -Math.PI / 2 : Math.PI / 2;
  const dist = MELEE_SIDE_HOLD_DIST + lunge;
  return {
    angle: MELEE_HOLD_ANGLE,
    flipX,
    worldX: player.x + Math.sin(sideAngle) * dist,
    worldZ: player.z + Math.cos(sideAngle) * dist,
  };
}

export function getPlayerSheet(player, time = 0) {
  if (player.isRolling?.(time)) return 'player_roll';
  if (player.isJumping?.(time)) return 'player_jump';
  if (player.isSneaking) return 'player_sneak';
  if (player.isCrouching) return 'player_crouch';
  if (!player.isMoving) return 'player_idle';
  return player.isSprinting ? 'player_run' : 'player_walk';
}

/** Animation state for flipbook player sheets. */
export function getPlayerAnim(player, time = 0) {
  if (player.isRolling?.(time)) {
    return {
      elapsed: Math.max(0, time - (player.roll.startTime ?? 0)),
      reverse: isRollingBackward(player),
    };
  }
  if (player.isJumping?.(time)) {
    return { elapsed: Math.max(0, time - (player.jump.startTime ?? 0)) };
  }
  if (player.isSneaking) {
    return { phase: player.walkPhase, reverse: !isMovingForward(player) };
  }
  if (player.isCrouching) return { time };
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

/** Scout walk — synced to walk flipbook fps; heavier landing, shadow stays grounded. */
export function getScoutWalkBounceY(animTime, moving, fps = SCOUT_WALK_FPS, amp = 2.2) {
  if (!moving) return 0;
  const t = (animTime * fps) % 1;
  if (t < 0.18) {
    return -Math.pow(t / 0.18, 0.5) * amp;
  }
  const u = (t - 0.18) / 0.82;
  return -amp + amp * Math.pow(u, 3.6);
}

export function getPlayerBounceY(player, time = 0) {
  if (player.isRolling?.(time) || player.isCrouching || player.isSneaking) return 0;
  if (player.isJumping?.(time)) {
    const t = player.getJumpT?.(time) ?? 0;
    return -Math.sin(t * Math.PI) * 11;
  }
  const amp = player.isSprinting ? 2.8 : 1.8;
  return getWalkBounceY(player.walkPhase, player.isMoving, amp);
}

/** Subtle idle bob for held weapon — syncs with standing/breathing (screen px, negative = up). */
export const IDLE_BREATH_AMP = 1.1;
export const IDLE_BREATH_HZ = 0.42;

export function getPlayerIdleBreathY(player, time = 0) {
  if (player.isMoving || player.isCrouching || player.isSneaking || player.isMeleeAnimating?.(time)) return 0;
  if (player.isRolling?.(time) || player.isJumping?.(time)) return 0;
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

/** Enemy body sheet — scout uses charge strip while winding up / firing. */
export function getEnemyBodySheet(type, moving, shootPhase = null) {
  if (type === 'scout') {
    if (shootPhase === 'charging' || shootPhase === 'firing') return 'scout_charge';
    return getWalkSheet('scout', moving);
  }
  return getWalkSheet(type, moving);
}

/** Flipbook timing for enemy body sheets. */
export function getEnemyBodyAnim(type, moving, shootPhase, time = 0, chargeAnimStart = null, opts = {}) {
  if (type === 'scout' && (shootPhase === 'charging' || shootPhase === 'firing')) {
    const elapsed = chargeAnimStart != null ? Math.max(0, time - chargeAnimStart) : 0;
    return { elapsed };
  }
  const walkSpeedMult = opts.walkSpeedMult ?? 1;
  return getWalkAnim(moving, time * walkSpeedMult);
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
    this._pathImages = {};
    this._iconDataUrlCache = new Map();
    this.flipbooks = {};
    this.ready = false;
    this._preloadPromise = null;
    this._tileBitmapCache = new Map();
    this._tileBitmapOrder = [];
    this._tileBitmapMax = 384;
  }

  getImageByPath(path) {
    return this._pathImages[path] ?? null;
  }

  getIconDataUrl(path) {
    if (this._iconDataUrlCache.has(path)) return this._iconDataUrlCache.get(path);
    const img = this._pathImages[path];
    if (!img?.complete || !img.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    const url = c.toDataURL('image/png');
    this._iconDataUrlCache.set(path, url);
    return url;
  }

  async decodePaths(paths) {
    const list = paths instanceof Set ? [...paths] : paths;
    await Promise.all(list.map((path) => {
      const img = this._pathImages[path];
      if (!img?.decode) return Promise.resolve();
      return img.decode().catch(() => {});
    }));
  }

  _loadPathOnly(path) {
    if (this._pathImages[path]) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      const finish = () => {
        this._pathImages[path] = img;
        if (img.decode) img.decode().then(resolve).catch(resolve);
        else resolve();
      };
      img.onload = finish;
      img.onerror = () => resolve();
      img.src = path;
    });
  }

  async ensurePaths(paths) {
    const list = paths instanceof Set ? [...paths] : paths;
    const missing = list.filter((p) => !this._pathImages[p]);
    if (missing.length) await Promise.all(missing.map((p) => this._loadPathOnly(p)));
    await this.decodePaths(list);
    for (const p of list) this.getIconDataUrl(p);
  }

  /** Pre-decode inventory + UI icons for instant DOM slots on mobile. */
  async decodeItemIcons() {
    const paths = Object.values(ASSET_PATHS).filter((p) =>
      p.startsWith('assets/items/') || p.startsWith('assets/ui/'),
    );
    await this.ensurePaths(paths);
  }

  async warmInventoryIcons() {
    await this.decodeItemIcons();
  }

  preloadAll() {
    if (!this._preloadPromise) {
      this._preloadPromise = this.loadAll()
        .then(() => this.warmInventoryIcons())
        .catch(() => {});
    }
    return this._preloadPromise;
  }

  async loadAll() {
    if (this.ready) return;
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
      } else if (w === h && w > frameW) {
        frameW = w;
        frameH = h;
        frameCount = 1;
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
      let idx = Math.floor(Math.max(0, anim.elapsed) * fb.fps);
      idx = Math.min(idx, fb.frameCount - 1);
      if (anim.reverse) idx = fb.frameCount - 1 - idx;
      return idx;
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
      img.decoding = 'async';
      const finish = () => {
        this.images[name] = img;
        this._pathImages[path] = img;
        this._parseFlipbook(name, img);
        resolve();
      };
      img.onload = () => {
        if (img.decode) img.decode().then(finish).catch(finish);
        else finish();
      };
      img.onerror = () => {
        if (!name.startsWith('floor_') && !name.startsWith('foliage_') && !name.startsWith('shack_')) {
          const fallback = buildFallback(name);
          if (fallback) {
            this.images[name] = fallback;
            this._pathImages[path] = fallback;
            this._parseFlipbook(name, fallback);
          }
        }
        resolve();
      };
      img.src = path;
    });
  }

  draw(ctx, name, sx, sy, scale = 2, angle = 0, flipX = false, pivot = 'center', chopTilt = 0, anim = null) {
    const img = this.images[name] ?? this._getImage(name);
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
    if (typeof pivot === 'object' && pivot.nx != null && pivot.ny != null) {
      pivotX = pivot.nx;
      pivotY = pivot.ny;
    } else if (pivot === 'shoulder') {
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
    ctx.translate(Math.round(sx), Math.round(sy));
    if (flipX) ctx.scale(-1, 1);
    if (angle) ctx.rotate(angle);
    if (chopTilt) ctx.rotate(chopTilt);
    ctx.drawImage(img, srcX, srcY, fw, fh, -ox, -oy, dw, dh);
    ctx.restore();
  }

  _getImage(name) {
    if (this.images[name]) return this.images[name];
    if (name.startsWith('floor_') || name.startsWith('foliage_') || name.startsWith('shack_')) return null;
    const fallback = buildFallback(name);
    if (!fallback) return null;
    this.images[name] = fallback;
    if (name.startsWith('floor_') || name.startsWith('foliage_')) this._parseFlipbook(name, fallback);
    return fallback;
  }

  _tintKey(tint) {
    if (!tint) return 0;
    if (tint.a && tint.b) {
      const ka = ((tint.a.r >> 4) << 8) | ((tint.a.g >> 4) << 4) | (tint.a.b >> 4);
      const kb = ((tint.b.r >> 4) << 8) | ((tint.b.g >> 4) << 4) | (tint.b.b >> 4);
      if (ka === kb) return ka;
      return (ka << 12) | kb;
    }
    return ((tint.r >> 4) << 8) | ((tint.g >> 4) << 4) | (tint.b >> 4);
  }

  _applyTintToTile(nc, img, srcSize, tint) {
    const a = tint.a || tint;
    const b = tint.b || tint;
    const c = tint.c || a;
    const flat = a.r === b.r && a.g === b.g && a.b === b.b
      && c.r === a.r && c.g === a.g && c.b === a.b;
    if (flat) {
      nc.fillStyle = `rgb(${a.r},${a.g},${a.b})`;
      nc.fillRect(0, 0, srcSize, srcSize);
      nc.globalCompositeOperation = 'destination-in';
      nc.drawImage(img, 0, 0, srcSize, srcSize);
      nc.globalCompositeOperation = 'multiply';
      nc.drawImage(img, 0, 0, srcSize, srcSize);
      return;
    }
    const grad = nc.createLinearGradient(0, 0, srcSize, 0);
    const stops = 5;
    for (let i = 0; i <= stops; i++) {
      const t = i / stops;
      const u = t * t * (3 - 2 * t);
      const r = Math.round(a.r + (b.r - a.r) * u);
      const g = Math.round(a.g + (b.g - a.g) * u);
      const bl = Math.round(a.b + (b.b - a.b) * u);
      grad.addColorStop(t, `rgb(${r},${g},${bl})`);
    }
    nc.fillStyle = grad;
    nc.fillRect(0, 0, srcSize, srcSize);
    nc.globalCompositeOperation = 'destination-in';
    nc.drawImage(img, 0, 0, srcSize, srcSize);
    nc.globalCompositeOperation = 'multiply';
    nc.drawImage(img, 0, 0, srcSize, srcSize);
  }

  _cacheTileBitmap(key, canvas) {
    if (!this._tileBitmapCache.has(key)) {
      this._tileBitmapOrder.push(key);
      if (this._tileBitmapOrder.length > this._tileBitmapMax) {
        const old = this._tileBitmapOrder.shift();
        this._tileBitmapCache.delete(old);
      }
    }
    this._tileBitmapCache.set(key, canvas);
    return canvas;
  }

  getTileBitmap(name, px, tint) {
    const img = this.images[name];
    if (!img) return null;

    const srcSize = img.naturalWidth || img.width || 16;
    const outPx = Math.round(px);
    const scale = Math.max(1, Math.round(outPx / srcSize));
    const bakedPx = srcSize * scale;
    const tintKey = this._tintKey(tint);
    const key = `${name}:${outPx}:${tintKey}`;
    const hit = this._tileBitmapCache.get(key);
    if (hit) return hit;

    const native = document.createElement('canvas');
    native.width = srcSize;
    native.height = srcSize;
    const nc = native.getContext('2d');
    nc.imageSmoothingEnabled = false;
    nc.drawImage(img, 0, 0, srcSize, srcSize);
    if (tint) {
      this._applyTintToTile(nc, img, srcSize, tint);
    }

    const canvas = document.createElement('canvas');
    canvas.width = outPx;
    canvas.height = outPx;
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    if (bakedPx === outPx) {
      c.drawImage(native, 0, 0, outPx, outPx);
    } else {
      c.drawImage(native, 0, 0, bakedPx, bakedPx, 0, 0, outPx, outPx);
    }
    return this._cacheTileBitmap(key, canvas);
  }

  stampTile(ctx, name, sx, sy, tilePx, tint = null, alpha = 1) {
    const px = Math.round(tilePx);
    const bmp = this.getTileBitmap(name, px, tint);
    if (!bmp) return;
    const x = Math.round(sx);
    const y = Math.round(sy);
    const prev = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.drawImage(bmp, x, y, px, px);
    ctx.globalAlpha = prev;
  }

  drawTile(ctx, name, sx, sy, tilePx, tint = null) {
    const px = Math.round(tilePx);
    const bmp = this.getTileBitmap(name, px, tint);
    if (!bmp) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, Math.round(sx), Math.round(sy), px, px);
  }
}
