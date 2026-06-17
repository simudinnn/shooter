import { World, TILE } from './world.js';
import { ChunkEntityManager } from './chunkEntities.js';
import { unpackTintGradient, getBiome, isTreeFoliage, rollWorldSeed } from './worldGen.js';
import { Player, BulletPool, WEAPONS, GUN_HOLD_OFFSET, findBulletSpawn } from './player.js';
import { createExplosion, createGroundSpew, updateParticles } from './enemies.js';
import { SoundManager } from './audio.js';
import { Minimap } from './minimap.js';
import { ItemManager } from './items.js';
import { ChestManager, CHEST_DRAW_SCALE, CHEST_OPAQUE_HALF_W, CHEST_OPAQUE_HALF_H, CHEST_DRAW_PIVOT } from './chests.js';
import { chestSpriteName } from './loot.js';
import { SpriteBank, gunAimTransform, gunPivotHoldOffset, getReloadPoseBlend, getReloadHoldScreenX, getMeleeHoldPose, getWalkSheet, getWalkAnim, getEnemyBodySheet, getEnemyBodyAnim, velToSpriteAngle, getPlayerSheet, getPlayerAnim, getPlayerFlipX, getPlayerBounceY, getPlayerIdleBreathY, getWalkBounceY, getScoutWalkBounceY, getFlipXFromAngle, isMovingForward, CHAR_NATIVE_PX, getEnemyNativePx, getEnemyDrawScale, spriteFeetOffset, PARTICLE_FX_NATIVE_PX, getParticleFxSprite, getParticleFxAnim, CURSOR_DRAW_SCALE } from './sprites.js';
import { collectCollisionTargets, moveWithEntityCollision } from './collision.js';
import { createStepDust, createBulletCasing, createBloodSplatter, createRobotHitSparks, createRobotSmoke, createRobotFire, createRobotDeathFx, PARTICLE_SIZE_UNIT } from './particles.js';
import { VirtualJoystick } from './joystick.js';
import { InventoryUI } from './inventory.js';
import { snapCamLean, worldToScreen, camPixelsFromPlayer, leanPixelsFromOffset, drawPixelEllipseShadow, PPU, INTERNAL_W, INTERNAL_H, RENDER_SCALE } from './renderConfig.js';

const SPRITE_PLAYER = 1.50;
const SPRITE_CHEST = CHEST_DRAW_SCALE;
const SPRITE_CRATE = 2.2;
const SPRITE_BULLET = 1.2;
const SPRITE_CASING = 1.5;
const SPRITE_GUN = 1.35;
const SPRITE_CURSOR = CURSOR_DRAW_SCALE;
const AUTO_AIM_TURN_RATE = 16;
const AUTO_AIM_TARGET_TURN_RATE = 4.5;
const AUTO_AIM_STICK_TURN_RATE = 12;
const AUTO_AIM_SCREEN_PAD = 28;
/** Subtle camera lean toward cursor (world units = px / PPU). */
const CAM_FOLLOW_STRENGTH = 0.15;
const CAM_FOLLOW_MAX_PX = 64;
const CAM_FOLLOW_SMOOTH = 50;

class Game {
  constructor() {
    this.running = false;
    this.kills = 0;
    this.startTime = 0;
    this.particles = [];
    this._weaponBreathY = 0;
    this._lastWalkStep = -1;
    this._lastBounceLand = -1;
    this.mouseDown = false;
    this.prevMouseDown = false;
    this._lastMoveDirX = 0;
    this._lastMoveDirZ = 0;
    this._lastMoveTime = 0;
    this.keys = {};
    this.modifiers = { ctrl: false, shift: false };
    this.audio = new SoundManager();
    this.sprites = new SpriteBank();
    this.mouse = { sx: INTERNAL_W / 2, sy: INTERNAL_H / 2, wx: 0, wz: 0, clientX: 0, clientY: 0 };
    this.camOffset = { x: 0, z: 0 };
    this._camPxX = 0;
    this._camPxZ = 0;
    this._camLeanPxX = 0;
    this._camLeanPxZ = 0;
    this.touchMove = { x: 0, z: 0 };
    this.mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this._initCanvas();
    this._initUI();
    this._bindEvents();
    this._minimapTick = 0;
  }

  _initCanvas() {
    this.canvas = document.getElementById('game-canvas');
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.style.outline = 'none';
    this.ctx = this.canvas.getContext('2d');
    this.renderScale = RENDER_SCALE;
    this.canvas.width = INTERNAL_W * RENDER_SCALE;
    this.canvas.height = INTERNAL_H * RENDER_SCALE;
    this.ctx.imageSmoothingEnabled = false;
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const bufW = INTERNAL_W * this.renderScale;
    const bufH = INTERNAL_H * this.renderScale;
    const scale = Math.max(
      window.innerWidth / bufW,
      window.innerHeight / bufH,
    );
    this.displayScale = scale;
    this.canvas.style.width = `${bufW * scale}px`;
    this.canvas.style.height = `${bufH * scale}px`;
  }

  _initUI() {
    this.el = {
      startScreen: document.getElementById('start-screen'),
      gameOver: document.getElementById('game-over'),
      gameOverTitle: document.getElementById('game-over-title'),
      gameOverStats: document.getElementById('game-over-stats'),
      hud: document.getElementById('hud'),
      healthBar: document.getElementById('health-bar'),
      healthText: document.getElementById('health-text'),
      pickupStatus: document.getElementById('pickup-status'),
      powerupStatus: document.getElementById('powerup-status'),
      interactPrompt: document.getElementById('interact-prompt'),
      weaponName: document.getElementById('weapon-name'),
      ammoCurrent: document.getElementById('ammo-current'),
      ammoReserve: document.getElementById('ammo-reserve'),
      reloadIndicator: document.getElementById('reload-indicator'),
      zoneLabel: document.getElementById('zone-label'),
      damageFlash: document.getElementById('damage-flash'),
      startBtn: document.getElementById('start-btn'),
      restartBtn: document.getElementById('restart-btn'),
      minimapCanvas: document.getElementById('minimap'),
      mobileControls: document.getElementById('mobile-controls'),
      waveBanner: document.getElementById('wave-banner'),
      inventory: document.getElementById('inventory'),
    };
    this.minimap = new Minimap(this.el.minimapCanvas);
    this.inventoryUI = new InventoryUI(this);
    this._waveBannerTimer = null;
  }

  showWaveBanner(text, duration = 2) {
    if (!this.el.waveBanner) return;
    const banner = this.el.waveBanner;
    banner.textContent = text;
    banner.classList.toggle('cleared', text.toLowerCase().includes('cleared'));
    banner.classList.remove('hidden');
    requestAnimationFrame(() => banner.classList.add('show'));
    clearTimeout(this._waveBannerTimer);
    this._waveBannerTimer = setTimeout(() => {
      banner.classList.remove('show');
      setTimeout(() => {
        banner.classList.add('hidden');
        banner.classList.remove('cleared');
      }, 280);
    }, duration * 1000);
  }

  _syncKeyboardModifiers(e) {
    this.modifiers.ctrl = e.ctrlKey;
    this.modifiers.shift = e.shiftKey;
  }

  _isShiftHeld() {
    return this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.modifiers.shift;
  }

  _blockGameShortcuts(e) {
    if (!this.running) return false;
    if (e.code === 'F5') return false;
    if (e.ctrlKey || e.metaKey) return true;
    if (e.altKey && (e.code.startsWith('Key') || e.code.startsWith('Digit'))) return true;
    return false;
  }

