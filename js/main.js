import { setElementPixelText, setElementWrappedPixelText, preloadPixelTextAtlas, PIXEL_TEXT_SCALE, PIXEL_TEXT_SCALE_SM } from './pixelText.js';
import { World, TILE } from './world.js';
import { ChunkEntityManager } from './chunkEntities.js';
import { unpackTintGradient, isTreeFoliage, treeOccludesPlayer, rollWorldSeed, setWorldSeed, getWorldSeed } from './worldGen.js';
import { Robot, Scout, createGroundSpew, updateParticles, createExplosion } from './enemies.js';
import { CorpseManager, corpseSpriteName, CORPSE_DRAW_SCALE } from './corpses.js';
import { Player, BulletPool, WEAPONS, GUN_HOLD_OFFSET, findBulletSpawn } from './player.js';
import {
  captureGameState,
  deleteSave,
  hasSavedGame,
  readSave,
  writeSave,
} from './saveGame.js';
import { SoundManager } from './audio.js';
import { ItemManager } from './items.js';
import { GroundDropManager, GROUND_DROP_DISPLAY_PX, GROUND_DROP_RES_PX } from './groundDrops.js';
import { getEnemyStatusIcon, tickTileFlowField } from './enemyNav.js';
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
  doorDrawsInFront,
  doorBackDrawZ,
  doorFrontDrawZ,
  bulletDrawSortZ,
  entityFeetZ,
} from './buildingGen.js';
import { chestSpriteName, getItemIconSrc } from './loot.js';
import { SpriteBank, gunAimTransform, gunPivotHoldOffset, getReloadPoseBlend, getReloadHoldScreenX, getMeleeHoldPose, getHandHoldPose, getWalkSheet, getWalkAnim, getEnemyBodySheet, getEnemyBodyAnim, velToSpriteAngle, getPlayerSheet, getPlayerAnim, getPlayerFlipX, getPlayerBounceY, getPlayerIdleBreathY, getWalkBounceY, resolveFlipX, isMovingForward, CHAR_NATIVE_PX, getEnemyNativePx, getEnemyDrawScale, spriteFeetOffset, PARTICLE_FX_NATIVE_PX, getParticleFxSprite, getParticleFxAnim, CURSOR_DRAW_SCALE, ENEMY_STATUS_ICON_SCALE } from './sprites.js';
import { collectCollisionTargets, moveWithEntityCollision, applyApproachPush, updateLocomotion, isSprintAnimSpeed, entityPushRadius } from './collision.js';
import { drawCollisionDebug } from './collisionDebug.js';
import { createStepDust, createBulletCasing, createBloodSplatter, createRobotHitSparks, createRobotSmoke, createRobotFire, createRobotDeathFx, PARTICLE_SIZE_UNIT } from './particles.js';
import { VirtualJoystick } from './joystick.js';
import { InventoryUI, INV_CURSOR_SRC } from './inventory.js';
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
import {
  computeViewBounds,
  pointInViewBounds,
  VIEW_MARGIN_TILES,
  VIEW_SPRITE_PAD,
} from './viewCull.js';
import { LanSession } from './lanSession.js';
import { clearNetEntities } from './netState.js';
import {
  isSupabaseConfigured,
  createRoom,
  findRoomByCode,
  registerJoin,
  closeRoom,
  roomWebSocketUrl,
} from './rooms.js';

const VISION_DARKNESS = 0.25;
/** Y-sort bias — shadows on the floor, under walls and bodies. */
const SORT_SHADOW = 0;
const SORT_WALL_BACK = 1;
const SORT_ENTITY = 2;
const SORT_GUN = 3;
const SORT_WALL_FRONT = 6;

const SPRITE_PLAYER = 1.50;
const SPRITE_CHEST = CHEST_DRAW_SCALE;
const SPRITE_CRATE = 2.2;
const SPRITE_BULLET = 1.2;
const SPRITE_CASING = 1.5;
const SPRITE_GUN = 1.35;
const SPRITE_CURSOR = CURSOR_DRAW_SCALE;

