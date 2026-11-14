import { normalizeThrowableItem } from './throwables.js';
import { RaidBase, raidLevel, challengeProgress, newRaidProfile, deployProfile, extractProfile, loseRaidProfile, normalizeRaidProfile, EXTRACT_RADIUS, EXTRACT_SECONDS } from './raidBase.js';
import { collectWallOccluders, collectPropOccluders, computeWallVisibility, makeWallLightPath, pointInWallLight, rasterizeWallShadow, resolveWallLightOrigin } from './wallShadows.js';
import { drawPixelText, setElementPixelText, setElementWrappedPixelText, preloadPixelTextAtlas, PIXEL_TEXT_SCALE, PIXEL_TEXT_SCALE_SM } from './pixelText.js';
import { World, TILE } from './world.js';
import { ChunkEntityManager } from './chunkEntities.js';
import { unpackTintGradient, isTreeFoliage, treeOccludesPlayer, rollWorldSeed, setWorldSeed, getWorldSeed } from './worldGen.js';
import { Robot, Scout, Raider, createGroundSpew, updateParticles, createExplosion } from './enemies.js';
import { CorpseManager, corpseSpriteName, CORPSE_DRAW_SCALE } from './corpses.js';
import { Player, BulletPool, WEAPONS, MELEE_WEAPONS, GUN_HOLD_OFFSET, HUMAN_WALK_RATE, HUMAN_SPRINT_RATE, findBulletSpawn } from './player.js';
import {
  capturePlayerState,
  readSave,
  writeSave,
} from './saveGame.js';
import { SoundManager } from './audio.js';
import { ItemManager } from './items.js';
import { GroundDropManager, GROUND_DROP_DISPLAY_PX, GROUND_DROP_RES_PX } from './groundDrops.js';
import { getEnemyStatusIcon, hearPlayerGunshot, hasCombatSight } from './enemyNav.js';
import { ChestManager, CHEST_DRAW_SCALE, CHEST_OPAQUE_HALF_W, CHEST_OPAQUE_HALF_H, CHEST_DRAW_PIVOT } from './chests.js';
import {
  BuildingManager,
  drawBuildingFloors,
  drawBuildingWall,
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
  BUILDING_ART_PX,
} from './buildingGen.js';
import { chestSpriteName, getItemDisplayName, getItemIconSrc } from './loot.js';
import { SpriteBank, gunAimTransform, gunPivotHoldOffset, getReloadPoseBlend, getReloadHoldScreenX, getMeleeHoldPose, getHandHoldPose, getWalkSheet, getWalkAnim, getEnemyBodySheet, getEnemyBodyAnim, velToSpriteAngle, getPlayerSheet, getPlayerAnim, getPlayerFlipX, getPlayerBounceY, getPlayerIdleBreathY, getWalkBounceY, resolveFlipX, isMovingForward, CHAR_NATIVE_PX, getEnemyNativePx, getEnemyDrawScale, spriteFeetOffset, PARTICLE_FX_NATIVE_PX, getParticleFxSprite, getParticleFxAnim, ENEMY_STATUS_ICON_SCALE } from './sprites.js';
import { collectCollisionTargets, moveWithEntityCollision, applyApproachPush, updateLocomotion, isSprintAnimSpeed, entityPushRadius } from './collision.js';
import { drawCollisionDebug } from './collisionDebug.js';
import { createStepDust, createBulletCasing, createBloodSplatter, createRobotHitSparks, createRobotSmoke, createRobotFire, createRobotDeathFx, PARTICLE_SIZE_UNIT } from './particles.js';
import { VirtualJoystick } from './joystick.js';
import { InventoryUI, INV_CURSOR_SRC } from './inventory.js';
import { getWeaponAmmoType, AMMO_TYPES } from './ammo.js';
import { DayNightCycle, applyNightOverlay } from './dayNight.js';
import { getWorldBoundsWorld } from './highwayGen.js';
import { followMovingAxis, worldToScreen, camPixelsFromPlayer, drawPixelEllipseShadow, PPU, INTERNAL_W, INTERNAL_H, RENDER_SCALE } from './renderConfig.js';
import {
  computeViewBounds,
  pointInViewBounds,
  VIEW_MARGIN_TILES,
  VIEW_SPRITE_PAD,
} from './viewCull.js';
const npcCollisionZ = (npc) => npc.z + (npc.getMoveCollider().zOff ?? 0);

const DYNAMIC_SHADOWS = new URLSearchParams(location.search).get('shadows') !== '0';

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