  _onGameKeyDown(e) {
    if (this.running && e.ctrlKey && (e.code === 'KeyW' || e.key?.toLowerCase() === 'w')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    this._syncKeyboardModifiers(e);
    if (this._blockGameShortcuts(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      if (this.running && !e.repeat) this.inventoryUI.toggle();
      return;
    }
    if (!e.repeat) this.keys[e.code] = true;
    if (!this.running) return;
    if (e.repeat) return;
    if (this.inventoryUI?.isOpen()) return;
    if (e.code === 'KeyR') this._tryStartReload(performance.now() / 1000);
    if (e.code === 'KeyE') this._tryOpenNearbyChest();
    if (e.code === 'Digit1') this.player.setWeaponSlot('gun');
    if (e.code === 'Digit2') this.player.setWeaponSlot('melee');
  }

  _onGameKeyUp(e) {
    this.keys[e.code] = false;
    this._syncKeyboardModifiers(e);
    if (this._blockGameShortcuts(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  _clearKeyboardInput() {
    this.keys = {};
    this.modifiers = { ctrl: false, shift: false };
    this.mouseDown = false;
  }

  _bindEvents() {
    this.el.startBtn.addEventListener('click', () => this.start());
    this.el.restartBtn.addEventListener('click', () => this.start());
    window.addEventListener('resize', () => this._resizeCanvas());

    window.addEventListener('keydown', (e) => this._onGameKeyDown(e), true);
    window.addEventListener('keyup', (e) => this._onGameKeyUp(e), true);
    window.addEventListener('blur', () => this._clearKeyboardInput());

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.canvas.focus();
        this.audio.resume();
        this.mouseDown = true;
      } else if (e.button === 2 && this.running && !this.inventoryUI?.isOpen()) {
        const chest = this._getChestUnderCursor();
        if (chest) this.inventoryUI.openChest(chest);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    document.addEventListener('mousemove', (e) => this._onMouseMove(e));
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());

    this.canvas.addEventListener('wheel', (e) => {
      if (!this.running || this.inventoryUI?.isOpen()) return;
      e.preventDefault();
      if (this.player?.toggleWeaponSlot()) this.audio.weaponSwitch();
    }, { passive: false });

    this._bindMobileControls();
  }

  _bindMobileControls() {
    if (!this.el.mobileControls) return;

    const bindPress = (id, onPress) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      let lastAt = 0;
      const run = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - lastAt < 250) return;
        lastAt = now;
        onPress();
      };
      btn.addEventListener('pointerdown', run, { passive: false });
    };

    const bindHold = (id, onDown, onUp) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      let held = false;
      const start = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (held) return;
        held = true;
        onDown();
      };
      const end = (e) => {
        if (!held) return;
        held = false;
        e.preventDefault();
        onUp();
      };
      btn.addEventListener('pointerdown', start, { passive: false });
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', end);
    };

    this.moveJoystick = new VirtualJoystick(
      document.getElementById('move-joystick-base'),
      document.getElementById('move-joystick-knob'),
      {
        onChange: (x, y) => {
          this.touchMove.x = x;
          this.touchMove.z = y;
        },
      },
    );

    bindHold('mb-fire', () => {
      this.audio.resume();
      this.mouseDown = true;
    }, () => { this.mouseDown = false; });

    bindPress('mb-reload', () => {
      if (this.running) this._tryStartReload(performance.now() / 1000);
    });

    bindPress('mb-gun', () => { if (this.running) this.player?.setWeaponSlot('gun'); });
    bindPress('mb-knife', () => { if (this.running) this.player?.setWeaponSlot('melee'); });

    bindPress('mb-interact', () => {
      if (this.running) {
        this.audio.resume();
        this._tryOpenNearbyChest();
      }
    });

    bindPress('mb-inventory', () => {
      if (this.running) this.inventoryUI.toggle();
    });

