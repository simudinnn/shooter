import { World, TILE } from './world.js';
import { ChunkEntityManager } from './chunkEntities.js';
import { unpackTintGradient, getBiome, isTreeFoliage, rollWorldSeed, setWorldSeed } from './worldGen.js';
import { Robot, Scout, createExplosion, createGroundSpew, updateParticles } from './enemies.js';
import { Player, BulletPool, WEAPONS, GUN_HOLD_OFFSET, findBulletSpawn } from './player.js';
import {
  captureGameState,
  deleteSave,
  hasSavedGame,
  readSave,
  writeSave,
} from './saveGame.js';
import { SoundManager } from './audio.js';
import { Minimap } from './minimap.js';
import { ItemManager } from './items.js';
import { ChestManager, CHEST_DRAW_SCALE, CHEST_OPAQUE_HALF_W, CHEST_OPAQUE_HALF_H, CHEST_DRAW_PIVOT } from './chests.js';
import {
  BuildingManager,
  drawBuildingFloors,
  drawBuildingWall,
  drawBuildingRoof,
  drawBuildingDoor,
  drawBuildingDecor,
  drawDecorPiece,
  getDoorScreenHitBox,
} from './buildings.js';
import {
  wallDrawsInFront,
  wallFrontDrawZ,
  wallBackDrawZ,
  buildingGunClipBounds,
  foliageOverlapsBuildingInterior,
  doorDrawsInFront,
  doorBackDrawZ,
  doorFrontDrawZ,
  bulletDrawSortZ,
  entityFeetZ,
} from './buildingGen.js';
import { chestSpriteName } from './loot.js';
import { SpriteBank, gunAimTransform, gunPivotHoldOffset, getReloadPoseBlend, getReloadHoldScreenX, getMeleeHoldPose, getWalkSheet, getWalkAnim, getEnemyBodySheet, getEnemyBodyAnim, velToSpriteAngle, getPlayerSheet, getPlayerAnim, getPlayerFlipX, getPlayerBounceY, getPlayerIdleBreathY, getWalkBounceY, getScoutWalkBounceY, getFlipXFromAngle, isMovingForward, CHAR_NATIVE_PX, getEnemyNativePx, getEnemyDrawScale, spriteFeetOffset, PARTICLE_FX_NATIVE_PX, getParticleFxSprite, getParticleFxAnim, CURSOR_DRAW_SCALE } from './sprites.js';
import { collectCollisionTargets, moveWithEntityCollision, didDisplace } from './collision.js';
import { drawCollisionDebug } from './collisionDebug.js';
import { createStepDust, createBulletCasing, createBloodSplatter, createRobotHitSparks, createRobotSmoke, createRobotFire, createRobotDeathFx, PARTICLE_SIZE_UNIT } from './particles.js';
import { VirtualJoystick } from './joystick.js';
import { InventoryUI } from './inventory.js';
import { getWeaponAmmoType, AMMO_TYPES } from './ammo.js';
import { DayNightCycle, applyNightOverlay } from './dayNight.js';
import { snapCamLean, worldToScreen, camPixelsFromPlayer, leanPixelsFromOffset, drawPixelEllipseShadow, PPU, INTERNAL_W, INTERNAL_H, RENDER_SCALE } from './renderConfig.js';
import {
  collectVisionSegments,
  computeVisibilityPolygon,
  drawVisibilityOverlay,
  pointInVisibilityPolygon,
  resolveVisionOrigin,
} from './visibility.js';

const VISION_DARKNESS = 0.22;

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
const AUTO_AIM_GUN_MAX_RANGE = 52;
const AUTO_AIM_MELEE_MAX_RANGE = 4.5;
/** Extended melee snap range when mobile autolock is on. */
const AUTO_AIM_MELEE_LOCK_RANGE = 9;
const AUTO_AIM_SCREEN_PAD = 28;
const MOBILE_STICK_DEADZONE = 0.15;
/** Subtle camera lean toward cursor (world units = px / PPU). */
const CAM_FOLLOW_STRENGTH = 0.15;
const CAM_FOLLOW_MAX_PX = 64;
const CAM_FOLLOW_SMOOTH = 50;