const GAME_CURSOR_SRC = {
  inv_cursor: INV_CURSOR_SRC,
  cursor: 'assets/ui/cursor.png',
  cursor_melee: 'assets/ui/cursor_melee.png',
  cursor_shotgun: 'assets/ui/cursor_shotgun.png',
};
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
    this._visCamX = null;
    this._visCamZ = null;
    this._visPx = null;
    this._visPz = null;
    this._visTick = 0;
    this._drawListScratch = [];
    this.debugCollision = false;
    this.touchMove = { x: 0, z: 0 };
    this.autoLock = false;
    this.mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.lan = null;
    this._treeFadeAlpha = new Map();
    this._enemyVisAlpha = new Map();
    this._cachedYsortFoliage = [];
    this._exportingMap = false;
    this._spawnReveal = null;

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
    this.renderScale = this.mobile ? 1 : RENDER_SCALE;
    this.canvas.width = INTERNAL_W * this.renderScale;
    this.canvas.height = INTERNAL_H * this.renderScale;
    this.ctx.imageSmoothingEnabled = false;
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const bufW = INTERNAL_W * this.renderScale;
    const bufH = INTERNAL_H * this.renderScale;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const scale = Math.max(vw / bufW, vh / bufH);
    this.displayScale = scale;
    this.canvas.style.width = `${bufW * scale}px`;
    this.canvas.style.height = `${bufH * scale}px`;
  }

  _initUI() {
    this.el = {
      mainMenu: document.getElementById('main-menu'),
      menuSubtitle: document.getElementById('menu-subtitle'),
      pauseMenu: document.getElementById('pause-menu'),
      pauseRoomCode: document.getElementById('pause-room-code'),
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
      createRoomBtn: document.getElementById('create-room-btn'),
      joinRoomBtn: document.getElementById('join-room-btn'),
      playerNameInput: document.getElementById('player-name-input'),
      roomCodeInput: document.getElementById('room-code-input'),
      roomCodeDisplay: document.getElementById('room-code-display'),
      lanStatus: document.getElementById('lan-status'),
      resumeBtn: document.getElementById('resume-btn'),
      saveGameBtn: document.getElementById('save-game-btn'),
      backToMenuBtn: document.getElementById('back-to-menu-btn'),
      confirmYesBtn: document.getElementById('confirm-yes-btn'),
      confirmNoBtn: document.getElementById('confirm-no-btn'),
      mobileControls: document.getElementById('mobile-controls'),
      waveBanner: document.getElementById('wave-banner'),
      inventory: document.getElementById('inventory'),
      loadingScreen: document.getElementById('loading-screen'),
      loadingBarFill: document.getElementById('loading-bar-fill'),
      loadingStatus: document.getElementById('loading-status'),
      spawnCurtain: document.getElementById('spawn-curtain'),
      spawnCurtainStatus: document.getElementById('spawn-curtain-status'),
    };
    this.inventoryUI = new InventoryUI(this);
    this._menuCursorEl = null;
    this._onMenuPointerMove = (e) => this._moveMenuCursor(e);
    this._waveBannerTimer = null;
    this._confirmYes = null;
    this._confirmNo = null;
    preloadPixelTextAtlas().then(() => this._initStaticPixelLabels());
  }

  _setPixelText(el, text, scale = PIXEL_TEXT_SCALE) {
    if (!el) return;
    if (!text) {
      el.replaceChildren?.();
      return;
    }
    setElementPixelText(el, text, scale);
  }

  _setPixelBtn(btn, text, scale = PIXEL_TEXT_SCALE) {
    this._setPixelText(btn, text, scale);
  }

  _initStaticPixelLabels() {
    const T = PIXEL_TEXT_SCALE;
    const S = PIXEL_TEXT_SCALE_SM;
    document.querySelectorAll('#overlay button.ui-slice-button, #mobile-controls button.ui-slice-button').forEach((btn) => {
      const label = btn.textContent.trim();
      if (label) this._setPixelBtn(btn, label, T);
    });
    this._setPixelText(document.querySelector('#main-menu h1'), 'Robot Ruins', T);
    document.querySelectorAll('#loading-screen .menu-heading, #pause-menu .menu-heading').forEach((el) => {
      const label = el.textContent.trim();
      if (label) this._setPixelText(el, label, T);
    });
    this._setPixelText(this.el.reloadIndicator, 'Reloading...', T);
    this._setPixelText(this.el.spawnCurtainStatus, 'Entering the ruins...', T);
    this._setPixelText(document.querySelector('.ammo-sep'), '/', T);
    if (this.el.loadingStatus?.textContent.trim()) {
      this._setPixelText(this.el.loadingStatus, this.el.loadingStatus.textContent.trim(), T);
    }
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
    this._hideGameCursor();
    this._endSpawnReveal();
    this.el.mobileControls?.classList.add('hidden');
    this._enableMenuCursor();
    if (deathStats) {
      this._setPixelText(this.el.menuSubtitle, deathStats, PIXEL_TEXT_SCALE_SM);
      this.el.menuSubtitle.classList.remove('hidden');
    } else {
      this._setPixelText(this.el.menuSubtitle, '');
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
    this._hideGameCursor();
    this._enableMenuCursor();
    if (this.el.pauseRoomCode) {
      if (this._roomCode && this.lan?.isOnline) {
        this._setPixelText(this.el.pauseRoomCode, `Room code: ${this._roomCode}`, PIXEL_TEXT_SCALE);
        this.el.pauseRoomCode.classList.remove('hidden');
      } else {
        this._setPixelText(this.el.pauseRoomCode, '');
        this.el.pauseRoomCode.classList.add('hidden');
      }
    }
    this._clearKeyboardInput();
    this.prevMouseDown = false;
    this.mouseDown = false;
    this.inventoryUI?.forceClose();
  }

  _hidePauseMenu() {
    this.paused = false;
    this.el.pauseMenu?.classList.add('hidden');
    this._disableMenuCursor();
    this.canvas.focus();
  }

  _ensureMenuCursor() {
    if (this._menuCursorEl) return;
    this._menuCursorEl = document.createElement('img');
    this._menuCursorEl.className = 'menu-cursor-follow';
    this._menuCursorEl.src = INV_CURSOR_SRC;
    this._menuCursorEl.alt = '';
    this._menuCursorEl.draggable = false;
    document.body.appendChild(this._menuCursorEl);
  }

  _enableMenuCursor() {
    if (this.mobile) return;
    this._ensureMenuCursor();
    document.body.classList.add('menu-custom-cursor');
    document.addEventListener('pointermove', this._onMenuPointerMove);
    if (this._menuCursorEl) this._menuCursorEl.style.visibility = 'visible';
  }

  _disableMenuCursor() {
    document.removeEventListener('pointermove', this._onMenuPointerMove);
    document.body.classList.remove('menu-custom-cursor');
    if (this._menuCursorEl) this._menuCursorEl.style.visibility = 'hidden';
  }

  _ensureGameCursor() {
    if (this._gameCursorEl) return;
    this._gameCursorEl = document.createElement('img');
    this._gameCursorEl.className = 'game-cursor-follow';
    this._gameCursorEl.alt = '';
    this._gameCursorEl.draggable = false;
    document.body.appendChild(this._gameCursorEl);
  }

  _hideGameCursor() {
    if (this._gameCursorEl) this._gameCursorEl.style.visibility = 'hidden';
  }

  _panelOpen() {
    return !!this.inventoryUI?.isOpen();
  }

  _internalScreenToClient(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (sx / INTERNAL_W) * rect.width,
      y: rect.top + (sy / INTERNAL_H) * rect.height,
    };
  }

  _syncGameCursor() {
    if (!this.running || this.paused || this._panelOpen() || this._isSpawnRevealActive()) {
      this._hideGameCursor();
      return;
    }
    this._ensureGameCursor();
    const sprite = this._getCursorSprite();
    const src = GAME_CURSOR_SRC[sprite] ?? INV_CURSOR_SRC;
    const path = src.startsWith('http') || src.startsWith('/') ? src : new URL(src, location.href).href;
    if (this._gameCursorEl.dataset.sprite !== sprite) {
      this._gameCursorEl.dataset.sprite = sprite;
      this._gameCursorEl.src = path;
    }
    const size = sprite === 'inv_cursor' ? 56 : (this.mobile ? 32 : 48);
    this._gameCursorEl.style.width = `${size}px`;
    this._gameCursorEl.style.height = `${size}px`;
    if (this.mobile) {
      const pt = this._internalScreenToClient(this.mouse.sx, this.mouse.sy);
      this._gameCursorEl.style.left = `${pt.x}px`;
      this._gameCursorEl.style.top = `${pt.y}px`;
      this._gameCursorEl.style.transform = 'translate(-50%, -50%)';
    } else {
      this._gameCursorEl.style.left = `${this.mouse.clientX}px`;
      this._gameCursorEl.style.top = `${this.mouse.clientY}px`;
      this._gameCursorEl.style.transform = 'translate(-50%, -50%)';
    }
    this._gameCursorEl.style.visibility = 'visible';
  }

  _moveMenuCursor(e) {
    if (!this._menuCursorEl || this.mobile) return;
    this._menuCursorEl.style.visibility = 'visible';
    this._menuCursorEl.style.left = `${e.clientX}px`;
    this._menuCursorEl.style.top = `${e.clientY}px`;
  }

  _showLoadingScreen() {
    this._disableMenuCursor();
    this.el.loadingScreen?.classList.remove('hidden');
    this.el.mainMenu?.classList.add('hidden');
    this._setLoadingProgress(0, 'Preparing…');
  }

  _hideLoadingScreen() {
    this.el.loadingScreen?.classList.add('hidden');
  }

  _setLoadingProgress(fraction, message) {
    const pct = Math.max(0, Math.min(1, fraction)) * 100;
    if (this.el.loadingBarFill) this.el.loadingBarFill.style.width = `${pct}%`;
    if (message && this.el.loadingStatus) this._setPixelText(this.el.loadingStatus, message, PIXEL_TEXT_SCALE);
  }

  _isSpawnRevealActive() {
    return !!this._spawnReveal && this._spawnReveal.phase !== 'done';
  }

  _beginSpawnReveal() {
    this._spawnReveal = {
      phase: 'foliage',
      opacity: 1,
      fadeOutDuration: 2.4,
      holdElapsed: 0,
      minHold: 2.75,
      maxHold: 10,
      radiusChunks: 5,
    };
    this._disableMenuCursor();
    this._hideGameCursor();
    this.inventoryUI?._disableInvCursor?.();
    if (this.el.spawnCurtainStatus) {
      this._setPixelText(this.el.spawnCurtainStatus, 'Entering the ruins...', PIXEL_TEXT_SCALE);
      this.el.spawnCurtainStatus.style.opacity = '0.85';
    }
    this.el.spawnCurtain?.classList.remove('hidden');
    this.el.spawnCurtain?.classList.remove('is-fading-out');
    if (this.el.spawnCurtain) {
      this.el.spawnCurtain.classList.remove('is-entering');
      this.el.spawnCurtain.style.opacity = '1';
    }
  }

  _syncSpawnCurtain(opacity) {
    const el = this.el.spawnCurtain;
    if (!el) return;
    const a = Math.max(0, Math.min(1, opacity));
    el.style.opacity = String(a);
    if (this.el.spawnCurtainStatus) {
      this.el.spawnCurtainStatus.style.opacity = String(Math.min(0.85, a * 0.9));
    }
  }

  _updateSpawnReveal(dt) {
    const reveal = this._spawnReveal;
    if (!reveal || reveal.phase === 'done') return;

    if (reveal.phase === 'foliage') {
      if (this.player && this.world && !reveal.areaBootstrapped) {
        reveal.areaBootstrapped = true;
        this.world.touchChunksAround(this.player.x, this.player.z, reveal.radiusChunks + 1, { eager: true });
        this.chunkEntities?._populateBuildingsOnly(this.player, reveal.radiusChunks);
        const cleared = this.world.ensureClearSpawnPosition(this.player.x, this.player.z);
        if (cleared.x !== this.player.x || cleared.z !== this.player.z) {
          this.player.x = cleared.x;
          this.player.z = cleared.z;
          this.world._cachedPlayerSpawn = { x: cleared.x, z: cleared.z };
        }
        const view = this.getViewBoundsWorld();
        this._cachedYsortFoliage = this.world.collectYsortFoliage(
          view.minX,
          view.maxX,
          view.minZ,
          view.maxZ,
        );
      }
      reveal.holdElapsed += dt;
      const areaReady = this.world?.isSpawnAreaReadyAround(
        this.player.x,
        this.player.z,
        reveal.radiusChunks,
      );
      const timedOut = reveal.holdElapsed >= reveal.maxHold;
      if ((areaReady || timedOut) && reveal.holdElapsed >= reveal.minHold) {
        reveal.phase = 'fadeOut';
        reveal.opacity = 1;
        this._syncSpawnCurtain(1);
        if (this.el.spawnCurtainStatus) {
          this.el.spawnCurtainStatus.style.opacity = '0';
        }
      }
      return;
    }

    if (reveal.phase === 'fadeOut') {
      reveal.opacity = Math.max(0, reveal.opacity - dt / reveal.fadeOutDuration);
      this._syncSpawnCurtain(reveal.opacity);
      if (reveal.opacity <= 0) this._endSpawnReveal();
    }
  }

  _endSpawnReveal() {
    if (this._spawnReveal) this._spawnReveal.phase = 'done';
    this._spawnReveal = null;
    this.el.spawnCurtain?.classList.add('hidden');
    if (this.el.spawnCurtain) this.el.spawnCurtain.style.opacity = '';
    this.canvas?.focus();
  }

  _showConfirm(message, onYes, onNo) {
    const frame = this.el.confirmDialog?.querySelector('.menu-frame--confirm');
    const maxWidth = Math.max(200, Math.min(432, (frame?.clientWidth || 432) - 48));
    setElementWrappedPixelText(this.el.confirmMessage, message, maxWidth, PIXEL_TEXT_SCALE_SM);
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
    if (this._panelOpen()) return;
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
    this.lan?.disconnect();
    this.lan = null;
    this._roomCode = null;
    if (this._activeRoom?.id) {
      closeRoom(this._activeRoom.id);
      this._activeRoom = null;
    }
    this._hidePauseMenu();
    this._clearKeyboardInput();
    this.touchMove = { x: 0, z: 0 };
    this.moveJoystick?.reset();
    this.inventoryUI?.forceClose();
    this._showMainMenu();
  }

  _setLanStatus(text) {
    if (!this.el.lanStatus) return;
    if (text) {
      this._setPixelText(this.el.lanStatus, text, PIXEL_TEXT_SCALE_SM);
      this.el.lanStatus.classList.remove('hidden');
    } else {
      this._setPixelText(this.el.lanStatus, '');
      this.el.lanStatus.classList.add('hidden');
    }
  }

  _playerName() {
    return this.el.playerNameInput?.value?.trim().slice(0, 16) || 'Player';
  }

  async _connectToRoom(room, { isHost = false } = {}) {
    this._setLanStatus('Connecting…');
    const url = roomWebSocketUrl(room);
    try {
      const lan = new LanSession(this, {
        playerId: null,
        playerName: this._playerName(),
        url,
        roomId: room.id,
        roomSeed: room.seed,
      });
      await lan.connect();
      this.lan = lan;
      this._roomCode = room.code || null;
      this._activeRoom = isHost ? room : null;
      if (!isHost) await registerJoin(room.id);
      this._setLanStatus('');
      this._hideMainMenu();
      await this._bootGame({ worldSeed: lan.sessionSeed }, { lan });
    } catch (err) {
      console.error(err);
      this.lan?.disconnect();
      this.lan = null;
      this._roomCode = null;
      this._activeRoom = null;
      const hint = window.location.protocol === 'file:'
        ? 'Open the game via http://localhost (npm start), not as a file.'
        : 'Make sure the game server is running at this same URL.';
      this._setLanStatus(`${err.message}. ${hint}`);
      this._showMainMenu();
    }
  }

  async _createRoom() {
    if (!isSupabaseConfigured()) {
      this._setLanStatus('Supabase not configured — edit js/supabaseConfig.js');
      return;
    }
    this._setLanStatus('Creating room…');
    try {
      const room = await createRoom(this._playerName());
      this.el.roomCodeDisplay?.classList.remove('hidden');
      if (this.el.roomCodeDisplay) {
        this._setPixelText(
          this.el.roomCodeDisplay,
          `Room code: ${room.code} - share with friends`,
          PIXEL_TEXT_SCALE_SM,
        );
      }
      await this._connectToRoom(room, { isHost: true });
    } catch (err) {
      console.error(err);
      this._setLanStatus(err.message);
    }
  }

  async _joinRoom() {
    if (!isSupabaseConfigured()) {
      this._setLanStatus('Supabase not configured — edit js/supabaseConfig.js');
      return;
    }
    const code = this.el.roomCodeInput?.value?.trim();
    if (!code) {
      this._setLanStatus('Enter a room code');
      return;
    }
    this._setLanStatus('Finding room…');
    try {
      const room = await findRoomByCode(code);
      await this._connectToRoom(room, { isHost: false });
    } catch (err) {
      console.error(err);
      this._setLanStatus(err.message);
    }
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
    this._setPixelText(banner, text, PIXEL_TEXT_SCALE + 1);
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
    if (e.code === 'Tab' && this.running) {
      e.preventDefault();
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
    if (e.code === 'KeyE' && !e.repeat) {
      e.preventDefault();
      if (this.lan?.isOnline) {
        this.lan.queueInteract();
        return;
      }
      if (this.inventoryUI?.isOpen()) {
        this.inventoryUI.close();
        return;
      }
      if (!this.running || this.paused) return;
      if (this.mobile) {
        this._tryInteract();
      } else {
        this.inventoryUI.toggle();
      }
      return;
    }
    if (!this.running || this.paused) return;
    if (e.repeat) return;
    if (this._panelOpen()) return;
    if (e.code === 'F3') {
      e.preventDefault();
      this.debugCollision = !this.debugCollision;
      return;
    }
    if (e.code === 'KeyR') {
      if (this.lan?.isOnline) this.lan.queueReload();
      else this._tryStartReload(performance.now() / 1000);
    }
    if (e.code === 'Digit1') this.player?.setActiveHandSlot(0);
    if (e.code === 'Digit2') this.player?.setActiveHandSlot(1);
    if (e.code === 'KeyF' || e.code === 'Digit3') {
      const before = this.player?.health;
      if (this.player?.useQuickSlot()) {
        const healed = Math.max(0, Math.round(this.player.health - before));
        this.items.setPickupMsg(`+${healed} HP`);
        this.audio.pickup();
      } else if (this.player?.quickSlot) {
        this.items.setPickupMsg('Already at full health', { error: true });
      }
    }
    if (e.code === 'KeyQ' || e.code === 'Digit4') {
      this.player?.useThrowableSlot();
    }
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
    this.el.createRoomBtn?.addEventListener('click', () => this._createRoom());
    this.el.joinRoomBtn?.addEventListener('click', () => this._joinRoom());
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
    window.visualViewport?.addEventListener('resize', () => this._resizeCanvas());
    window.visualViewport?.addEventListener('scroll', () => this._resizeCanvas());

    window.addEventListener('keydown', (e) => this._onGameKeyDown(e), true);
    window.addEventListener('keyup', (e) => this._onGameKeyUp(e), true);
    window.addEventListener('blur', () => {
      if (this._panelOpen()) return;
      this._clearKeyboardInput();
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.canvas.focus();
      this.audio.resume();
        if (!this.paused) this.mouseDown = true;
      } else if (e.button === 2 && this.running && !this.paused && !this._panelOpen()) {
        if (this.lan?.isOnline) {
          if (this._getNearbyGroundDropForInteract() || this._getInteractDoor()) {
            this.lan.queueInteract();
          } else {
            const container = this._getLootContainerUnderCursor();
            if (container) this.inventoryUI.openChest(container);
          }
        } else if (this._tryPickupGroundDrop()) {
          /* hovered ground drop takes priority over chest / door */
        } else if (!this._tryToggleNearbyDoor()) {
          const container = this._getLootContainerUnderCursor();
          if (container) {
            this.inventoryUI.openChest(container);
          }
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
      if (!this.running || this.paused || this._panelOpen()) return;
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
      const clearPressed = () => btn.classList.remove('mb-pressed');
      const run = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('mb-pressed');
        const now = performance.now();
        if (now - lastAt < 250) {
          clearPressed();
          return;
        }
        lastAt = now;
        onPress();
        setTimeout(clearPressed, 120);
      };
      btn.addEventListener('pointerdown', run, { passive: false });
      btn.addEventListener('pointerup', clearPressed);
      btn.addEventListener('pointercancel', clearPressed);
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
        btn.classList.add('mb-pressed');
        onDown();
      };
      const end = (e) => {
        if (!held) return;
        held = false;
        btn.classList.remove('mb-pressed');
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
      if (this.running) {
        if (this.lan?.isOnline) this.lan.queueReload();
        else this._tryStartReload(performance.now() / 1000);
      }
    });

    bindPress('mb-pause', () => this._togglePause());
    bindPress('mb-hand-0', () => { if (this.running) this.player?.setActiveHandSlot(0); });
    bindPress('mb-hand-1', () => { if (this.running) this.player?.setActiveHandSlot(1); });
    bindPress('mb-quick', () => {
      if (!this.running) return;
      const before = this.player?.health;
      if (this.player?.useQuickSlot()) {
        const healed = Math.max(0, Math.round(this.player.health - before));
        this.items.setPickupMsg(`+${healed} HP`);
        this.audio.pickup();
      } else if (this.player?.quickSlot) {
        this.items.setPickupMsg('Already at full health', { error: true });
      }
    });
    bindPress('mb-throw', () => { if (this.running) this.player?.useThrowableSlot(); });

    bindPress('mb-interact', () => {
      if (this.running) {
        this.audio.resume();
        if (this.lan?.isOnline) this.lan.queueInteract();
        else this._tryInteract();
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

  _refreshAimVisibility() {
    if (!this.player?.alive || !this.running || !this.world) {
      this._aimVisPoly = null;
      return;
    }
    const cam = this._camera();
    const px = this.player.x;
    const pz = this.player.z;

    const viewHalfW = INTERNAL_W / PPU / 2 + TILE;
    const viewHalfH = INTERNAL_H / PPU / 2 + TILE;
    const viewMinX = cam.x - viewHalfW;
    const viewMaxX = cam.x + viewHalfW;
    const viewMinZ = cam.z - viewHalfH;
    const viewMaxZ = cam.z + viewHalfH;
    const insideBuilding = this.buildings?.insideBuilding;
    const visibleBuildings = this.buildings?.collectInView(viewMinX, viewMaxX, viewMinZ, viewMaxZ) ?? [];
    const origin = resolveVisionOrigin(this.world, px, pz, insideBuilding);
    const segments = collectVisionSegments(
      this.world,
      visibleBuildings,
      viewMinX,
      viewMaxX,
      viewMinZ,
      viewMaxZ,
      insideBuilding,
    );
    this._aimVisPoly = computeVisibilityPolygon(
      origin.x,
      origin.z,
      segments,
      viewMinX,
      viewMaxX,
      viewMinZ,
      viewMaxZ,
    );
  }

  _isRobotVisibleToPlayer(robot) {
    if (!this._aimVisPoly) return true;
    return pointInVisibilityPolygon(robot.x, entityFeetZ(robot), this._aimVisPoly);
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
      if (!this._isRobotVisibleToPlayer(robot)) continue;
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
      this._syncPlayerFlip();
      return;
    }

    const target = this._screenToWorld(this.mouse.sx, this.mouse.sy);
    this.mouse.wx = target.x;
    this.mouse.wz = target.z;
    this.player.angle = this._resolveAimAngle(this.mouse.sx, this.mouse.sy);
    this._syncPlayerFlip();
  }

  _syncPlayerFlip() {
    if (!this.player) return;
    this.player._flipX = resolveFlipX(this.player.angle, this.player._flipX ?? false);
  }

  _updateCameraFollow(dt) {
    if (!this.player) return;
    const decay = 1 - Math.exp(-CAM_FOLLOW_SMOOTH * dt);
    if (this.mobile || this._panelOpen()) {
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

  /** Visible world rect — matches ground draw culling (+ optional margin in tiles). */
  getViewBoundsWorld(marginTiles = VIEW_MARGIN_TILES) {
    const cam = this._camera();
    return computeViewBounds(cam.x, cam.z, marginTiles);
  }

  isWorldPointOnScreen(wx, wz, extraPad = 0) {
    const v = this.getViewBoundsWorld();
    return pointInViewBounds(v, wx, wz, extraPad);
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

  _updateEnemyVisFades(dt) {
    if (!this.player?.alive || !this._aimVisPoly) {
      this._enemyVisAlpha.clear();
      return;
    }
    const fadeRate = 9;
    const step = Math.min(1, fadeRate * dt);
    const active = new Set();

    for (const robot of this.robots) {
      if (!robot.alive && !robot.emerging) continue;
      active.add(robot);
      const inVis = pointInVisibilityPolygon(robot.x, entityFeetZ(robot), this._aimVisPoly);
      const target = inVis ? 1 : 0;
      const prev = this._enemyVisAlpha.get(robot) ?? target;
      this._enemyVisAlpha.set(robot, prev + (target - prev) * step);
    }

    for (const [robot, prev] of this._enemyVisAlpha) {
      if (active.has(robot)) continue;
      const next = prev + (0 - prev) * step;
      if (next <= 0.01) this._enemyVisAlpha.delete(robot);
      else this._enemyVisAlpha.set(robot, next);
    }
  }

  _isWorldPointVisible(wx, wz) {
    if (!this._aimVisPoly) return true;
    return pointInVisibilityPolygon(wx, wz, this._aimVisPoly);
  }

  _enemyVisMul(robot) {
    if (!this._aimVisPoly) return 1;
    return this._enemyVisAlpha.get(robot) ?? 1;
  }

  _treeFadeKey(f) {
    return `${f.x.toFixed(2)},${f.z.toFixed(2)},${f.kind}`;
  }

  _updateTreeFades(dt) {
    if (!this.player?.alive || !this.world) return;
    const px = this.player.x;
    const pz = this.player.z;
    const playerSortZ = this._playerSortZ();
    const playerRadius = this.player.radius ?? 0.35;
    const playerBodyH = (CHAR_NATIVE_PX * SPRITE_PLAYER) / PPU;
    const playerTopZ = pz - playerBodyH * 0.9;
    const nearTrees = this._cachedYsortFoliage.filter((f) => isTreeFoliage(f.kind));

    const active = new Set();
    const fadeRate = 7;
    const step = Math.min(1, fadeRate * dt);

    for (const f of nearTrees) {
      const key = this._treeFadeKey(f);
      active.add(key);
      const target = treeOccludesPlayer(f, px, pz, playerRadius, playerSortZ, {
        playerTopZ,
        headRadius: Math.max(0.4, playerRadius * 0.42),
      }) ? 0.5 : 1;
      const prev = this._treeFadeAlpha.get(key) ?? 1;
      this._treeFadeAlpha.set(key, prev + (target - prev) * step);
    }

    for (const [key, prev] of this._treeFadeAlpha) {
      if (active.has(key)) continue;
      const next = prev + (1 - prev) * step;
      if (next >= 0.995) this._treeFadeAlpha.delete(key);
      else this._treeFadeAlpha.set(key, next);
    }
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

  async _bootGame(saveData = null, bootOpts = null) {
    const isSaveLoad = !!saveData;
    if (!isSaveLoad) {
      this._beginSpawnReveal();
    }
    if (bootOpts?.lan) {
      this.lan = bootOpts.lan;
    } else {
      this.lan?.disconnect();
      this.lan = null;
    }
    this.audio.init();
    this.audio.resume();

    await this._spritePreload;

    if (saveData?.worldSeed != null) {
      setWorldSeed(saveData.worldSeed);
    } else if (bootOpts?.lan?.sessionSeed != null) {
      setWorldSeed(bootOpts.lan.sessionSeed);
    } else {
      rollWorldSeed();
    }

    this.world = new World();
    this.world.setSpriteBank(this.sprites);
    await this.world.build();
    this.bullets = new BulletPool();
    this.robots = [];
    this.items = new ItemManager(this.world);
    this.chests = new ChestManager(this.world);
    this.corpses = new CorpseManager(this.world);
    this.groundDrops = new GroundDropManager(this.world);
    this.buildings = new BuildingManager(this.world, this.chests);
    this.world.setFoliagePopulatedHook((chunk) => {
      this.buildings.reconcileFoliageInChunk(chunk, this.world);
    });
    preloadPixelTextAtlas();
    this.particles = [];
    this.dayNight = new DayNightCycle();

    if (saveData) {
      this.player = new Player();
      this.player.applySaveData(saveData.player);
      this._applySaveState(saveData);
      this._finalizeLoadedSave(saveData);
    } else {
      this.player = new Player();
      const spawn = this.world.getPlayerSpawn();
      this.player.x = spawn.x;
      this.player.z = spawn.z;
    }
    this.world.prewarmGround(this.player.x, this.player.z, 4);

    this._disableMenuCursor();
    this._hideGameCursor();

    this.chunkEntities = new ChunkEntityManager(this.world, this);
    this.chunkEntities.reset();

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
    if (this.lan?.isOnline) clearNetEntities(this);

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

  _finalizeLoadedSave(data) {
    this.world._cachedPlayerSpawn = { x: this.player.x, z: this.player.z };
    for (const b of this.buildings.buildings) {
      if (b.homeCx == null || b.homeCz == null) continue;
      const chunk = this.world.getChunk(b.homeCx, b.homeCz);
      chunk.buildingsSpawned = true;
      if (b.chests?.length || b.chest) chunk.chestsSpawned = true;
    }
    for (const f of data.chunkFlags ?? []) {
      const chunk = this.world.getChunk(f.cx, f.cz);
      if (f.spidersSpawned) chunk.spidersSpawned = true;
      if (f.buildingsSpawned) chunk.buildingsSpawned = true;
      if (f.chestsSpawned) chunk.chestsSpawned = true;
    }
    for (const b of this.buildings.buildings) {
      this.buildings._clearFoliageForBuilding(this.world, b);
    }
    this.world.touchChunksAround(this.player.x, this.player.z, 6);
    const view = this.getViewBoundsWorld();
    this._cachedYsortFoliage = this.world.collectYsortFoliage(
      view.minX,
      view.maxX,
      view.minZ,
      view.maxZ,
    );
  }

  _update(dt, time) {
    if (this.paused) return;

    if (this._isSpawnRevealActive()) {
      this._updateSpawnReveal(dt);
    }

    const online = this.lan?.isOnline;
    this.lan?.tick(dt, this);

    const inventoryOpen = this._panelOpen();
    if (!online) this.dayNight?.update(dt);
    if (this.player?.alive && this.world) {
      this.world.touchChunksAround(this.player.x, this.player.z, 5);
    }
    this.buildings?.update(this.player, dt);

    if (this.player?.alive && this.world && !this._isSpawnRevealActive()) {
      const view = this.getViewBoundsWorld();
      this._cachedYsortFoliage = this.world.collectYsortFoliage(
        view.minX,
        view.maxX,
        view.minZ,
        view.maxZ,
      );
    } else if (!this._isSpawnRevealActive()) {
      this._cachedYsortFoliage = [];
    }

    this._updateTreeFades(dt);
    this._updateEnemyVisFades(dt);

    if (!inventoryOpen) {
      if (!online && !this._isSpawnRevealActive()) {
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
        let wantsSprint;
        if (this.mobile && usingStick) {
          wantsSprint = stickMag > 0.9 && isMovingForward(this.player);
        } else {
          wantsSprint = sprintInput && isMovingForward(this.player);
        }
        const walkSpeed = this.player.speed * this.player.getSpeedMult(time);
        const sprintSpeed = walkSpeed * this.player.sprintMult;
        const speed = wantsSprint ? sprintSpeed : walkSpeed;
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
        applyApproachPush(
          this.player,
          playerPrevX,
          playerPrevZ,
          this.player.x,
          this.player.z,
          entityPushRadius(this.player, PPU),
          targets,
          0.42,
          this.world,
          PPU,
        );
      }

      if (Math.abs(this.player.knockVX) > 0.08 || Math.abs(this.player.knockVZ) > 0.08) {
        const knockTargets = collectCollisionTargets({ player: this.player, robots: this.robots, exclude: this.player });
        const moveShape = this.player.getMoveCollider(PPU);
        const kr = moveWithEntityCollision(
          this.world,
          this.player.x,
          this.player.z,
          this.player.knockVX * dt,
          this.player.knockVZ * dt,
          moveShape,
          moveShape,
          knockTargets,
          this.player,
        );
        this.player.x = kr.x;
        this.player.z = kr.z;
        const friction = Math.exp(-11 * dt);
        this.player.knockVX *= friction;
        this.player.knockVZ *= friction;
      } else {
        this.player.knockVX = 0;
        this.player.knockVZ = 0;
      }

      const locomotion = updateLocomotion(playerPrevX, playerPrevZ, this.player.x, this.player.z, dt);
      this.player.isMoving = locomotion.moving;
      this.player.moveSpeed = locomotion.speed;

      if (this.player.isMoving) {
        const walkSpeed = this.player.speed * this.player.getSpeedMult(time);
        const sprintSpeed = walkSpeed * this.player.sprintMult;
        this.player.isSprinting = isSprintAnimSpeed(this.player.moveSpeed, walkSpeed, sprintSpeed);

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
      }

      this._updateCameraFollow(dt);
      if (!this._isSpawnRevealActive()) {
        this._refreshAimVisibility();
        this._syncAim(dt);
      }

      if (!online && !this._isSpawnRevealActive()) {
      const fireEdge = this.mouseDown && !this.prevMouseDown;
      const fireRelease = !this.mouseDown && this.prevMouseDown;
      const wantsShoot = this.player.isAutomaticWeapon()
        ? this.mouseDown
        : fireEdge;

      if (this.player.usesMeleeCombat()) {
        const melee = this.player.getActiveMelee();
        if (melee?.noCharge) {
          if (fireEdge && this.player.canMeleeCharge(time)) {
            this.player.startInstantMeleeSwing(time);
          }
        } else if (this.player.isMeleeActive()) {
          if (this.mouseDown && this.player.canMeleeCharge(time)) {
            this.player.startMeleeCharge(time);
          }
          if (fireRelease && this.player.isMeleeCharging()) {
            this.player.releaseMeleeCharge(time);
          }
        }
        this._updateMeleeStrike(time);
      } else if (wantsShoot) {
        if (this.player.canShoot(time)) {
          this._fireGun(time);
        } else if (this.player.wantsAutoReload(time)) {
          this._tryStartReload(time);
        }
      }
      }

      this.prevMouseDown = this.mouseDown;
    } else {
      this.player.isMoving = false;
      this.player.isSprinting = false;
      this.player.moveSpeed = 0;
      this.player.moveDirX = 0;
      this.player.moveDirZ = 0;
      this._lastWalkStep = -1;
      this._lastBounceLand = -1;
      this.prevMouseDown = this.mouseDown;
    }

    if (inventoryOpen) this._updateCameraFollow(dt);
    if (!online && !this._isSpawnRevealActive()) {
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
    tickTileFlowField(time, this.world, this.buildings, this.player, this.robots);
    const simView = this.getViewBoundsWorld();
    const simPad = TILE * 10;
    for (const robot of this.robots) {
      if (!pointInViewBounds(simView, robot.x, robot.z, simPad)) continue;
      robot.update(dt, this.player, this.world, this.robots, (r) => {
        if (this.player.takeDamage(r.meleeDamage, time)) {
          this.player.applyMeleeKnockback(r.x, r.z, 2.2 + r.meleeDamage * 0.04);
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
    } else if (!this._isSpawnRevealActive()) {
      this.chunkEntities.update(this.player);
    }
    const breathTarget = getPlayerIdleBreathY(this.player, time);
    this._weaponBreathY += (breathTarget - this._weaponBreathY) * Math.min(1, dt * 18);
    updateParticles(this.particles, dt, this.world, {
      onCasingLand: () => this.audio.casingLand(),
    });
    this.corpses?.update(dt, time, (x, z) => {
      this.particles.push(...createRobotSmoke(x, z - 0.15, 0.22));
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
      const time = performance.now() / 1000;
      this.corpses.spawnFromRobot(robot, time);
      const idx = this.robots.indexOf(robot);
      if (idx >= 0) this.robots.splice(idx, 1);
      this.audio.explosion();
      this.particles.push(...createExplosion(robot.x, robot.z));
      this.particles.push(...createRobotDeathFx(robot.x, robot.z, robot.radius * 1.1));
      this.particles.push(...createRobotSmoke(robot.x, robot.z, 0.55));
    }
  }

  _chestScreenPos(chest) {
    return this._worldToScreen(chest.x, chest.z);
  }

  _corpseScreenPos(corpse) {
    return this._worldToScreen(corpse.x, corpse.z);
  }

  _getNearbyCorpse() {
    if (!this.corpses?.corpses?.length) return null;
    return this.corpses.getNearby(this.player);
  }

  _getHoveredCorpse() {
    if (!this.corpses?.corpses?.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const corpse of this.corpses.corpses) {
      const s = this._corpseScreenPos(corpse);
      const dx = this.mouse.sx - s.x;
      const dy = this.mouse.sy - s.y;
      const hitR = 18;
      const d = dx * dx + dy * dy;
      if (d > hitR * hitR) continue;
      if (d < bestD) {
        bestD = d;
        best = corpse;
      }
    }
    return best;
  }

  _getLootContainerUnderCursor() {
    const corpse = this._getHoveredCorpse();
    if (corpse && this.corpses.isInInteractRange(this.player, corpse)) return corpse;
    const chest = this._getChestUnderCursor();
    if (chest && this.chests.isInInteractRange(this.player, chest)) return chest;
    return null;
  }

  _getHoveredGroundDrop() {
    if (!this.groundDrops?.drops?.length) return null;
    return this.groundDrops.getHovered(this.mouse, this);
  }

  _getNearbyGroundDrop() {
    if (!this.groundDrops?.drops?.length) return null;
    return this.groundDrops.getNearby(this.player);
  }

  _getNearbyGroundDropForInteract() {
    const drop = this._getHoveredGroundDrop() ?? this._getNearbyGroundDrop();
    if (!drop || !this.groundDrops.isInPickupRange(this.player, drop)) return null;
    return drop;
  }

  _tryPickupGroundDrop(drop = null) {
    if (!this.running || this._panelOpen()) return false;
    const target = drop
      ?? this._getHoveredGroundDrop()
      ?? (this.mobile ? this._getNearbyGroundDrop() : null);
    if (!target || !this.groundDrops.isInPickupRange(this.player, target)) return false;
    const result = this.player.tryStoreItem(target.item);
    if (!result.ok) {
      this.items.setPickupMsg('Inventory full', { error: true, duration: 1.8 });
      return false;
    }
    if (result.remainder) {
      target.item = result.remainder;
    } else {
      this.groundDrops.remove(target);
    }
    this.audio.inventoryPlace();
    this.inventoryUI?.render();
    return true;
  }

  _tryDropFromInventoryDrag(e, stashedItem) {
    return this.inventoryUI?.tryDropOnGround(e, stashedItem) ?? false;
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
    if (!this.running || this._panelOpen()) return false;
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
    if (this._isSpawnRevealActive()) return false;
    if (this._tryToggleNearbyDoor()) return true;
    if (this._tryPickupGroundDrop()) return true;
    if (this._tryOpenNearbyChest()) return true;
    if (this._tryOpenNearbyCorpse()) return true;
    return false;
  }

  _getNearbyChest() {
    if (!this.chests?.chests?.length) return null;
    const chest = this.chests.getNearby(this.player);
    if (!chest || !this.chests.isInInteractRange(this.player, chest)) return null;
    return chest;
  }

  _tryOpenNearbyChest() {
    if (!this.running || this._panelOpen()) return false;
    const chest = this._getNearbyChest();
    if (!chest) return false;
    this.inventoryUI.openChest(chest);
    return true;
  }

  _tryOpenNearbyCorpse() {
    if (!this.running || this._panelOpen()) return false;
    const corpse = this._getNearbyCorpse();
    if (!corpse || !this.corpses.isInInteractRange(this.player, corpse)) return false;
    this.inventoryUI.openChest(corpse);
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
    const halfW = Math.round(CHEST_OPAQUE_HALF_W);
    const halfH = Math.round(CHEST_OPAQUE_HALF_H);
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
    if (!this.running || this._panelOpen() || !this.player) return null;
    const door = this._getInteractDoor();
    const nearbyChest = this._getNearbyChest();
    const hoveredChest = this._getHoveredChest();
    const nearbyCorpse = this._getNearbyCorpse();
    const hoveredCorpse = this._getHoveredCorpse();
    const canDoor = !!door;
    const canChestMobile = this.mobile && nearbyChest && !door;
    const canChestDesktop = !this.mobile && hoveredChest
      && this.chests.isInInteractRange(this.player, hoveredChest);
    const canChest = canChestMobile || canChestDesktop;
    const canCorpseMobile = this.mobile && nearbyCorpse && !door && !canChest;
    const canCorpseDesktop = !this.mobile && hoveredCorpse
      && this.corpses.isInInteractRange(this.player, hoveredCorpse);
    const canCorpse = (canCorpseMobile || canCorpseDesktop) && !canChest;

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
          halfW: Math.round(CHEST_OPAQUE_HALF_W) + 4,
          halfH: Math.round(CHEST_OPAQUE_HALF_H) + 6,
        },
      };
    }
    if (canCorpse) {
      const corpse = canCorpseDesktop ? hoveredCorpse : nearbyCorpse;
      const s = this._corpseScreenPos(corpse);
      return {
        kind: 'corpse',
        box: { x: s.x, y: s.y, halfW: 16, halfH: 14 },
      };
    }
    const hoveredDrop = this._getHoveredGroundDrop();
    const nearbyDrop = this._getNearbyGroundDrop();
    const canDropMobile = this.mobile && nearbyDrop && !door && !canChest && !canCorpse;
    const canDropDesktop = !this.mobile && hoveredDrop
      && this.groundDrops.isInPickupRange(this.player, hoveredDrop);
    const canPickupDrop = (canDropMobile || canDropDesktop) && !canChest && !canCorpse;
    if (canPickupDrop) {
      const drop = canDropDesktop ? hoveredDrop : nearbyDrop;
      const s = this._worldToScreen(drop.x, drop.z);
      return {
        kind: 'drop',
        box: { x: s.x, y: s.y - 4, halfW: 12, halfH: 10 },
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
    if (w.sound === 'm870') this.audio.m870();
    else if (w.sound === 'm24') this.audio.m24();
    else if (w.sound === 'glock') this.audio.glock();
    else if (w.sound === 'uzi') this.audio.uzi();
    else if (w.sound === 'revolver') this.audio.revolver();
    else if (w.sound === 'famas') this.audio.famas();
    else if (w.sound === 'fal') this.audio.fal();
    else this.audio.m16();
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
    if (hitAny) this.audio.melee();
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
    if (!this.player) return 'cursor_melee';
    if (this.player.weaponSlot === 'melee' && (this.player.meleeKey || this.player.isMeleeActive())) {
      return 'cursor_melee';
    }
    if (this.player.weaponSlot === 'gun' && this.player.weaponKey) {
      if (this.player.weaponKey === 'm870') return 'cursor_shotgun';
      return 'cursor';
    }
    if (this.player.isUnarmed()) return 'cursor_melee';
    return 'cursor_melee';
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
    if (this.player.isMeleeActive() || this.player.isUnarmed() || drawTime >= this.player.shotFlashUntil) return false;
    const cfg = WEAPONS[this.player.weaponKey];
    return !!(cfg?.shotSprite && weaponDraw.sheet === cfg.shotSprite);
  }

  _getPeerGunScreenPose(peer, px, pz, bounce, drawTime) {
    if ((peer.weaponSlot ?? 'gun') !== 'gun' || !peer.weaponKey) return null;
    const cfg = WEAPONS[peer.weaponKey];
    if (!cfg?.sprite) return null;
    const angle = peer._renderAngle ?? peer.angle;
    const flip = resolveFlipX(angle, peer._flipX ?? false);
    const playerGs = this._worldToScreen(px, pz);
    const gunAim = gunAimTransform(angle, flip);
    const holdDist = GUN_HOLD_OFFSET + gunPivotHoldOffset(gunAim.angle);
    const holdOffX = Math.round(Math.sin(angle) * holdDist * PPU);
    const holdOffY = Math.round(Math.cos(angle) * holdDist * PPU);
    return {
      isMelee: false,
      isShotFlash: false,
      sx: playerGs.x + holdOffX,
      sy: playerGs.y + holdOffY + bounce,
      aimAngle: gunAim.angle,
      aimFlip: gunAim.flipX,
      pivot: 'shoulder',
      tilt: 0,
      weaponDraw: { sheet: cfg.sprite, frame: 0 },
      weaponAnim: null,
    };
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

    if (this.player.isMeleeActive() || this.player.isUnarmed()) {
      const isHand = !!this.player.getActiveMelee()?.noCharge;
      const punchExtend = isHand
        ? this.player.getMeleeSwingLunge(drawTime)
        : lunge;
      const drop = isHand ? 0 : this.player.getMeleeSwingDrop(drawTime);
      const bladeTilt = isHand ? 0 : this.player.getMeleeBladeTilt(drawTime);
      const meleePose = isHand
        ? getHandHoldPose(this.player, punchExtend)
        : getMeleeHoldPose(this.player, lunge);
      const meleeOffX = Math.round((meleePose.worldX - this.player.x) * PPU);
      const meleeOffY = Math.round((meleePose.worldZ - this.player.z) * PPU);
      const bodyBounce = Math.round(getPlayerBounceY(this.player));
      const handBounce = isHand && this.player.isMoving ? -bodyBounce : bodyBounce;
      return {
        isMelee: true,
        isShotFlash: false,
        sx: playerGs.x + meleeOffX,
        sy: playerGs.y + meleeOffY + drop + handBounce + idleBreath,
        aimAngle: meleePose.angle,
        aimFlip: meleePose.flipX,
        pivot: 'shoulder',
        tilt: bladeTilt,
        weaponDraw,
        weaponAnim,
      };
    }

    const gunAim = gunAimTransform(this.player.angle, this.player._flipX ?? false);
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


  _drawVisibilityFog(ctx, useVisFog, visPoly, worldToScreen) {
    if (!useVisFog || !visPoly) return;
    drawVisibilityOverlay(ctx, visPoly, worldToScreen, INTERNAL_W, INTERNAL_H, VISION_DARKNESS);
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
    if (!this.running || !this.player) return;
    if (this.paused) {
      this._hideGameCursor();
      return;
    }

    const ctx = this.ctx;
    const nightFactor = this.dayNight?.getNightFactor() ?? 0;
    this._syncCamPixels();
    ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a3a32';
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    const cam = this._camera();
    const camT = this._camTranslate();
    const view = this.getViewBoundsWorld();
    const viewHalfW = (view.maxX - view.minX) * 0.5;
    const viewHalfH = (view.maxZ - view.minZ) * 0.5;
    const tilePx = TILE * PPU;
    const viewMinX = view.minX;
    const viewMaxX = view.maxX;
    const viewMinZ = view.minZ;
    const viewMaxZ = view.maxZ;
    const spritePad = VIEW_SPRITE_PAD;
    const insideBuilding = this.buildings?.insideBuilding;
    const useVisFog = !!(this.player && this.running);
    const visPoly = useVisFog ? this._aimVisPoly : null;
    const inView = (x, z, pad = spritePad) => pointInViewBounds(view, x, z, pad);
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

    for (const building of visibleBuildings) {
      drawBuildingFloors(ctx, building, worldToScreen, tilePx, this.sprites);
    }

    const playerSortZ = this._playerSortZ();
    const playerX = this.player.x;
    const playerZ = this.player.z;
    const drawList = this._drawListScratch;
    drawList.length = 0;
    const brightParticles = [];
    for (const building of visibleBuildings) {
      this.buildings?._ensureBuildingDecorSprites(building, this.sprites);
      for (const piece of building.decor ?? []) {
        if (!inView(piece.x, piece.z, TILE * 2)) continue;
        const isInterior = !!piece.interior;
        if (useVisFog && visPoly && !isInterior && !this._isWorldPointVisible(piece.x, piece.z)) continue;
        this.sprites.ensureSprite(piece.sprite);
        drawList.push({
          z: piece.sortZ,
          sortBias: piece.sortBias ?? SORT_ENTITY,
          draw: () => drawDecorPiece(ctx, this.sprites, piece, tilePx, worldToScreen),
        });
      }
    }
    const ysortFoliage = this._cachedYsortFoliage;
    for (const f of ysortFoliage) {
      if (!inView(f.x, f.z, spritePad)) continue;
      if (useVisFog && visPoly && !this._isWorldPointVisible(f.x, f.z)) continue;
      const sortZ = f.sortZ ?? (f.z + (f.sortZBias ?? 0));
      if (isTreeFoliage(f.kind)) {
        this.sprites.ensureSprite(f.sprite);
        drawList.push({
          z: sortZ,
          sortBias: SORT_SHADOW,
          draw: () => {
            const s = this._worldToScreen(f.x, f.z);
            const size = tilePx * (f.drawSize ?? 1);
            drawPixelEllipseShadow(
              ctx,
              Math.round(s.x),
              Math.round(s.y),
              size * 0.36,
              size * 0.13,
              tilePx,
            );
          },
        });
      }
      drawList.push({
        z: sortZ,
        sortBias: SORT_WALL_BACK,
        draw: () => {
          const s = this._worldToScreen(f.x, f.z);
          const size = tilePx * (f.drawSize ?? 1);
          const tint = f.tintKey ? unpackTintGradient(f.tintKey) : null;
          const fadeAlpha = this._treeFadeAlpha.get(this._treeFadeKey(f)) ?? 1;
          const prevAlpha = ctx.globalAlpha;
          if (isTreeFoliage(f.kind) && fadeAlpha < 0.999) ctx.globalAlpha = prevAlpha * fadeAlpha;
          this.sprites.ensureSprite(f.sprite);
          if (isTreeFoliage(f.kind)) {
            this.sprites.drawPropSprite(ctx, f.sprite, Math.round(s.x), Math.round(s.y), size, {
              anchor: 'bottom-center',
            });
          } else {
            const drawX = Math.round(s.x - size * 0.5);
            const drawY = Math.round(s.y - size);
            this.sprites.drawTile(ctx, f.sprite, drawX, drawY, size, tint, f.flipX ?? false);
          }
          ctx.globalAlpha = prevAlpha;
        },
      });
    }
    for (const corpse of this.corpses?.corpses ?? []) {
      if (!inView(corpse.x, corpse.z, TILE * 2)) continue;
      const corpseScale = CORPSE_DRAW_SCALE * (getEnemyDrawScale(corpse.type) / getEnemyDrawScale('spider'));
      const corpseSortZ = this.corpses.sortZ(corpse);
      drawList.push({ z: corpseSortZ, sortBias: SORT_ENTITY, draw: () => {
        const s = this._corpseScreenPos(corpse);
        this.sprites.draw(
          ctx,
          corpseSpriteName(corpse.type),
          s.x,
          s.y,
          corpseScale,
          0,
          false,
          'center',
        );
      }});
    }
    for (const building of visibleBuildings) {
      const playerInside = insideBuilding === building;
      const bOriginX = building.originX;
      const bOriginZ = building.originZ;
      for (const wall of building.walls) {
        const wallWx = bOriginX + (wall.tx + 0.5) * TILE;
        const wallWz = bOriginZ + (wall.tz + 0.5) * TILE;
        if (!inView(wallWx, wallWz)) continue;
        if (wallDrawsInFront(wall, playerSortZ, playerInside, playerX, playerZ, building)) continue;
        drawList.push({
          z: wallBackDrawZ(wall, playerSortZ, playerInside, playerX, playerZ, building),
          sortBias: SORT_WALL_BACK,
          fogBarrier: true,
          draw: () => drawBuildingWall(ctx, wall, building, worldToScreen, tilePx, this.sprites),
        });
      }
      if (!doorDrawsInFront(building, playerSortZ, playerInside, playerX, playerZ)) {
        const doorWx = bOriginX + (building.doorTx ?? Math.floor(building.w / 2) + 0.5) * TILE;
        const doorWz = bOriginZ + (building.doorTz ?? building.h - 1 + 0.5) * TILE;
        if (inView(doorWx, doorWz)) {
          drawList.push({
            z: doorBackDrawZ(building, playerSortZ, playerInside, playerX, playerZ),
            sortBias: SORT_WALL_BACK,
            fogBarrier: true,
            draw: () => drawBuildingDoor(ctx, building, worldToScreen, tilePx, this.sprites),
          });
        }
      }
    }
    for (const chest of this.chests.chests) {
      if (!inView(chest.x, chest.z, TILE * 2)) continue;
      drawList.push({ z: chest.z, sortBias: SORT_ENTITY, draw: () => {
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
    const dropDrawTime = performance.now() / 1000;
    for (const drop of this.groundDrops?.drops ?? []) {
      if (!inView(drop.x, drop.z, TILE * 2)) continue;
      const bob = Math.sin(dropDrawTime * 2.4 + drop.bobPhase) * 1.1;
      drawList.push({ z: drop.sortZ, sortBias: SORT_ENTITY, draw: () => {
        const s = this._worldToScreen(drop.x, drop.z);
        drawPixelEllipseShadow(
          ctx,
          Math.round(s.x),
          Math.round(s.y),
          GROUND_DROP_DISPLAY_PX * 0.45,
          GROUND_DROP_DISPLAY_PX * 0.15,
          tilePx,
        );
        this.sprites.drawGroundItem(
          ctx,
          drop.sprite,
          s.x,
          s.y,
          GROUND_DROP_DISPLAY_PX,
          bob,
          GROUND_DROP_RES_PX,
        );
      }});
    }
    for (const robot of this.robots) {
      if (!robot.alive && !robot.emerging) continue;
      if (!inView(robot.x, robot.z, spritePad)) continue;
      const enemyNativePx = getEnemyNativePx(robot.type);
      const enemyDrawScale = getEnemyDrawScale(robot.type);
      const robotSortZ = this._feetSortZ(robot.x, robot.z, enemyNativePx, enemyDrawScale);
      const isSpider = robot.type === 'spider';
      const isScout = robot.type === 'scout';
      const visMul = this._enemyVisMul(robot);
      drawList.push({ z: robotSortZ, sortBias: SORT_SHADOW, draw: () => {
        if (!robot.alive && !robot.emerging) return;
        if (visMul < 0.02) return;
        const emerge = robot.getEmergeT();
        const shadowLift = isScout ? 4 : (isSpider ? 4 : 0);
        const shadowRx = (isScout ? 15 : 10) * emerge;
        const shadowRy = (isScout ? 5.5 : 4) * emerge;
        if (shadowRx < 2 || shadowRy < 2) return;
        const shake = robot.getEmergeShake();
        const s = this._worldToScreen(robot.x, robot.z);
        const bury = (1 - emerge) * 32;
        const enemyDrawScale = getEnemyDrawScale(robot.type);
        const scale = enemyDrawScale * (0.15 + emerge * 0.85);
        const chargeShake = robot.jump?.charging
          ? Math.sin(performance.now() / 1000 * 28) * 2.5 * (1 - (robot.jump.chargeLeft ?? 0) / 0.5)
          : 0;
        const drawX = Math.round(s.x + shake.x + chargeShake);
        const shootPhase = robot.shoot?.phase ?? null;
        const robotMoving = (robot.moving || (robot.moveSpeed ?? 0) > 0.2) && !robot.emerging
          && shootPhase !== 'charging' && shootPhase !== 'firing';
        const canWalkBounce = robotMoving
          && !robot.jump?.active && !robot.jump?.charging;
        const walkBounce = getWalkBounceY(
          robot.walkPhase,
          canWalkBounce,
          isScout ? 2.2 : 1.8,
        );
        const walkBouncePx = Math.round(walkBounce);
        const jumpBob = robot.jump?.active ? Math.round(-(robot.bob || 0) * 16) : 0;
        const chargeBob = robot.jump?.charging ? Math.round((robot.bob || 0) * 14) : 0;
        const emergeBob = robot.emerging ? Math.round((robot.bob || 0) * 3) : 0;
        const anchorY = Math.round(s.y - bury + shake.y + emergeBob + jumpBob + chargeBob);
        const feetY = Math.round(anchorY + spriteFeetOffset(enemyNativePx, scale) + walkBouncePx);
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * visMul;
        drawPixelEllipseShadow(ctx, drawX, feetY - shadowLift, shadowRx, shadowRy, tilePx);
        ctx.globalAlpha = prevAlpha;
      }});
      drawList.push({ z: robotSortZ, sortBias: SORT_ENTITY, draw: () => {
        if (visMul < 0.02) return;
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
        const robotMoving = (robot.moving || (robot.moveSpeed ?? 0) > 0.2) && !robot.emerging
          && shootPhase !== 'charging' && shootPhase !== 'firing';
        const canWalkBounce = robotMoving
          && !robot.jump?.active && !robot.jump?.charging;
        const walkBounce = getWalkBounceY(
          robot.walkPhase,
          canWalkBounce,
          isScout ? 2.2 : 1.8,
        );
        const walkBouncePx = Math.round(walkBounce);
        const jumpBob = robot.jump?.active ? Math.round(-(robot.bob || 0) * 16) : 0;
        const chargeBob = robot.jump?.charging ? Math.round((robot.bob || 0) * 14) : 0;
        const emergeBob = robot.emerging ? Math.round((robot.bob || 0) * 3) : 0;
        const anchorY = Math.round(s.y - bury + shake.y + emergeBob + jumpBob + chargeBob);
        const drawY = anchorY + walkBouncePx;
        if (robot.emerging) {
          const hole = 1 - emerge;
          ctx.fillStyle = `rgba(18, 14, 10, ${0.55 * hole * visMul})`;
        ctx.beginPath();
          ctx.ellipse(s.x, s.y + 9, 8 + hole * 6, 3 + hole * 3, 0, 0, Math.PI * 2);
        ctx.fill();
        }
        const bodySheet = getEnemyBodySheet(robot.type, robotMoving, shootPhase);
        const bodyAnim = getEnemyBodyAnim(
          robot.type,
          robotMoving,
          shootPhase,
          drawTime,
          robot.shoot?.animStart,
          { walkPhase: robot.walkPhase },
        );
        ctx.globalAlpha = (0.3 + emerge * 0.7) * visMul;
        this.sprites.draw(
          ctx,
          bodySheet,
          drawX,
          drawY,
          scale,
          0,
          robot._flipX ?? false,
          'center',
          0,
          bodyAnim,
        );
        const statusIcon = getEnemyStatusIcon(robot);
        if (statusIcon && emerge > 0.85) {
          const headLift = Math.round(spriteFeetOffset(enemyNativePx, scale) + walkBouncePx);
          const iconY = drawY - headLift - 14;
          const bob = Math.sin(drawTime * 4.5 + robot.x) * 1.5;
          ctx.globalAlpha = visMul;
          this.sprites.draw(
            ctx,
            statusIcon,
            drawX,
            iconY + bob,
            ENEMY_STATUS_ICON_SCALE,
            0,
            false,
            'center',
          );
        }
        ctx.globalAlpha = 1;
      }});
    }
    const drawTime = performance.now() / 1000;
    const playerSheet = getPlayerSheet(this.player, drawTime);
    const playerFlip = getPlayerFlipX(this.player);
    const playerBounce = Math.round(getPlayerBounceY(this.player, drawTime));
    const idleBreath = Math.round(this._weaponBreathY ?? 0);
    const playerAnim = getPlayerAnim(this.player, drawTime);
    drawList.push({ z: playerSortZ, sortBias: SORT_SHADOW, draw: () => {
      const s = this._worldToScreen(this.player.x, this.player.z);
      const feetY = Math.round(s.y + playerBounce + spriteFeetOffset(CHAR_NATIVE_PX, SPRITE_PLAYER));
      drawPixelEllipseShadow(ctx, s.x, feetY, 10, 4, tilePx);
    }});
    if (this.lan) {
      for (const peer of this.lan.remoteDrawList()) {
        const px = peer._renderX ?? peer.x;
        const pz = peer._renderZ ?? peer.z;
        if (!inView(px, pz, spritePad)) continue;
        const peerSortZ = this._feetSortZ(px, pz, CHAR_NATIVE_PX, SPRITE_PLAYER);
        const peerBounce = Math.round(getWalkBounceY(peer.walkPhase ?? 0, true));
        const peerFlip = resolveFlipX(peer._renderAngle ?? peer.angle, peer._flipX ?? false);
        const peerAngle = peer._renderAngle ?? peer.angle;
        const fakePlayer = {
          isMoving: peer.isMoving,
          isSprinting: peer.isSprinting,
          moveDirX: peer.moveDirX,
          moveDirZ: peer.moveDirZ,
          angle: peerAngle,
          weaponSlot: peer.weaponSlot ?? 'gun',
          weaponKey: peer.weaponKey ?? 'glock',
          walkPhase: peer.walkPhase ?? 0,
        };
        drawList.push({
          z: peerSortZ,
          sortBias: SORT_SHADOW,
          draw: () => {
            const s = this._worldToScreen(px, pz);
            const feetY = Math.round(s.y + peerBounce + spriteFeetOffset(CHAR_NATIVE_PX, SPRITE_PLAYER));
            drawPixelEllipseShadow(ctx, s.x, feetY, 10, 4, tilePx);
          },
        });
        drawList.push({
          z: peerSortZ,
          sortBias: SORT_ENTITY,
          draw: () => {
            const s = this._worldToScreen(px, pz);
            const sheet = getPlayerSheet(fakePlayer, drawTime);
            const anim = getPlayerAnim(fakePlayer, drawTime);
            ctx.save();
            ctx.globalAlpha = 0.92;
            this.sprites.draw(ctx, sheet, s.x, s.y + peerBounce, SPRITE_PLAYER, 0, peerFlip, 'center', 0, anim);
            ctx.fillStyle = '#a8d4ff';
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(peer.name ?? 'Player', s.x, s.y + peerBounce - 28);
            ctx.restore();
          },
        });
        const peerGunPose = this._getPeerGunScreenPose(peer, px, pz, peerBounce, drawTime);
        if (peerGunPose) {
          drawList.push({
            z: peerSortZ + 0.02,
            sortBias: SORT_GUN,
            draw: () => this._drawWeaponSprite(ctx, peerGunPose),
          });
        }
      }
    }
    drawList.push({ z: playerSortZ, sortBias: SORT_ENTITY, draw: () => {
      const s = this._worldToScreen(this.player.x, this.player.z);
      this.sprites.draw(ctx, playerSheet, s.x, s.y + playerBounce, SPRITE_PLAYER, 0, playerFlip, 'center', 0, playerAnim);
    }});
    const gunClip = insideBuilding ? buildingGunClipBounds(insideBuilding) : null;
    drawList.push({ z: playerSortZ + 0.02, sortBias: SORT_GUN, draw: () => {
      const pose = this._getGunScreenPose(drawTime);
      this._drawWeaponSprite(ctx, pose, gunClip);
    }});
    for (const building of visibleBuildings) {
      const playerInside = insideBuilding === building;
      const bOriginX = building.originX;
      const bOriginZ = building.originZ;
      for (const wall of building.walls) {
        const wallWx = bOriginX + (wall.tx + 0.5) * TILE;
        const wallWz = bOriginZ + (wall.tz + 0.5) * TILE;
        if (!inView(wallWx, wallWz)) continue;
        if (!wallDrawsInFront(wall, playerSortZ, playerInside, playerX, playerZ, building)) continue;
        drawList.push({
          z: wallFrontDrawZ(wall, playerSortZ, playerInside, playerX, playerZ, building),
          sortBias: SORT_WALL_FRONT,
          fogBarrier: true,
          draw: () => drawBuildingWall(ctx, wall, building, worldToScreen, tilePx, this.sprites),
        });
      }
      if (doorDrawsInFront(building, playerSortZ, playerInside, playerX, playerZ)) {
        const doorWx = building.originX + (building.doorTx ?? Math.floor(building.w / 2) + 0.5) * TILE;
        const doorWz = building.originZ + (building.doorTz ?? building.h - 1 + 0.5) * TILE;
        if (inView(doorWx, doorWz)) {
          drawList.push({
            z: doorFrontDrawZ(building, playerSortZ, playerInside, playerX, playerZ),
            sortBias: SORT_WALL_FRONT,
            fogBarrier: true,
            draw: () => drawBuildingDoor(ctx, building, worldToScreen, tilePx, this.sprites),
          });
        }
      }
    }
    for (const p of this.particles) {
      if (!inView(p.x, p.z, TILE)) continue;
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
        sortBias: SORT_ENTITY,
        draw: () => {
          this._drawParticle(ctx, p, 1);
        },
      });
    }
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      if (!inView(b.x, b.z, TILE * 2)) continue;
      if (useVisFog && visPoly && !this._isWorldPointVisible(b.x, b.z)) continue;
      const bulletZ = bulletDrawSortZ(b.x, b.z, visibleBuildings);
      drawList.push({
        z: bulletZ,
        sortBias: SORT_ENTITY,
        draw: () => {
          this._drawBulletTrail(ctx, b);
      const s = this._worldToScreen(b.x, b.z);
      const bScale = b.fromPlayer ? SPRITE_BULLET : 1;
          const bAngle = velToSpriteAngle(b.vx, b.vz);
          this.sprites.draw(ctx, 'bullet', s.x, s.y, bScale, bAngle);
        },
      });
    }
    drawList.sort((a, b) => (a.z - b.z) || ((a.sortBias ?? 0) - (b.sortBias ?? 0)));
    let fogDrawn = false;
    for (const d of drawList) {
      if (useVisFog && !fogDrawn && d.fogBarrier) {
        this._drawVisibilityFog(ctx, useVisFog, visPoly, worldToScreen);
        fogDrawn = true;
      }
      d.draw();
    }
    if (useVisFog && !fogDrawn) {
      this._drawVisibilityFog(ctx, useVisFog, visPoly, worldToScreen);
    }

    for (const building of visibleBuildings) {
      const alpha = this.buildings?.roofAlphaFor(building) ?? 1;
      drawBuildingRoof(ctx, building, worldToScreen, tilePx, alpha, this.sprites);
    }

    this._drawPlayerCooldown(ctx, performance.now() / 1000);

    applyNightOverlay(ctx, INTERNAL_W, INTERNAL_H, nightFactor);

    brightParticles.sort((a, b) => a.z - b.z);
    for (const { p } of brightParticles) {
      this._drawParticle(ctx, p, 1);
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
        this,
      );
    }

    this._syncGameCursor();
  }

  _drawPlayerCooldown(ctx, time) {
    if (!this.player || this.player.isMeleeActive() || this.player.isUnarmed()) return;
    const gun = this.player.getWeapon();
    if (!gun) return;
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

  _setMobileSlotBtn(id, item, fallbackLabel) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.replaceChildren();
    if (!item) {
      this._setPixelText(btn, fallbackLabel, PIXEL_TEXT_SCALE_SM);
      return;
    }
    const src = getItemIconSrc(item);
    if (!src) {
      this._setPixelText(btn, fallbackLabel, PIXEL_TEXT_SCALE_SM);
      return;
    }
    const img = document.createElement('img');
    img.className = 'mb-btn-icon';
    img.alt = '';
    img.draggable = false;
    img.decoding = 'sync';
    const dataUrl = this.sprites?.getIconDataUrl?.(src);
    img.src = dataUrl || src;
    btn.appendChild(img);
  }

  _syncMobileQuickBar() {
    if (!this.mobile) return;
    const p = this.player;
    this._setMobileSlotBtn('mb-hand-0', p?.getHandSlotItem(0), '1');
    this._setMobileSlotBtn('mb-hand-1', p?.getHandSlotItem(1), '2');
    this._setMobileSlotBtn('mb-quick', p?.quickSlot, '3');
    this._setMobileSlotBtn('mb-throw', p?.throwableSlot, '4');
    document.getElementById('mb-hand-0')?.classList.toggle('mb-active', p?.activeHandSlot === 0);
    document.getElementById('mb-hand-1')?.classList.toggle('mb-active', p?.activeHandSlot === 1);
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
    this._setPixelText(
      this.el.healthText,
      String(Math.ceil(this.player.health)) + (this.player.shield > 0 ? ` (+${Math.ceil(this.player.shield)})` : ''),
      PIXEL_TEXT_SCALE,
    );
    this._setPixelText(this.el.weaponName, w?.name ?? 'Hand', PIXEL_TEXT_SCALE);
    if (this.player.isMeleeActive() || this.player.isUnarmed()) {
      this._setPixelText(this.el.ammoCurrent, '-', PIXEL_TEXT_SCALE);
      this._setPixelText(this.el.ammoReserve, '-', PIXEL_TEXT_SCALE);
      this.el.ammoCurrent.classList.remove('ammo-low');
      this.el.ammoReserve.classList.remove('ammo-low');
      this.el.reloadIndicator.classList.add('hidden');
      this._drawAmmoHudIcon(null);
    } else {
      const gun = this.player.getWeapon();
      if (!gun) {
        this._setPixelText(this.el.ammoCurrent, '-', PIXEL_TEXT_SCALE);
        this._setPixelText(this.el.ammoReserve, '0', PIXEL_TEXT_SCALE);
        this.el.ammoCurrent.classList.remove('ammo-low');
        this.el.ammoReserve.classList.toggle('ammo-low', true);
        this.el.reloadIndicator.classList.add('hidden');
        this._drawAmmoHudIcon(null);
      } else {
        const reserve = this.player.getReserveAmmo();
        this._setPixelText(this.el.ammoCurrent, `${gun.ammo}/${gun.magSize}`, PIXEL_TEXT_SCALE);
        this._setPixelText(this.el.ammoReserve, String(reserve), PIXEL_TEXT_SCALE);
        this.el.ammoCurrent.classList.toggle('ammo-low', gun.ammo === 0);
        this.el.ammoReserve.classList.toggle('ammo-low', reserve <= 0);
        this.el.reloadIndicator.classList.toggle('hidden', !gun.reloading);
        this._drawAmmoHudIcon(getWeaponAmmoType(this.player.weaponKey));
      }
    }

    if (this.el.zoneLabel) {
      this._setPixelText(this.el.zoneLabel, '', PIXEL_TEXT_SCALE);
    }

    if (this.el.gameDay && this.dayNight) {
      this._setPixelText(this.el.gameDay, this.dayNight.formatDay(), PIXEL_TEXT_SCALE);
    }
    if (this.el.gameClock && this.dayNight) {
      this._setPixelText(this.el.gameClock, this.dayNight.formatClock(), PIXEL_TEXT_SCALE);
    }

    if (this.items.pickupMsg) {
      this._setPixelText(this.el.pickupStatus, this.items.pickupMsg, PIXEL_TEXT_SCALE);
      this.el.pickupStatus.classList.add('active');
      this.el.pickupStatus.classList.toggle('error', this.items.pickupMsgError);
    } else {
      this._setPixelText(this.el.pickupStatus, '');
      this.el.pickupStatus.classList.remove('active', 'error');
    }

    const power = this.player.getActivePowerUpLabel(time);
    this._setPixelText(this.el.powerupStatus, power || '', PIXEL_TEXT_SCALE);
    this.el.powerupStatus.classList.toggle('active', !!power);
    this._syncMobileQuickBar();

    const hoveredChest = this._getHoveredChest();
    const nearbyChest = this._getNearbyChest();
    const hoveredCorpse = this._getHoveredCorpse();
    const nearbyCorpse = this._getNearbyCorpse();
    const interactDoor = this._getInteractDoor();
    const canOpenChestDesktop = !this.inventoryUI.open
      && !this.mobile
      && hoveredChest
      && this.chests.isInInteractRange(this.player, hoveredChest);
    const canOpenChestMobile = !this.inventoryUI.open && this.mobile && nearbyChest && !interactDoor;
    const canOpenChest = canOpenChestDesktop || canOpenChestMobile;
    const canOpenCorpseDesktop = !this.inventoryUI.open
      && !this.mobile
      && hoveredCorpse
      && this.corpses.isInInteractRange(this.player, hoveredCorpse);
    const canOpenCorpseMobile = !this.inventoryUI.open && this.mobile && nearbyCorpse && !interactDoor && !canOpenChest;
    const canOpenCorpse = canOpenCorpseDesktop || canOpenCorpseMobile;
    const hoveredDrop = this._getHoveredGroundDrop();
    const nearbyDrop = this._getNearbyGroundDrop();
    const canPickupDropDesktop = !this.inventoryUI.open
      && !this.mobile
      && hoveredDrop
      && this.groundDrops.isInPickupRange(this.player, hoveredDrop);
    const canPickupDropMobile = !this.inventoryUI.open && this.mobile && nearbyDrop && !interactDoor && !canOpenChest && !canOpenCorpse;
    const canPickupDrop = canPickupDropDesktop || canPickupDropMobile;
    const canToggleDoor = !this.inventoryUI.open && interactDoor;
    const mbInteract = document.getElementById('mb-interact');
    mbInteract?.classList.toggle('mb-nearby', canToggleDoor || canOpenChestMobile || canOpenCorpseMobile || canPickupDropMobile);
    const pickupDrop = canPickupDrop ? (hoveredDrop ?? nearbyDrop) : null;
    const showPrompt = canToggleDoor || canOpenChest || canOpenCorpse || canPickupDrop;
    this.el.interactPrompt.classList.toggle('hidden', !showPrompt);
    if (showPrompt) {
      const doorVerb = interactDoor?.doorOpen ? 'close' : 'open';
      if (this.mobile) {
        const mobileText = canToggleDoor
          ? `E to ${doorVerb} door`
          : (canOpenCorpse ? 'E to loot' : (pickupDrop ? `E ${pickupDrop.label}` : 'E to open'));
        setElementPixelText(this.el.interactPrompt, mobileText, PIXEL_TEXT_SCALE);
        this._positionInteractPromptAbovePlayer();
      } else {
        const mx = this.mouse.clientX;
        const my = this.mouse.clientY;
        const desktopText = canToggleDoor
          ? `RMB to ${doorVerb} door`
          : (canOpenCorpse ? 'RMB to loot' : (pickupDrop ? `RMB ${pickupDrop.label}` : 'RMB to open'));
        setElementPixelText(this.el.interactPrompt, desktopText, PIXEL_TEXT_SCALE);
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
  }

  _checkGameOver() {
    if (!this.player.alive) this._endGame();
  }

  _endGame() {
    this.running = false;
    this.paused = false;
    this.lan?.disconnect();
    this.lan = null;
    this._roomCode = null;
    if (this._activeRoom?.id) {
      closeRoom(this._activeRoom.id);
      this._activeRoom = null;
    }
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

const game = new Game();
window.game = game;