const GAME_CURSOR_SRC = {
  inv_cursor: INV_CURSOR_SRC,
  cursor: 'assets/ui/cursor.png',
  cursor_melee: 'assets/ui/cursor_melee.png',
  cursor_shotgun: 'assets/ui/cursor_shotgun.png',
};
const MOBILE_STICK_DEADZONE = 0.15;
/** Subtle camera lean toward cursor (world units = px / PPU). */
const CAM_FOLLOW_STRENGTH = 0.15;
const CAM_FOLLOW_MAX_PX = 64;
const CAM_FOLLOW_SMOOTH = 50;
const CAM_PLAYER_SMOOTH = 10;

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
    this._mobileSlotIcons = new WeakMap();
    this._frameRequest = null;
    this.debugCollision = false;
    this.touchMove = { x: 0, z: 0 };
    this.touchAim = { x: 0, z: 0 };
    this.mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this._treeFadeAlpha = new Map();
    this._cachedYsortFoliage = [];
    this._exportingMap = false;
    this._spawnReveal = null;

    this._initCanvas();
    this._initUI();
    this._bindEvents();
    this.raidBase = new RaidBase(document.getElementById('raid-base'), {
      save: (profile) => this._writeRaidProfile(profile),
      deploy: () => this._deployRaid(),
      playUi: (name) => this.audio.playUi(name),
      setSound: (enabled, volume) => this.audio.setEnabled(enabled, volume),
    });
    this._loadGameAssets().catch((error) => {
      console.error('Game startup failed:', error);
      this._hideLoadingScreen();
      document.getElementById('startup-error').classList.remove('hidden');
    });
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
    this._visibleHalfWidth = Math.min(INTERNAL_W, vw / (scale * this.renderScale)) / 2;
    this._visibleHalfHeight = Math.min(INTERNAL_H, vh / (scale * this.renderScale)) / 2;
    this.displayScale = scale;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.ceil(bufW * scale * dpr) / dpr;
    const height = Math.ceil(bufH * scale * dpr) / dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.style.left = `${Math.round((vw - width) * 0.5 * dpr) / dpr}px`;
    this.canvas.style.top = `${Math.round((vh - height) * 0.5 * dpr) / dpr}px`;
    this.canvas.style.transform = 'none';
  }

  _initUI() {
    this.el = {
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
      damageFlash: document.getElementById('damage-flash'),
      resumeBtn: document.getElementById('resume-btn'),
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
    document.querySelectorAll('#loading-screen .menu-heading, #pause-menu .menu-heading').forEach((el) => {
      const label = el.textContent.trim();
      if (label) this._setPixelText(el, label, T);
    });
    this._setPixelText(document.getElementById('reload-label'), 'Reloading', T);
    this._setPixelText(this.el.spawnCurtainStatus, 'Entering the ruins...', T);
    this._setPixelText(document.querySelector('.ammo-sep'), '/', T);
    if (this.el.loadingStatus?.textContent.trim()) {
      this._setPixelText(this.el.loadingStatus, this.el.loadingStatus.textContent.trim(), T);
    }
  }

  _showPauseMenu() {
    this.paused = true;
    const challenges = document.getElementById('raid-pause-challenges');
    challenges.replaceChildren();
    if (this.raidProfile) {
      for (const challenge of challengeProgress(this.raidProfile, this.kills).filter((entry) => !entry.claimed)) {
        const row = document.createElement('p');
        const label = `${challenge.title} / ${challenge.progress}/${challenge.goal}`;
        row.setAttribute('aria-label', label);
        this._setPixelText(row, label, PIXEL_TEXT_SCALE_SM);
        challenges.appendChild(row);
      }
    }
    this.el.pauseMenu?.classList.remove('hidden');
    this._hideGameCursor();
    this._enableMenuCursor();
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
    if (this.running && this._frameRequest === null) {
      this.lastTime = performance.now();
      this._scheduleFrame();
    }
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
    const size = sprite === 'inv_cursor' ? 56 : (this.mobile ? 36 : 54);
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

  async _loadGameAssets() {
    await this._paintLoadingProgress(0.1, 'Loading sprites and fonts');
    await Promise.all([this._spritePreload, preloadPixelTextAtlas()]);
    await this._paintLoadingProgress(0.8, 'Loading sounds');
    await this.audio.init();
    await this._paintLoadingProgress(1, 'Opening Safe Zone');
    this._openSavedBase();
    this._hideLoadingScreen();
  }

  _showLoadingScreen() {
    this._setPixelText(document.getElementById('loading-heading'), 'Loading Raid', PIXEL_TEXT_SCALE);
    this._disableMenuCursor();
    this.el.loadingScreen?.classList.remove('hidden');
    this._setLoadingProgress(0, 'Preparing…');
  }

  async _paintLoadingProgress(fraction, message) {
    if (this.el.loadingScreen?.classList.contains('hidden')) return;
    this._setLoadingProgress(fraction, message);
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  _hideLoadingScreen() {
    this.el.loadingScreen?.classList.add('hidden');
  }

  _setLoadingProgress(fraction, message) {
    const pct = Math.max(0, Math.min(1, fraction)) * 100;
    if (this.el.loadingBarFill) this.el.loadingBarFill.style.width = `${pct}%`;
    this.el.loadingBarFill?.parentElement.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (message && this.el.loadingStatus) this._setPixelText(this.el.loadingStatus, message, PIXEL_TEXT_SCALE);
  }

  _isSpawnRevealActive() {
    return !!this._spawnReveal && this._spawnReveal.phase !== 'done';
  }

  _beginSpawnReveal() {
    this._spawnReveal = {
      phase: 'foliage',
      opacity: 1,
      fadeOutDuration: 0.65,
      holdElapsed: 0,
      minHold: 0.25,
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
          this.camFollow = { ...cleared };
          this._previousCameraTarget = { ...cleared };
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

  _writeRaidProfile(profile) {
    if (!writeSave({ profile })) return false;
    this.raidProfile = profile;
    return true;
  }

  _showRaidBase(profile, message = '') {
    this.running = false;
    this.paused = false;
    this.inventoryUI.forceClose();
    this._clearKeyboardInput();
    this._hideLoadingScreen();
    this.el.pauseMenu?.classList.add('hidden');
    this.el.confirmDialog?.classList.add('hidden');
    this.el.hud?.classList.add('hidden');
    this.el.mobileControls?.classList.add('hidden');
    document.body.classList.remove('game-active');
    this._hideGameCursor();
    this._endSpawnReveal();
    this._disableMenuCursor();
    this.raidBase.show(profile, message);
  }

  _requestBackToMenu() {
    this._showConfirm('Abandon this raid? You will lose all carried gear and loot.', () => {
      this._closeConfirm();
      this._finishRaid(false, true);
    }, () => this._closeConfirm());
  }

  _openSavedBase() {
    const save = readSave();
    let profile = save?.profile ? normalizeRaidProfile(save.profile) : newRaidProfile(save);
    let message = '';
    if (profile.deployed) {
      const { raidCheckpoint, ...previous } = profile;
      const next = loseRaidProfile(previous);
      this.raidProfile = next;
      this._showRaidResult({
        previous, next, abandoned: true,
        carried: raidCheckpoint?.carried ?? previous.kit,
        seconds: raidCheckpoint?.seconds,
        kills: raidCheckpoint?.kills,
        raiderKills: raidCheckpoint?.raiderKills,
        onContinue: () => this._writeRaidProfile(next) ? '' : 'Could not save the profile.',
      });
      return;
    }
    if (!this._writeRaidProfile(profile)) message = 'Could not save the profile.';
    this.raidProfile = profile;
    this._showRaidBase(profile, message);
  }

  _saveRaidCheckpoint() {
    if (!this.running || !this.raidProfile?.deployed || this.inventoryUI.drag) return;
    this._writeRaidProfile({
      ...this.raidProfile,
      raidCheckpoint: {
        carried: capturePlayerState(this.player),
        seconds: Math.max(0, Math.floor((performance.now() - this.raidStartedAt) / 1000)),
        kills: this.kills,
        raiderKills: this.raiderKills,
      },
    });
  }

  async _deployRaid() {
    if (this._deploying || this.running) return;
    const previous = this.raidProfile;
    if (!this._writeRaidProfile(deployProfile(previous))) {
      this.raidBase.show(previous, 'Could not save your raid checkpoint.');
      return;
    }
    this._deploying = true;
    this.audio.playUi('deploy');
    this.raidBase.hide();
    this._showLoadingScreen();
    try {
      await this._paintLoadingProgress(0.08, 'Preparing raid…');
      await this._bootGame(null, previous.kit);
    } catch (error) {
      console.error('Deploy failed:', error);
      const restored = this._writeRaidProfile(previous);
      this.raidProfile = previous;
      this._showRaidBase(previous, restored ? 'Deploy failed. Your loadout was restored.' : 'Deploy failed. Loadout restored for this session only.');
    } finally {
      this._deploying = false;
    }
  }

  _placeHatches() {
    const origin = this.player;
    const startAngle = Math.random() * Math.PI * 2;
    const hatches = [];
    const bounds = getWorldBoundsWorld();
    for (let sector = 0; sector < 4; sector++) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const angle = startAngle + sector * Math.PI / 2 + (attempt % 2 ? -1 : 1) * attempt * 0.055;
        const radius = (101 + (attempt % 4) * 4) * TILE;
        const x = Math.round((origin.x + Math.sin(angle) * radius) / TILE) * TILE;
        const z = Math.round((origin.z + Math.cos(angle) * radius) / TILE) * TILE;
        if (x < bounds.minX + 12 || x > bounds.maxX - 12 || z < bounds.minZ + 12 || z > bounds.maxZ - 12) continue;
        this.world.prewarmGround(x, z, 1);
        if (!this.world.isValidHatchSite(x, z)) continue;
        if (hatches.some((entry) => Math.hypot(x - entry.x, z - entry.z) < 140)) continue;
        hatches.push({ x, z, state: 'closed', remaining: 0 });
        break;
      }
    }
    if (!hatches.length) throw new Error('No clear hatch site outside town.');
    return hatches;
  }

  _callHatch(hatch = this.nearestHatch) {
    if (!this.running || this.paused || this._panelOpen() || this._isSpawnRevealActive()
      || hatch?.state !== 'closed'
      || Math.hypot(hatch.x - this.player.x, hatch.z - this.player.z) > EXTRACT_RADIUS) return false;
    hatch.state = 'calling';
    hatch.remaining = 10;
    return true;
  }

  _canCallHatch() {
    const hatch = this.nearestHatch;
    if (this.inventoryUI.isOpen() || hatch?.state !== 'closed'
      || Math.hypot(hatch.x - this.player.x, hatch.z - this.player.z) > EXTRACT_RADIUS) return false;
    if (this.mobile) return true;
    const point = this._worldToScreen(hatch.x, hatch.z);
    const halfSize = TILE * PPU;
    return Math.abs(point.x - this.mouse.sx) <= halfSize && Math.abs(point.y - this.mouse.sy) <= halfSize;
  }

  _updateExtraction(dt) {
    if (!this.hatches?.length || this._isSpawnRevealActive()) return;
    let nearest = null;
    let distance = Infinity;
    for (const hatch of this.hatches) {
      if (hatch.state === 'calling') {
        hatch.remaining = Math.max(0, hatch.remaining - dt);
        if (hatch.remaining === 0) {
          hatch.state = 'open';
          for (let puff = 0; puff < 5; puff++) {
            this.particles.push(...createRobotSmoke(hatch.x, hatch.z, .5));
          }
        }
      }
      const gap = Math.hypot(hatch.x - this.player.x, hatch.z - this.player.z);
      if (gap < distance) {
        nearest = hatch;
        distance = gap;
      }
    }
    this.nearestHatch = nearest;
    const nearby = distance <= EXTRACT_RADIUS;
    const label = document.getElementById('raid-extract-distance');
    const metres = 'Hatch / ' + Math.ceil(distance / TILE) + 'm';
    if (label.textContent !== metres) label.textContent = metres;
    const direction = document.getElementById('raid-hatch-direction');
    direction.style.rotate = Math.atan2(nearest.x - this.player.x, -(nearest.z - this.player.z)) + 'rad';
    const status = document.getElementById('raid-hatch-status');
    let message = nearby && nearest.state === 'calling' ? 'Opening / ' + Math.ceil(nearest.remaining) + 's' : '';
    if (nearby && nearest.state === 'open') {
      this._extractElapsed += dt;
      message = 'Extracting / ' + Math.max(1, Math.ceil(EXTRACT_SECONDS - this._extractElapsed)) + 's';
      if (this._extractElapsed >= EXTRACT_SECONDS) {
        this._finishRaid(true);
        return;
      }
    } else this._extractElapsed = 0;
    if (status.textContent !== message) status.textContent = message;
  }

  _finishRaid(extracted, abandoned = false) {
    if (!this.running) return;
    this.running = false;
    this.inventoryUI.forceClose();
    this._clearKeyboardInput();
    const { raidCheckpoint: _checkpoint, ...previous } = this.raidProfile;
    const carried = capturePlayerState(this.player);
    const next = extracted ? extractProfile(previous, this.player, this.kills) : loseRaidProfile(previous);
    const saved = this._writeRaidProfile(next);
    this.raidProfile = next;
    this.hatches = [];
    this.nearestHatch = null;
    this.el.pauseMenu.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.mobileControls.classList.add('hidden');
    document.body.classList.remove('game-active');
    this._hideGameCursor();
    this._disableMenuCursor();
    this._showRaidResult({
      previous, next, carried, extracted, abandoned, saved,
      seconds: Math.max(0, Math.floor((performance.now() - this.raidStartedAt) / 1000)),
      kills: this.kills, raiderKills: this.raiderKills,
    });
  }

  _showRaidResult({ previous, next, carried, extracted = false, abandoned = false,
    saved = true, seconds, kills, raiderKills, onContinue }) {
    const summary = document.getElementById('raid-results');
    summary.dataset.outcome = extracted ? 'success' : 'loss';
    const setLabel = (selector, text) => {
      const element = summary.querySelector(selector);
      element.setAttribute('aria-label', text);
      this._setPixelText(element, text, PIXEL_TEXT_SCALE_SM);
    };
    setLabel('h2', extracted ? 'Extraction successful' : abandoned ? 'Raid abandoned' : 'Raid lost');
    setLabel('#raid-result-duration', seconds == null ? 'Time: —' : 'Time: ' + Math.floor(seconds / 60) + 'm ' + seconds % 60 + 's');
    setLabel('#raid-result-kills', 'Robots: ' + (kills ?? '—'));
    setLabel('#raid-result-raiders', 'Raiders: ' + (raiderKills ?? '—'));
    setLabel('#raid-result-xp', '+' + (next.xp - previous.xp) + ' XP');
    setLabel('#raid-result-items-title', extracted ? 'New loot extracted' : 'Items lost');
    const items = summary.querySelector('#raid-result-items');
    items.replaceChildren();
    const totals = new Map();
    const itemKey = (item) => item.kind + ':' + (item.key ?? item.ammoType ?? '');
    const slots = (kit) => [...kit.itemSlots, ...kit.handSlots, ...kit.equipmentSlots].filter(Boolean);
    for (const item of slots(carried)) {
      const key = itemKey(item);
      const existing = totals.get(key);
      totals.set(key, { ...item, amount: (existing?.amount ?? 0) + (item.amount ?? 1) });
    }
    if (extracted) {
      for (const item of slots(this.raidStartingKit)) {
        const entry = totals.get(itemKey(item));
        if (entry) entry.amount -= item.amount ?? 1;
      }
    }
    for (const item of totals.values()) {
      if (item.amount <= 0) continue;
      const cell = document.createElement('div');
      cell.className = 'raid-result-item';
      cell.style.setProperty('--result-delay', Math.min(items.childElementCount * 35, 350) + 'ms');
      const icon = document.createElement('img');
      icon.src = getItemIconSrc(item);
      icon.alt = getItemDisplayName(item);
      cell.title = icon.alt;
      const count = document.createElement('span');
      this._setPixelText(count, String(item.amount), PIXEL_TEXT_SCALE_SM);
      cell.append(icon, count);
      items.append(cell);
    }
    if (!items.childElementCount) this._setPixelText(items, 'None', PIXEL_TEXT_SCALE_SM);
    const completed = extracted ? challengeProgress(next).filter((challenge) =>
      !challenge.claimed && challenge.progress >= challenge.goal &&
      challengeProgress(previous).some((entry) => entry.id === challenge.id && entry.progress < entry.goal)) : [];
    const notes = completed.map((challenge) => 'Challenge complete / ' + challenge.title);
    if (!saved) notes.push('Save failed. Progress is available for this session only.');
    setLabel('#raid-result-note', notes.filter(Boolean).join(' / '));
    const button = summary.querySelector('#raid-result-continue');
    button.onclick = () => {
      this.audio.stopLose();
      summary.classList.add('hidden');
      this._showRaidBase(next, onContinue?.() ?? '');
    };
    summary.classList.remove('hidden');
    button.focus({ preventScroll: true });
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
    if (this.inventoryUI?.quantityDialog?.open) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.inventoryUI.quantityDialog.close();
      }
      return;
    }
    if (e.code === 'F7') {
      e.preventDefault();
      if (!e.repeat && this.raidProfile && !this._deploying) {
        const profile = { ...this.raidProfile, cash: this.raidProfile.cash + 1000 };
        if (this._writeRaidProfile(profile) && !this.raidBase.root.classList.contains('hidden')) {
          this.raidBase.profile = profile;
          this.raidBase.render();
        }
      }
      return;
    }
    const confirmOpen = this.el.confirmDialog && !this.el.confirmDialog.classList.contains('hidden');
    const menu = confirmOpen ? this.el.confirmDialog : this.running ? this.el.pauseMenu : undefined;
    if ((!this.running || this.paused || confirmOpen) && this.raidBase?.handleMenuKey(e, menu)) {
      e.preventDefault();
      return;
    }
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
      this._tryStartReload(performance.now() / 1000);
    }
    if (e.code === 'Digit1' || e.code === 'Digit2') this._selectRaidHand(e.code === 'Digit1' ? 0 : 1);
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
    this.moveJoystick?.reset();
    this.aimJoystick?.reset();
  }

  _bindEvents() {
    document.addEventListener('click', (event) => {
      if (!event.target.closest?.('#overlay, #inventory, #hud button, #mb-pause')) return;
      const control = event.target.closest?.('button, [role="button"], .inv-slot-sprite, input, select, label');
      if (control?.dataset.uiCue === 'manual' || control?.id === 'raid-deploy-confirm') return;
      const button = control?.matches('button:not(.inv-slot-sprite), [role="button"]')
        && !control.disabled && control.getAttribute('aria-disabled') !== 'true';
      this.audio.playUi(button ? 'button1' : 'click1');
      if (control && !control.disabled && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        control.animate([{ scale: '0.95' }, { scale: '1' }], { duration: 160, easing: 'ease-out' });
      }
    }, true);
    this.el.resumeBtn?.addEventListener('click', () => this._hidePauseMenu());
    this.el.backToMenuBtn?.addEventListener('click', () => this._requestBackToMenu());
    this.el.confirmYesBtn?.addEventListener('click', () => this._confirmYes?.());
    this.el.confirmNoBtn?.addEventListener('click', () => this._confirmNo?.());
    window.addEventListener('resize', () => this._resizeCanvas());
    window.addEventListener('pagehide', () => {
      if (!this.running) return;
      this.inventoryUI.forceClose();
      this._saveRaidCheckpoint();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && this.running && this.raidProfile?.deployed) this._finishRaid(false, true);
    });
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
        if (!this.mobile && this._canCallHatch() && this._callHatch()) return;
        if (this._tryPickupGroundDrop()) {
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
      this.heldThrowable = null;
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
      let pointerId = null;
      const start = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pointerId != null) return;
        pointerId = e.pointerId;
        btn.setPointerCapture(pointerId);
        btn.classList.add('mb-pressed');
        onDown();
      };
      const end = (e) => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        btn.classList.remove('mb-pressed');
        e.preventDefault();
        onUp();
      };
      btn.addEventListener('pointerdown', start, { passive: false });
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('lostpointercapture', end);
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

    this.aimJoystick = new VirtualJoystick(
      document.getElementById('aim-joystick-base'),
      document.getElementById('aim-joystick-knob'),
      { onChange: (x, z) => { this.touchAim = { x, z }; } },
    );

    bindHold('mb-fire', () => {
      this.audio.resume();
      this.mouseDown = true;
    }, () => { this.mouseDown = false; });

    bindPress('mb-reload', () => {
      if (this.running) {
        this._tryStartReload(performance.now() / 1000);
      }
    });

    bindPress('mb-pause', () => this._togglePause());
    bindPress('mb-hand-0', () => { if (this.running) this._selectRaidHand(0); });
    bindPress('mb-hand-1', () => { if (this.running) this._selectRaidHand(1); });
    bindPress('mb-interact', () => {
      if (this.running) {
        this.audio.resume();
        this._tryInteract();
      }
    });

    bindPress('mb-inventory', () => {
      if (this.running) this.inventoryUI.toggle();
    });

    if (this.mobile) {
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

  _setAimCursorFromAngle(angle, distPx = 72) {
    this.mouse.sx = INTERNAL_W / 2 + Math.sin(angle) * distPx;
    this.mouse.sy = INTERNAL_H / 2 + Math.cos(angle) * distPx;
    if (this.player) {
      const worldDist = distPx / PPU;
      this.mouse.wx = this.player.x + Math.sin(angle) * worldDist;
      this.mouse.wz = this.player.z + Math.cos(angle) * worldDist;
    }
  }

  _syncAim() {
    if (!this.running || !this.player) return;
    if (this.mobile) {
      const { x, z } = this.touchAim;
      if (Math.hypot(x, z) > MOBILE_STICK_DEADZONE) {
        this.player.angle = Math.atan2(x, z);
      }
      this._setAimCursorFromAngle(this.player.angle);
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
    const previous = this._previousCameraTarget;
    this.camFollow.x = followMovingAxis(this.camFollow.x, previous.x, this.player.x, CAM_PLAYER_SMOOTH, dt);
    this.camFollow.z = followMovingAxis(this.camFollow.z, previous.z, this.player.z, CAM_PLAYER_SMOOTH, dt);
    previous.x = this.player.x;
    previous.z = this.player.z;
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
  }

  _syncCamPixels() {
    if (!this.player) {
      this._camPxX = 0;
      this._camPxZ = 0;
      this._camLeanPxX = 0;
      this._camLeanPxZ = 0;
      return;
    }
    const camera = this._camera();
    const cp = camPixelsFromPlayer(camera.x, camera.z);
    this._camPxX = cp.x;
    this._camPxZ = cp.z;
    this._camLeanPxX = 0;
    this._camLeanPxZ = 0;
  }

  _camTranslate() {
    return {
      x: -this._camPxX - this._camLeanPxX + (INTERNAL_W >> 1),
      y: -this._camPxZ - this._camLeanPxZ + (INTERNAL_H >> 1),
    };
  }

  _camera() {
    if (!this.player) return { x: 0, z: 0 };
    const follow = this.camFollow ?? this.player;
    return {
      x: follow.x + this.camOffset.x,
      z: follow.z + this.camOffset.z,
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

  _entityToScreen(wx, wz) {
    const camera = this._camera();
    return { x: INTERNAL_W / 2 + (wx - camera.x) * PPU, y: INTERNAL_H / 2 + (wz - camera.z) * PPU };
  }

  _worldToScreen(wx, wz) {
    if (this.player && wx === this.player.x && wz === this.player.z) {
      const camera = this._camera();
      return {
        x: (INTERNAL_W >> 1) + Math.round((wx - camera.x) * PPU),
        y: (INTERNAL_H >> 1) + Math.round((wz - camera.z) * PPU),
      };
    }
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
        ss = this._worldToScreen(spawn.x, spawn.z - spawn.spriteLift);
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

  async _bootGame(saveData = null, raidKit = null) {
    const isSaveLoad = !!saveData;
    if (!isSaveLoad) {
      this._beginSpawnReveal();
    }
    this.audio.init().catch(() => {});
    this.audio.resume();

    await this._spritePreload;
    await this._paintLoadingProgress(0.32, 'Generating terrain…');

    if (saveData?.worldSeed != null) {
      setWorldSeed(saveData.worldSeed);
    } else {
      rollWorldSeed();
    }

    this.world = new World();
    this.world.setSpriteBank(this.sprites);
    await this.world.build();
    await this._paintLoadingProgress(0.56, 'Preparing spawn area…');
    this.bullets = new BulletPool();
    this.robots = [];
    this.raiderSpawnSites = new Set();
    this.nextRaiderSpawnCheck = 0;
    this.items = new ItemManager(this.world);
    this.chests = new ChestManager(this.world);
    this.corpses = new CorpseManager(this.world);
    this.groundDrops = new GroundDropManager(this.world);
    this.buildings = new BuildingManager(this.world, this.chests, (opening, point) => {
      const distance = Math.hypot(point.x - this.player.x, point.z - this.player.z);
      const volume = Math.max(0, 1 - distance / 44);
      if (volume > 0) this.audio.doorToggle(opening, this._soundOffset(point), volume);
    });
    this.world.setFoliagePopulatedHook((chunk) => {
      this.buildings.reconcileFoliageInChunk(chunk, this.world);
    });
    preloadPixelTextAtlas();
    this.particles = [];
    this.heldThrowable = null;
    this.thrownItems = [];
    this.dayNight = new DayNightCycle();

    if (saveData) {
      this.player = new Player();
      this.player.applySaveData(saveData.player);
      for (const drop of saveData.groundDrops ?? []) {
        this.groundDrops.dropAt(drop.x, drop.z, drop.item, null, { preserve: drop.preserve, exact: true });
      }
      this._applySaveState(saveData);
      this._finalizeLoadedSave(saveData);
      this._spillLockedInventory();
    } else {
      this.player = new Player();
      const spawn = this.world.getPlayerSpawn();
      if (raidKit) {
        this.player.applySaveData({ ...raidKit, x: spawn.x, z: spawn.z, health: 100, maxHealth: 100, shield: 0, alive: true, powerUps: {} });
      }
      this.player.x = spawn.x;
      this.player.z = spawn.z;
    }
    this.player.raidLevel = this.raidProfile ? raidLevel(this.raidProfile) : 1;
    this.world.prewarmGround(this.player.x, this.player.z, 4);
    this.player.canSeeEnemyOnScreen = (robot) => {
      const point = this._worldToScreen(robot.x, robot.z);
      return Math.abs(point.x - (INTERNAL_W >> 1)) <= this._visibleHalfWidth
        && Math.abs(point.y - (INTERNAL_H >> 1)) <= this._visibleHalfHeight;
    };
    this._nextTerrainWarmup = 0;
    await this._paintLoadingProgress(0.82, 'Locating extraction hatches…');
    this.hatches = raidKit ? this._placeHatches() : [];
    await this._paintLoadingProgress(1, 'Entering the Ruins…');
    this.nearestHatch = null;
    this.raidStartedAt = performance.now();
    this.camFollow = { x: this.player.x, z: this.player.z };
    this._previousCameraTarget = { ...this.camFollow };
    this.nextRaidCheckpointAt = this.raidStartedAt + 3000;
    this.raidStartingKit = capturePlayerState(this.player);
    this._extractElapsed = 0;
    document.getElementById('raid-extract-distance').textContent = '';
    document.getElementById('raid-hatch-status').textContent = '';

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
    this.raiderKills = 0;
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

    this._hideLoadingScreen();
    this.lastTime = performance.now();

    this._loop(this.lastTime);
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
    this._spillLockedInventory();

    if (this._isSpawnRevealActive()) {
      this._updateSpawnReveal(dt);
    }


    const inventoryOpen = this._panelOpen();
    if (this.player?.alive && this.world && time >= this._nextTerrainWarmup) {
      this._nextTerrainWarmup = time + 0.08;
      this.world.touchChunksAround(this.player.x, this.player.z, 5, { budget: 1 });
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

    if (!inventoryOpen) {
      if (!this._isSpawnRevealActive()) {
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

        const walkRate = this.player.isSprinting ? HUMAN_SPRINT_RATE : HUMAN_WALK_RATE;
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
        this._syncAim();
      }

      if (!this._isSpawnRevealActive()) {
      const fireEdge = this.mouseDown && !this.prevMouseDown;
      const fireRelease = !this.mouseDown && this.prevMouseDown;
      const wantsShoot = this.player.isAutomaticWeapon()
        ? this.mouseDown
        : fireEdge;

      if (this.heldThrowable) {
        if (fireEdge) this._throwHeldItem();
      } else if (this.player.usesMeleeCombat()) {
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
    if (!this._isSpawnRevealActive()) {
    const reloadResult = this.player.updateReload(time);
    if (reloadResult?.ejectCasings > 0) {
      const cfg = WEAPONS[this.player.weaponKey];
      this._emitCasings(reloadResult.ejectCasings, cfg?.casingColor || 'yellow');
    }
    this._updateMidCooldownCasings(time);
    this.player.updateGunKick(dt);

    this.items.update(dt);
    this.chunkEntities.update(this.player, time);
    this._syncCamPixels();
    this.bullets.update(dt, this.world, (b) => this._onBulletHit(b), this.player);
    const navStart = performance.now();

    const simView = this.getViewBoundsWorld();
    const simPad = TILE * 10;
    this._spawnRaiders(time);
    const raiders = this.robots.filter((robot) => robot.type === 'raider' && robot.alive);
    for (const robot of [...this.robots]) {
      if (!robot.alive) continue;
      if (!pointInViewBounds(simView, robot.x, robot.z, simPad)) continue;
      const previousX = robot.x;
      const previousZ = robot.z;
      const moved = () => Math.hypot(robot.x - previousX, robot.z - previousZ) > dt * 0.15;
      if (robot.type === 'raider') {
        const previousStep = Math.floor(robot.walkPhase / 2);
        robot.updateRaider(dt, this.player, this.world, this.robots, this.chests.chests, this.corpses.corpses,
          this.groundDrops, this.bullets.bullets, this.buildings, time,
          (raider, angle, target) => this._raiderAttack(raider, angle, target, time));
        robot.renderMoving = moved();
        if (robot.renderMoving && Math.floor(robot.walkPhase / 2) > previousStep) {
          const distance = Math.hypot(robot.x - this.player.x, robot.z - this.player.z);
          const volume = 0.2 * Math.max(0, 1 - distance / 45);
          if (volume > 0) this.audio.play('footstep', volume, 1.15 + Math.random() * 0.1, this._soundOffset(robot));
        }
        continue;
      }
      const lure = !robot.emerging && this.thrownItems.find((item) => item.key === 'flare'
        && item.flight <= 0 && !item.done && Math.hypot(robot.x - item.x, robot.z - item.z) <= TILE * 12);
      if (lure) {
        robot.combatTarget = null;
        robot.searchPhase = 'investigate';
        robot.hasLastKnown = true;
        robot.lastKnownX = lure.x;
        robot.lastKnownZ = lure.z - robot.getMoveCollider().zOff;
        robot.angle = Math.atan2(lure.x - robot.x, lure.z - robot.z);
        const phase = robot.walkPhase;
        robot._chaseMove(dt, this.player, this.world, this.robots, this.buildings, time);
        robot.renderMoving = moved();
        robot._applyLocomotion(previousX, previousZ, dt, robot.renderMoving ? 8 : 0);
        if (robot.renderMoving && Math.floor(robot.walkPhase / 2) > Math.floor(phase / 2)) {
          const offset = this._soundOffset(robot);
          const distance = Math.hypot(offset.x, offset.z);
          if (robot.type === 'scout') this.audio.scoutStomp(distance, offset);
          else this.audio.enemyFootstep(distance, offset);
        }
        continue;
      }
      let target = this.player;
      let targetRange = Math.min(24, Math.hypot(robot.x - target.x, robot.z - target.z));
      for (const raider of raiders) {
        const distance = Math.hypot(robot.x - raider.x, robot.z - raider.z);
        if (!raider.alive || distance >= targetRange
          || !hasCombatSight(this.world, robot, raider)) continue;
        target = raider;
        targetRange = distance;
      }
      robot.combatTarget = target;
      robot.update(dt, target, this.world, this.robots, (r) => {
        if (this.world.segmentBlocked(r.x, entityFeetZ(r), target.x, entityFeetZ(target), 0.16, false)) return;
        if (target !== this.player) {
          this._damageRobot(target, r.meleeDamage, r.x, r.z, null, false);
          return;
        }
        if (this.player.takeDamage(r.meleeDamage, time)) {
          this.player.applyMeleeKnockback(r.x, r.z, 2.2 + r.meleeDamage * 0.04);
          this.audio.playerHurt(this._soundOffset(this.player));
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

      robot.renderMoving = moved();
      if (robot.alive && robot.renderMoving && !robot.emerging
        && !(robot.jump?.active || robot.jump?.charging)
        && robot.shoot?.phase !== 'charging' && robot.shoot?.phase !== 'firing') {
        const step = Math.floor(robot.walkPhase / (robot.type === 'scout' ? 1 : 2));
        if (step !== robot._audioStep) {
          robot._audioStep = step;
          if (step > 0) {
            const dist = Math.hypot(robot.x - this.player.x, robot.z - this.player.z);
            if (robot.type === 'scout') this.audio.scoutStomp(dist, this._soundOffset(robot));
            else this.audio.enemyFootstep(dist, this._soundOffset(robot));
          }
        }
      } else {
        robot._audioStep = -1;
      }

      if (robot.type === 'scout' && robot.shoot) {
        const phase = robot.shoot.phase;
        if (phase === 'charging' && robot._prevShootPhase !== 'charging') {
          const dist = Math.hypot(robot.x - this.player.x, robot.z - this.player.z);
          this.audio.scoutChargeStart(dist, this._soundOffset(robot));
        }
        robot._prevShootPhase = phase;
      }
    }
      this._npcFrameMs = performance.now() - navStart;
    } else if (!this._isSpawnRevealActive()) {
      this.chunkEntities.update(this.player, time);
    }
    const breathTarget = getPlayerIdleBreathY(this.player, time);
    this._weaponBreathY += (breathTarget - this._weaponBreathY) * Math.min(1, dt * 18);
    this._updateThrownItems(dt, time);
    updateParticles(this.particles, dt, this.world, {
      onCasingLand: (casing) => this.audio.casingLand(this._soundOffset(casing, casing.z)),
    });
    this.corpses?.update(dt, time, (x, z) => {
      this.particles.push(...createRobotSmoke(x, z - 0.15, 0.22));
    });
  }

  _enemyShoot(robot, angle, damage = 10) {
    if (!robot?.alive || robot.emerging) return;
    const spread = robot.shoot?.bulletSpread ?? 0.28;
    const bullet = this.bullets.spawn(
      robot.x,
      robot.z,
      angle,
      { damage, bulletSpeed: 72, spread },
      false,
      this.world,
    );
    if (bullet) bullet.enemyOwner = robot;
    const offset = this._soundOffset(robot);
    this.audio.enemyShot(Math.hypot(offset.x, offset.z), offset);
  }

  _soundOffset(entity, sourceZ = entityFeetZ(entity)) {
    const shelter = this.buildings?.getEntityBuildingAt(this.player);
    const nearOpening = shelter && (
      [shelter, shelter.rearDoor].some((door) => door?.doorOpen
        && Math.hypot(this.player.x - (door.originX + (door.doorTx + 0.5) * TILE),
          entityFeetZ(this.player) - (door.originZ + (door.doorTz + 0.5) * TILE)) < TILE * 1.35)
      || shelter.walls.some((wall) => wall.window
        && Math.hypot(this.player.x - wall.x, entityFeetZ(this.player) - wall.z) < TILE * 1.35)
    );
    return {
      x: entity.x - this.player.x,
      z: entity.z - this.player.z,
      outside: Boolean(shelter && !nearOpening && this.buildings.getEntityBuildingAt(entity) !== shelter),
      nearOpening: Boolean(nearOpening),
      occluded: !nearOpening && Math.hypot(entity.x - this.player.x, entity.z - this.player.z) >= TILE * 3
        && this.world.segmentBlocked(this.player.x, entityFeetZ(this.player), entity.x, sourceZ,
          0, false, null, { soundTrace: true }),
    };
  }

  _spawnRaiders(time) {
    if (time < this.nextRaiderSpawnCheck) return;
    this.nextRaiderSpawnCheck = time + 11;
    if (this.robots.filter((enemy) => enemy.type === 'raider' && enemy.alive
      && Math.hypot(enemy.x - this.player.x, enemy.z - this.player.z) < 100).length >= 3) return;
    for (const chest of this.chests.chests) {
      const building = chest.homeBuilding;
      if (!building || !chest.slots.some(Boolean)) continue;
      const site = `${building.originX},${building.originZ}`;
      if (this.raiderSpawnSites.has(site)) continue;
      const x = building.originX + (building.doorTx + 0.5) * TILE;
      const z = building.originZ + ((building.doorTz ?? building.h - 1) + 2) * TILE;
      const distance = Math.hypot(x - this.player.x, z - this.player.z);
      if (distance < 22 || distance > 70 || this.world.checkCollision(x, z, 1.3)) continue;
      this.raiderSpawnSites.add(site);
      this.robots.push(new Raider(x, z, chest));
      return;
    }
  }

  _selectRaidHand(index) {
    this.heldThrowable = null;
    this.player?.setActiveHandSlot(index);
  }

  _throwHeldItem() {
    const { index, key } = this.heldThrowable;
    this.heldThrowable = null;
    const item = normalizeThrowableItem(this.player.itemSlots[index]);
    if (!item || item.key !== key || !this.player.isItemSlotUnlocked(index)) return;
    const x = this.player.x;
    const z = entityFeetZ(this.player);
    const target = this._screenToWorld(this.mouse.sx, this.mouse.sy);
    const dx = target.x - x;
    const dz = target.z - z;
    const distance = Math.hypot(dx, dz);
    const scale = Math.min(1, TILE * 5 / Math.max(distance, 0.001));
    this.player.itemSlots[index] = item.amount > 1 ? { ...item, amount: item.amount - 1 } : null;
    this.thrownItems.push({ key, x, z, vx: dx * scale / 0.55, vz: dz * scale / 0.55, age: 0, flight: 0.55, lift: 0, tick: 0 });
  }

  _updateThrownItems(dt, time) {
    const blocked = (x, z, nx, nz) => this.world.segmentBlocked(x, z, nx, nz, 0.1, false, null, { solidTrace: true });
    for (const item of this.thrownItems) {
      item.age += dt;
      if (item.flight > 0) {
        const step = Math.min(dt, item.flight);
        item.flight -= step;
        const nx = item.x + item.vx * step;
        const nz = item.z + item.vz * step;
        if (blocked(item.x, item.z, nx, nz)) {
          if (item.key === 'molotov') {
            let low = 0;
            let high = 1;
            for (let i = 0; i < 5; i++) {
              const mid = (low + high) / 2;
              if (blocked(item.x, item.z, item.x + (nx - item.x) * mid, item.z + (nz - item.z) * mid)) high = mid;
              else low = mid;
            }
            item.x += (nx - item.x) * low;
            item.z += (nz - item.z) * low;
            item.flight = 0;
          }
          else {
            if (blocked(item.x, item.z, nx, item.z)) item.vx *= -0.55;
            else item.x = nx;
            if (blocked(item.x, item.z, item.x, nz)) item.vz *= -0.55;
            else item.z = nz;
          }
        } else {
          item.x = nx;
          item.z = nz;
        }
        item.lift = Math.sin(Math.PI * item.flight / 0.55) * 18;
      }
      if (item.key === 'grenade' && item.age >= 3) {
        this.audio.explosion(this._soundOffset(item, item.z));
        this.particles.push(...createExplosion(item.x, item.z), ...createExplosion(item.x, item.z),
          ...createExplosion(item.x, item.z), ...createRobotSmoke(item.x, item.z, 1.6));
        this._damagePlayerFromThrowable(item, TILE * 2, 85, time, blocked);
        for (const npc of [...this.robots]) {
          const z = npcCollisionZ(npc);
          if (npc.alive && Math.hypot(npc.x - item.x, z - item.z) < TILE * 2
            && !blocked(item.x, item.z, npc.x, z)) this._damageRobot(npc, 85, item.x, item.z);
        }
        item.done = true;
      }
      if (item.flight > 0 || item.done || item.key === 'grenade') continue;
      const flare = item.key === 'flare';
      item.done = item.age >= (flare ? 10 : 6);
      if (item.done) continue;
      const radius = TILE * 2;
      item.fxTimer = (item.fxTimer ?? 0) - dt;
      while (item.fxTimer <= 0) {
        item.fxTimer += flare ? 0.045 + Math.random() * 0.025 : 0.009 + Math.random() * 0.009;
        const angle = Math.random() * Math.PI * 2;
        if (flare) {
          this.particles.push(...createRobotHitSparks(item.x, item.z,
            item.x - Math.cos(angle), item.z - Math.sin(angle), 14));
          continue;
        }
        const distance = Math.sqrt(Math.random()) * radius;
        const x = item.x + Math.cos(angle) * distance;
        const z = item.z + Math.sin(angle) * distance;
        if (blocked(item.x, item.z, x, z)) continue;
        for (const flame of createRobotFire(x, z, 0)) {
          flame.vx = 0;
          flame.vz = 0;
          this.particles.push(flame);
        }
      }
      if (!flare) {
        item.tick -= dt;
        if (item.tick > 0) continue;
        item.tick += 0.4;
        this._damagePlayerFromThrowable(item, radius, 8, time, blocked);
        for (const npc of [...this.robots]) {
          const z = npcCollisionZ(npc);
          if (npc.alive && Math.hypot(npc.x - item.x, z - item.z) <= radius
            && !blocked(item.x, item.z, npc.x, z)) this._damageRobot(npc, 8, item.x, item.z);
        }
      }
    }
    this.thrownItems = this.thrownItems.filter((item) => !item.done);
  }

  _damagePlayerFromThrowable(item, radius, damage, time, blocked) {
    const player = this.player;
    const z = npcCollisionZ(player);
    if (!player.alive || Math.hypot(player.x - item.x, z - item.z) > radius
      || blocked(item.x, item.z, player.x, z) || !player.takeDamage(damage, time)) return;
    this.audio.playerHurt(this._soundOffset(player));
    this.el.damageFlash.classList.add('active');
    setTimeout(() => this.el.damageFlash.classList.remove('active'), 150);
    this.particles.push(...createBloodSplatter(player.x, player.z, item.x, item.z, damage));
  }

  _raiderAttack(raider, angle, target, time) {
    const melee = MELEE_WEAPONS[raider.weaponKey];
    if (melee) {
      if (this.world.segmentBlocked(raider.x, entityFeetZ(raider), target.x, entityFeetZ(target), 0.16, false)) return 0.25;
      raider.swingStartedAt = time;
      const damage = Math.round(melee.damage * 0.55);
      this.audio.melee(this._soundOffset(raider));
      if (target !== this.player) this._damageRobot(target, damage, raider.x, raider.z, null, false);
      else if (target.takeDamage(damage, time)) {
        this.audio.playerHurt(this._soundOffset(this.player));
        this.el.damageFlash.classList.add('active');
        setTimeout(() => this.el.damageFlash.classList.remove('active'), 150);
        this.particles.push(...createBloodSplatter(target.x, target.z, raider.x, raider.z, damage));
      }
      return 0.85;
    }
    const weapon = WEAPONS[raider.weaponKey];
    raider.shotFlashUntil = time + 0.075;
    const aim = gunAimTransform(angle);
    const hold = GUN_HOLD_OFFSET + gunPivotHoldOffset(aim.angle);
    const gunZ = raider.z + Math.cos(angle) * hold;
    this.particles.push(...createBulletCasing(
      raider.x + Math.sin(angle) * hold, gunZ, angle, aim.flipX, weapon.casingColor || 'yellow',
      1, (entityFeetZ(raider) - gunZ) * PPU,
    ));
    const bloom = Math.min(0.24, (raider.shotBloom ?? 0) + (weapon.automatic ? 0.045 : 0.08));
    raider.shotBloom = bloom;
    const shot = { ...weapon, damage: weapon.damage * (weapon.automatic ? 0.38 : 0.55), spread: Math.max(0.26, weapon.spread) + bloom };
    for (let i = 0; i < weapon.pellets; i++) {
      const bullet = this.bullets.spawn(raider.x, raider.z, angle, shot, false, this.world);
      if (bullet) {
        bullet.enemyOwner = raider;
        bullet.raiderShotOrigin = { x: raider.x, z: entityFeetZ(raider) };
      }
    }
    const distance = Math.hypot(raider.x - this.player.x, raider.z - this.player.z);
    if (distance < 125) this.audio.enemyShot(distance, this._soundOffset(raider), weapon.sound);
    return weapon.automatic
      ? Math.max(0.13, weapon.fireRate) + Math.random() * 0.07
      : Math.max(0.48, weapon.fireRate) + Math.random() * 0.25;
  }

  _damageRobot(robot, damage, fromX, fromZ, bullet = null, playerCredit = true) {
    if (!robot.applyHit(damage, fromX, fromZ, this.world, {
      fromBullet: !!bullet,
      alert: this.player.canSeeEnemyOnScreen(robot),
    })) return;
    const isRaider = robot.type === 'raider';
    const soundOffset = this._soundOffset(robot);
    if (isRaider) {
      this.audio.playerHurt(soundOffset);
      this.particles.push(...createBloodSplatter(robot.x, robot.z, fromX, fromZ, damage));
    } else {
      this.audio.hitEnemy(soundOffset);
      this.particles.push(...createRobotHitSparks(robot.x, robot.z, fromX, fromZ, damage));
    }
    if (bullet) bullet.active = false;
    if (!robot.alive) {
      if (isRaider) {
        if (playerCredit) this.raiderKills++;
        const weapon = WEAPONS[robot.weaponKey];
        const loot = [
          ...robot.loot,
          ...(Math.random() < 0.35 ? [{
            kind: weapon ? 'weapon' : 'melee', key: robot.weaponKey, durability: 45 + Math.floor(Math.random() * 31),
            ...(weapon && { ammo: robot.ammo }),
          }] : []),
          ...(robot.bandages > 0 ? [{ kind: 'consumable', key: 'bandage', amount: robot.bandages }] : []),
          weapon ? { kind: 'ammo', ammoType: getWeaponAmmoType(robot.weaponKey), amount: weapon.magSize }
            : { kind: 'material', key: 'mechanical_comp', amount: 2 },
        ];
        for (const item of loot) this.groundDrops.dropAt(robot.x, robot.z, item, null, { preserve: true });
        const index = this.robots.indexOf(robot);
        if (index >= 0) this.robots.splice(index, 1);
        return true;
      }
      if (playerCredit) {
        this.kills++;
        if (this.raidProfile) {
          const reached = challengeProgress(this.raidProfile, this.kills).find((challenge) =>
            !challenge.claimed && challenge.metric === 'extractedKills' && challenge.progress >= challenge.goal && challengeProgress(this.raidProfile, this.kills - 1).some((entry) => entry.id === challenge.id && entry.progress < entry.goal));
          if (reached) this.showWaveBanner(`${reached.title} · Extract to complete`, 3);
        }
      }
      const time = performance.now() / 1000;
      this.corpses.spawnFromRobot(robot, time);
      const idx = this.robots.indexOf(robot);
      if (idx >= 0) this.robots.splice(idx, 1);
      this.audio.explosion(this._soundOffset(robot));
      this.particles.push(...createExplosion(robot.x, robot.z));
      this.particles.push(...createRobotDeathFx(robot.x, robot.z, robot.radius * 1.1));
      this.particles.push(...createRobotSmoke(robot.x, robot.z, 0.55));
    }
    return true;
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
      if (!pointInWallLight(this._wallLight, corpse.x, this.corpses.sortZ(corpse))) continue;
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

  _tryPickupGroundDrop(drop = null) {
    if (!this.running || this._panelOpen()) return false;
    const target = drop
      ?? this._getHoveredGroundDrop()
      ?? (this.mobile ? this._getNearbyGroundDrop() : null);
    return this._collectGroundDrop(target);
  }

  _collectGroundDrop(target) {
    if (!target || !this.groundDrops.drops.includes(target)
      || !this.groundDrops.isInPickupRange(this.player, target)) return false;
    const result = this.player.tryLootItem(target.item);
    if (!result.ok) {
      this.items.setPickupMsg('Inventory full', { error: true, duration: 1.8 });
      return false;
    }
    if (result.remainder) {
      target.item = result.remainder;
      target.label = getItemDisplayName(target.item);
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
    for (const building of this.buildings.buildings.flatMap((house) => house.rearDoor ? [house, house.rearDoor] : [house])) {
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
    return true;
  }

  _tryInteract() {
    if (this._isSpawnRevealActive()) return false;
    if (this._callHatch()) return true;
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
    this._syncCamPixels();
    for (const robot of this.robots) hearPlayerGunshot(robot, this.player);
    const shot = { ...w, damage: w.damage * this.player.getDamageMult(time) };
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
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
    this.player.wearActiveHand(100 / (cfg?.durabilityShots ?? 650));
  }

  _spillLockedInventory() {
    if (this.inventoryUI?.drag?.moved) return;
    const player = this.player;
    for (const item of player.drainLockedInventory()) {
      this.groundDrops.dropAt(player.x, player.z, item, player, { preserve: true });
    }
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

    for (const robot of [...this.robots]) {
      if (!robot.alive) continue;
      const dx = robot.x - this.player.x;
      const dz = robot.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + robot.radius) continue;
      if (this.world.segmentBlocked(this.player.x, entityFeetZ(this.player),
        robot.x, npcCollisionZ(robot), 0.16, false)) {
        continue;
      }
      let diff = Math.atan2(dx, dz) - aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > halfArc) continue;
      if (this._damageRobot(robot, dmg, this.player.x, this.player.z)) {
        if (!hitAny) this.audio.melee(this._soundOffset(robot));
        hitAny = true;
      }
    }
    if (hitAny && this.player.isMeleeActive()) this.player.wearActiveHand(1);
  }

  _onBulletHit(bullet) {
    const time = performance.now() / 1000;
    const origin = bullet.playerShotOrigin
      ?? (bullet.enemyOwner?.type === 'raider' ? bullet.raiderShotOrigin : null);
    const blocked = (target) => origin && this.world.segmentBlocked(
      origin.x, origin.z, target.x, target === this.player ? entityFeetZ(target) : npcCollisionZ(target), 0.06, false, null, { feetTrace: true });
    if (bullet.fromPlayer || bullet.enemyOwner) {
      for (const robot of this.robots) {
        if (!robot.alive) continue;
        if (!bullet.fromPlayer && (robot === bullet.enemyOwner
          || (bullet.enemyOwner.type !== 'raider' && robot.type !== 'raider'))) continue;
        const dx = bullet.x - robot.x;
        const hitZ = bullet.playerShotOrigin ? robot.z + (robot.getHitCollider()?.zOff ?? 0) : robot.z;
        const dz = bullet.z - hitZ;
        if (dx * dx + dz * dz < (robot.radius + 0.5) ** 2) {
          if (blocked(robot)) continue;
          const fromX = bullet.x - bullet.vx * 0.02;
          const fromZ = bullet.z - bullet.vz * 0.02;
          this._damageRobot(robot, bullet.damage, fromX, fromZ, bullet, bullet.fromPlayer);
          return;
        }
      }
      if (bullet.fromPlayer) return;
    }

    if (!this.player?.alive) return;
      const dx = bullet.x - this.player.x;
      const dz = bullet.z - this.player.z;
    const hitR = this.player.radius + 0.45;
    if (dx * dx + dz * dz >= hitR * hitR) return;
    if (blocked(this.player)) return;
    if (this.player.takeDamage(bullet.damage, time, { perBullet: true })) {
          this.audio.playerHurt(this._soundOffset(this.player));
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
    const spriteZ = b.z - (b.spriteLift ?? 0);
    const tail = this._worldToScreen(b.x - nx * trailWorld, spriteZ - nz * trailWorld);
    const head = this._worldToScreen(b.x, spriteZ);
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

  _getGunScreenPose(drawTime) {
    const playerGs = this._entityToScreen(this.player.x, this.player.z);
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
      true,
    );
    if (clipBounds) ctx.restore();
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
    if (!this.running || !this.player) return;
    if (this.paused) {
      this._hideGameCursor();
      return;
    }

    let ctx = this.ctx;
    const nightFactor = this.dayNight?.getNightFactor() ?? 0;
    this._syncCamPixels();
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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

    for (const hatch of this.hatches ?? []) {
      if (!inView(hatch.x, hatch.z, EXTRACT_RADIUS)) continue;
      const point = worldToScreen(hatch.x, hatch.z);
      this.sprites.drawPropSprite(ctx, hatch.state === 'open' ? 'hatch_open' : 'hatch_closed',
        point.x, point.y, 2 * tilePx, { anchor: 'center' });
      const extracting = hatch === this.nearestHatch && this._extractElapsed > 0;
      if (hatch.state === 'calling' || extracting) {
        const seconds = extracting ? EXTRACT_SECONDS - this._extractElapsed : hatch.remaining;
        drawPixelText(ctx, `${Math.max(1, Math.ceil(seconds))}s`, point.x, point.y - tilePx - 8, 1, 'center');
      }
      if (extracting) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 20, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * this._extractElapsed / EXTRACT_SECONDS);
        ctx.strokeStyle = '#85d79c';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const playerSortZ = this._playerSortZ();
    const playerX = this.player.x;
    const playerZ = this.player.z;
    const lightView = {
      minX: Math.floor(viewMinX / TILE) * TILE,
      maxX: Math.ceil(viewMaxX / TILE) * TILE,
      minZ: Math.floor(viewMinZ / TILE) * TILE,
      maxZ: Math.ceil(viewMaxZ / TILE) * TILE,
    };
    const occluders = [];
    if (DYNAMIC_SHADOWS) {
      occluders.push(...collectWallOccluders(visibleBuildings, lightView),
        ...collectPropOccluders(visibleBuildings, this._cachedYsortFoliage, lightView, playerX, playerZ));
    }
    const colliderZ = playerZ + this.player.getMoveCollider(PPU).zOff;
    const floorPixel = TILE / BUILDING_ART_PX;
    const lightOrigin = occluders.length ? resolveWallLightOrigin(
      Math.round(playerX / floorPixel) * floorPixel, Math.round(colliderZ / floorPixel) * floorPixel,
      playerX, colliderZ, occluders,
    ) : null;
    const lightKey = occluders.length ? JSON.stringify([lightOrigin, lightView, occluders]) : null;
    if (lightKey !== this._wallLightKey) {
      this._wallLightKey = lightKey;
      this._wallLightWithoutCaster = new Map();
      this._wallLight = computeWallVisibility(lightOrigin.x, lightOrigin.z, lightView, occluders, this._wallLightWithoutCaster);
      if (this._wallLight) {
        this._wallShadowCanvas ??= document.createElement('canvas');
        rasterizeWallShadow(this._wallShadowCanvas, this._wallLight, lightView, floorPixel);
      }
    }
    for (const item of this.thrownItems ?? []) {
      if ((item.key === 'molotov' && item.flight <= 0) || !pointInWallLight(this._wallLight, item.x, item.z)) continue;
      const point = worldToScreen(item.x, item.z);
      this.sprites.drawGroundItem(ctx, item.key, point.x, point.y, 18, -item.lift);
    }
    const shadowMask = this._wallLight ? this._wallShadowCanvas : null;
    const shadowOrigin = worldToScreen(lightView.minX, lightView.minZ);
    const drawShadowMask = (context, mask = shadowMask) => {
      context.imageSmoothingEnabled = false;
      context.globalAlpha = 0.25;
      context.drawImage(mask, shadowOrigin.x, shadowOrigin.y,
        mask.width * floorPixel * PPU, mask.height * floorPixel * PPU);
    };
    if (shadowMask) {
      ctx.save();
      drawShadowMask(ctx);
      ctx.restore();
    }
    const lit = (x, z) => pointInWallLight(this._wallLight, x, z);
    const lightPath = this._wallLight && makeWallLightPath(this._wallLight, worldToScreen);
    const drawList = this._drawListScratch;
    drawList.length = 0;
    const shadowBounds = (x, z, size) => {
      const p = worldToScreen(x, z);
      return { minX: p.x - size, minY: p.y - size, maxX: p.x + size, maxY: p.y + size };
    };
    const shadowGridOrigin = worldToScreen(0, 0);
    const drawHumanShadow = (point, bounce) => {
      const feetY = Math.round(point.y + bounce + spriteFeetOffset(CHAR_NATIVE_PX, SPRITE_PLAYER));
      drawPixelEllipseShadow(ctx, point.x, feetY, 10, 4, tilePx, shadowGridOrigin);
    };
    const brightParticles = [];
    for (const building of visibleBuildings) {
      this.buildings?._ensureBuildingDecorSprites(building, this.sprites);
      for (const piece of building.decor ?? []) {
        if (!inView(piece.x, piece.z, TILE * 2)) continue;
        this.sprites.ensureSprite(piece.sprite);
        drawList.push({
          z: piece.sortZ,
          sortBias: piece.sortBias ?? SORT_ENTITY,
          receivesShadow: true,
          shadowSource: piece,
          shadowBounds: shadowBounds(piece.x, piece.z, tilePx * 2),
          draw: () => drawDecorPiece(ctx, this.sprites, piece, tilePx, worldToScreen),
        });
      }
    }
    const ysortFoliage = this._cachedYsortFoliage;
    for (const f of ysortFoliage) {
      if (!inView(f.x, f.z, spritePad)) continue;
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
              shadowGridOrigin,
            );
          },
        });
      }
      drawList.push({
        z: sortZ,
        sortBias: SORT_WALL_BACK,
        receivesShadow: true,
        shadowSource: f,
        shadowBounds: shadowBounds(f.x, f.z, tilePx * (f.drawSize ?? 1) + 2),
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
      if (!inView(corpse.x, corpse.z, TILE * 2) || !lit(corpse.x, this.corpses.sortZ(corpse))) continue;
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
          draw: () => drawBuildingWall(ctx, wall, building, worldToScreen, tilePx, this.sprites),
        });
      }
      for (const door of building.rearDoor ? [building, building.rearDoor] : [building]) {
        if (doorDrawsInFront(door, playerSortZ, playerInside, playerX, playerZ)) continue;
        const doorWx = bOriginX + ((door.doorTx ?? Math.floor(door.w / 2)) + 0.5) * TILE;
        const doorWz = bOriginZ + ((door.doorTz ?? door.h - 1) + 0.5) * TILE;
        if (inView(doorWx, doorWz)) {
          drawList.push({
            z: doorBackDrawZ(door, playerSortZ, playerInside, playerX, playerZ),
            sortBias: SORT_WALL_BACK,
            draw: () => drawBuildingDoor(ctx, door, worldToScreen, tilePx, this.sprites),
          });
        }
      }
    }
    for (const chest of this.chests.chests) {
      if (!inView(chest.x, chest.z, TILE * 2)) continue;
      drawList.push({ z: chest.z + 0.02, sortBias: SORT_ENTITY, receivesShadow: true,
        shadowBounds: shadowBounds(chest.x, chest.z, tilePx * 2), draw: () => {
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
      if (!inView(drop.x, drop.z, TILE * 2) || !lit(drop.x, drop.z)) continue;
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
          shadowGridOrigin,
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
      if (!inView(robot.x, robot.z, spritePad) || !lit(robot.x, npcCollisionZ(robot))) continue;
      if (robot.type === 'raider') {
        const z = this._feetSortZ(robot.x, robot.z, CHAR_NATIVE_PX, SPRITE_PLAYER);
        const point = this._entityToScreen(robot.x, robot.z);
        drawList.push({ z, sortBias: SORT_SHADOW, draw: () => drawHumanShadow(point, 0) });
        drawList.push({ z, sortBias: SORT_ENTITY, draw: () => {
          const flip = Math.sin(robot.angle) < 0;
          this.sprites.draw(ctx, getPlayerSheet(robot, robot.renderMoving), point.x, point.y, SPRITE_PLAYER, 0, flip, 'center', 0,
            getPlayerAnim(robot, dropDrawTime, robot.renderMoving), true);
          const gun = WEAPONS[robot.weaponKey];
          if (gun) {
            const aim = gunAimTransform(robot.angle);
            const reach = (GUN_HOLD_OFFSET + gunPivotHoldOffset(aim.angle)) * PPU;
            const elapsed = gun.reloadTime - robot.reloadLeft;
            const blend = robot.reloadLeft > 0 ? Math.min(1, elapsed / 0.18, robot.reloadLeft / 0.18) : 0;
            const sx = point.x + Math.sin(robot.angle) * reach * (1 - blend) + getReloadHoldScreenX(point.x, aim.flipX) * blend - point.x * blend;
            const sy = point.y + Math.cos(robot.angle) * reach * (1 - blend);
            const shot = dropDrawTime < (robot.shotFlashUntil ?? 0);
            const sheet = shot && gun.shotSprite ? gun.shotSprite : robot.reloadLeft > 0 ? gun.sprite + '_reload' : gun.sprite;
            this.sprites.draw(ctx, sheet, sx, sy,
              1.1, aim.angle * (1 - blend) - Math.PI * 0.35 * blend, aim.flipX, 'shoulder',
              0, robot.reloadLeft > 0 ? { elapsed } : null, true);
          } else {
            const melee = MELEE_WEAPONS[robot.weaponKey];
            const elapsed = dropDrawTime - (robot.swingStartedAt ?? -Infinity);
            const swing = elapsed >= 0 && elapsed < 0.42 ? Math.sin(Math.PI * elapsed / 0.42) : 0;
            const pose = getMeleeHoldPose(robot, 0.14 * swing);
            const hold = this._entityToScreen(pose.worldX, pose.worldZ);
            this.sprites.draw(ctx, melee.sprite, hold.x, hold.y + 8 * swing, 1.1,
              pose.angle, pose.flipX, 'shoulder', melee.swingAngle * swing, null, true);
          }
        }});
        continue;
      }
      const enemyNativePx = getEnemyNativePx(robot.type);
      const enemyDrawScale = getEnemyDrawScale(robot.type);
      const robotSortZ = this._feetSortZ(robot.x, robot.z, enemyNativePx, enemyDrawScale);
      const isSpider = robot.type === 'spider';
      const isScout = robot.type === 'scout';
      drawList.push({ z: robotSortZ, sortBias: SORT_SHADOW, draw: () => {
        if (!robot.alive && !robot.emerging) return;
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
        const drawX = s.x + shake.x + chargeShake;
        const shootPhase = robot.shoot?.phase ?? null;
        const robotMoving = robot.renderMoving && !robot.emerging
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
        const anchorY = s.y - bury + shake.y + emergeBob + jumpBob + chargeBob;
        const feetY = Math.round(anchorY + spriteFeetOffset(enemyNativePx, scale) + walkBouncePx);
        drawPixelEllipseShadow(ctx, drawX, feetY - shadowLift, shadowRx, shadowRy, tilePx, shadowGridOrigin);
      }});
      drawList.push({ z: robotSortZ, sortBias: SORT_ENTITY, draw: () => {
        const drawTime = performance.now() / 1000;
        const emerge = robot.getEmergeT();
        const shake = robot.getEmergeShake();
        const s = this._entityToScreen(robot.x, robot.z);
        const bury = (1 - emerge) * 32;
        const scale = enemyDrawScale * (0.15 + emerge * 0.85);
        const chargeShake = robot.jump?.charging
          ? Math.sin(drawTime * 28) * 2.5 * (1 - (robot.jump.chargeLeft ?? 0) / 0.5)
          : 0;
        const drawX = Math.round(s.x + shake.x + chargeShake);
        const shootPhase = robot.shoot?.phase ?? null;
        const isScout = robot.type === 'scout';
        const robotMoving = robot.renderMoving && !robot.emerging
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
          ctx.fillStyle = `rgba(18, 14, 10, ${0.55 * hole})`;
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
        );
        ctx.globalAlpha = (0.3 + emerge * 0.7);
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
          true,
        );
        const statusIcon = getEnemyStatusIcon(robot);
        if (statusIcon && emerge > 0.85) {
          const headLift = Math.round(spriteFeetOffset(enemyNativePx, scale) + walkBouncePx);
          const iconY = drawY - headLift - 14;
          const bob = Math.sin(drawTime * 4.5 + robot.x) * 1.5;
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
        if (robot.name) {
          drawPixelText(ctx, robot.name, drawX, drawY - 34, 1, 'center');
        }
        ctx.globalAlpha = 1;
      }});
    }
    const drawTime = performance.now() / 1000;
    const playerSheet = getPlayerSheet(this.player);
    const playerFlip = getPlayerFlipX(this.player);
    const playerBounce = Math.round(getPlayerBounceY(this.player, drawTime));
    const idleBreath = Math.round(this._weaponBreathY ?? 0);
    const playerAnim = getPlayerAnim(this.player, drawTime);
    drawList.push({ z: playerSortZ, sortBias: SORT_SHADOW, draw: () => {
      const s = this._worldToScreen(this.player.x, this.player.z);
      drawHumanShadow(s, playerBounce);
    }});
    drawList.push({ z: playerSortZ, sortBias: SORT_ENTITY, draw: () => {
      const s = this._entityToScreen(this.player.x, this.player.z);
      this.sprites.draw(ctx, playerSheet, s.x, s.y + playerBounce, SPRITE_PLAYER, 0, playerFlip, 'center', 0, playerAnim, true);
    }});
    const gunClip = insideBuilding ? buildingGunClipBounds(insideBuilding) : null;
    drawList.push({ z: playerSortZ + 0.02, sortBias: SORT_GUN, draw: () => {
      if (this.heldThrowable) {
        const point = this._entityToScreen(this.player.x, this.player.z);
        this.sprites.drawGroundItem(ctx, this.heldThrowable.key, point.x + Math.sin(this.player.angle) * 12, point.y + 8, 18);
      } else {
        this._drawWeaponSprite(ctx, this._getGunScreenPose(drawTime), gunClip);
      }
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
          draw: () => drawBuildingWall(ctx, wall, building, worldToScreen, tilePx, this.sprites),
        });
      }
      for (const door of building.rearDoor ? [building, building.rearDoor] : [building]) {
        if (!doorDrawsInFront(door, playerSortZ, playerInside, playerX, playerZ)) continue;
        const doorWx = door.originX + ((door.doorTx ?? Math.floor(door.w / 2)) + 0.5) * TILE;
        const doorWz = door.originZ + ((door.doorTz ?? door.h - 1) + 0.5) * TILE;
        if (inView(doorWx, doorWz)) {
          drawList.push({
            z: doorFrontDrawZ(door, playerSortZ, playerInside, playerX, playerZ),
            sortBias: SORT_WALL_FRONT,
            draw: () => drawBuildingDoor(ctx, door, worldToScreen, tilePx, this.sprites),
          });
        }
      }
    }
    for (const p of this.particles) {
      if (!inView(p.x, p.z, TILE) || !lit(p.x, p.z)) continue;
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
        lightOnly: true,
        draw: () => {
          this._drawParticle(ctx, p);
        },
      });
    }
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      if (!inView(b.x, b.z, TILE * 2) || !lit(b.x, b.z)) continue;
      const bulletZ = bulletDrawSortZ(b.x, b.z, visibleBuildings);
      drawList.push({
        z: bulletZ,
        sortBias: SORT_ENTITY,
        lightOnly: true,
        draw: () => {
          this._drawBulletTrail(ctx, b);
          const s = this._worldToScreen(b.x, b.z - (b.spriteLift ?? 0));
          const bScale = b.fromPlayer ? SPRITE_BULLET : 1;
          const bAngle = velToSpriteAngle(b.vx, b.vz);
          this.sprites.draw(ctx, 'bullet', s.x, s.y, bScale, bAngle);
        },
      });
    }
    drawList.sort((a, b) => (a.z - b.z) || ((a.sortBias ?? 0) - (b.sortBias ?? 0)));
    // Group consecutive props while keeping their depth relative to walls and entities.
    const sceneContext = ctx;
    const casterBySource = shadowMask ? new Map(occluders.filter((box) => box.source).map((box) => [box.source, box])) : null;
    for (let i = 0; i < drawList.length; i++) {
      const entry = drawList[i];
      if (shadowMask && entry.receivesShadow) {
        const caster = casterBySource.get(entry.shadowSource);
        let mask = shadowMask;
        if (caster) {
          this._propShadowMasks ??= new WeakMap();
          let cached = this._propShadowMasks.get(entry.shadowSource);
          if (cached?.lightKey !== lightKey) {
            const light = this._wallLightWithoutCaster.get(entry.shadowSource);
            const canvas = cached?.canvas ?? document.createElement('canvas');
            if (light) rasterizeWallShadow(canvas, light, lightView, floorPixel);
            cached = { lightKey, canvas, hasShadow: Boolean(light) };
            this._propShadowMasks.set(entry.shadowSource, cached);
          }
          mask = cached.hasShadow ? cached.canvas : null;
        }
        const first = i;
        const bounds = { ...entry.shadowBounds };
        while (!caster && drawList[i + 1]?.receivesShadow
          && !casterBySource.has(drawList[i + 1].shadowSource)) {
          const next = drawList[++i].shadowBounds;
          bounds.minX = Math.min(bounds.minX, next.minX);
          bounds.minY = Math.min(bounds.minY, next.minY);
          bounds.maxX = Math.max(bounds.maxX, next.maxX);
          bounds.maxY = Math.max(bounds.maxY, next.maxY);
        }
        const x = Math.max(0, Math.floor(bounds.minX));
        const y = Math.max(0, Math.floor(bounds.minY));
        const width = Math.min(INTERNAL_W, Math.ceil(bounds.maxX)) - x;
        const height = Math.min(INTERNAL_H, Math.ceil(bounds.maxY)) - y;
        if (width <= 0 || height <= 0) continue;
        if (!mask) {
          for (let j = first; j <= i; j++) drawList[j].draw();
          continue;
        }
        if (!this._propShadowLayer) this._propShadowLayer = document.createElement('canvas');
        const layer = this._propShadowLayer;
        if (layer.width !== this.canvas.width) layer.width = this.canvas.width;
        if (layer.height !== this.canvas.height) layer.height = this.canvas.height;
        ctx = layer.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const scale = this.renderScale;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(x, y, width, height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();
        for (let j = first; j <= i; j++) drawList[j].draw();
        ctx.globalCompositeOperation = 'source-atop';
        drawShadowMask(ctx, mask);
        ctx.restore();
        ctx = sceneContext;
        ctx.drawImage(layer, x * scale, y * scale, width * scale, height * scale, x, y, width, height);
      } else if (lightPath && entry.lightOnly) {
        ctx.save();
        ctx.clip(lightPath);
        entry.draw();
        ctx.restore();
      } else {
        entry.draw();
      }
    }

    this._drawPlayerCooldown(ctx, performance.now() / 1000);

    applyNightOverlay(ctx, INTERNAL_W, INTERNAL_H, nightFactor);
    const bounds = getWorldBoundsWorld();
    const near = worldToScreen(bounds.minX, bounds.minZ);
    const far = worldToScreen(bounds.maxX, bounds.maxZ);
    const fogWidth = TILE * PPU * 7;
    for (const [edge, direction, limit, horizontal] of [
      [near.x, 1, INTERNAL_W, true], [far.x, -1, INTERNAL_W, true],
      [near.y, 1, INTERNAL_H, false], [far.y, -1, INTERNAL_H, false],
    ]) {
      const inner = edge + direction * fogWidth;
      if (direction > 0 ? inner <= 0 : inner >= limit) continue;
      const gradient = horizontal ? ctx.createLinearGradient(edge, 0, inner, 0)
        : ctx.createLinearGradient(0, edge, 0, inner);
      gradient.addColorStop(0, '#353d39');
      gradient.addColorStop(1, 'rgba(53, 61, 57, 0)');
      ctx.fillStyle = gradient;
      const start = direction > 0 ? 0 : Math.max(0, inner);
      const size = direction > 0 ? Math.min(limit, inner) : limit - start;
      if (horizontal) ctx.fillRect(start, 0, size, INTERNAL_H);
      else ctx.fillRect(0, start, INTERNAL_W, size);
    }

    brightParticles.sort((a, b) => a.z - b.z);
    ctx.save();
    if (lightPath) ctx.clip(lightPath);
    for (const { p } of brightParticles) {
      this._drawParticle(ctx, p);
    }

    ctx.restore();

    const vignetteRadius = Math.hypot(this._visibleHalfWidth, this._visibleHalfHeight);
    if (vignetteRadius > 0) {
      if (this._vignetteRadius !== vignetteRadius) {
        const x = INTERNAL_W / 2;
        const y = INTERNAL_H / 2;
        const gradient = ctx.createRadialGradient(x, y, vignetteRadius * 0.42, x, y, vignetteRadius);
        gradient.addColorStop(0, 'rgba(12, 16, 14, 0)');
        gradient.addColorStop(0.65, 'rgba(12, 16, 14, 0.09)');
        gradient.addColorStop(1, 'rgba(12, 16, 14, 0.28)');
        this._vignette = gradient;
        this._vignetteRadius = vignetteRadius;
      }
      ctx.fillStyle = this._vignette;
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
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
    const src = item && getItemIconSrc(item);
    if (!src) {
      this._setPixelText(btn, fallbackLabel, PIXEL_TEXT_SCALE_SM);
      return;
    }
    const previous = this._mobileSlotIcons.get(btn);
    if (previous?.src === src && btn.firstChild === previous.img) return;
    const img = document.createElement('img');
    img.className = 'mb-btn-icon';
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = this.sprites.getIconUrl(src) || src;
    btn.replaceChildren(img);
    this._mobileSlotIcons.set(btn, { src, img });
  }

  _syncMobileQuickBar() {
    if (!this.mobile) return;
    const p = this.player;
    this._setMobileSlotBtn('mb-hand-0', p?.getHandSlotItem(0), '1');
    this._setMobileSlotBtn('mb-hand-1', p?.getHandSlotItem(1), '2');
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
    if (this._lastAmmoHudImage === img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, outPx, outPx);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, srcPx, srcPx, 0, 0, outPx, outPx);
    this._lastAmmoHudImage = img;
  }

  _updateHUD() {
    const w = this.player.getDisplayWeapon();
    const time = performance.now() / 1000;
    const charging = this.player.melee?.charging;
    const reloading = !this.player.isMeleeActive() && this.player.getWeapon()?.reloading;
    const progress = charging ? this.player.getMeleeChargeProgress(time) : this.player.getReloadProgress(time);
    if (charging || reloading) {
      this.el.reloadIndicator.style.setProperty('--fill-frame', `${Math.min(7, Math.floor(progress * 8)) * 100 / 7}%`);
      this._setPixelText(document.getElementById('reload-label'), charging ? 'Charging' : 'Reloading', PIXEL_TEXT_SCALE);
    }
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
      this.el.reloadIndicator.classList.toggle('hidden', !charging);
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

    if (this.items.pickupMsg) {
      this._setPixelText(this.el.pickupStatus, this.items.pickupMsg, PIXEL_TEXT_SCALE);
      if (this._pickupNotice !== this.items.pickupMsg) {
        this._pickupNotice = this.items.pickupMsg;
        this.el.pickupStatus.animate([{ opacity: 0, translate: '0 5px' }, { opacity: 1, translate: '0 0', offset: 0.15 },
          { opacity: 1, translate: '0 -4px', offset: 0.75 }, { opacity: 0, translate: '0 -14px' }],
        { duration: 1000 * this.items.pickupMsgTimer, easing: 'ease-out', fill: 'forwards' });
      }
      this.el.pickupStatus.classList.add('active');
      this.el.pickupStatus.classList.toggle('error', this.items.pickupMsgError);
    } else {
      this._pickupNotice = null;
      this._setPixelText(this.el.pickupStatus, '');
      this.el.pickupStatus.classList.remove('active', 'error');
    }

    const power = this.player.getActivePowerUpLabel(time);
    this._setPixelText(this.el.powerupStatus, power || '', PIXEL_TEXT_SCALE);
    this.el.powerupStatus.classList.toggle('active', !!power);
    this._syncMobileQuickBar();

    const hoveredChest = this.mobile ? null : this._getHoveredChest();
    const nearbyChest = this.mobile ? this._getNearbyChest() : null;
    const hoveredCorpse = this.mobile ? null : this._getHoveredCorpse();
    const nearbyCorpse = this.mobile ? this._getNearbyCorpse() : null;
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
    const hoveredDrop = this.mobile ? null : this._getHoveredGroundDrop();
    const nearbyDrop = this.mobile ? this._getNearbyGroundDrop() : null;
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
    const canCallHatch = this._canCallHatch();
    if (canCallHatch) mbInteract?.classList.add('mb-nearby');
    const showPrompt = canCallHatch || canToggleDoor || canOpenChest || canOpenCorpse || canPickupDrop;
    this.el.interactPrompt.classList.toggle('hidden', !showPrompt);
    if (showPrompt) {
      const doorVerb = interactDoor?.doorOpen ? 'close' : 'open';
      if (this.mobile) {
        const mobileText = canCallHatch ? 'E Call Extract' : canToggleDoor
          ? `E to ${doorVerb} door`
          : (canOpenCorpse ? 'E to loot' : (pickupDrop ? `E ${pickupDrop.label}` : 'E to open'));
        setElementPixelText(this.el.interactPrompt, mobileText, PIXEL_TEXT_SCALE);
        this._positionInteractPromptAbovePlayer();
      } else {
        const mx = this.mouse.clientX;
        const my = this.mouse.clientY;
        const desktopText = canCallHatch ? 'RMB to call extract' : canToggleDoor
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
    this.audio.lose();
    this._finishRaid(false);
  }

  _scheduleFrame() {
    if (this._frameRequest !== null) return;
    this._frameRequest = requestAnimationFrame((now) => {
      this._frameRequest = null;
      try {
        this._loop(now);
      } catch (error) {
        console.error('Raid frame failed:', error);
        if (this.running) {
          this._showPauseMenu();
          this.showWaveBanner('Raid interrupted', 4);
        } else {
          document.getElementById('raid-results').classList.add('hidden');
          this._showRaidBase(this.raidProfile, 'Could not display the raid result.');
        }
      }
    });
  }

  _loop(now) {
    if (!this.running || this.paused) return;
    const frameMs = Math.max(0, now - this.lastTime);
    const updateStart = performance.now();
    this._npcFrameMs = 0;
    const dt = Math.min(frameMs / 1000, 0.05);
    this.lastTime = now;
    const time = now / 1000;

    this._frameDt = dt;
    const vest = this.player.equipmentSlots[0];
    const backpack = this.player.equipmentSlots[1];
    this._update(dt, time);
    if (vest !== this.player.equipmentSlots[0] || backpack !== this.player.equipmentSlots[1]) {
      this._spillLockedInventory();
      if (this.inventoryUI?.isOpen()) this.inventoryUI.render();
    }
    this._checkGameOver();
    if (this.running) this._updateExtraction(dt);
    if (!this.running || this.paused) return;
    if (now >= this.nextRaidCheckpointAt) {
      this._saveRaidCheckpoint();
      this.nextRaidCheckpointAt = now + 3000;
    }
    const renderStart = performance.now();
    this._draw();
    const renderMs = performance.now() - renderStart;
    this._updateHUD();
    const perf = this._perf ??= { frames: 0, total: 0, peak: 0, npcPeak: 0, updated: now };
    if (frameMs > 0) {
      perf.frames++;
      perf.total += frameMs;
      perf.peak = Math.max(perf.peak, frameMs);
    }
    perf.npcPeak = Math.max(perf.npcPeak, this._npcFrameMs);
    if (now - perf.updated >= 500 && perf.total > 0) {
      document.getElementById('raid-performance').textContent =
        `${Math.round(1000 * perf.frames / perf.total)} FPS · max ${perf.peak.toFixed(0)} ms\n`
        + `CPU ${(renderStart - updateStart).toFixed(1)} + draw ${renderMs.toFixed(1)} ms\n`
        + `NPC max ${perf.npcPeak.toFixed(1)} ms · shadows ${DYNAMIC_SHADOWS ? 'on' : 'off'}`;
      Object.assign(perf, { frames: 0, total: 0, peak: 0, npcPeak: 0, updated: now });
    }
    this._scheduleFrame();
  }
}

try {
  window.game = new Game();
} catch (error) {
  console.error('Game startup failed:', error);
  document.getElementById('startup-error').classList.remove('hidden');
}