    if (this.mobile) {
      this.el.mobileControls.classList.remove('hidden');
      document.body.classList.add('mobile-ui');
    }
  }

  _getMoveInput() {
    let moveX = 0;
    let moveZ = 0;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ -= 1;
    const stickMag = Math.hypot(this.touchMove.x, this.touchMove.z);
    if (stickMag > 0.12) {
      moveX += this.touchMove.x;
      moveZ += this.touchMove.z;
    }
    return { moveX, moveZ };
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * INTERNAL_W;
    const sy = ((e.clientY - rect.top) / rect.height) * INTERNAL_H;
    this.mouse.sx = Math.max(0, Math.min(INTERNAL_W, sx));
    this.mouse.sy = Math.max(0, Math.min(INTERNAL_H, sy));
    this.mouse.clientX = e.clientX;
    this.mouse.clientY = e.clientY;
  }

  _angleDelta(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  _isWorldOnScreen(wx, wz, pad = AUTO_AIM_SCREEN_PAD) {
    const s = this._worldToScreen(wx, wz);
    return s.x >= -pad && s.x <= INTERNAL_W + pad && s.y >= -pad && s.y <= INTERNAL_H + pad;
  }

  _findNearestRobotOnScreen() {
    let best = null;
    let bestDist = Infinity;

    for (const robot of this.robots) {
      if (!robot.alive && !robot.emerging) continue;
      if (!this._isWorldOnScreen(robot.x, robot.z)) continue;
      const dx = robot.x - this.player.x;
      const dz = robot.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = robot;
      }
    }
    return best;
  }

  _setAimCursorFromAngle(angle, distPx = 72) {
    this.mouse.sx = INTERNAL_W / 2 + Math.sin(angle) * distPx;
    this.mouse.sy = INTERNAL_H / 2 + Math.cos(angle) * distPx;
    if (this.player) {
      const worldDist = distPx / PPU;
      this.mouse.wx = this.player.x + Math.sin(angle) * worldDist;
      this.mouse.wz = this.player.z + Math.cos(angle) * worldDist;
    }
  }

  _rotateAimToward(desired, dt, turnRate = AUTO_AIM_TURN_RATE) {
    const delta = this._angleDelta(this.player.angle, desired);
    const step = turnRate * dt;
    if (Math.abs(delta) <= step) this.player.angle = desired;
    else this.player.angle += Math.sign(delta) * step;
  }

  _syncAim(dt) {
    if (!this.running || !this.player) return;

    if (this.mobile) {
      let cursorSx;
      let cursorSy;
      let turnRate = null;

      const target = this._findNearestRobotOnScreen();
      if (target) {
        const ts = this._worldToScreen(target.x, target.z);
        cursorSx = ts.x;
        cursorSy = ts.y;
        this.mouse.wx = target.x;
        this.mouse.wz = target.z;
        turnRate = AUTO_AIM_TARGET_TURN_RATE;
      } else {
        const stickMag = Math.hypot(this.touchMove.x, this.touchMove.z);
        if (stickMag > 0.12) {
          const stickAngle = Math.atan2(this.touchMove.x, this.touchMove.z);
          const distPx = 72;
          cursorSx = INTERNAL_W / 2 + Math.sin(stickAngle) * distPx;
          cursorSy = INTERNAL_H / 2 + Math.cos(stickAngle) * distPx;
          const w = this._screenToWorld(cursorSx, cursorSy);
          this.mouse.wx = w.x;
          this.mouse.wz = w.z;
          turnRate = AUTO_AIM_STICK_TURN_RATE;
        } else {
          this._setAimCursorFromAngle(this.player.angle);
          this.player.angle = this._resolveAimAngle(this.mouse.sx, this.mouse.sy);
          return;
        }
      }

      this.mouse.sx = cursorSx;
      this.mouse.sy = cursorSy;
      const desired = this._resolveAimAngle(cursorSx, cursorSy);
      this._rotateAimToward(desired, dt, turnRate);
      return;
    }

    const target = this._screenToWorld(this.mouse.sx, this.mouse.sy);
    this.mouse.wx = target.x;
    this.mouse.wz = target.z;
    this.player.angle = this._resolveAimAngle(this.mouse.sx, this.mouse.sy);
  }

  _updateCameraFollow(dt) {
    if (!this.player) return;
    const decay = 1 - Math.exp(-CAM_FOLLOW_SMOOTH * dt);
    if (this.mobile || this.inventoryUI?.isOpen()) {
      this.camOffset.x += (0 - this.camOffset.x) * decay;
      this.camOffset.z += (0 - this.camOffset.z) * decay;
      return;
    }
    const dx = (this.mouse.sx - INTERNAL_W / 2) / PPU;
    const dz = (this.mouse.sy - INTERNAL_H / 2) / PPU;
    let tx = dx * CAM_FOLLOW_STRENGTH;
    let tz = dz * CAM_FOLLOW_STRENGTH;
    const maxW = CAM_FOLLOW_MAX_PX / PPU;
    const len = Math.hypot(tx, tz);
    if (len > maxW) {
      tx = tx / len * maxW;
      tz = tz / len * maxW;
    }
    this.camOffset.x += (tx - this.camOffset.x) * decay;
    this.camOffset.z += (tz - this.camOffset.z) * decay;
    this.camOffset.x = snapCamLean(this.camOffset.x);
    this.camOffset.z = snapCamLean(this.camOffset.z);
  }

  _syncCamPixels() {
    if (!this.player) {
      this._camPxX = 0;
      this._camPxZ = 0;
      this._camLeanPxX = 0;
      this._camLeanPxZ = 0;
      return;
    }
    const cp = camPixelsFromPlayer(this.player.x, this.player.z);
    this._camPxX = cp.x;
    this._camPxZ = cp.z;
    const lean = leanPixelsFromOffset(this.camOffset.x, this.camOffset.z);
    this._camLeanPxX = lean.x;
    this._camLeanPxZ = lean.z;
  }

  _camTranslate() {
    return {
      x: -this._camPxX - this._camLeanPxX + (INTERNAL_W >> 1),
      y: -this._camPxZ - this._camLeanPxZ + (INTERNAL_H >> 1),
    };
  }

  _camera() {
    if (!this.player) return { x: 0, z: 0 };
    return {
      x: this.player.x + this.camOffset.x,
      z: this.player.z + this.camOffset.z,
    };
  }

  /** Visible world rect — matches ground draw culling (+ optional margin). */
  getViewBoundsWorld(margin = TILE) {
    const cam = this._camera();
    const viewHalfW = INTERNAL_W / PPU / 2 + margin;
    const viewHalfH = INTERNAL_H / PPU / 2 + margin;
    return {
      minX: cam.x - viewHalfW,
      maxX: cam.x + viewHalfW,
      minZ: cam.z - viewHalfH,
      maxZ: cam.z + viewHalfH,
    };
  }

  isWorldPointOnScreen(wx, wz, extraPad = 0) {
    const v = this.getViewBoundsWorld(TILE);
    const pad = extraPad;
    return wx >= v.minX - pad && wx <= v.maxX + pad && wz >= v.minZ - pad && wz <= v.maxZ + pad;
  }

  _worldToScreen(wx, wz) {
    return worldToScreen(wx, wz, this._camPxX, this._camPxZ, this._camLeanPxX, this._camLeanPxZ);
  }

  /** Inverse of _worldToScreen — world point under a screen pixel. */
  _screenToWorld(sx, sy) {
    return {
      x: (sx - (INTERNAL_W >> 1) + this._camPxX + this._camLeanPxX) / PPU,
      z: (sy - (INTERNAL_H >> 1) + this._camPxZ + this._camLeanPxZ) / PPU,
    };
  }

  _gunWorldPos(angle) {
    const aim = gunAimTransform(angle);
    const hold = GUN_HOLD_OFFSET + gunPivotHoldOffset(aim.angle);
    return {
      x: this.player.x + Math.sin(angle) * hold,
      z: this.player.z + Math.cos(angle) * hold,
    };
  }

  /** Aim so the bullet path on screen passes through the cursor (accounts for barrel lift). */
  _resolveAimAngle(cursorSx, cursorSy) {
    let angle = this.player.angle;
    for (let i = 0; i < 6; i++) {
      const spawn = findBulletSpawn(this.world, this.player.x, this.player.z, angle);
      let ss;
      if (spawn) {
        ss = this._worldToScreen(spawn.x, spawn.z);
      } else {
        const gun = this._gunWorldPos(angle);
        ss = this._worldToScreen(gun.x, gun.z);
      }
      const next = Math.atan2(cursorSx - ss.x, cursorSy - ss.y);
      const delta = this._angleDelta(angle, next);
      angle = next;
      if (Math.abs(delta) < 0.00005) break;
    }
    return angle;
  }

  /** World Z at sprite feet — used for depth sort vs foliage bases. */
  _feetSortZ(wx, wz, nativePx, scale) {
    return wz + spriteFeetOffset(nativePx, scale) / PPU;
  }

  _playerSortZ() {
    return this._feetSortZ(this.player.x, this.player.z, CHAR_NATIVE_PX, SPRITE_PLAYER);
  }

  /** Depth in front of enemy sprites — sparks sort at body center but enemies use feet Z. */
  _inFrontOfEnemySortZ(wx, wz) {
    let z = wz;
    for (const type of ['spider', 'scout']) {
      z = Math.max(z, this._feetSortZ(wx, wz, getEnemyNativePx(type), getEnemyDrawScale(type)));
    }
    return z + 0.04;
  }

  start() {
    this.el.startBtn.disabled = true;
    this.el.restartBtn.disabled = true;
    this._bootGame()
      .catch((err) => {
        console.error('Deploy/start failed:', err);
        this.el.startScreen?.classList.remove('hidden');
        this.el.gameOver?.classList.add('hidden');
        this.el.hud?.classList.add('hidden');
      })
      .finally(() => {
        this.el.startBtn.disabled = false;
        this.el.restartBtn.disabled = false;
      });
  }

  async _bootGame() {
    this.audio.init();
    this.audio.resume();

    await this.sprites.loadAll();

    rollWorldSeed();
    this.world = new World();
    await this.world.build();
    this.world.prewarmGround(this.sprites, PPU);
    this.player = new Player();
    const spawn = this.world.getPlayerSpawn();
    this.player.x = spawn.x;
    this.player.z = spawn.z;
    this.bullets = new BulletPool();
    this.robots = [];
    this.chunkEntities = new ChunkEntityManager(this.world, this);
    this.chunkEntities.reset();
    this.items = new ItemManager(this.world);
    this.chests = new ChestManager(this.world);
    this.particles = [];
    this._weaponBreathY = 0;
    this.camOffset = { x: 0, z: 0 };
    this._camPxX = 0;
    this._camPxZ = 0;
    this._camLeanPxX = 0;
    this._camLeanPxZ = 0;
    this._lastWalkStep = -1;
    this._lastBounceLand = -1;
    this.kills = 0;
    this.startTime = performance.now();
    this.running = true;

    this.canvas.focus();

    this.el.startScreen.classList.add('hidden');
    this.el.gameOver.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    document.body.classList.add('game-active');
    if (this.mobile) this.el.mobileControls?.classList.remove('hidden');
    if (this.mobile) document.body.classList.add('mobile-ui');

    this.lastTime = performance.now();
    this._loop();
  }

  _update(dt, time) {
    const inventoryOpen = this.inventoryUI?.isOpen();

    if (!inventoryOpen) {
      this.player.updateMobility(time);

      const { moveX: rawMoveX, moveZ: rawMoveZ } = this._getMoveInput();
      let moveX = rawMoveX;
      let moveZ = rawMoveZ;

      const stickMag = Math.hypot(this.touchMove.x, this.touchMove.z);
      const usingStick = stickMag > 0.12;

      const sprintInput = this._isShiftHeld();
      this.player.isMoving = moveX !== 0 || moveZ !== 0;

      if (this.player.isMoving) {
        const len = Math.hypot(moveX, moveZ);
        if (len > 0.01) {
          this.player.moveDirX = moveX / len;
          this.player.moveDirZ = moveZ / len;
        }
        let sprint;
        if (this.mobile && usingStick) {
          sprint = stickMag > 0.9 && isMovingForward(this.player);
        } else {
          sprint = sprintInput && isMovingForward(this.player);
        }
        const speed = this.player.speed * (sprint ? this.player.sprintMult : 1) * this.player.getSpeedMult(time);
        this.player.isSprinting = sprint;
        const analog = Math.min(1, len);
        moveX = (moveX / len) * speed * dt * analog;
        moveZ = (moveZ / len) * speed * dt * analog;
        const targets = collectCollisionTargets({ player: this.player, robots: this.robots, exclude: this.player });
        const moveShape = this.player.getMoveCollider(PPU);
        const r = moveWithEntityCollision(
          this.world,
          this.player.x,
          this.player.z,
          moveX,
          moveZ,
          moveShape,
          moveShape,
          targets,
          this.player,
        );
        this.player.x = r.x;
        this.player.z = r.z;
        const walkRate = this.player.isSprinting ? 9 : 6;
        this.player.walkPhase += dt * walkRate;

        const bounceLand = Math.floor(this.player.walkPhase / 2);
        if (bounceLand !== this._lastBounceLand) {
          this._lastBounceLand = bounceLand;
          if (bounceLand > 0) {
            const mx = this.player.moveDirX ?? 0;
            const mz = this.player.moveDirZ ?? 0;
            const feetOffZ = spriteFeetOffset(CHAR_NATIVE_PX, SPRITE_PLAYER) / PPU;
            const feetX = this.player.x - mx * 0.1;
            const feetZ = this.player.z + feetOffZ - mz * 0.1;
            this.particles.push(...createStepDust(feetX, feetZ));
            this.audio.footstep();
          }
        }
      } else {
        this.player.isSprinting = false;
        this._lastWalkStep = -1;
        this._lastBounceLand = -1;
      }

      this._updateCameraFollow(dt);
      this._syncAim(dt);

      const fireEdge = this.mouseDown && !this.prevMouseDown;
      const fireRelease = !this.mouseDown && this.prevMouseDown;
      const wantsShoot = this.player.isAutomaticWeapon()
        ? this.mouseDown
        : fireEdge;

      if (this.player.isMeleeActive()) {
        if (this.mouseDown && this.player.canMeleeCharge(time)) {
          this.player.startMeleeCharge(time);
        }
        if (fireRelease && this.player.isMeleeCharging()) {
          this.player.releaseMeleeCharge(time);
        }
        this._updateMeleeStrike(time);
      } else if (wantsShoot) {
        if (this.player.canShoot(time)) {
          this._fireGun(time);
        } else if (this.player.wantsAutoReload(time)) {
          this._tryStartReload(time);
        }
      }

      this.prevMouseDown = this.mouseDown;
    } else {
      this.player.isMoving = false;
      this.player.isSprinting = false;
      this.player.moveDirX = 0;
      this.player.moveDirZ = 0;
      this._lastWalkStep = -1;
      this._lastBounceLand = -1;
      this.prevMouseDown = this.mouseDown;
    }

    if (inventoryOpen) this._updateCameraFollow(dt);
    const reloadResult = this.player.updateReload(time);
    if (reloadResult?.ejectCasings > 0) {
      const cfg = WEAPONS[this.player.weaponKey];
      this._emitCasings(reloadResult.ejectCasings, cfg?.casingColor || 'yellow');
    }
    this._updateMidCooldownCasings(time);
    this.player.updateGunKick(dt);

    this.items.update(dt);
    this.chunkEntities.update(this.player);
    this.bullets.update(dt, this.world, (b) => this._onBulletHit(b), this.player);
    for (const robot of this.robots) {
      robot.update(dt, this.player, this.world, this.robots, (r) => {
        if (this.player.takeDamage(r.meleeDamage, time)) {
          this.audio.playerHurt();
          this.el.damageFlash.classList.add('active');
          setTimeout(() => this.el.damageFlash.classList.remove('active'), 150);
          this.particles.push(...createBloodSplatter(
            this.player.x,
            this.player.z,
            r.x,
            r.z,
            r.meleeDamage * 0.55,
          ));
        }
      }, (r, angle, damage) => this._enemyShoot(r, angle, damage));
      if (robot.emerging) {
        robot.groundSpewAcc += dt;
        const spewRate = 0.035;
        const intensity = 0.6 + (1 - robot.getEmergeT()) * 1.4;
        while (robot.groundSpewAcc >= spewRate) {
          robot.groundSpewAcc -= spewRate;
          this.particles.push(...createGroundSpew(robot.x, robot.z, intensity));
        }
      } else if (robot.alive) {
        const ratio = robot.healthRatio;
        const bodySpread = robot.radius * 1.15;
        if (ratio <= 0.5) {
          robot.statusFxAcc += dt;
          const rate = ratio <= 0.25 ? 0.12 : 0.28;
          while (robot.statusFxAcc >= rate) {
            robot.statusFxAcc -= rate;
            this.particles.push(...createRobotSmoke(robot.x, robot.z, bodySpread));
            if (ratio <= 0.25) {
              this.particles.push(...createRobotFire(robot.x, robot.z, bodySpread * 0.95));
            }
          }
        } else {
          robot.statusFxAcc = 0;
        }
      }

      if (robot.alive && robot.moving && !robot.emerging
        && !(robot.jump?.active || robot.jump?.charging)
        && robot.shoot?.phase !== 'charging' && robot.shoot?.phase !== 'firing') {
        const step = Math.floor(robot.walkPhase / (robot.type === 'scout' ? 1 : 2));
        if (step !== robot._audioStep) {
          robot._audioStep = step;
          if (step > 0) {
            const dist = Math.hypot(robot.x - this.player.x, robot.z - this.player.z);
            if (robot.type === 'scout') this.audio.scoutStomp(dist);
            else this.audio.enemyFootstep(dist);
          }
        }
      } else {
        robot._audioStep = -1;
      }

      if (robot.type === 'scout' && robot.shoot) {
        const phase = robot.shoot.phase;
        if (phase === 'charging' && robot._prevShootPhase !== 'charging') {
          const dist = Math.hypot(robot.x - this.player.x, robot.z - this.player.z);
          this.audio.scoutChargeStart(dist);
        }
        robot._prevShootPhase = phase;
      }
    }
    const breathTarget = getPlayerIdleBreathY(this.player, time);
    this._weaponBreathY += (breathTarget - this._weaponBreathY) * Math.min(1, dt * 18);
    updateParticles(this.particles, dt, this.world, {
      onCasingLand: () => this.audio.casingLand(),
    });
  }

  _enemyShoot(robot, angle, damage = 10) {
    if (!robot?.alive || robot.emerging) return;
    const spread = robot.shoot?.bulletSpread ?? 0.28;
    this.bullets.spawn(
      robot.x,
      robot.z,
      angle,
      { damage, bulletSpeed: 72, spread },
      false,
      this.world,
    );
    this.audio.enemyShot();
  }

  _damageRobot(robot, damage, fromX, fromZ, bullet = null) {
    if (!robot.applyHit(damage, fromX, fromZ, this.world, { fromBullet: !!bullet })) return;
    this.audio.hitEnemy();
    this.particles.push(...createRobotHitSparks(robot.x, robot.z, fromX, fromZ, damage));
    if (bullet) bullet.active = false;
    if (!robot.alive) {
      this.kills++;
      this.audio.explosion();
      const spread = robot.radius * 1.35;
      this.particles.push(...createExplosion(robot.x, robot.z));
      this.particles.push(...createRobotDeathFx(robot.x, robot.z, spread));
    }
  }

  _chestScreenPos(chest) {
    return this._worldToScreen(chest.x, chest.z);
  }

  _getNearbyChest() {
    if (!this.chests?.chests?.length) return null;
    const chest = this.chests.getNearby(this.player);
    if (!chest || !this.chests.isInInteractRange(this.player, chest)) return null;
    return chest;
  }

  _tryOpenNearbyChest() {
    if (!this.running || this.inventoryUI?.isOpen()) return false;
    const chest = this._getNearbyChest();
    if (!chest) return false;
    this.inventoryUI.openChest(chest);
    return true;
  }

  _getChestUnderCursor() {
    const chest = this._getHoveredChest();
    if (!chest) return null;
    if (!this.chests.isInInteractRange(this.player, chest)) return null;
    return chest;
  }

  _getHoveredChest() {
    if (!this.chests?.chests?.length) return null;
    const halfW = Math.round(CHEST_OPAQUE_HALF_W * SPRITE_CHEST);
    const halfH = Math.round(CHEST_OPAQUE_HALF_H * SPRITE_CHEST);
    let best = null;
    let bestD = Infinity;
    for (const chest of this.chests.chests) {
      const s = this._chestScreenPos(chest);
      const dx = this.mouse.sx - s.x;
      const dy = this.mouse.sy - s.y;
      if (Math.abs(dx) > halfW + 6 || Math.abs(dy) > halfH + 8) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = chest;
      }
    }
    return best;
  }

  _tryStartReload(time) {
    if (this.player.isMeleeActive()) return;
    const result = this.player.startReload(time);
    if (!result) return;
    if (result.cancelled) return;
    this.audio.reload();
    if (result.casingReload) {
      const cfg = WEAPONS[this.player.weaponKey];
      this._emitCasings(cfg.casingCount || cfg.magSize || 6, cfg.casingColor || 'yellow');
    }
  }

  _emitCasings(count, color) {
    if (count > 0) this.audio.casingEject();
    const angle = this.player.angle;
    const flip = Math.sin(angle) < 0;
    const aim = gunAimTransform(angle);
    const hold = GUN_HOLD_OFFSET + gunPivotHoldOffset(aim.angle);
    const gunX = this.player.x + Math.sin(angle) * hold;
    const gunZ = this.player.z + Math.cos(angle) * hold;
    const footPx = spriteFeetOffset(CHAR_NATIVE_PX, SPRITE_PLAYER);
    const bounce = getPlayerBounceY(this.player);
    const playerS = this._worldToScreen(this.player.x, this.player.z);
    const gunS = this._worldToScreen(gunX, gunZ);
    const footY = playerS.y + bounce + footPx;
    const gunY = gunS.y + bounce;
    const groundDrop = footY - gunY;
    this.particles.push(
      ...createBulletCasing(gunX, gunZ, angle, flip, color, count, groundDrop),
    );
  }

  _updateMidCooldownCasings(time) {
    if (this.player.isMeleeActive() || this.player.weaponSlot !== 'gun' || !this.player.weaponKey) return;
    const cfg = WEAPONS[this.player.weaponKey];
    if (cfg?.casingMode !== 'mid_cooldown') return;
    if (this.player.weaponKey !== this.player.casingCooldownWeaponKey) return;
    if (this.player.casingMidEmitted) return;
    if (!this.player.hasFireCooldown()) return;
    const t = this.player.getFireCooldownT(time);
    if (t > 0.5) return;
    this.player.casingMidEmitted = true;
    this._emitCasings(1, cfg.casingColor || 'yellow');
  }

  _fireGun(time) {
    const w = this.player.shoot(time);
    const dmgMult = this.player.getDamageMult(time);
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const shot = { ...w, damage: w.damage * dmgMult };
      this.bullets.spawn(this.player.x, this.player.z, this.player.angle, shot, true, this.world);
    }
    const recoil = this.player.applyShootRecoil();
    const targets = collectCollisionTargets({ player: this.player, robots: this.robots, exclude: this.player });
    const moveShape = this.player.getMoveCollider(PPU);
    const rk = moveWithEntityCollision(
      this.world,
      this.player.x,
      this.player.z,
      recoil.x,
      recoil.z,
      moveShape,
      moveShape,
      targets,
      this.player,
    );
    this.player.x = rk.x;
    this.player.z = rk.z;
    const cfg = WEAPONS[this.player.weaponKey];
    if (cfg?.casingMode === 'per_shot') {
      this._emitCasings(1, cfg.casingColor || 'yellow');
    }
    if (w.sound === 'shotgun') this.audio.shotgunShot();
    else if (w.sound === 'sniper') this.audio.sniperShot();
    else if (w.sound === 'pistol') this.audio.pistolShot();
    else this.audio.rifleShot();
  }

  _updateMeleeStrike(time) {
    if (!this.player.isMeleeStrikeFrame(time)) return;
    this.player.melee.hitApplied = true;
    const melee = this.player.getActiveMelee();
    const charge = this.player.melee.swingCharge;
    const dmg = melee.damage * this.player.getMeleeDamageMult(charge) * this.player.getDamageMult(time);
    const range = melee.range + this.player.radius;
    const halfArc = melee.arc / 2;
    const aim = this.player.angle;
    let hitAny = false;

    for (const robot of this.robots) {
      if (!robot.alive) continue;
      const dx = robot.x - this.player.x;
      const dz = robot.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + robot.radius) continue;
      let diff = Math.atan2(dx, dz) - aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > halfArc) continue;
      this._damageRobot(robot, dmg, this.player.x, this.player.z);
      hitAny = true;
    }
    if (hitAny) this.audio.pistolShot();
  }

  _onBulletHit(bullet) {
    const time = performance.now() / 1000;
    if (bullet.fromPlayer) {
      for (const robot of this.robots) {
        if (!robot.alive) continue;
        const dx = bullet.x - robot.x;
        const dz = bullet.z - robot.z;
        if (dx * dx + dz * dz < (robot.radius + 0.5) ** 2) {
          const fromX = bullet.x - bullet.vx * 0.02;
          const fromZ = bullet.z - bullet.vz * 0.02;
          this._damageRobot(robot, bullet.damage, fromX, fromZ, bullet);
          return;
        }
      }
      return;
    }

    if (!this.player?.alive) return;
    const dx = bullet.x - this.player.x;
    const dz = bullet.z - this.player.z;
    const hitR = this.player.radius + 0.45;
    if (dx * dx + dz * dz >= hitR * hitR) return;
    if (this.player.takeDamage(bullet.damage, time, { perBullet: true })) {
      this.audio.playerHurt();
      this.el.damageFlash.classList.add('active');
      setTimeout(() => this.el.damageFlash.classList.remove('active'), 150);
      this.particles.push(...createBloodSplatter(
        this.player.x,
        this.player.z,
        bullet.x - bullet.vx * 0.02,
        bullet.z - bullet.vz * 0.02,
        bullet.damage * 0.55,
      ));
    }
    bullet.active = false;
  }

  _getCursorSprite() {
    if (!this.player) return 'cursor';
    if (this.player.isMeleeActive()) return 'cursor_melee';
    if (this.player.weaponKey === 'm870') return 'cursor_shotgun';
    return 'cursor';
  }

  _particleDrawSize(p, halfPlayerPx, lifeFade) {
    const base = p.size ?? 0.2;
    switch (p.kind) {
      case 'dust':
        return base * halfPlayerPx * 0.5 * lifeFade;
      case 'spew':
      case 'fx':
        return base * halfPlayerPx * 0.55 * lifeFade;
      case 'casing':
      case 'blood':
        return base * halfPlayerPx * lifeFade;
      case 'spark':
        return Math.max(2, base * halfPlayerPx * 0.58 * lifeFade);
      case 'scrape':
        return Math.max(3, base * halfPlayerPx * 0.9 * lifeFade);
      case 'smoke':
        return Math.max(3, base * halfPlayerPx * 0.82 * lifeFade);
      case 'fire':
        return Math.max(2, base * halfPlayerPx * 0.72 * lifeFade);
      default:
        return Math.min(base * 2.2, halfPlayerPx * 0.35) * lifeFade;
    }
  }

  _particleAirY(p) {
    let y = 0;
    if (p.useScreenFall) y = p.fall ?? 0;
    else if (p.liftVel !== undefined || p.lift) y = -(p.lift || 0) * PPU;
    return y + (p.screenRise ?? 0);
  }

  _drawFxParticleSprite(ctx, p, sx, sy, alpha, sz) {
    const sprite = p.sprite || getParticleFxSprite(p.kind);
    const scale = Math.max(1, sz / PARTICLE_FX_NATIVE_PX);
    const angle = p.kind === 'spark' ? Math.atan2(p.vx, p.vz) : 0;
    ctx.globalAlpha = alpha;
    this.sprites.draw(ctx, sprite, sx, sy, scale, angle, false, 'center', 0, getParticleFxAnim(p));
    ctx.globalAlpha = 1;
  }

  _drawBulletTrail(ctx, b) {
    const speed = Math.hypot(b.vx, b.vz);
    if (speed < 8) return;
    const trailWorld = Math.min(1.15, speed * 0.011);
    const nx = b.vx / speed;
    const nz = b.vz / speed;
    const tail = this._worldToScreen(b.x - nx * trailWorld, b.z - nz * trailWorld);
    const head = this._worldToScreen(b.x, b.z);
    const dx = head.x - tail.x;
    const dy = head.y - tail.y;
    const len = Math.hypot(dx, dy);
    if (len < 3) return;

    const steps = Math.max(10, Math.floor(len / 1.4));
    const bright = b.fromPlayer;
    const warm = bright ? ['#6a4a10', '#a87818', '#d8a828', '#ffe878', '#fff8c8'] : ['#5a2010', '#883018', '#c05828', '#f08848', '#ffc898'];

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.round(tail.x + dx * t);
      const py = Math.round(tail.y + dy * t);
      const alpha = 0.12 + t * t * 0.88;
      const palette = warm[Math.min(warm.length - 1, Math.floor(t * warm.length))];
      const sz = t > 0.92 ? 2 : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = palette;
      ctx.fillRect(px, py, sz, sz);
      if (t > 0.2 && t < 0.92 && i % 2 === 0) {
        const bx = Math.round(tail.x + dx * (t - 1 / len));
        const by = Math.round(tail.y + dy * (t - 1 / len));
        ctx.globalAlpha = alpha * 0.45;
        ctx.fillRect(bx, by, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawParticle(ctx, p) {
    const s = this._worldToScreen(p.x, p.z);
    const groundY = Math.round(p.groundDrop ?? 0);
    const airY = Math.round(this._particleAirY(p));
    const halfPlayerPx = CHAR_NATIVE_PX * SPRITE_PLAYER * PARTICLE_SIZE_UNIT;
    const lifeFade = 0.55 + Math.min(1, p.life * 1.4) * 0.45;
    const sz = Math.round(this._particleDrawSize(p, halfPlayerPx, lifeFade));
    const splatW = Math.round(p.splatW ? p.splatW * halfPlayerPx : sz * 1.5);
    const splatH = Math.round(p.splatH ? p.splatH * halfPlayerPx : sz * 0.4);
    let alpha = Math.min(1, p.life * 2.2);
    if (p.kind === 'blood') alpha = Math.min(1, alpha * 0.85);
    if (p.kind === 'smoke') alpha = Math.min(0.72, 0.25 + alpha * 0.55);
    if (p.kind === 'fire') alpha = Math.min(0.95, alpha * 1.1);
    if (p.kind === 'spark') alpha = Math.min(1, alpha * 1.35);
    if (p.kind === 'scrape') alpha = Math.min(1, alpha * 1.05);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;

    if (p.kind === 'casing') {
      const sprite = p.casingSprite || 'casing';
      ctx.globalAlpha = alpha;
      this.sprites.draw(
        ctx,
        sprite,
        s.x,
        Math.round(s.y + airY),
        SPRITE_CASING,
        p.spin || 0,
        false,
        p.grounded ? 'handle' : 'center',
      );
      ctx.globalAlpha = 1;
    } else if (p.kind === 'blood' && p.grounded && p.splatW) {
      ctx.fillRect(s.x - splatW, s.y + groundY - splatH * 0.5, splatW * 2, splatH);
    } else if (p.kind === 'blood') {
      ctx.fillRect(s.x - sz / 2, s.y - sz / 2 + airY, sz, sz * 0.85);
    } else if (p.kind === 'spark' || p.kind === 'smoke' || p.kind === 'fire') {
      this._drawFxParticleSprite(ctx, p, s.x, Math.round(s.y + airY), alpha, sz);
    } else if (p.kind === 'scrape' && p.grounded && p.splatW) {
      ctx.fillRect(s.x - splatW, s.y + groundY - splatH * 0.5, splatW * 2, splatH);
    } else if (p.kind === 'scrape') {
      ctx.fillRect(s.x - sz / 2, s.y - sz * 0.35 + airY, sz, Math.max(2, sz * 0.55));
    } else if (p.kind === 'dust' || p.kind === 'spew' || p.kind === 'fx') {
      ctx.fillRect(s.x - sz / 2, s.y - sz * 0.35 + airY, sz, sz * 0.55);
    } else {
      ctx.fillRect(s.x - sz / 2, s.y - sz / 2 + airY, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  _draw() {
    const ctx = this.ctx;
    this._syncCamPixels();
    ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a3a32';
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    const cam = this._camera();
    const camT = this._camTranslate();
    const viewHalfW = INTERNAL_W / PPU / 2 + TILE;
    const viewHalfH = INTERNAL_H / PPU / 2 + TILE;
    const tilePx = TILE * PPU;
    this.world.drawGroundLayer(
      ctx,
      camT.x,
      camT.y,
      viewHalfW,
      viewHalfH,
      PPU,
      this.sprites,
      cam.x,
      cam.z,
    );

    for (const d of this.world.decor) {
      if (d.kind === 'crate') {
        const s = this._worldToScreen(d.x, d.z);
        this.sprites.draw(this.ctx, d.sprite || 'crate', s.x, s.y, SPRITE_CRATE);
        continue;
      }
      const hw = d.halfW * PPU;
      const hd = d.halfD * PPU;
      const s = this._worldToScreen(d.x, d.z);
      ctx.fillStyle = d.kind === 'room' ? '#6a6560' : '#8a8580';
      ctx.fillRect(s.x - hw, s.y - hd, hw * 2, hd * 2);
      ctx.strokeStyle = '#f0a030';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x - hw + 1, s.y - hd + 1, hw * 2 - 2, hd * 2 - 2);
    }

    const drawList = [];
    const ysortFoliage = this.world.collectYsortFoliage(
      cam.x - viewHalfW,
      cam.x + viewHalfW,
      cam.z - viewHalfH,
      cam.z + viewHalfH,
    );
    for (const f of ysortFoliage) {
      drawList.push({
        z: f.sortZ ?? f.z,
        sortBias: 0,
        draw: () => {
          const s = this._worldToScreen(f.x, f.z);
          const size = tilePx * (f.drawSize ?? 1);
          const feetX = Math.round(s.x);
          const feetY = Math.round(s.y);
          if (isTreeFoliage(f.kind)) {
            drawPixelEllipseShadow(
              ctx,
              feetX,
              feetY,
              size * 0.36,
              size * 0.13,
              tilePx,
            );
          }
          const tint = f.tintKey ? unpackTintGradient(f.tintKey) : null;
          const drawX = Math.round(s.x - size * 0.5);
          const drawY = Math.round(s.y - size);
          this.sprites.drawTile(ctx, f.sprite, drawX, drawY, size, tint);
        },
      });
    }
    for (const chest of this.chests.chests) {
      drawList.push({ z: chest.z, sortBias: 1, draw: () => {
        const s = this._chestScreenPos(chest);
        this.sprites.draw(
          ctx,
          chestSpriteName(chest.variant),
          s.x,
          s.y,
          SPRITE_CHEST,
          0,
          false,
          CHEST_DRAW_PIVOT,
        );
      }});
    }
    for (const robot of this.robots) {
      if (!robot.alive && !robot.emerging) continue;
      const enemyNativePx = getEnemyNativePx(robot.type);
      const enemyDrawScale = getEnemyDrawScale(robot.type);
      const robotSortZ = this._feetSortZ(robot.x, robot.z, enemyNativePx, enemyDrawScale);
      drawList.push({ z: robotSortZ, sortBias: 1, draw: () => {
        const drawTime = performance.now() / 1000;
        const emerge = robot.getEmergeT();
        const shake = robot.getEmergeShake();
        const s = this._worldToScreen(robot.x, robot.z);
        const bury = (1 - emerge) * 32;
        const scale = enemyDrawScale * (0.15 + emerge * 0.85);
        const chargeShake = robot.jump?.charging
          ? Math.sin(drawTime * 28) * 2.5 * (1 - (robot.jump.chargeLeft ?? 0) / 0.5)
          : 0;
        const drawX = Math.round(s.x + shake.x + chargeShake);
        const shootPhase = robot.shoot?.phase ?? null;
        const robotMoving = robot.moving && !robot.emerging
          && shootPhase !== 'charging' && shootPhase !== 'firing';
        const canWalkBounce = robotMoving
          && !robot.jump?.active && !robot.jump?.charging;
        const walkBounce = robot.type === 'scout'
          ? getScoutWalkBounceY(drawTime, canWalkBounce)
          : getWalkBounceY(robot.walkPhase, canWalkBounce);
        const walkBouncePx = Math.round(walkBounce);
        const jumpBob = robot.jump?.active ? Math.round(-(robot.bob || 0) * 16) : 0;
        const chargeBob = robot.jump?.charging ? Math.round((robot.bob || 0) * 14) : 0;
        const emergeBob = robot.emerging ? Math.round((robot.bob || 0) * 3) : 0;
        const anchorY = Math.round(s.y - bury + shake.y + emergeBob + jumpBob + chargeBob);
        const drawY = anchorY + walkBouncePx;
        const feetY = Math.round(anchorY + spriteFeetOffset(enemyNativePx, scale));
        if (robot.emerging) {
          const hole = 1 - emerge;
          ctx.fillStyle = `rgba(18, 14, 10, ${0.55 * hole})`;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y + 9, 8 + hole * 6, 3 + hole * 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.3 + emerge * 0.7;
        const isScout = robot.type === 'scout';
        const shadowLift = isScout ? 4 : 0;
        const shadowRx = (isScout ? 15 : 10) * emerge;
        const shadowRy = (isScout ? 5.5 : 4) * emerge;
        if (shadowRx >= 2 && shadowRy >= 2) {
          drawPixelEllipseShadow(ctx, drawX, feetY - shadowLift, shadowRx, shadowRy, tilePx);
        }
        const bodySheet = getEnemyBodySheet(robot.type, robotMoving, shootPhase);
        const bodyAnim = getEnemyBodyAnim(robot.type, robotMoving, shootPhase, drawTime, robot.shoot?.animStart);
        this.sprites.draw(
          ctx,
          bodySheet,
          drawX,
          drawY,
          scale,
          0,
          getFlipXFromAngle(robot.angle),
          'center',
          0,
          bodyAnim,
        );
        ctx.globalAlpha = 1;
      }});
    }
    const drawTime = performance.now() / 1000;
    const playerSheet = getPlayerSheet(this.player, drawTime);
    const playerFlip = getPlayerFlipX(this.player);
    const playerBounce = Math.round(getPlayerBounceY(this.player, drawTime));
    const idleBreath = Math.round(this._weaponBreathY ?? 0);
    const playerAnim = getPlayerAnim(this.player, drawTime);
    const playerSortZ = this._playerSortZ();
    drawList.push({ z: playerSortZ, sortBias: 1, draw: () => {
      const s = this._worldToScreen(this.player.x, this.player.z);
      const feetY = Math.round(s.y + playerBounce + spriteFeetOffset(CHAR_NATIVE_PX, SPRITE_PLAYER));
      drawPixelEllipseShadow(ctx, s.x, feetY, 10, 4, tilePx);
      this.sprites.draw(ctx, playerSheet, s.x, s.y + playerBounce, SPRITE_PLAYER, 0, playerFlip, 'center', 0, playerAnim);
    }});
    drawList.push({ z: playerSortZ + 0.02, sortBias: 1, draw: () => {
      const lunge = this.player.getMeleeSwingLunge(drawTime);
      const playerGs = this._worldToScreen(this.player.x, this.player.z);
      const weaponDraw = this.player.getWeaponDraw(drawTime);
      const weaponAnim = weaponDraw.frame != null
        ? { frame: weaponDraw.frame }
        : weaponDraw.elapsed != null
          ? { elapsed: weaponDraw.elapsed }
          : null;
      const reloadPose = getReloadPoseBlend(this.player, drawTime);

      if (this.player.isMeleeActive()) {
        const drop = this.player.getMeleeSwingDrop(drawTime);
        const bladeTilt = this.player.getMeleeBladeTilt(drawTime);
        const meleePose = getMeleeHoldPose(this.player, lunge);
        const meleeGs = this._worldToScreen(meleePose.worldX, meleePose.worldZ);
        this.sprites.draw(
          ctx,
          weaponDraw.sheet,
          meleeGs.x,
          meleeGs.y + drop + playerBounce + idleBreath,
          SPRITE_GUN,
          meleePose.angle,
          meleePose.flipX,
          'shoulder',
          bladeTilt,
          weaponAnim,
        );
      } else {
        const gunAim = gunAimTransform(this.player.angle);
        const holdDist = GUN_HOLD_OFFSET + lunge + gunPivotHoldOffset(gunAim.angle);
        const gunWorldX = this.player.x + Math.sin(this.player.angle) * holdDist;
        const gunWorldZ = this.player.z + Math.cos(this.player.angle) * holdDist;
        const normalGs = this._worldToScreen(gunWorldX, gunWorldZ);
        let sx;
        let sy;
        let aimAngle;
        let aimFlip;
        if (reloadPose) {
          const b = reloadPose.blend;
          const normalY = normalGs.y + playerBounce + idleBreath;
          const centerY = playerGs.y + playerBounce + idleBreath;
          const holdX = getReloadHoldScreenX(playerGs.x, reloadPose.flipX);
          sx = Math.round(normalGs.x + (holdX - normalGs.x) * b);
          sy = normalY + (centerY - normalY) * b;
          aimAngle = reloadPose.angle;
          aimFlip = reloadPose.flipX;
        } else {
          sx = normalGs.x;
          sy = normalGs.y + playerBounce + idleBreath;
          aimAngle = gunAim.angle - this.player.gunKick;
          aimFlip = gunAim.flipX;
        }
        this.sprites.draw(
          ctx,
          weaponDraw.sheet,
          sx,
          sy,
          SPRITE_GUN,
          aimAngle,
          aimFlip,
          'shoulder',
          0,
          weaponAnim,
        );
      }
    }});
    for (const p of this.particles) {
      let sortZ = p.z;
      if (p.kind === 'spark' || p.kind === 'scrape') {
        sortZ = this._inFrontOfEnemySortZ(p.x, p.z);
      } else if (p.kind === 'blood') {
        sortZ = p.z - 0.2;
      } else {
        sortZ = p.z - 0.05;
      }
      drawList.push({ z: sortZ, sortBias: 1, draw: () => this._drawParticle(ctx, p) });
    }
    drawList.sort((a, b) => (a.z - b.z) || ((a.sortBias ?? 0) - (b.sortBias ?? 0)));
    for (const d of drawList) d.draw();

    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      this._drawBulletTrail(ctx, b);
      const s = this._worldToScreen(b.x, b.z);
      const bScale = b.fromPlayer ? SPRITE_BULLET : 1;
      this.sprites.draw(ctx, 'bullet', s.x, s.y, bScale, velToSpriteAngle(b.vx, b.vz));
    }

    if (this.running && !this.inventoryUI?.isOpen()) {
      this.sprites.draw(ctx, this._getCursorSprite(), this.mouse.sx, this.mouse.sy, SPRITE_CURSOR);
    }

    this._drawPlayerCooldown(ctx, performance.now() / 1000);
  }

  _drawPlayerCooldown(ctx, time) {
    if (!this.player || this.player.isMeleeActive()) return;
    const gun = this.player.getWeapon();
    const reloading = gun.reloading;
    const reloadP = this.player.getReloadProgress(time);
    const fireT = this.player.getFireCooldownT(time);
    const showFire = this.player.hasFireCooldown() && fireT > 0.02;
    const showReload = reloading;
    if (!showFire && !showReload) return;

    const s = this._worldToScreen(this.player.x, this.player.z);
    const barW = 14;
    const barH = 2;
    const bx = Math.round(s.x - barW / 2);
    const by = Math.round(s.y + 11);
    const progress = showReload ? reloadP : fireT;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a2820';
    ctx.fillRect(bx, by, barW, barH);

    const fillW = Math.max(0, Math.round(barW * progress));
    ctx.fillStyle = showReload ? '#b83828' : '#c88828';
    if (fillW > 0) ctx.fillRect(bx, by, fillW, barH);
  }

  _updateHUD() {
    const w = this.player.getDisplayWeapon();
    const time = performance.now() / 1000;
    const hpPct = (this.player.health / this.player.maxHealth) * 100;
    this.el.healthBar.style.width = `${hpPct}%`;
    this.el.healthText.textContent = Math.ceil(this.player.health) + (this.player.shield > 0 ? ` (+${Math.ceil(this.player.shield)})` : '');
    this.el.weaponName.textContent = w.name;
    if (this.player.isMeleeActive()) {
      this.el.ammoCurrent.textContent = '—';
      this.el.ammoReserve.textContent = '—';
      this.el.ammoCurrent.style.color = '#e8e4dc';
      this.el.reloadIndicator.classList.add('hidden');
    } else {
      const gun = this.player.getWeapon();
      const reserve = this.player.getReserveAmmo();
      this.el.ammoCurrent.textContent = `${gun.ammo}/${gun.magSize}`;
      this.el.ammoReserve.textContent = reserve;
      this.el.ammoCurrent.style.color = gun.ammo === 0 ? '#ff4040' : '#e8e4dc';
      this.el.ammoReserve.style.color = reserve > 0 ? '#8899aa' : '#556066';
      this.el.reloadIndicator.classList.toggle('hidden', !gun.reloading);
    }

    const biome = getBiome(this.player.x, this.player.z);
    const zoneNames = { base: 'Base', meadow: 'Meadow', forest: 'Forest', scrub: 'Scrub', rock: 'Rock' };
    if (this.el.zoneLabel) {
      this.el.zoneLabel.textContent = zoneNames[biome] || biome;
    }

    if (this.items.pickupMsg) {
      this.el.pickupStatus.textContent = this.items.pickupMsg;
      this.el.pickupStatus.classList.add('active');
    } else {
      this.el.pickupStatus.textContent = '';
      this.el.pickupStatus.classList.remove('active');
    }

    const power = this.player.getActivePowerUpLabel(time);
    this.el.powerupStatus.textContent = power;
    this.el.powerupStatus.classList.toggle('active', !!power);

    const hoveredChest = this._getHoveredChest();
    const nearbyChest = this._getNearbyChest();
    const canOpenChestDesktop = !this.inventoryUI.open
      && !this.mobile
      && hoveredChest
      && this.chests.isInInteractRange(this.player, hoveredChest);
    const canOpenChestMobile = !this.inventoryUI.open && this.mobile && nearbyChest;
    const canOpenChest = canOpenChestDesktop || canOpenChestMobile;
    const mbInteract = document.getElementById('mb-interact');
    mbInteract?.classList.toggle('mb-nearby', canOpenChestMobile);
    this.el.interactPrompt.classList.toggle('hidden', !canOpenChest);
    if (canOpenChest) {
      if (this.mobile) {
        this.el.interactPrompt.textContent = 'E to open';
        this.el.interactPrompt.style.left = '';
        this.el.interactPrompt.style.top = '';
        this.el.interactPrompt.style.bottom = '';
        this.el.interactPrompt.style.transform = '';
      } else {
        const mx = this.mouse.clientX;
        const my = this.mouse.clientY;
        this.el.interactPrompt.textContent = 'RMB to open';
        this.el.interactPrompt.style.left = `${mx}px`;
        this.el.interactPrompt.style.top = `${my - 28}px`;
        this.el.interactPrompt.style.bottom = 'auto';
        this.el.interactPrompt.style.transform = 'translate(-50%, -100%)';
      }
    } else {
      this.el.interactPrompt.style.left = '';
      this.el.interactPrompt.style.top = '';
      this.el.interactPrompt.style.bottom = '';
      this.el.interactPrompt.style.transform = '';
    }

    this._minimapTick++;
    if ((this._minimapTick & 3) === 0) {
      this.minimap.render(this.player, this.robots, this.world, this.chests);
    }
  }

  _checkGameOver() {
    if (!this.player.alive) this._endGame();
  }

  _endGame() {
    this.running = false;
    const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(1);
    this.audio.lose();
    this.el.gameOverTitle.textContent = 'Mission failed';
    this.el.gameOverTitle.style.color = '#f05030';
    const wave = this.waves?.wave || 0;
    this.el.gameOverStats.textContent = `Wave ${wave} · Kills: ${this.kills} · Time: ${elapsed}s · HP: ${Math.ceil(this.player.health)}`;
    this.el.gameOver.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    document.body.classList.remove('game-active');
    this._clearKeyboardInput();
    this.prevMouseDown = false;
    this.touchMove = { x: 0, z: 0 };
    this.moveJoystick?.reset();
    this.inventoryUI?.forceClose();
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const time = now / 1000;

    this._update(dt, time);
    this._draw();
    this._updateHUD();
    this._checkGameOver();
    requestAnimationFrame(() => this._loop());
  }
}

new Game();