class Game {
  constructor() {
    this.running = false;
    this.paused = false;
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
    this._spritePreload = this.sprites.preloadAll();
    this.mouse = { sx: INTERNAL_W / 2, sy: INTERNAL_H / 2, wx: 0, wz: 0, clientX: 0, clientY: 0 };
    this.camOffset = { x: 0, z: 0 };
    this._camPxX = 0;
    this._camPxZ = 0;
    this._camLeanPxX = 0;
    this._camLeanPxZ = 0;
    this.debugCollision = false;
    this.touchMove = { x: 0, z: 0 };
    this.autoLock = false;
    this.mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this._initCanvas();
    this._initUI();
    this._bindEvents();
    this._showMainMenu();
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
      mainMenu: document.getElementById('main-menu'),
      menuSubtitle: document.getElementById('menu-subtitle'),
      pauseMenu: document.getElementById('pause-menu'),
      confirmDialog: document.getElementById('confirm-dialog'),
      confirmMessage: document.getElementById('confirm-message'),
      hud: document.getElementById('hud'),
      healthBar: document.getElementById('health-bar'),
      healthText: document.getElementById('health-text'),
      pickupStatus: document.getElementById('pickup-status'),
      powerupStatus: document.getElementById('powerup-status'),
      interactPrompt: document.getElementById('interact-prompt'),
      weaponName: document.getElementById('weapon-name'),
      ammoCurrent: document.getElementById('ammo-current'),
      ammoReserve: document.getElementById('ammo-reserve'),
      ammoIcon: document.getElementById('ammo-icon'),
      reloadIndicator: document.getElementById('reload-indicator'),
      zoneLabel: document.getElementById('zone-label'),
      gameDay: document.getElementById('game-day'),
      gameClock: document.getElementById('game-clock'),
      damageFlash: document.getElementById('damage-flash'),
      newGameBtn: document.getElementById('new-game-btn'),
      loadGameBtn: document.getElementById('load-game-btn'),
      resumeBtn: document.getElementById('resume-btn'),
      saveGameBtn: document.getElementById('save-game-btn'),
      backToMenuBtn: document.getElementById('back-to-menu-btn'),
      confirmYesBtn: document.getElementById('confirm-yes-btn'),
      confirmNoBtn: document.getElementById('confirm-no-btn'),
      minimapCanvas: document.getElementById('minimap'),
      mobileControls: document.getElementById('mobile-controls'),
      waveBanner: document.getElementById('wave-banner'),
      inventory: document.getElementById('inventory'),
    };
    this.minimap = new Minimap(this.el.minimapCanvas);
    this.inventoryUI = new InventoryUI(this);
    this._waveBannerTimer = null;
    this._confirmYes = null;
    this._confirmNo = null;
  }

  _refreshMainMenuButtons() {
    const hasSave = hasSavedGame();
    this.el.loadGameBtn?.classList.toggle('hidden', !hasSave);
  }

  _showMainMenu(deathStats = null) {
    this._refreshMainMenuButtons();
    this.el.mainMenu?.classList.remove('hidden');
    this.el.pauseMenu?.classList.add('hidden');
    this.el.confirmDialog?.classList.add('hidden');
    this.el.hud?.classList.add('hidden');
    document.body.classList.remove('game-active');
    this.el.mobileControls?.classList.add('hidden');
    if (deathStats) {
      this.el.menuSubtitle.textContent = deathStats;
      this.el.menuSubtitle.classList.remove('hidden');
    } else {
      this.el.menuSubtitle.textContent = '';
      this.el.menuSubtitle.classList.add('hidden');
    }
  }

  _hideMainMenu() {
    this.el.mainMenu?.classList.add('hidden');
    this.el.menuSubtitle?.classList.add('hidden');
  }

  _showPauseMenu() {
    this.paused = true;
    this.el.pauseMenu?.classList.remove('hidden');
    this._clearKeyboardInput();
    this.prevMouseDown = false;
    this.mouseDown = false;
    this.inventoryUI?.forceClose();
  }

  _hidePauseMenu() {
    this.paused = false;
    this.el.pauseMenu?.classList.add('hidden');
    this.canvas.focus();
  }

  _showConfirm(message, onYes, onNo) {
    this.el.confirmMessage.textContent = message;
    this.el.confirmDialog?.classList.remove('hidden');
    this._confirmYes = onYes;
    this._confirmNo = onNo ?? (() => this.el.confirmDialog?.classList.add('hidden'));
  }

  _closeConfirm() {
    this.el.confirmDialog?.classList.add('hidden');
    this._confirmYes = null;
    this._confirmNo = null;
  }

  _togglePause() {
    if (!this.running || !this.player?.alive) return;
    if (this.inventoryUI?.isOpen()) return;
    if (this.el.confirmDialog && !this.el.confirmDialog.classList.contains('hidden')) return;
    if (this.paused) {
      this._hidePauseMenu();
    } else {
      this._showPauseMenu();
    }
  }

  _saveCurrentGame() {
    const ok = writeSave(captureGameState(this));
    if (ok) this._refreshMainMenuButtons();
    return ok;
  }

  _requestBackToMenu() {
    this._showConfirm(
      'Save before exiting?',
      () => {
        this._closeConfirm();
        this._saveCurrentGame();
        this._quitToMainMenu();
      },
      () => {
        this._closeConfirm();
        this._quitToMainMenu();
      },
    );
  }

  _quitToMainMenu() {
    this.running = false;
    this.paused = false;
    this._hidePauseMenu();
    this._clearKeyboardInput();
    this.touchMove = { x: 0, z: 0 };
    this.moveJoystick?.reset();
    this.inventoryUI?.forceClose();
    this._showMainMenu();
  }

  _requestNewGame() {
    if (hasSavedGame()) {
      this._showConfirm(
        'Are you sure you want to play a new game? Your old save will be removed.',
        () => {
          this._closeConfirm();
          deleteSave();
          this._refreshMainMenuButtons();
          this._startNewGame();
        },
        () => this._closeConfirm(),
      );
      return;
    }
    this._startNewGame();
  }

  _startNewGame() {
    this._hideMainMenu();
    this._bootGame(null).catch((err) => {
      console.error('New game failed:', err);
      this._showMainMenu();
    });
  }

  _startLoadGame() {
    const data = readSave();
    if (!data) {
      this._refreshMainMenuButtons();
      return;
    }
    this._hideMainMenu();
    this._bootGame(data).catch((err) => {
      console.error('Load failed:', err);
      this._showMainMenu();
    });
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
      if (this.running && !this.paused && !e.repeat) this.inventoryUI.toggle();
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.el.confirmDialog && !this.el.confirmDialog.classList.contains('hidden')) {
        if (this._confirmNo) this._confirmNo();
        return;
      }
      if (this.running) this._togglePause();
      return;
    }
    if (!e.repeat) this.keys[e.code] = true;
    if (!this.running || this.paused) return;
    if (e.repeat) return;
    if (this.inventoryUI?.isOpen()) return;
    if (e.code === 'F3') {
      e.preventDefault();
      this.debugCollision = !this.debugCollision;
      return;
    }
    if (e.code === 'KeyR') this._tryStartReload(performance.now() / 1000);
    if (e.code === 'KeyE') this._tryInteract();
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
    this.el.newGameBtn?.addEventListener('click', () => this._requestNewGame());
    this.el.loadGameBtn?.addEventListener('click', () => this._startLoadGame());
    this.el.resumeBtn?.addEventListener('click', () => this._hidePauseMenu());
    this.el.saveGameBtn?.addEventListener('click', () => {
      this._saveCurrentGame();
      this._hidePauseMenu();
    });
    this.el.backToMenuBtn?.addEventListener('click', () => this._requestBackToMenu());
    this.el.confirmYesBtn?.addEventListener('click', () => this._confirmYes?.());
    this.el.confirmNoBtn?.addEventListener('click', () => this._confirmNo?.());
    window.addEventListener('resize', () => this._resizeCanvas());

    window.addEventListener('keydown', (e) => this._onGameKeyDown(e), true);
    window.addEventListener('keyup', (e) => this._onGameKeyUp(e), true);
    window.addEventListener('blur', () => {
      if (this.inventoryUI?.isOpen()) return;
      this._clearKeyboardInput();
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.canvas.focus();
        this.audio.resume();
        if (!this.paused) this.mouseDown = true;
      } else if (e.button === 2 && this.running && !this.paused && !this.inventoryUI?.isOpen()) {
        if (!this._tryToggleNearbyDoor()) {
          const chest = this._getChestUnderCursor();
          if (chest) this.inventoryUI.openChest(chest);
        }
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
      if (!this.running || this.paused || this.inventoryUI?.isOpen()) return;
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

    bindPress('mb-pause', () => this._togglePause());
    bindPress('mb-gun', () => { if (this.running) this.player?.setWeaponSlot('gun'); });
    bindPress('mb-knife', () => { if (this.running) this.player?.setWeaponSlot('melee'); });

    bindPress('mb-interact', () => {
      if (this.running) {
        this.audio.resume();
        this._tryInteract();
      }
    });

    bindPress('mb-inventory', () => {
      if (this.running) this.inventoryUI.toggle();
    });

    bindPress('mb-autolock', () => {
      this.autoLock = !this.autoLock;
      document.getElementById('mb-autolock')?.classList.toggle('mb-active', this.autoLock);
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
    if (stickMag > MOBILE_STICK_DEADZONE) {
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
    let maxRange = AUTO_AIM_GUN_MAX_RANGE;
    if (this.mobile && this.player?.isMeleeActive()) {
      maxRange = this.autoLock ? AUTO_AIM_MELEE_LOCK_RANGE : AUTO_AIM_MELEE_MAX_RANGE;
    }

    for (const robot of this.robots) {
      if (!robot.alive && !robot.emerging) continue;
      if (!this._isWorldOnScreen(robot.x, robot.z)) continue;
      const dx = robot.x - this.player.x;
      const dz = robot.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxRange) continue;
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

      if (this.autoLock) {
        const target = this._findNearestRobotOnScreen();
        if (target) {
          const ts = this._worldToScreen(target.x, target.z);
          cursorSx = ts.x;
          cursorSy = ts.y;
          this.mouse.wx = target.x;
          this.mouse.wz = target.z;
          turnRate = AUTO_AIM_TARGET_TURN_RATE;
        }
      }

      if (turnRate == null) {
        const stickMag = Math.hypot(this.touchMove.x, this.touchMove.z);
        if (stickMag > MOBILE_STICK_DEADZONE) {
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

  async _bootGame(saveData = null) {
    this.audio.init();
    this.audio.resume();

    await this._spritePreload;

    if (saveData?.worldSeed != null) {
      setWorldSeed(saveData.worldSeed);
    } else {
      rollWorldSeed();
    }

    this.world = new World();
    await this.world.build();
    this.world.prewarmGround(this.sprites, PPU);
    this.player = new Player();
    if (saveData?.player) {
      this.player.applySaveData(saveData.player);
    } else {
      const spawn = this.world.getPlayerSpawn();
      this.player.x = spawn.x;
      this.player.z = spawn.z;
    }
    this.bullets = new BulletPool();
    this.robots = [];
    this.chunkEntities = new ChunkEntityManager(this.world, this);
    this.chunkEntities.reset();
    this.items = new ItemManager(this.world);
    this.chests = new ChestManager(this.world);
    this.buildings = new BuildingManager(this.world, this.chests);
    this.particles = [];
    this.dayNight = new DayNightCycle();

    if (saveData) {
      this._applySaveState(saveData);
    }

    this._weaponBreathY = 0;
    this.camOffset = { x: 0, z: 0 };
    this._camPxX = 0;
    this._camPxZ = 0;
    this._camLeanPxX = 0;
    this._camLeanPxZ = 0;
    this._lastWalkStep = -1;
    this._lastBounceLand = -1;
    this.kills = saveData?.kills ?? 0;
    this.playTimeBase = saveData?.playTimeMs ?? 0;
    this.startTime = performance.now();
    this.paused = false;
    this.running = true;

    this.canvas.focus();

    this.el.pauseMenu?.classList.add('hidden');
    this.el.confirmDialog?.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    document.body.classList.add('game-active');
    if (this.mobile) this.el.mobileControls?.classList.remove('hidden');
    if (this.mobile) document.body.classList.add('mobile-ui');

    this.lastTime = performance.now();
    this._loop();
  }

  _applySaveState(data) {
    if (data.dayNight) {
      this.dayNight.timeMinutes = data.dayNight.timeMinutes;
      this.dayNight.day = data.dayNight.day;
    }

    for (const f of data.chunkFlags ?? []) {
      const chunk = this.world.getChunk(f.cx, f.cz);
      if (f.spidersSpawned) chunk.spidersSpawned = true;
      if (f.buildingsSpawned) chunk.buildingsSpawned = true;
      if (f.chestsSpawned) chunk.chestsSpawned = true;
    }

    this.buildings.restoreAllFromSave(data.buildings, this.world);

    for (const s of data.robots ?? []) {
      const robot = s.type === 'scout'
        ? new Scout(s.x, s.z, s.wave ?? 1)
        : new Robot(s.x, s.z, s.wave ?? 1, s.type ?? 'spider');
      robot.health = s.health;
      robot.maxHealth = s.maxHealth;
      robot.angle = s.angle ?? robot.angle;
      robot.homeCx = s.homeCx;
      robot.homeCz = s.homeCz;
      robot.alive = s.alive !== false;
      robot.emerging = false;
      if (s.homeCx != null && s.homeCz != null) {
        const chunk = this.world.getChunk(s.homeCx, s.homeCz);
        chunk.spidersSpawned = true;
      }
      this.robots.push(robot);
    }
  }

  _update(dt, time) {
    if (this.paused) return;

    const inventoryOpen = this.inventoryUI?.isOpen();
    this.dayNight?.update(dt);
    this.buildings?.update(this.player, dt);

    if (!inventoryOpen) {
      this.player.updateMobility(time);

      const { moveX: rawMoveX, moveZ: rawMoveZ } = this._getMoveInput();
      let moveX = rawMoveX;
      let moveZ = rawMoveZ;

      const stickMag = Math.hypot(this.touchMove.x, this.touchMove.z);
      const usingStick = stickMag > MOBILE_STICK_DEADZONE;

      const sprintInput = this._isShiftHeld();
      const wantsMove = moveX !== 0 || moveZ !== 0;
      const playerPrevX = this.player.x;
      const playerPrevZ = this.player.z;

      if (wantsMove) {
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

        const walkStep = Math.floor(this.player.walkPhase);
        if (walkStep > this._lastWalkStep) {
          for (let s = Math.max(this._lastWalkStep + 1, 1); s <= walkStep; s++) {
            if (s % 2 === 0) {
              this.audio.footstep(this.player.isSprinting);
            }
          }
          this._lastWalkStep = walkStep;
        }

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
          }
        }
      } else {
        this.player.isSprinting = false;
        this._lastWalkStep = -1;
        this._lastBounceLand = -1;
      }

      this.player.isMoving = wantsMove && didDisplace(playerPrevX, playerPrevZ, this.player.x, this.player.z);

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
      }, (r, angle, damage) => this._enemyShoot(r, angle, damage), this.buildings, time);
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

  _getNearbyDoor() {
    if (!this.buildings?.buildings?.length) return null;
    return this.buildings.getNearbyDoor(this.player);
  }

  _getHoveredDoor() {
    if (!this.buildings?.buildings?.length) return null;
    let best = null;
    let bestD = Infinity;
    const worldToScreen = (wx, wz) => this._worldToScreen(wx, wz);
    for (const building of this.buildings.buildings) {
      const box = getDoorScreenHitBox(building, worldToScreen);
      const dx = this.mouse.sx - box.x;
      const dy = this.mouse.sy - box.y;
      if (Math.abs(dx) > box.halfW || Math.abs(dy) > box.halfH) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = building;
      }
    }
    return best;
  }

  /** Door for interact — proximity on mobile; cursor hover + range on desktop. */
  _getInteractDoor() {
    if (!this.buildings?.buildings?.length || !this.player) return null;
    if (this.mobile) return this.buildings.getNearbyDoor(this.player);
    const hovered = this._getHoveredDoor();
    if (!hovered || !this.buildings.isInDoorInteractRange(this.player, hovered)) return null;
    return hovered;
  }

  _tryToggleNearbyDoor() {
    if (!this.running || this.inventoryUI?.isOpen()) return false;
    const building = this._getInteractDoor();
    if (!building) return false;
    if (!this.buildings.toggleDoor(building, this.player)) {
      if (building.doorOpen) {
        this.items.setPickupMsg('Clear the doorway first', { error: true, duration: 1.6 });
      }
      return false;
    }
    this.audio.doorToggle(building.doorOpen);
    return true;
  }

  _tryInteract() {
    if (this._tryToggleNearbyDoor()) return true;
    return this._tryOpenNearbyChest();
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

  _getInteractHighlight(time) {
    if (!this.running || this.inventoryUI?.isOpen() || !this.player) return null;
    const door = this._getInteractDoor();
    const nearbyChest = this._getNearbyChest();
    const hoveredChest = this._getHoveredChest();
    const canDoor = !!door;
    const canChestMobile = this.mobile && nearbyChest && !door;
    const canChestDesktop = !this.mobile && hoveredChest
      && this.chests.isInInteractRange(this.player, hoveredChest);
    const canChest = canChestMobile || canChestDesktop;

    if (canDoor) {
      return {
        kind: 'door',
        box: getDoorScreenHitBox(door, (wx, wz) => this._worldToScreen(wx, wz)),
      };
    }
    if (canChest) {
      const chest = canChestDesktop ? hoveredChest : nearbyChest;
      const s = this._chestScreenPos(chest);
      return {
        kind: 'chest',
        box: {
          x: s.x,
          y: s.y,
          halfW: Math.round(CHEST_OPAQUE_HALF_W * SPRITE_CHEST) + 4,
          halfH: Math.round(CHEST_OPAQUE_HALF_H * SPRITE_CHEST) + 6,
        },
      };
    }
    return null;
  }

  _drawInteractPulse(ctx, box, time) {
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 5.5));
    const pad = 2 + pulse * 2;
    const x0 = Math.round(box.x - box.halfW - pad);
    const y0 = Math.round(box.y - box.halfH - pad);
    const w = Math.round((box.halfW + pad) * 2);
    const h = Math.round((box.halfH + pad) * 2);
    ctx.save();
    ctx.strokeStyle = `rgba(255, 200, 90, ${0.35 + pulse * 0.45})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, w, h);
    ctx.strokeStyle = `rgba(255, 220, 120, ${0.2 + pulse * 0.25})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 2, y0 - 2, w + 4, h + 4);
    ctx.restore();
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
    const melee = this.player.getActiveMelee();
    if (!melee) return;
    this.player.melee.hitApplied = true;
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
      if (this.world.segmentBlocked(this.player.x, this.player.z, robot.x, robot.z, 0.2, false, null, {
        losSeg: {
          x0: this.player.x,
          z0: this.player.z,
          x1: robot.x,
          z1: robot.z,
        },
      })) {
        continue;
      }
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

  _isShotFlashFrame(drawTime, weaponDraw) {
    if (this.player.isMeleeActive() || drawTime >= this.player.shotFlashUntil) return false;
    const cfg = WEAPONS[this.player.weaponKey];
    return !!(cfg?.shotSprite && weaponDraw.sheet === cfg.shotSprite);
  }

  _getGunScreenPose(drawTime) {
    const playerGs = this._worldToScreen(this.player.x, this.player.z);
    const playerBounce = Math.round(getPlayerBounceY(this.player, drawTime));
    const idleBreath = Math.round(this._weaponBreathY ?? 0);
    const lunge = this.player.getMeleeSwingLunge(drawTime);
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
      const meleeOffX = Math.round((meleePose.worldX - this.player.x) * PPU);
      const meleeOffY = Math.round((meleePose.worldZ - this.player.z) * PPU);
      return {
        isMelee: true,
        isShotFlash: false,
        sx: playerGs.x + meleeOffX,
        sy: playerGs.y + meleeOffY + drop + playerBounce + idleBreath,
        aimAngle: meleePose.angle,
        aimFlip: meleePose.flipX,
        pivot: 'shoulder',
        tilt: bladeTilt,
        weaponDraw,
        weaponAnim,
      };
    }

    const gunAim = gunAimTransform(this.player.angle);
    const holdDist = GUN_HOLD_OFFSET + lunge + gunPivotHoldOffset(gunAim.angle);
    const holdOffX = Math.round(Math.sin(this.player.angle) * holdDist * PPU);
    const holdOffY = Math.round(Math.cos(this.player.angle) * holdDist * PPU);
    const normalSx = playerGs.x + holdOffX;
    const normalSy = playerGs.y + holdOffY;
    let sx;
    let sy;
    let aimAngle;
    let aimFlip;
    if (reloadPose) {
      const b = reloadPose.blend;
      const normalY = normalSy + playerBounce + idleBreath;
      const centerY = playerGs.y + playerBounce + idleBreath;
      const holdX = getReloadHoldScreenX(playerGs.x, reloadPose.flipX);
      sx = normalSx + Math.round((holdX - normalSx) * b);
      sy = normalY + Math.round((centerY - normalY) * b);
      aimAngle = reloadPose.angle;
      aimFlip = reloadPose.flipX;
    } else {
      sx = normalSx;
      sy = normalSy + playerBounce + idleBreath;
      aimAngle = gunAim.angle - this.player.gunKick;
      aimFlip = gunAim.flipX;
    }

    return {
      isMelee: false,
      isShotFlash: this._isShotFlashFrame(drawTime, weaponDraw),
      sx,
      sy,
      aimAngle,
      aimFlip,
      pivot: 'shoulder',
      tilt: 0,
      weaponDraw,
      weaponAnim,
    };
  }

  _drawWeaponSprite(ctx, pose, clipBounds = null) {
    if (clipBounds) {
      ctx.save();
      ctx.beginPath();
      if (clipBounds.clipXOnly) {
        const leftS = this._worldToScreen(clipBounds.minX, 0);
        const rightS = this._worldToScreen(clipBounds.maxX, 0);
        const left = Math.min(leftS.x, rightS.x);
        const right = Math.max(leftS.x, rightS.x);
        ctx.rect(left, 0, right - left, INTERNAL_H);
      } else {
        const tl = this._worldToScreen(clipBounds.minX, clipBounds.minZ);
        const br = this._worldToScreen(clipBounds.maxX, clipBounds.maxZ);
        const left = Math.min(tl.x, br.x);
        const right = Math.max(tl.x, br.x);
        const top = Math.min(tl.y, br.y) - 10;
        const bottom = Math.max(tl.y, br.y) + 2;
        ctx.rect(left, top, right - left, bottom - top);
      }
      ctx.clip();
    }
    this.sprites.draw(
      ctx,
      pose.weaponDraw.sheet,
      pose.sx,
      pose.sy,
      SPRITE_GUN,
      pose.aimAngle,
      pose.aimFlip,
      pose.pivot,
      pose.tilt,
      pose.weaponAnim,
    );
    if (clipBounds) ctx.restore();
  }

  _visibilityMul(x, z, useVisFog, visPoly) {
    if (!useVisFog || !visPoly) return 1;
    return pointInVisibilityPolygon(x, z, visPoly) ? 1 : 0;
  }

  _drawParticle(ctx, p, visMul = 1) {
    if (visMul < 0.02) return;
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
    ctx.globalAlpha = alpha * visMul;

    if (p.kind === 'casing') {
      const sprite = p.casingSprite || 'casing';
      ctx.globalAlpha = alpha * visMul;
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
      this._drawFxParticleSprite(ctx, p, s.x, Math.round(s.y + airY), alpha * visMul, sz);
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
    const nightFactor = this.dayNight?.getNightFactor() ?? 0;
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
    const viewMinX = cam.x - viewHalfW;
    const viewMaxX = cam.x + viewHalfW;
    const viewMinZ = cam.z - viewHalfH;
    const viewMaxZ = cam.z + viewHalfH;
    const visibleBuildings = this.buildings?.collectInView(viewMinX, viewMaxX, viewMinZ, viewMaxZ) ?? [];
    const worldToScreen = (wx, wz) => this._worldToScreen(wx, wz);

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

    const insideBuilding = this.buildings?.insideBuilding;
    const useVisFog = this.player && this.running;
    let visPoly = null;
    if (useVisFog) {
      const visOrigin = resolveVisionOrigin(this.world, this.player.x, this.player.z, insideBuilding);
      const visSegs = collectVisionSegments(
        this.world,
        visibleBuildings,
        viewMinX,
        viewMaxX,
        viewMinZ,
        viewMaxZ,
        insideBuilding,
      );
      visPoly = computeVisibilityPolygon(
        visOrigin.x,
        visOrigin.z,
        visSegs,
        viewMinX,
        viewMaxX,
        viewMinZ,
        viewMaxZ,
      );
    }

    for (const building of visibleBuildings) {
      drawBuildingFloors(ctx, building, worldToScreen, tilePx, this.sprites);
    }

    if (useVisFog && visPoly) {
      drawVisibilityOverlay(ctx, visPoly, worldToScreen, INTERNAL_W, INTERNAL_H, VISION_DARKNESS);
    }

    const visFadeStep = 1 - Math.exp(-10 * (this._frameDt ?? 0.016));

    const playerSortZ = this._playerSortZ();
    const playerX = this.player.x;
    const playerZ = this.player.z;
    const drawList = [];
    const brightParticles = [];
    for (const building of visibleBuildings) {
      const playerInside = insideBuilding === building;
      for (const wall of building.walls) {
        const drawWall = () => drawBuildingWall(ctx, wall, building, worldToScreen, tilePx, this.sprites);
        if (wallDrawsInFront(wall, playerSortZ, playerInside, playerX, playerZ, building)) continue;
        const sortBias = wall.extendNorth ? 1 : 0;
        const wallZ = wallBackDrawZ(wall, playerSortZ, playerInside, playerX, playerZ, building);
        drawList.push({ z: wallZ, sortBias, draw: drawWall });
      }
      if (!doorDrawsInFront(building, playerSortZ, playerInside, playerX, playerZ)) {
        drawList.push({
          z: doorBackDrawZ(building, playerSortZ, playerInside, playerX, playerZ),
          sortBias: 0,
          draw: () => drawBuildingDoor(ctx, building, worldToScreen, tilePx, this.sprites),
        });
      }
      for (const piece of building.decor ?? []) {
        drawList.push({
          z: piece.sortZ,
          sortBias: piece.sortBias ?? 1,
          draw: () => drawDecorPiece(ctx, this.sprites, piece, tilePx, worldToScreen),
        });
      }
    }
    const ysortFoliage = this.world.collectYsortFoliage(
      cam.x - viewHalfW,
      cam.x + viewHalfW,
      cam.z - viewHalfH,
      cam.z + viewHalfH,
    ).filter((f) => {
      for (const building of this.buildings.buildings) {
        if (foliageOverlapsBuildingInterior(building, f)) return false;
      }
      return true;
    });
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
        const isScout = robot.type === 'scout';
        const robotMoving = robot.moving && !robot.emerging
          && shootPhase !== 'charging' && shootPhase !== 'firing';
        const canWalkBounce = robotMoving
          && !robot.jump?.active && !robot.jump?.charging;
        const scoutChaseWalk = isScout && robot.chasing && robotMoving;
        const scoutWalkMult = scoutChaseWalk ? 1.75 : 1;
        const walkBounce = isScout
          ? getScoutWalkBounceY(drawTime * scoutWalkMult, canWalkBounce)
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
        let visMul = 1;
        if (useVisFog && visPoly) {
          const inVis = pointInVisibilityPolygon(robot.x, entityFeetZ(robot), visPoly);
          const target = inVis ? 1 : 0;
          if (robot._visAlpha == null) robot._visAlpha = target;
          robot._visAlpha += (target - robot._visAlpha) * visFadeStep;
          visMul = robot._visAlpha;
        } else if (robot._visAlpha != null && robot._visAlpha < 0.999) {
          robot._visAlpha += (1 - robot._visAlpha) * visFadeStep;
          visMul = robot._visAlpha;
        }
        const isSpider = robot.type === 'spider';
        const shadowLift = isScout ? 4 : (isSpider ? 4 : 0);
        const shadowRx = (isScout ? 15 : 10) * emerge;
        const shadowRy = (isScout ? 5.5 : 4) * emerge;
        if (shadowRx >= 2 && shadowRy >= 2 && visMul > 0.06) {
          ctx.save();
          ctx.globalAlpha = visMul;
          drawPixelEllipseShadow(ctx, drawX, feetY - shadowLift, shadowRx, shadowRy, tilePx);
          ctx.restore();
        }
        const bodySheet = getEnemyBodySheet(robot.type, robotMoving, shootPhase);
        const bodyAnim = getEnemyBodyAnim(
          robot.type,
          robotMoving,
          shootPhase,
          drawTime,
          robot.shoot?.animStart,
          { walkSpeedMult: scoutWalkMult },
        );
        ctx.globalAlpha = (0.3 + emerge * 0.7) * visMul;
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
    drawList.push({ z: playerSortZ, sortBias: 1, draw: () => {
      const s = this._worldToScreen(this.player.x, this.player.z);
      const feetY = Math.round(s.y + playerBounce + spriteFeetOffset(CHAR_NATIVE_PX, SPRITE_PLAYER));
      drawPixelEllipseShadow(ctx, s.x, feetY, 10, 4, tilePx);
      this.sprites.draw(ctx, playerSheet, s.x, s.y + playerBounce, SPRITE_PLAYER, 0, playerFlip, 'center', 0, playerAnim);
    }});
    const gunClip = insideBuilding ? buildingGunClipBounds(insideBuilding) : null;
    drawList.push({ z: playerSortZ + 0.02, sortBias: 2, draw: () => {
      const pose = this._getGunScreenPose(drawTime);
      this._drawWeaponSprite(ctx, pose, gunClip);
    }});
    for (const building of visibleBuildings) {
      const playerInside = insideBuilding === building;
      for (const wall of building.walls) {
        if (!wallDrawsInFront(wall, playerSortZ, playerInside, playerX, playerZ, building)) continue;
        drawList.push({
          z: wallFrontDrawZ(wall, playerSortZ, playerInside, playerX, playerZ, building),
          sortBias: 6,
          draw: () => drawBuildingWall(ctx, wall, building, worldToScreen, tilePx, this.sprites),
        });
      }
      if (doorDrawsInFront(building, playerSortZ, playerInside, playerX, playerZ)) {
        drawList.push({
          z: doorFrontDrawZ(building, playerSortZ, playerInside, playerX, playerZ),
          sortBias: 6,
          draw: () => drawBuildingDoor(ctx, building, worldToScreen, tilePx, this.sprites),
        });
      }
    }
    for (const p of this.particles) {
      if (p.kind === 'fire') {
        brightParticles.push({ z: p.z - 0.05, p });
        continue;
      }
      let sortZ = p.z;
      if (p.kind === 'spark' || p.kind === 'scrape') {
        sortZ = this._inFrontOfEnemySortZ(p.x, p.z);
      } else if (p.kind === 'blood') {
        sortZ = p.z - 0.2;
      } else {
        sortZ = p.z - 0.05;
      }
      drawList.push({
        z: sortZ,
        sortBias: 1,
        draw: () => {
          const visMul = this._visibilityMul(p.x, p.z, useVisFog, visPoly);
          this._drawParticle(ctx, p, visMul);
        },
      });
    }
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      const bulletZ = bulletDrawSortZ(b.x, b.z, visibleBuildings);
      drawList.push({
        z: bulletZ,
        sortBias: 1,
        draw: () => {
          if (this._visibilityMul(b.x, b.z, useVisFog, visPoly) <= 0) return;
          this._drawBulletTrail(ctx, b);
          const s = this._worldToScreen(b.x, b.z);
          const bScale = b.fromPlayer ? SPRITE_BULLET : 1;
          const bAngle = velToSpriteAngle(b.vx, b.vz);
          this.sprites.draw(ctx, 'bullet', s.x, s.y, bScale, bAngle);
        },
      });
    }
    drawList.sort((a, b) => (a.z - b.z) || ((a.sortBias ?? 0) - (b.sortBias ?? 0)));
    for (const d of drawList) d.draw();

    for (const building of visibleBuildings) {
      const alpha = this.buildings?.roofAlphaFor(building) ?? 1;
      drawBuildingRoof(ctx, building, worldToScreen, tilePx, alpha, this.sprites);
    }

    this._drawPlayerCooldown(ctx, performance.now() / 1000);

    applyNightOverlay(ctx, INTERNAL_W, INTERNAL_H, nightFactor);

    brightParticles.sort((a, b) => a.z - b.z);
    for (const { p } of brightParticles) {
      const visMul = this._visibilityMul(p.x, p.z, useVisFog, visPoly);
      this._drawParticle(ctx, p, visMul);
    }

    if (this.debugCollision) {
      drawCollisionDebug(
        ctx,
        this.world,
        worldToScreen,
        viewMinX,
        viewMaxX,
        viewMinZ,
        viewMaxZ,
      );
    }

    if (this.running && !this.inventoryUI?.isOpen()) {
      this.sprites.draw(ctx, this._getCursorSprite(), this.mouse.sx, this.mouse.sy, SPRITE_CURSOR);
    }
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

  _positionInteractPromptAbovePlayer() {
    if (!this.player || !this.el.interactPrompt) return;
    this._syncCamPixels();
    const ps = this._worldToScreen(this.player.x, this.player.z);
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / INTERNAL_W;
    const scaleY = rect.height / INTERNAL_H;
    const clientX = rect.left + ps.x * scaleX;
    const feetLift = (spriteFeetOffset(CHAR_NATIVE_PX, SPRITE_PLAYER) + CHAR_NATIVE_PX * SPRITE_PLAYER) * scaleY;
    const clientY = rect.top + ps.y * scaleY - feetLift;
    this.el.interactPrompt.style.left = `${clientX}px`;
    this.el.interactPrompt.style.top = `${clientY}px`;
    this.el.interactPrompt.style.bottom = 'auto';
    this.el.interactPrompt.style.transform = 'translate(-50%, -100%)';
  }

  _drawAmmoHudIcon(ammoType) {
    const canvas = this.el.ammoIcon;
    if (!canvas) return;
    const srcPx = 16;
    const scale = 2;
    const outPx = srcPx * scale;
    if (canvas.width !== outPx) {
      canvas.width = outPx;
      canvas.height = outPx;
    }
    if (!ammoType) {
      canvas.classList.add('hidden');
      return;
    }
    canvas.classList.remove('hidden');
    const spriteName = AMMO_TYPES[ammoType]?.sprite ?? 'pistol_ammo';
    const img = this.sprites?.images[spriteName];
    if (!img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, outPx, outPx);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, srcPx, srcPx, 0, 0, outPx, outPx);
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
      this._drawAmmoHudIcon(null);
    } else {
      const gun = this.player.getWeapon();
      const reserve = this.player.getReserveAmmo();
      this.el.ammoCurrent.textContent = `${gun.ammo}/${gun.magSize}`;
      this.el.ammoReserve.textContent = reserve;
      this.el.ammoCurrent.style.color = gun.ammo === 0 ? '#ff4040' : '#e8e4dc';
      this.el.ammoReserve.style.color = reserve > 0 ? '#8899aa' : '#556066';
      this.el.reloadIndicator.classList.toggle('hidden', !gun.reloading);
      this._drawAmmoHudIcon(getWeaponAmmoType(this.player.weaponKey));
    }

    const biome = getBiome(this.player.x, this.player.z);
    const zoneNames = { base: 'Base', meadow: 'Meadow', forest: 'Forest', scrub: 'Scrub', rock: 'Rock' };
    if (this.el.zoneLabel) {
      this.el.zoneLabel.textContent = zoneNames[biome] || biome;
    }

    if (this.el.gameDay && this.dayNight) {
      this.el.gameDay.textContent = this.dayNight.formatDay();
    }
    if (this.el.gameClock && this.dayNight) {
      this.el.gameClock.textContent = this.dayNight.formatClock();
    }

    if (this.items.pickupMsg) {
      this.el.pickupStatus.textContent = this.items.pickupMsg;
      this.el.pickupStatus.classList.add('active');
      this.el.pickupStatus.classList.toggle('error', this.items.pickupMsgError);
    } else {
      this.el.pickupStatus.textContent = '';
      this.el.pickupStatus.classList.remove('active', 'error');
    }

    const power = this.player.getActivePowerUpLabel(time);
    this.el.powerupStatus.textContent = power;
    this.el.powerupStatus.classList.toggle('active', !!power);

    const hoveredChest = this._getHoveredChest();
    const nearbyChest = this._getNearbyChest();
    const interactDoor = this._getInteractDoor();
    const canOpenChestDesktop = !this.inventoryUI.open
      && !this.mobile
      && hoveredChest
      && this.chests.isInInteractRange(this.player, hoveredChest);
    const canOpenChestMobile = !this.inventoryUI.open && this.mobile && nearbyChest && !interactDoor;
    const canOpenChest = canOpenChestDesktop || canOpenChestMobile;
    const canToggleDoor = !this.inventoryUI.open && interactDoor;
    const mbInteract = document.getElementById('mb-interact');
    mbInteract?.classList.toggle('mb-nearby', canToggleDoor || canOpenChestMobile);
    const showPrompt = canToggleDoor || canOpenChest;
    this.el.interactPrompt.classList.toggle('hidden', !showPrompt);
    if (showPrompt) {
      const doorVerb = interactDoor?.doorOpen ? 'close' : 'open';
      if (this.mobile) {
        this.el.interactPrompt.textContent = canToggleDoor
          ? `E to ${doorVerb} door`
          : 'E to open';
        this._positionInteractPromptAbovePlayer();
      } else {
        const mx = this.mouse.clientX;
        const my = this.mouse.clientY;
        this.el.interactPrompt.textContent = canToggleDoor
          ? `RMB to ${doorVerb} door`
          : 'RMB to open';
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

    this.minimap.render(this.player, this.robots, this.world, this.chests, this.buildings);
  }

  _checkGameOver() {
    if (!this.player.alive) this._endGame();
  }

  _endGame() {
    this.running = false;
    this.paused = false;
    const elapsed = (((this.playTimeBase ?? 0) + performance.now() - this.startTime) / 1000).toFixed(1);
    this.audio.lose();
    deleteSave();
    this._refreshMainMenuButtons();
    this._clearKeyboardInput();
    this.prevMouseDown = false;
    this.touchMove = { x: 0, z: 0 };
    this.moveJoystick?.reset();
    this.inventoryUI?.forceClose();
    this._showMainMenu(`You died — Kills: ${this.kills} · Time: ${elapsed}s`);
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const time = now / 1000;

    this._frameDt = dt;
    if (!this.paused) {
      this._update(dt, time);
      this._checkGameOver();
    }
    this._draw();
    this._updateHUD();
    requestAnimationFrame(() => this._loop());
  }
}

new Game();
