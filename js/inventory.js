import { WEAPONS, MELEE_WEAPONS, ITEM_STORAGE_SIZE, UNLOCKED_ITEM_SLOTS, EQUIPMENT_SLOT_COUNT, HAND_SLOT_COUNT } from './player.js';
import { weaponItemSpritePath } from './sprites.js';
import { CHEST_SLOT_COUNT, getItemDisplayName, getItemDescription, getItemIconSrc, isQuickEquipItem, isThrowableItem } from './loot.js';
import { mergeMaterialStacks, MATERIAL_STACK_MAX, materialItemsMatch } from './materials.js';
import {
  AMMO_STACK_MAX,
  BANDAGE_STACK_MAX,
  ammoItemsMatch,
  bandageItemsMatch,
  mergeAmmoStacks,
  mergeBandageStacks,
} from './ammo.js';
import {
  consumableItemsMatch,
  mergeConsumableStacks,
  normalizeConsumableItem,
} from './consumables.js';
import { isEquipmentItem, normalizeEquipmentItem } from './equipment.js';
import { normalizeThrowableItem } from './throwables.js';
import { getConsumableHealAmount } from './consumables.js';
import {
  applyRecycleYields,
  canCraftRecipe,
  canRecycleItem,
  canStoreRecycleYields,
  craftRecipe,
  getCraftableRecipes,
  getRecipeLabel,
  getRecycleYields,
  recipeMaterialCosts,
  CRAFT_RECIPES,
  CRAFT_MAX_MATERIALS,
} from './crafting.js';
import { INTERNAL_W, INTERNAL_H } from './renderConfig.js';
import { createPixelTextImg, preloadPixelTextAtlas, setElementPixelText, setElementWrappedPixelText, PIXEL_TEXT_SCALE, PIXEL_TEXT_SCALE_SM, PIXEL_TEXT_SCALE_XS } from './pixelText.js';

export const INV_SLOT_SRC = 'assets/ui/inv_slot.png';
export const INV_CURSOR_SRC = 'assets/ui/inv_cursor.png';
export const CRAFT_PANEL_SRC = 'assets/ui/crafting.png';
export const CRAFT_TOGGLE_SRC = 'assets/ui/craft_toggle.png';
export const INV_LOCK_SRC = 'assets/items/misc/lock.png';

const ANIM_MS = 320;
const EQUIPMENT_LABELS = ['Head', 'Chest', 'Legs', 'Gear'];
const HAND_SLOT_LABELS = ['W1', 'W2'];
const QUICK_SLOT_LABEL = 'Use';
const THROW_SLOT_LABEL = 'Throw';
const CRAFT_PICK_COLS = 5;
const CRAFT_PICK_GAP_PX = 4;

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.chestMode = false;
    this.chest = null;
    this.animating = false;
    this.selectedSlot = null;
    this.selectedChestSlot = null;
    this.drag = null;
    this._skipClick = false;
    this._tooltipEl = null;
    this._contextMenuEl = null;
    this._contextSlot = null;
    this._contextAnchorEl = null;
    this._cursorEl = null;
    this._hoverTooltipText = null;
    this._stackTapKey = null;
    this._stackTapAt = 0;
    this.selectedCraftRecipeId = null;
    this.craftOpen = false;
    this._onDragMove = (e) => this._handleDragMove(e);
    this._onDragEnd = (e) => this._handleDragEnd(e);
    this._dragListenerOpts = { capture: true };
    this._onInvPointerMove = (e) => this._moveInvCursor(e);
    this.root = document.getElementById('inventory');
    this.panel = document.getElementById('inventory-panel');
    this.dualWrap = document.getElementById('inventory-dual-wrap');
    this.slideTrack = document.getElementById('inv-slide-track');
    this.mainCluster = document.getElementById('inv-main-cluster');
    this.craftPanel = document.getElementById('craft-panel');
    this.craftToggleBtn = document.getElementById('inv-craft-toggle');
    this.craftBgImg = document.getElementById('craft-panel-bg');
    this.craftPickerEl = document.getElementById('inv-craft-picker');
    this.craftCostGridEl = document.getElementById('inv-craft-cost-grid');
    this.craftBtnEl = document.getElementById('inv-craft-btn');
    preloadPixelTextAtlas();
    this.bgImg = document.getElementById('inventory-bg');
    this.weaponsEl = document.getElementById('inv-weapons-grid');
    this.equipmentEl = document.getElementById('inv-equipment-grid');
    this.itemsEl = document.getElementById('inv-items-grid');
    this.chestPanelRoot = document.getElementById('chest-panel');
    this.chestBgImg = document.getElementById('chest-panel-bg');
    this.chestEl = document.getElementById('inv-chest-grid');

    if (this.bgImg) {
      this.bgImg.addEventListener('error', () => {
        if (this.bgImg.dataset.fallback) return;
        this.bgImg.dataset.fallback = '1';
        this.bgImg.src = InventoryUI.fallbackImage();
      }, { once: true });
    }
    if (this.chestBgImg) {
      this.chestBgImg.addEventListener('error', () => {
        if (this.chestBgImg.dataset.fallback) return;
        this.chestBgImg.dataset.fallback = '1';
        this.chestBgImg.src = InventoryUI.fallbackChestImage();
      }, { once: true });
    }
    if (this.craftBgImg) {
      this.craftBgImg.addEventListener('error', () => {
        if (this.craftBgImg.dataset.fallback) return;
        this.craftBgImg.dataset.fallback = '1';
        this.craftBgImg.src = InventoryUI.fallbackCraftImage();
      }, { once: true });
    }

    this.backdrop = this.root?.querySelector('.inv-backdrop');
    this.backdrop?.addEventListener('pointerdown', (e) => {
      if (this.drag?.moved) return;
      e.preventDefault();
      this.close();
    });
    this.panel?.addEventListener('click', (e) => e.stopPropagation());
    this.craftPanel?.addEventListener('click', (e) => e.stopPropagation());
    this.craftToggleBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleCraftPanel();
    });
    this.craftBtnEl?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const player = this.game.player;
      if (!player) return;
      const recipe = getCraftableRecipes(player).find((r) => r.id === this.selectedCraftRecipeId);
      this._tryCraftRecipe(recipe);
    });
    this._ensureCraftPickerResizeObserver();
    this._ensureMobileScaleObserver();
    this._syncCraftBtnLabel();
    preloadPixelTextAtlas().then(() => {
      this._syncCraftBtnLabel();
      this._syncCraftToggleLabel();
    });
    document.addEventListener('pointerdown', (e) => this._onDocumentPointerDown(e));
    const syncMods = (e) => {
      if (!this.game.modifiers) return;
      this.game.modifiers.shift = e.shiftKey;
      this.game.modifiers.ctrl = e.ctrlKey;
    };
    this.root?.addEventListener('keydown', syncMods);
    this.root?.addEventListener('keyup', syncMods);
  }

  _isShiftClick(e) {
    return !!(e?.shiftKey || this.game?._isShiftHeld?.());
  }

  _onDocumentPointerDown(e) {
    if (!this._contextMenuEl || this._contextMenuEl.classList.contains('hidden')) return;
    if (e.target.closest('.inv-context-menu')) return;
    if (e.target.closest('.inv-context-btn')) return;
    if (e.target.closest('.inv-item-slot, .inv-chest-slot, .inv-weapon-slot') === this._contextAnchorEl) return;
    this._hideContextMenu();
  }

  static fallbackImage() {
    const c = document.createElement('canvas');
    c.width = 520;
    c.height = 340;
    const g = c.getContext('2d');
    g.fillStyle = '#141c18';
    g.fillRect(0, 0, 520, 340);
    g.strokeStyle = '#f0a030';
    g.lineWidth = 3;
    g.strokeRect(6, 6, 508, 328);
    g.fillStyle = '#1e2a24';
    g.fillRect(16, 40, 200, 280);
    g.fillRect(228, 40, 276, 280);
    g.fillStyle = '#f0a030';
    g.font = 'bold 14px monospace';
    g.textAlign = 'left';
    g.fillText('GEAR', 24, 32);
    g.fillText('ITEMS', 236, 32);
    return c.toDataURL('image/png');
  }

  static fallbackCraftImage() {
    const c = document.createElement('canvas');
    c.width = 380;
    c.height = Math.round(380 * 170 / 260);
    const g = c.getContext('2d');
    g.fillStyle = '#141c18';
    g.fillRect(0, 0, 380, c.height);
    g.strokeStyle = '#c8a860';
    g.lineWidth = 3;
    g.strokeRect(6, 6, 368, c.height - 12);
    g.fillStyle = '#1a2620';
    g.fillRect(14, 28, 352, c.height - 40);
    return c.toDataURL('image/png');
  }

  static fallbackChestImage() {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 220;
    const g = c.getContext('2d');
    g.fillStyle = '#141c18';
    g.fillRect(0, 0, 300, 220);
    g.strokeStyle = '#b4322d';
    g.lineWidth = 3;
    g.strokeRect(6, 6, 288, 208);
    g.fillStyle = '#1c2622';
    g.fillRect(16, 36, 268, 168);
    g.fillStyle = '#c8a860';
    g.font = 'bold 14px monospace';
    g.textAlign = 'left';
    g.fillText('CHEST', 24, 28);
    return c.toDataURL('image/png');
  }

  isOpen() { return this.open; }
  isChestMode() { return this.chestMode; }
  isCraftOpen() { return this.craftOpen; }

  toggleCraftPanel() {
    if (!this.open) return;
    this.craftOpen = !this.craftOpen;
    this.root?.classList.toggle('craft-open', this.craftOpen);
    this.craftToggleBtn?.setAttribute('aria-expanded', String(this.craftOpen));
    if (this.craftOpen) this._renderCraftPanel(this.game.player);
    this._syncCraftPickerLayoutSoon();
  }

  _setCraftOpen(open) {
    this.craftOpen = !!open;
    this.root?.classList.toggle('craft-open', this.craftOpen);
    this.craftToggleBtn?.setAttribute('aria-expanded', String(this.craftOpen));
  }

  toggle() {
    if (this.animating) return;
    if (this.open) this.close();
    else this.openPanel();
  }

  openPanel() {
    if (!this.running() || this.animating) return;
    this.chestMode = false;
    this.chest = null;
    this._setChestLayout(false);
    this._openUi();
  }

  openChest(chest) {
    if (!this.running() || this.animating || !chest) return;
    const inRange = chest.isCorpse
      ? this.game.corpses?.isInInteractRange(this.game.player, chest)
      : this.game.chests?.isInInteractRange(this.game.player, chest);
    if (!inRange) return;
    this.chestMode = true;
    this.chest = chest;
    if (!chest.isCorpse) {
      chest.opened = true;
      this.game.audio?.chestOpen();
    }
    this._setChestLayout(true);
    this._openUi();
  }

  _openUi() {
    this.open = true;
    this.animating = true;
    this.selectedSlot = null;
    this.selectedChestSlot = null;
    this.game.player?.melee && (this.game.player.melee.charging = false);
    this.game.mouseDown = false;
    this.game.prevMouseDown = false;
    this.root?.classList.remove('hidden');
    document.activeElement?.blur?.();
    this._enableInvCursor();
    this._syncCraftBtnLabel();
    this._syncCraftToggleLabel();
    this.render();
    this._syncMobilePanelScaleSoon();
    this._prewarmInventoryIcons().then(() => {
      if (this.open && !this.drag?.moved) this.render();
    });
    requestAnimationFrame(() => {
      this.root?.classList.add('open');
      setTimeout(() => { this.animating = false; }, ANIM_MS);
    });
  }

  _setChestLayout(chestMode) {
    if (chestMode) {
      this.root?.classList.add('chest-mode');
      this.chestPanelRoot?.classList.remove('hidden');
    } else {
      this.root?.classList.remove('chest-mode');
      this.chestPanelRoot?.classList.add('hidden');
    }
    this._syncMobilePanelScaleSoon();
  }

  close() {
    if (!this.open || this.animating) return;
    this._cancelDrag();
    this._hideContextMenu();
    this._disableInvCursor();
    this.animating = true;
    this.selectedSlot = null;
    this.selectedChestSlot = null;
    this.chestMode = false;
    this.chest = null;
    this._setCraftOpen(false);
    this._setChestLayout(false);
    this.root?.classList.remove('open');
    setTimeout(() => {
      this.root?.classList.add('hidden');
      this.open = false;
      this.animating = false;
    }, ANIM_MS);
  }

  forceClose() {
    this._cancelDrag();
    this._hideContextMenu();
    this._disableInvCursor();
    this.open = false;
    this.chestMode = false;
    this.chest = null;
    this.animating = false;
    this.selectedSlot = null;
    this.selectedChestSlot = null;
    this._setCraftOpen(false);
    this._setChestLayout(false);
    this.root?.classList.remove('open');
    this.root?.classList.add('hidden');
  }

  running() {
    return this.game.running && this.game.player?.alive;
  }

  _makeSlot(className, extra = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `${className} inv-slot-sprite ${extra}`.trim();
    return el;
  }

  _makeCraftPickSlot() {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'inv-craft-pick-slot';
    const inner = document.createElement('span');
    inner.className = 'inv-craft-pick-inner';
    el.appendChild(inner);
    return el;
  }

  _makeCraftCostSlot() {
    const el = document.createElement('div');
    el.className = 'inv-craft-cost-slot';
    const inner = document.createElement('span');
    inner.className = 'inv-craft-cost-inner';
    el.appendChild(inner);
    return el;
  }

  _ensureCraftPickerResizeObserver() {
    if (this._craftPickerResizeObs || !this.craftPickerEl) return;
    this._craftPickerResizeObs = new ResizeObserver(() => this._syncCraftPickerLayout());
    this._craftPickerResizeObs.observe(this.craftPickerEl);
    if (this.craftCostGridEl) this._craftPickerResizeObs.observe(this.craftCostGridEl);
  }

  _syncCraftPickerLayout() {
    if (!this.craftOpen) return;
    const picker = this.craftPickerEl;
    if (picker) {
      const width = picker.clientWidth;
      if (width > 0) {
        const scrollbarAllowance = picker.scrollHeight > picker.clientHeight ? 10 : 0;
        const cell = Math.max(
          36,
          Math.floor((width - scrollbarAllowance - CRAFT_PICK_GAP_PX * (CRAFT_PICK_COLS - 1)) / CRAFT_PICK_COLS),
        );
        picker.style.setProperty('--craft-pick-cell', `${cell}px`);
      }
    }
    const costGrid = this.craftCostGridEl;
    if (costGrid) {
      const width = costGrid.clientWidth;
      if (width > 0) {
        const gap = 5;
        const cell = Math.max(36, Math.floor((width - gap * (CRAFT_MAX_MATERIALS - 1)) / CRAFT_MAX_MATERIALS));
        costGrid.style.setProperty('--craft-cost-cell', `${cell}px`);
      }
    }
  }

  _syncCraftPickerLayoutSoon() {
    requestAnimationFrame(() => {
      this._syncCraftPickerLayout();
      requestAnimationFrame(() => {
        this._syncCraftPickerLayout();
        this._syncMobilePanelScale();
      });
    });
  }

  _ensureMobileScaleObserver() {
    if (!this.game.mobile || this._mobileScaleObs) return;
    const onResize = () => this._syncMobilePanelScale();
    this._mobileScaleObs = new ResizeObserver(onResize);
    if (this.dualWrap) this._mobileScaleObs.observe(this.dualWrap);
    window.addEventListener('resize', onResize);
    this._mobileScaleOnResize = onResize;
  }

  _syncMobilePanelScale() {
    if (!this.game.mobile || !this.dualWrap) {
      this.dualWrap?.style.removeProperty('--inv-mobile-scale');
      return;
    }
    this.dualWrap.style.setProperty('--inv-mobile-scale', '1');
    const w = this.dualWrap.offsetWidth;
    const h = this.dualWrap.offsetHeight;
    if (w <= 0 || h <= 0) return;
    const padX = 16;
    const padTop = 40;
    const padBottom = 150;
    const maxW = window.innerWidth - padX * 2;
    const maxH = window.innerHeight - padTop - padBottom;
    const scale = Math.min(1, maxW / w, maxH / h);
    this.dualWrap.style.setProperty('--inv-mobile-scale', String(Math.max(0.32, scale)));
  }

  _syncMobilePanelScaleSoon() {
    requestAnimationFrame(() => {
      this._syncMobilePanelScale();
      requestAnimationFrame(() => this._syncMobilePanelScale());
    });
  }

  _setSlotLabel(slot, text, scale = PIXEL_TEXT_SCALE_XS) {
    slot.textContent = '';
    slot.classList.add('inv-empty-slot');
    slot.appendChild(createPixelTextImg(text, scale));
  }

  _syncCraftBtnLabel() {
    if (!this.craftBtnEl) return;
    this.craftBtnEl.setAttribute('aria-label', 'Craft');
    setElementPixelText(this.craftBtnEl, 'Craft', PIXEL_TEXT_SCALE_SM);
  }

  _syncCraftToggleLabel() {
    if (!this.craftToggleBtn) return;
    this.craftToggleBtn.setAttribute('aria-label', 'Toggle crafting');
    this.craftToggleBtn.classList.add('pixel-text-host');
    setElementPixelText(this.craftToggleBtn, 'Crafting', PIXEL_TEXT_SCALE_XS);
  }

  _contextDetailText(item) {
    const full = getItemDescription(item);
    const name = getItemDisplayName(item);
    const baseName = name.replace(/\s+x\d+$/i, '').trim();
    if (baseName && full.startsWith(baseName)) {
      const rest = full.slice(baseName.length).replace(/^\s*[—–-]\s*/, '').trim();
      if (rest) return rest;
    }
    if (name && full.startsWith(name)) {
      const rest = full.slice(name.length).replace(/^\s*[—–-]\s*/, '').trim();
      if (rest) return rest;
    }
    return full;
  }

  _canDropOnEquipment() {
    const data = this._dragItemData();
    return isEquipmentItem(data);
  }

  _handZoneName(handIndex) {
    return handIndex === 1 ? 'hand1' : 'hand0';
  }

  _handIndexFromZone(zone) {
    if (zone === 'hand1' || zone === 'melee') return 1;
    if (zone === 'hand0' || zone === 'main') return 0;
    return -1;
  }

  _legacyZone(zone) {
    const hand = this._handIndexFromZone(zone);
    if (hand === 0) return 'main';
    if (hand === 1) return 'melee';
    return zone;
  }

  _itemForContainer(container, index, player) {
    const hand = this._handIndexFromZone(container);
    if (hand >= 0) return player?.getHandSlotItem(hand);
    if (container === 'quick') return player?.quickSlot ? normalizeConsumableItem(player.quickSlot) : null;
    if (container === 'throwable') return player?.throwableSlot ?? null;
    if (container === 'equipment') return player?.equipmentSlots[index] ?? null;
    if (container === 'chest') return this.chest?.slots[index] ?? null;
    return player?.itemSlots[index] ?? null;
  }

  _canDropOnHand(handIndex) {
    const data = this._dragItemData();
    return !!(data && (data.kind === 'weapon' || data.kind === 'melee')
      && (data.kind !== 'weapon' || WEAPONS[data.key])
      && (data.kind !== 'melee' || MELEE_WEAPONS[data.key]));
  }

  _canDropOnQuick() {
    const data = this._dragItemData();
    return isQuickEquipItem(data);
  }

  _canDropOnThrowable() {
    const data = this._dragItemData();
    return isThrowableItem(data);
  }

  _slotIcon(src) {
    const bank = this.game.sprites;
    const dataUrl = bank?.getIconDataUrl?.(src);
    const img = document.createElement('img');
    img.className = 'inv-slot-icon';
    img.alt = '';
    img.draggable = false;
    img.loading = 'eager';
    img.decoding = 'sync';
    img.src = dataUrl || src;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    return img;
  }

  _collectInventoryIconPaths() {
    const paths = new Set([INV_LOCK_SRC]);
    const player = this.game.player;
    if (!player) return paths;
    for (let h = 0; h < HAND_SLOT_COUNT; h++) {
      const handItem = player.getHandSlotItem(h);
      if (handItem) {
        const src = getItemIconSrc(handItem);
        if (src) paths.add(src);
      }
    }
    if (player.quickSlot) {
      const src = getItemIconSrc(player.quickSlot);
      if (src) paths.add(src);
    }
    if (player.throwableSlot) {
      const src = getItemIconSrc(player.throwableSlot);
      if (src) paths.add(src);
    }
    for (const item of player.itemSlots) {
      if (item) {
        const src = getItemIconSrc(item);
        if (src) paths.add(src);
      }
    }
    if (this.chest?.slots) {
      for (const item of this.chest.slots) {
        if (item) {
          const src = getItemIconSrc(item);
          if (src) paths.add(src);
        }
      }
    }
    for (const recipe of CRAFT_RECIPES) {
      const outSrc = getItemIconSrc(recipe.output);
      if (outSrc) paths.add(outSrc);
      for (const costItem of recipeMaterialCosts(recipe)) {
        const costSrc = getItemIconSrc(costItem);
        if (costSrc) paths.add(costSrc);
      }
    }
    return paths;
  }

  async _prewarmInventoryIcons() {
    const bank = this.game.sprites;
    if (!bank) return;
    await bank.ensurePaths(this._collectInventoryIconPaths());
  }

  _appendStackCount(slot, amount) {
    if (!amount || amount <= 1) return;
    const label = createPixelTextImg(String(amount), PIXEL_TEXT_SCALE);
    label.className = 'inv-stack-count inv-pixel-text-img';
    slot.appendChild(label);
  }

  _stackAmount(data) {
    if (data?.kind === 'ammo') return data.amount;
    if (data?.kind === 'consumable' || data?.kind === 'bandage') return data.amount ?? 1;
    if (data?.kind === 'material') return data.amount ?? 1;
    if (data?.kind === 'throwable') return data.amount ?? 1;
    return 0;
  }

  _weaponIcon(sprite) {
    return this._slotIcon(weaponItemSpritePath(sprite));
  }

  _itemIcon(item) {
    return this._slotIcon(getItemIconSrc(item));
  }

  _lockIcon() {
    return this._slotIcon(INV_LOCK_SRC);
  }

  _bindTooltip(slot, text) {
    if (!text) return;
    const show = (e) => {
      if (this._isContextMenuOpen()) return;
      this._hoverTooltipText = text;
      this._showTooltipAt(e.clientX, e.clientY, text);
    };
    const move = (e) => {
      if (this._isContextMenuOpen()) return;
      if (this._hoverTooltipText !== text) return;
      this._showTooltipAt(e.clientX, e.clientY, text);
    };
    const hide = () => {
      if (this._hoverTooltipText === text) this._hoverTooltipText = null;
      this._hideTooltip();
    };
    slot.addEventListener('pointerenter', show);
    slot.addEventListener('pointermove', move);
    slot.addEventListener('pointerleave', hide);
  }

  _isContextMenuOpen() {
    return !!this._contextSlot && !this._contextMenuEl?.classList.contains('hidden');
  }

  _ensureInvCursor() {
    if (this._cursorEl) return;
    this._cursorEl = document.createElement('img');
    this._cursorEl.className = 'inv-cursor-follow';
    this._cursorEl.src = INV_CURSOR_SRC;
    this._cursorEl.alt = '';
    this._cursorEl.draggable = false;
    document.body.appendChild(this._cursorEl);
  }

  _enableInvCursor() {
    if (this.game.mobile) return;
    this._ensureInvCursor();
    this.root?.classList.add('inv-custom-cursor');
    document.body.classList.add('inv-custom-cursor');
    document.addEventListener('pointermove', this._onInvPointerMove);
  }

  _disableInvCursor() {
    document.removeEventListener('pointermove', this._onInvPointerMove);
    this.root?.classList.remove('inv-custom-cursor');
    document.body.classList.remove('inv-custom-cursor');
    this._hoverTooltipText = null;
    this._hideTooltip();
    if (this._cursorEl) this._cursorEl.style.visibility = 'hidden';
  }

  _moveInvCursor(e) {
    if (!this.open || !this._cursorEl || this.game.mobile) return;
    this._syncInvCursorAt(e.clientX, e.clientY);
    if (this._hoverTooltipText && !this._isContextMenuOpen()) {
      this._showTooltipAt(e.clientX, e.clientY, this._hoverTooltipText);
    }
  }

  _showTooltipAt(clientX, clientY, text) {
    if (!text) return;
    if (!this._tooltipEl) {
      this._tooltipEl = document.createElement('div');
      this._tooltipEl.className = 'inv-tooltip';
      document.body.appendChild(this._tooltipEl);
    }
    setElementPixelText(this._tooltipEl, text, PIXEL_TEXT_SCALE);
    this._tooltipEl.classList.add('visible');
    this._tooltipEl.style.visibility = 'hidden';
    this._tooltipEl.style.left = '0';
    this._tooltipEl.style.top = '0';
    const tip = this._tooltipEl.getBoundingClientRect();
    let left = clientX - tip.width / 2;
    let top = clientY - tip.height - 16;
    if (top < 8) top = clientY + 20;
    left = Math.max(8, Math.min(left, window.innerWidth - tip.width - 8));
    this._tooltipEl.style.left = `${left}px`;
    this._tooltipEl.style.top = `${top}px`;
    this._tooltipEl.style.visibility = 'visible';
  }

  _hideTooltip() {
    if (!this._tooltipEl) return;
    this._tooltipEl.classList.remove('visible');
    this._tooltipEl.style.visibility = 'hidden';
  }

  _ensureContextMenu() {
    if (this._contextMenuEl) return;
    const el = document.createElement('div');
    el.className = 'inv-context-menu hidden';
    el.innerHTML = `
      <p class="inv-context-title"></p>
      <p class="inv-context-desc"></p>
      <div class="inv-context-actions"></div>
    `;
    el.addEventListener('pointerleave', (e) => this._onContextMenuPointerLeave(e));
    document.body.appendChild(el);
    this._contextMenuEl = el;
  }

  _onContextMenuPointerLeave(e) {
    if (this.game.mobile) return;
    if (!this._contextSlot || this._contextMenuEl?.classList.contains('hidden')) return;
    const next = e.relatedTarget;
    if (next && (next === this._contextAnchorEl || this._contextAnchorEl?.contains(next))) return;
    this._hideContextMenu();
  }

  _onContextSlotPointerLeave(e) {
    if (this.game.mobile) return;
    if (!this._contextSlot || this._contextAnchorEl !== e.currentTarget) return;
    const next = e.relatedTarget;
    if (next?.closest?.('.inv-context-menu')) return;
    this._hideContextMenu();
  }

  _bindContextAction(btn, handler) {
    const run = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      handler();
    };
    btn.addEventListener('pointerup', run);
  }

  _setBtnLabel(btn, text, scale = PIXEL_TEXT_SCALE) {
    if (!btn) return;
    setElementPixelText(btn, text, scale);
    btn.classList.add('inv-pixel-text-btn');
  }

  _makeAmountSliderRow(labelPrefix, amount, maxAmount, onAmountChange) {
    const row = document.createElement('div');
    row.className = 'inv-context-amount-row';
    const label = document.createElement('span');
    label.className = 'inv-context-amount-label';
    const setLabel = (next) => setElementPixelText(label, `${labelPrefix}: ${next}`, PIXEL_TEXT_SCALE);
    setLabel(amount);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'inv-context-amount-slider';
    slider.min = '1';
    slider.max = String(maxAmount);
    slider.step = '1';
    slider.value = String(amount);
    slider.addEventListener('input', () => {
      const next = Math.max(1, Math.min(maxAmount, Number(slider.value) | 0));
      slider.value = String(next);
      setLabel(next);
      onAmountChange(next);
    });
    row.appendChild(label);
    row.appendChild(slider);
    return { row, slider, label };
  }

  _renderRecycleYieldIcons(container, yields) {
    container.innerHTML = '';
    for (const entry of yields ?? []) {
      const matItem = { kind: 'material', key: entry.key, amount: entry.amount };
      const icon = this._slotIcon(getItemIconSrc(matItem));
      icon.classList.add('inv-context-recycle-icon');
      container.appendChild(icon);
    }
  }

  _getContextAnchorEl(container, index) {
    const hand = this._handIndexFromZone(container);
    if (hand >= 0) {
      return this.weaponsEl?.querySelector(`[data-drop-zone="${this._handZoneName(hand)}"]`);
    }
    if (container === 'quick') return this.weaponsEl?.querySelector('[data-drop-zone="quick"]');
    if (container === 'throwable') return this.weaponsEl?.querySelector('[data-drop-zone="throwable"]');
    if (container === 'equipment') {
      return this.equipmentEl?.querySelector(`.inv-equip-slot[data-slot-index="${index}"]`);
    }
    const root = container === 'chest' ? this.chestEl : this.itemsEl;
    const cls = container === 'chest' ? 'inv-chest-slot' : 'inv-item-slot';
    return root?.querySelector(`.${cls}[data-slot-index="${index}"]`);
  }

  _reopenContextMenu() {
    if (!this._contextSlot || this._contextMenuEl?.classList.contains('hidden')) return;
    const { container, index } = this._contextSlot;
    const anchor = this._getContextAnchorEl(container, index);
    if (!anchor) {
      this._hideContextMenu();
      return;
    }
    const player = this.game.player;
    const item = this._itemForContainer(container, index, player);
    if (!item) {
      this._hideContextMenu();
      return;
    }
    this._contextAnchorEl = anchor;
    this._refreshContextMenuContent(container, index, anchor);
    this._positionContextMenu(anchor);
  }

  _renderAfterContextAction() {
    this.render({ keepContextMenu: true });
  }

  _hideContextMenu() {
    this._contextSlot = null;
    this._contextAnchorEl = null;
    if (!this._contextMenuEl) return;
    this._contextMenuEl.classList.add('hidden');
  }

  _positionContextMenu(anchorEl) {
    if (!this._contextMenuEl || !anchorEl) return;
    const overlap = 6;
    const slotRect = anchorEl.getBoundingClientRect();
    this._contextMenuEl.style.visibility = 'hidden';
    this._contextMenuEl.classList.remove('hidden');
    const menuRect = this._contextMenuEl.getBoundingClientRect();

    let left = slotRect.right - overlap;
    let top = slotRect.top + (slotRect.height - menuRect.height) * 0.5;

    if (left + menuRect.width > window.innerWidth - 8) {
      left = slotRect.left - menuRect.width + overlap;
    }
    if (top + menuRect.height > window.innerHeight - 8) {
      top = window.innerHeight - menuRect.height - 8;
    }
    if (top < 8) top = 8;
    left = Math.max(8, left);

    this._contextMenuEl.style.left = `${left}px`;
    this._contextMenuEl.style.top = `${top}px`;
    this._contextMenuEl.style.visibility = 'visible';
  }

  _showContextMenu(e, container, index, anchorEl) {
    const player = this.game.player;
    const item = this._itemForContainer(container, index, player);
    if (!item || !anchorEl) return;

    e?.preventDefault?.();
    e?.stopPropagation?.();
    this._hoverTooltipText = null;
    this._hideTooltip();
    this._ensureContextMenu();
    this._contextSlot = { container, index };
    this._contextAnchorEl = anchorEl;
    this._refreshContextMenuContent(container, index, anchorEl);
    this._positionContextMenu(anchorEl);
    this._refreshContextMenuContent(container, index, anchorEl);
    if (e) this._syncInvCursorAt(e.clientX, e.clientY);
  }

  _refreshContextMenuContent(container, index, anchorEl) {
    const player = this.game.player;
    const item = this._itemForContainer(container, index, player);
    if (!item || !anchorEl) return;

    const handIndex = this._handIndexFromZone(container);
    const isEquippedHand = handIndex >= 0;

    const title = this._contextMenuEl.querySelector('.inv-context-title');
    const desc = this._contextMenuEl.querySelector('.inv-context-desc');
    const actions = this._contextMenuEl.querySelector('.inv-context-actions');
    const maxTextW = Math.max(160, Math.min(292, (this._contextMenuEl.offsetWidth || 220) - 28));
    setElementWrappedPixelText(title, getItemDisplayName(item), maxTextW, PIXEL_TEXT_SCALE_SM);
    setElementWrappedPixelText(desc, this._contextDetailText(item), maxTextW, PIXEL_TEXT_SCALE_XS);
    actions.innerHTML = '';

    if (item.kind === 'weapon' && WEAPONS[item.key]) {
      if (container === 'item') {
        const equipBtn = document.createElement('button');
        equipBtn.type = 'button';
        equipBtn.className = 'inv-context-btn';
        this._setBtnLabel(equipBtn, 'Equip');
        this._bindContextAction(equipBtn, () => {
          this._contextEquipWeapon(index, container);
        });
        actions.appendChild(equipBtn);
      }

      const magAmmo = Math.max(0, Math.floor(item.ammo ?? 0));
      if (magAmmo > 0 && (container === 'item' || container === 'chest' || isEquippedHand)) {
        const ammoBtn = document.createElement('button');
        ammoBtn.type = 'button';
        ammoBtn.className = 'inv-context-btn';
        this._setBtnLabel(ammoBtn, 'Take ammo');
        this._bindContextAction(ammoBtn, () => {
          if (isEquippedHand && handIndex === player.activeHandSlot) {
            const result = player.takeAmmoFromEquippedGun();
            if (result.ok) {
              this.game.items.setPickupMsg(`+${result.taken} ammo`);
              this.game.audio.pickup();
            }
          } else if (isEquippedHand) {
            const handItem = player.getHandSlotItem(handIndex);
            const result = player.takeLoadedAmmoFromWeapon(handItem);
            if (result.ok) {
              this.game.items.setPickupMsg(`+${result.taken} ammo`);
              this.game.audio.pickup();
            }
          } else {
            this._contextTakeAmmo(index, container);
            return;
          }
          this._renderAfterContextAction();
        });
        actions.appendChild(ammoBtn);
      }
    } else if (item.kind === 'melee' && MELEE_WEAPONS[item.key]) {
      if (container === 'item' || container === 'chest') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inv-context-btn';
        this._setBtnLabel(btn, 'Equip');
        this._bindContextAction(btn, () => {
          this._contextEquipMelee(index, container);
        });
        actions.appendChild(btn);
      }
    } else if (isEquipmentItem(item) && container === 'item') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inv-context-btn';
      this._setBtnLabel(btn, 'Equip');
      this._bindContextAction(btn, () => {
        const empty = player.equipmentSlots.findIndex((s) => s == null);
        const target = empty >= 0 ? empty : 0;
        if (player.equipEquipmentFromInventory(index, target)) this.game.audio?.inventoryEquip();
        this._renderAfterContextAction();
      });
      actions.appendChild(btn);
    } else if (isQuickEquipItem(item) && container === 'item') {
      const quickBtn = document.createElement('button');
      quickBtn.type = 'button';
      quickBtn.className = 'inv-context-btn';
      this._setBtnLabel(quickBtn, 'Quick equip');
      this._bindContextAction(quickBtn, () => {
        if (player.equipQuickFromInventory(index)) this.game.audio?.inventoryEquip();
        this._renderAfterContextAction();
      });
      actions.appendChild(quickBtn);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inv-context-btn';
      this._setBtnLabel(btn, 'Use');
      this._bindContextAction(btn, () => {
        this._useConsumable(this.game.player, index);
        this._renderAfterContextAction();
      });
      actions.appendChild(btn);
    } else if (isThrowableItem(item) && container === 'item') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inv-context-btn';
      this._setBtnLabel(btn, 'Throwable slot');
      this._bindContextAction(btn, () => {
        if (player.equipThrowableFromInventory(index)) this.game.audio?.inventoryEquip();
        this._renderAfterContextAction();
      });
      actions.appendChild(btn);
    }

    if (canRecycleItem(item) && container === 'item') {
      const maxRecycle = this._stackAmountForSplit(item);
      let recycleCount = 1;
      const row = document.createElement('div');
      row.className = 'inv-context-recycle-row';
      const icons = document.createElement('div');
      icons.className = 'inv-context-recycle-icons';
      this._renderRecycleYieldIcons(icons, getRecycleYields(item, recycleCount));
      row.appendChild(icons);
      if (maxRecycle > 1) {
        const { row: amountRow } = this._makeAmountSliderRow('Recycle', recycleCount, maxRecycle, (next) => {
          recycleCount = next;
          this._renderRecycleYieldIcons(icons, getRecycleYields(item, recycleCount));
        });
        row.appendChild(amountRow);
      }
      const recycleBtn = document.createElement('button');
      recycleBtn.type = 'button';
      recycleBtn.className = 'inv-context-btn';
      this._setBtnLabel(recycleBtn, 'Recycle');
      this._bindContextAction(recycleBtn, () => {
        if (this._tryRecycleItem(index, container, recycleCount)) {
          this._renderAfterContextAction();
        }
      });
      row.appendChild(recycleBtn);
      actions.appendChild(row);
    }

    if (this._canSplitStack(item) && (container === 'item' || container === 'chest')) {
      const total = this._stackAmountForSplit(item);
      const maxSplit = total - 1;
      let splitAmount = Math.max(1, Math.floor(total / 2));
      const splitRow = document.createElement('div');
      splitRow.className = 'inv-context-split-row';
      const splitBtn = document.createElement('button');
      splitBtn.type = 'button';
      splitBtn.className = 'inv-context-btn';
      this._setBtnLabel(splitBtn, 'Split');
      this._bindContextAction(splitBtn, () => {
        if (!this._splitStack(container, index, splitAmount)) {
          this.game.items.setPickupMsg('No empty slot', { error: true });
        }
        this._renderAfterContextAction();
      });
      if (maxSplit > 1) {
        const { row: amountRow } = this._makeAmountSliderRow('Split', splitAmount, maxSplit, (next) => {
          splitAmount = next;
        });
        splitRow.appendChild(amountRow);
      }
      splitRow.appendChild(splitBtn);
      actions.appendChild(splitRow);
    }
  }

  _syncInvCursorAt(clientX, clientY) {
    if (!this.open || !this._cursorEl || this.game.mobile) return;
    this._cursorEl.style.visibility = 'visible';
    this._cursorEl.style.left = `${clientX}px`;
    this._cursorEl.style.top = `${clientY}px`;
  }

  _isStackableItem(item) {
    return item?.kind === 'ammo' || item?.kind === 'bandage' || item?.kind === 'material';
  }

  _groupStacksInContainer(container, focusIndex) {
    const slots = container === 'chest' ? this.chest?.slots : this.game.player?.itemSlots;
    if (!slots) return;
    const focus = slots[focusIndex];
    if (!this._isStackableItem(focus)) return;

    let total = focus.kind === 'bandage' || focus.kind === 'material'
      ? (focus.amount ?? 1)
      : (focus.amount ?? 0);
    for (let i = 0; i < slots.length; i++) {
      if (i === focusIndex) continue;
      const s = slots[i];
      const matches = focus.kind === 'bandage'
        ? bandageItemsMatch(s, focus)
        : focus.kind === 'material'
          ? materialItemsMatch(s, focus)
          : ammoItemsMatch(s, focus);
      if (!matches) continue;
      total += focus.kind === 'bandage' || focus.kind === 'material'
        ? (s.amount ?? 1)
        : (s.amount ?? 0);
      slots[i] = null;
    }

    const stackMax = focus.kind === 'bandage'
      ? BANDAGE_STACK_MAX
      : focus.kind === 'material'
        ? MATERIAL_STACK_MAX
        : AMMO_STACK_MAX;
    const inFocus = Math.min(stackMax, total);
    if (focus.kind === 'bandage') {
      slots[focusIndex] = { kind: 'bandage', amount: inFocus };
    } else if (focus.kind === 'material') {
      slots[focusIndex] = { kind: 'material', key: focus.key, amount: inFocus };
    } else {
      slots[focusIndex] = { kind: 'ammo', ammoType: focus.ammoType, amount: inFocus };
    }
    total -= inFocus;

    while (total > 0) {
      const empty = this._findEmptySlot(slots, container, -1);
      if (empty < 0) break;
      const add = Math.min(stackMax, total);
      if (focus.kind === 'bandage') {
        slots[empty] = { kind: 'bandage', amount: add };
      } else if (focus.kind === 'material') {
        slots[empty] = { kind: 'material', key: focus.key, amount: add };
      } else {
        slots[empty] = { kind: 'ammo', ammoType: focus.ammoType, amount: add };
      }
      total -= add;
    }

    this.game.audio?.inventoryMove();
  }

  _stackAmountForSplit(item) {
    if (item?.kind === 'ammo') return item.amount ?? 0;
    if (item?.kind === 'bandage') return item.amount ?? 1;
    if (item?.kind === 'material') return item.amount ?? 1;
    return 0;
  }

  _canSplitStack(item) {
    return this._isStackableItem(item) && this._stackAmountForSplit(item) > 1;
  }

  _findEmptySlot(slots, container, skipIndex) {
    const player = this.game.player;
    for (let i = 0; i < slots.length; i++) {
      if (i === skipIndex || slots[i] != null) continue;
      if (container === 'item' && !player?.isItemSlotUnlocked(i)) continue;
      return i;
    }
    return -1;
  }

  _splitStack(container, index, splitOff = null) {
    const slots = container === 'chest' ? this.chest?.slots : this.game.player?.itemSlots;
    if (!slots) return false;
    const item = slots[index];
    if (!this._canSplitStack(item)) return false;

    const total = this._stackAmountForSplit(item);
    if (splitOff == null) splitOff = total - Math.ceil(total / 2);
    splitOff = Math.max(1, Math.min(total - 1, Math.floor(splitOff)));
    const keep = total - splitOff;
    if (splitOff <= 0 || keep <= 0) return false;

    const emptyIdx = this._findEmptySlot(slots, container, index);
    if (emptyIdx < 0) return false;

    if (item.kind === 'ammo') {
      slots[index] = { kind: 'ammo', ammoType: item.ammoType, amount: keep };
      slots[emptyIdx] = { kind: 'ammo', ammoType: item.ammoType, amount: splitOff };
    } else if (item.kind === 'bandage') {
      slots[index] = { kind: 'bandage', amount: keep };
      slots[emptyIdx] = { kind: 'bandage', amount: splitOff };
    } else if (item.kind === 'material') {
      slots[index] = { kind: 'material', key: item.key, amount: keep };
      slots[emptyIdx] = { kind: 'material', key: item.key, amount: splitOff };
    } else {
      return false;
    }

    this.game.audio?.inventoryMove();
    return true;
  }

  _bindStackDoubleClick(slot, container, index, item) {
    if (!this._isStackableItem(item)) return;

    const group = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._stackTapKey = null;
      this._hideContextMenu();
      this._groupStacksInContainer(container, index);
      this.render();
    };

    slot.addEventListener('dblclick', (e) => {
      if (this.game.mobile) return;
      group(e);
    });

    if (this.game.mobile) {
      const tapKey = `${container}:${index}`;
      slot.addEventListener('click', (e) => {
        if (slot.disabled || this._skipClick || this.drag) return;
        const now = performance.now();
        if (this._stackTapKey === tapKey && now - this._stackTapAt < 400) {
          group(e);
          return;
        }
        this._stackTapKey = tapKey;
        this._stackTapAt = now;
      }, true);
    }
  }

  _contextEquipWeapon(index, container) {
    const player = this.game.player;
    if (!player) return;
    if (container === 'item') {
      player.swapItemSlotWithMain(index);
      this.game.audio?.inventoryEquip();
    } else if (container === 'chest' && this.chest) {
      const item = this.chest.slots[index];
      if (!item) return;
      player.equipWeaponFromChest(this.chest.slots, index, item);
      this.game.audio?.inventoryEquip();
    }
    this._hideContextMenu();
    this.render();
  }

  _contextEquipMelee(index, container) {
    const player = this.game.player;
    if (!player) return;
    if (container === 'item') {
      player.equipMeleeFromSlot(index);
      this.game.audio?.inventoryEquip();
    } else if (container === 'chest' && this.chest) {
      const item = this.chest.slots[index];
      if (!item) return;
      player.equipMeleeFromChest(this.chest.slots, index, item);
      this.game.audio?.inventoryEquip();
    }
    this._hideContextMenu();
    this.render();
  }

  _contextTakeAmmo(index, container) {
    const player = this.game.player;
    if (!player) return;
    const item = container === 'chest'
      ? this.chest?.slots[index]
      : player.itemSlots[index];
    if (!item) return;
    const result = player.takeLoadedAmmoFromWeapon(item);
    if (result.ok) {
      this.game.items.setPickupMsg(`+${result.taken} ammo`);
      this.game.audio.pickup();
    }
    this._renderAfterContextAction();
  }

  _bindContextMenu(slot, container, index) {
    slot.addEventListener('contextmenu', (e) => {
      if (slot.disabled) return;
      const player = this.game.player;
      if (!this._itemForContainer(container, index, player)) return;
      this._showContextMenu(e, container, index, slot);
    });
    slot.addEventListener('pointerleave', (e) => this._onContextSlotPointerLeave(e));
    if (this.game.mobile) {
      slot.addEventListener('click', (e) => {
        if (slot.disabled || this._skipClick || this.drag) return;
        const player = this.game.player;
        const item = this._itemForContainer(container, index, player);
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        this._showContextMenu(e, container, index, slot);
      });
    }
  }

  _useConsumable(player, index) {
    const item = player.itemSlots[index];
    const normalized = normalizeConsumableItem(item);
    if (!normalized) return false;
    const heal = getConsumableHealAmount(normalized.key);
    if (heal <= 0) return false;
    if (player.health >= player.maxHealth) {
      this.game.items.setPickupMsg('Already at full health', { error: true });
      return false;
    }
    if (!player.heal(heal)) return false;
    const left = (normalized.amount ?? 1) - 1;
    if (left <= 0) player.itemSlots[index] = null;
    else player.itemSlots[index] = { kind: 'consumable', key: normalized.key, amount: left };
    this.game.items.setPickupMsg(`+${heal} HP`);
    this.game.audio.pickup();
    return true;
  }

  _tryRecycleItem(index, container = 'item', count = 1) {
    if (container !== 'item') return false;
    const player = this.game.player;
    const item = player?.itemSlots[index];
    if (!item || !canRecycleItem(item)) {
      this.game.items?.setPickupMsg?.('Cannot recycle that item', { error: true });
      return false;
    }
    const maxCount = this._stackAmountForSplit(item);
    const recycleCount = Math.max(1, Math.min(maxCount, Math.floor(count)));
    const yields = getRecycleYields(item, recycleCount);
    if (!canStoreRecycleYields(player, yields)) {
      this.game.items?.setPickupMsg?.('Not enough inventory space', { error: true });
      return false;
    }
    if (item.kind === 'material' || item.kind === 'bandage' || item.kind === 'ammo') {
      const amount = item.amount ?? 1;
      if (amount <= recycleCount) player.itemSlots[index] = null;
      else player.itemSlots[index] = { ...item, amount: amount - recycleCount };
    } else if (recycleCount > 1) {
      this.game.items?.setPickupMsg?.('Can only recycle one at a time', { error: true });
      return false;
    } else {
      player.itemSlots[index] = null;
    }
    applyRecycleYields(player, yields);
    if (this.selectedSlot === index && !player.itemSlots[index]) this.selectedSlot = null;
    this.game.audio?.inventoryPlace();
    this.game.items?.setPickupMsg?.('Item recycled');
    return true;
  }

  _onItemSlotClick(index, player) {
    if (this.selectedSlot === null) {
      this.selectedSlot = index;
      this.render();
      return;
    }
    if (this.selectedSlot === index) {
      this.selectedSlot = null;
      this.render();
      return;
    }
    player.swapItemSlots(this.selectedSlot, index);
    this.game.audio?.inventoryMove();
    this.selectedSlot = null;
    this.render();
  }

  _onChestSlotClick(index) {
    if (!this.chest) return;
    if (this.selectedChestSlot === null) {
      this.selectedChestSlot = index;
      this.render();
      return;
    }
    if (this.selectedChestSlot === index) {
      this.selectedChestSlot = null;
      this.render();
      return;
    }
    const tmp = this.chest.slots[this.selectedChestSlot];
    this.chest.slots[this.selectedChestSlot] = this.chest.slots[index];
    this.chest.slots[index] = tmp;
    this.game.audio?.inventoryMove();
    this.selectedChestSlot = null;
    this.render();
  }

  _canDropOnMain() {
    return this._canDropOnHand(0);
  }

  _canDropOnMelee() {
    return this._canDropOnHand(1);
  }

  _dragItemData() {
    if (this.drag?.stashedItem) return this.drag.stashedItem;
    if (this.drag?.fromType === 'chest') {
      return this.chest?.slots[this.drag.fromIndex ?? -1] ?? null;
    }
    return this.drag?.player?.itemSlots[this.drag?.fromIndex ?? -1] ?? null;
  }

  _pickUpDragItem() {
    const { fromType, fromIndex, player } = this.drag ?? {};
    if (fromType === 'hand0' || fromType === 'main') {
      const item = player?.suspendHandSlotForDrag(0);
      if (!item) return;
      this.drag.stashedItem = item;
    } else if (fromType === 'hand1' || fromType === 'melee') {
      const item = player?.suspendHandSlotForDrag(1);
      if (!item) return;
      this.drag.stashedItem = item;
    } else if (fromType === 'quick') {
      const item = player?.suspendQuickSlotForDrag();
      if (!item) return;
      this.drag.stashedItem = item;
    } else if (fromType === 'throwable') {
      const item = player?.suspendThrowableSlotForDrag();
      if (!item) return;
      this.drag.stashedItem = item;
    } else if (fromType === 'equipment') {
      const item = player?.suspendEquipmentForDrag(fromIndex);
      if (!item) return;
      this.drag.stashedItem = item;
    } else if (fromType === 'chest') {
      const item = this.chest?.slots[fromIndex];
      if (!item) return;
      this.drag.stashedItem = item;
      this.chest.slots[fromIndex] = null;
    } else if (player && fromIndex != null) {
      const item = player.itemSlots[fromIndex];
      if (!item) return;
      this.drag.stashedItem = item;
      player.itemSlots[fromIndex] = null;
    }
    this.drag?.sourceEl?.classList.add('inv-drag-source');
    this.game.audio?.inventoryMove();
  }

  _restoreDragItem() {
    const { fromType, fromIndex, player, stashedItem } = this.drag ?? {};
    if (!stashedItem) return;
    if (fromType === 'hand0' || fromType === 'main') {
      if (!player?.getHandSlotItem(0)) player?.restoreHandSlot(0, stashedItem);
    } else if (fromType === 'hand1' || fromType === 'melee') {
      if (!player?.getHandSlotItem(1)) player?.restoreHandSlot(1, stashedItem);
    } else if (fromType === 'quick') {
      if (!player?.quickSlot) player?.restoreQuickSlot(stashedItem);
    } else if (fromType === 'throwable') {
      if (!player?.throwableSlot) player?.restoreThrowableSlot(stashedItem);
    } else if (fromType === 'equipment') {
      if (!player?.equipmentSlots[fromIndex]) player?.restoreEquipmentSlot(fromIndex, stashedItem);
    } else if (fromType === 'chest') {
      if (this.chest?.slots[fromIndex] == null) this.chest.slots[fromIndex] = stashedItem;
    } else if (player && fromIndex != null && player.itemSlots[fromIndex] == null) {
      player.itemSlots[fromIndex] = stashedItem;
    }
  }

  _bindHandSlotDrag(slot, handIndex, player) {
    const zone = this._handZoneName(handIndex);
    slot.addEventListener('pointerdown', (e) => {
      if (this._isShiftClick(e)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!player.getHandSlotItem(handIndex)) return;
      e.preventDefault();
      slot.setPointerCapture?.(e.pointerId);
      this._beginDrag(e, zone, -1, player, slot);
    });
  }

  _bindUtilitySlotDrag(slot, zone, player) {
    slot.addEventListener('pointerdown', (e) => {
      if (this._isShiftClick(e)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const item = zone === 'quick' ? player.quickSlot : player.throwableSlot;
      if (!item) return;
      e.preventDefault();
      slot.setPointerCapture?.(e.pointerId);
      this._beginDrag(e, zone, -1, player, slot);
    });
  }

  _bindEquipmentSlotDrag(slot, index, player) {
    slot.addEventListener('pointerdown', (e) => {
      if (this._isShiftClick(e)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!player.equipmentSlots[index]) return;
      e.preventDefault();
      slot.setPointerCapture?.(e.pointerId);
      this._beginDrag(e, 'equipment', index, player, slot);
    });
  }

  _bindItemSlotDrag(slot, index, player, container = 'item') {
    slot.dataset.slotIndex = String(index);
    slot.dataset.slotContainer = container;
    slot.addEventListener('pointerdown', (e) => {
      if (this._isShiftClick(e)) return;
      if (slot.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!this._slotItemAt(container, index, player)) return;
      e.preventDefault();
      slot.setPointerCapture?.(e.pointerId);
      this._beginDrag(e, container, index, player, slot);
    });
  }

  _slotItemAt(container, index, player) {
    if (container === 'chest') return this.chest?.slots[index] ?? null;
    return player?.itemSlots[index] ?? null;
  }

  _beginDrag(e, fromType, index, player, sourceEl) {
    this._cancelDrag();
    this._hoverTooltipText = null;
    this._hideTooltip();
    this.drag = {
      fromType,
      fromIndex: index,
      player,
      sourceEl,
      pointerId: e.pointerId,
      stashedItem: null,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ghost: null,
      dropTarget: null,
    };
    document.addEventListener('pointermove', this._onDragMove, this._dragListenerOpts);
    document.addEventListener('pointerup', this._onDragEnd, this._dragListenerOpts);
    document.addEventListener('pointercancel', this._onDragEnd, this._dragListenerOpts);
  }

  _handleDragMove(e) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;
    if (!this.drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      this._pickUpDragItem();
      if (!this.drag.stashedItem) {
        this._cancelDrag();
        return;
      }
      this.drag.moved = true;
      this.selectedSlot = null;
      this.selectedChestSlot = null;
      this._createDragGhost();
    }
    if (this.drag.ghost) {
      this.drag.ghost.style.left = `${e.clientX}px`;
      this.drag.ghost.style.top = `${e.clientY}px`;
    }
    this._updateDropTarget(e);
  }

  _createDragGhost() {
    const data = this._dragItemData();
    const ghost = document.createElement('div');
    ghost.className = 'inv-drag-ghost';
    const iconSrc = getItemIconSrc(data);
    if (iconSrc) ghost.appendChild(this._slotIcon(iconSrc));
    else ghost.textContent = '—';
    if (data?.kind === 'ammo' || data?.kind === 'consumable' || (data?.kind === 'bandage' && (data.amount ?? 1) > 1)) {
      const count = document.createElement('span');
      count.className = 'inv-stack-count';
      count.textContent = String(this._stackAmount(data));
      ghost.appendChild(count);
    }
    document.body.appendChild(ghost);
    this.drag.ghost = ghost;
  }

  _isPointerOverInventoryPanels(clientX, clientY) {
    const panels = [this.panel, this.chestPanelRoot];
    for (const el of panels) {
      if (!el || el.classList.contains('hidden')) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return true;
      }
    }
    return false;
  }

  tryDropOnGround(e, stashedItem) {
    if (!stashedItem || !this.open) return false;
    if (this._isPointerOverInventoryPanels(e.clientX, e.clientY)) return false;
    const game = this.game;
    if (!game?.groundDrops || !game.player || !game.canvas) return false;
    const canvasRect = game.canvas.getBoundingClientRect();
    const sx = ((e.clientX - canvasRect.left) / canvasRect.width) * INTERNAL_W;
    const sy = ((e.clientY - canvasRect.top) / canvasRect.height) * INTERNAL_H;
    const w = game._screenToWorld(sx, sy);
    game.groundDrops.dropAt(w.x, w.z, stashedItem, game.player);
    game.items?.setPickupMsg(`Dropped ${getItemDisplayName(stashedItem)}`, { duration: 1.5 });
    return true;
  }

  _dropTargetFromElement(el) {
    if (!el?.closest) return null;
    const hand0 = el.closest('.inv-weapon-slot[data-drop-zone="hand0"]');
    if (hand0 && this._canDropOnHand(0)) return hand0;
    const hand1 = el.closest('.inv-weapon-slot[data-drop-zone="hand1"]');
    if (hand1 && this._canDropOnHand(1)) return hand1;
    const main = el.closest('.inv-weapon-slot[data-drop-zone="main"]');
    if (main && this._canDropOnHand(0)) return main;
    const melee = el.closest('.inv-weapon-slot[data-drop-zone="melee"]');
    if (melee && this._canDropOnHand(1)) return melee;
    const quick = el.closest('.inv-utility-slot[data-drop-zone="quick"]');
    if (quick && this._canDropOnQuick()) return quick;
    const throwable = el.closest('.inv-utility-slot[data-drop-zone="throwable"]');
    if (throwable && this._canDropOnThrowable()) return throwable;
    const equip = el.closest('.inv-equip-slot[data-slot-index]');
    if (equip && this._canDropOnEquipment()) return equip;
    const item = el.closest('.inv-item-slot[data-slot-index]:not(.inv-locked)');
    if (item) return item;
    const chest = el.closest('.inv-chest-slot[data-slot-index]');
    if (chest) return chest;
    return null;
  }

  _updateDropTarget(e) {
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    let next = null;
    for (const el of stack) {
      if (el.classList?.contains('inv-drag-ghost')) continue;
      next = this._dropTargetFromElement(el);
      if (next) break;
    }

    if (this.drag.dropTarget === next) return;
    this.drag.dropTarget?.classList.remove('inv-drop-target');
    this.drag.dropTarget = next;
    next?.classList.add('inv-drop-target');
  }

  _mergeItemIntoSlot(player, index, item, displaced) {
    if (item?.kind === 'ammo' && displaced && ammoItemsMatch(item, displaced)) {
      const merged = mergeAmmoStacks(item, displaced);
      if (merged && !merged.overflow) {
        player.itemSlots[index] = merged;
        return null;
      }
      if (merged?.merged) {
        player.itemSlots[index] = merged.merged;
        return merged.overflow;
      }
    }
    if (item?.kind === 'bandage' && displaced && bandageItemsMatch(item, displaced)) {
      const merged = mergeBandageStacks(item, displaced);
      if (merged && !merged.overflow) {
        player.itemSlots[index] = merged;
        return null;
      }
      if (merged?.merged) {
        player.itemSlots[index] = merged.merged;
        return merged.overflow;
      }
    }
    if ((item?.kind === 'consumable' || item?.kind === 'bandage') && displaced && consumableItemsMatch(item, displaced)) {
      const merged = mergeConsumableStacks(item, displaced);
      if (merged && !merged.overflow) {
        player.itemSlots[index] = merged;
        return null;
      }
      if (merged?.merged) {
        player.itemSlots[index] = merged.merged;
        return merged.overflow;
      }
    }
    if (item?.kind === 'material' && displaced && materialItemsMatch(item, displaced)) {
      const merged = mergeMaterialStacks(item, displaced);
      if (merged && !merged.overflow) {
        player.itemSlots[index] = merged;
        return null;
      }
      if (merged?.merged) {
        player.itemSlots[index] = merged.merged;
        return merged.overflow;
      }
    }
    player.itemSlots[index] = item;
    return displaced;
  }

  _placeInSlot(container, index, item) {
    if (container === 'chest') {
      if (!this.chest) return null;
      const displaced = this.chest.slots[index];
      if (item?.kind === 'ammo' && displaced && ammoItemsMatch(item, displaced)) {
        const merged = mergeAmmoStacks(item, displaced);
        if (merged && !merged.overflow) {
          this.chest.slots[index] = merged;
          return null;
        }
        if (merged?.merged) {
          this.chest.slots[index] = merged.merged;
          return merged.overflow;
        }
      }
      if (item?.kind === 'bandage' && displaced && bandageItemsMatch(item, displaced)) {
        const merged = mergeBandageStacks(item, displaced);
        if (merged && !merged.overflow) {
          this.chest.slots[index] = merged;
          return null;
        }
        if (merged?.merged) {
          this.chest.slots[index] = merged.merged;
          return merged.overflow;
        }
      }
      if (item?.kind === 'material' && displaced && materialItemsMatch(item, displaced)) {
        const merged = mergeMaterialStacks(item, displaced);
        if (merged && !merged.overflow) {
          this.chest.slots[index] = merged;
          return null;
        }
        if (merged?.merged) {
          this.chest.slots[index] = merged.merged;
          return merged.overflow;
        }
      }
      this.chest.slots[index] = item;
      return displaced;
    }
    const player = this.drag.player;
    if (!player?.isItemSlotUnlocked(index)) return null;
    const displaced = player.itemSlots[index];
    if (item?.kind === 'weapon') return this._mergeItemIntoSlot(player, index, player._normalizeWeaponItem(item), displaced);
    return this._mergeItemIntoSlot(player, index, item, displaced);
  }

  _storeBandageInChest(bandageItem, chest) {
    let remaining = { ...bandageItem, amount: Math.floor(bandageItem.amount ?? 1) };
    if (remaining.amount <= 0) return null;

    for (let i = 0; i < CHEST_SLOT_COUNT && remaining.amount > 0; i++) {
      const existing = chest[i];
      if (!existing || !bandageItemsMatch(existing, remaining)) continue;
      if ((existing.amount ?? 1) >= BANDAGE_STACK_MAX) continue;
      const merged = mergeBandageStacks(remaining, existing);
      if (!merged) continue;
      if (merged.overflow) {
        chest[i] = merged.merged;
        remaining = { ...merged.overflow };
      } else {
        chest[i] = merged;
        remaining = { ...remaining, amount: 0 };
        break;
      }
    }

    while (remaining.amount > 0) {
      const emptyIdx = chest.findIndex((s) => s == null);
      if (emptyIdx < 0) break;
      const add = Math.min(BANDAGE_STACK_MAX, remaining.amount);
      chest[emptyIdx] = { kind: 'bandage', amount: add };
      remaining.amount -= add;
    }

    return remaining.amount > 0 ? remaining : null;
  }

  _storeItemInChest(item) {
    if (!this.chest || !item) return false;
    const emptyIdx = this.chest.slots.findIndex((s) => s == null);
    if (emptyIdx < 0) return false;
    this.chest.slots[emptyIdx] = item;
    return true;
  }

  _runShiftClick(container, index) {
    const player = this.game.player;
    if (!player) return;

    if (container === 'item') {
      if (!player.isItemSlotUnlocked(index)) return;
      const data = player.itemSlots[index];
      if (!data) return;
      if (data.kind === 'weapon' || data.kind === 'melee') {
        if (!this.chestMode || !this.chest) return;
        this._shiftInventorySlotToChest(index);
        return;
      }
      if (this.chestMode && this.chest) {
        this._shiftInventorySlotToChest(index);
        return;
      }
      if (this._useConsumable(player, index)) this.render();
      return;
    }

    if (container === 'chest' && this.chest) {
      const data = this.chest.slots[index];
      if (!data) return;
      const result = player.tryStoreItem(data);
      if (result.ok) {
        this.chest.slots[index] = result.remainder;
        this.game.audio?.pickup();
      }
      this.render();
    }
  }

  _shiftInventorySlotToChest(index) {
    const player = this.game.player;
    if (!this.chest || !player) return;
    if (!player.isItemSlotUnlocked(index)) return;
    const item = player.itemSlots[index];
    if (!item) return;

    const chest = this.chest.slots;
    const tryStoreAmmo = (ammoItem) => {
      let remaining = { ...ammoItem, amount: Math.floor(ammoItem.amount ?? 0) };
      if (!remaining.amount || remaining.amount <= 0) return null;

      // Merge into existing ammo stacks first.
      for (let i = 0; i < CHEST_SLOT_COUNT && remaining.amount > 0; i++) {
        const existing = chest[i];
        if (!existing) continue;
        if (!ammoItemsMatch(existing, remaining)) continue;
        if ((existing.amount ?? 0) >= AMMO_STACK_MAX) continue;

        const merged = mergeAmmoStacks(remaining, existing);
        if (!merged) continue;

        // mergeAmmoStacks returns either:
        // - an ammo item (fully merged), or
        // - { merged, overflow } when it overflows.
        if (merged.overflow) {
          chest[i] = merged.merged;
          remaining = { ...merged.overflow };
        } else {
          chest[i] = merged;
          remaining = { ...remaining, amount: 0 };
          break;
        }
      }

      // Fill empty slots with any overflow remainder.
      while (remaining.amount > 0) {
        const emptyIdx = chest.findIndex((s) => s == null);
        if (emptyIdx < 0) break;
        const add = Math.min(AMMO_STACK_MAX, remaining.amount);
        chest[emptyIdx] = { kind: 'ammo', ammoType: remaining.ammoType, amount: add };
        remaining.amount -= add;
      }

      return remaining.amount > 0 ? remaining : null;
    };

    const itemKind = item.kind;
    let remainder = null;
    if (itemKind === 'ammo') {
      remainder = tryStoreAmmo(item);
    } else if (itemKind === 'bandage') {
      remainder = this._storeBandageInChest(item, chest);
    } else {
      if (!this._storeItemInChest(item)) return;
    }

    // Only clear the inventory slot if we stored everything.
    if (!remainder) player.itemSlots[index] = null;
    else player.itemSlots[index] = remainder;

    this.game.audio?.inventoryPlace();
    this.render();
  }

  _placeDragFromHand(handIndex, dropTarget, item, player) {
    const zone = dropTarget.dataset.dropZone;
    const targetHand = this._handIndexFromZone(zone);
    if (targetHand === handIndex) {
      player.restoreHandSlot(handIndex, item);
      return true;
    }
    if (targetHand >= 0) {
      const displaced = player.getHandSlotItem(targetHand);
      player.restoreHandSlot(targetHand, item);
      if (displaced) player.restoreHandSlot(handIndex, displaced);
      return true;
    }
    if (dropTarget.classList.contains('inv-item-slot')) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      if (!player.isItemSlotUnlocked(toIndex)) return false;
      const displaced = player.itemSlots[toIndex];
      player.itemSlots[toIndex] = item.kind === 'weapon' ? player._normalizeWeaponItem(item) : item;
      if (displaced) player.restoreHandSlot(handIndex, displaced);
      else player.handSlots[handIndex] = null;
      return true;
    }
    if (dropTarget.classList.contains('inv-chest-slot') && this.chest) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      const displaced = this._placeInSlot('chest', toIndex, item.kind === 'weapon' ? player._normalizeWeaponItem(item) : item);
      if (displaced) player.restoreHandSlot(handIndex, displaced);
      else player.handSlots[handIndex] = null;
      return true;
    }
    return false;
  }

  _placeDragFromQuick(dropTarget, item, player) {
    if (dropTarget.dataset.dropZone === 'quick') {
      player.restoreQuickSlot(item);
      return true;
    }
    if (dropTarget.classList.contains('inv-item-slot')) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      if (!player.isItemSlotUnlocked(toIndex)) return false;
      const displaced = player.itemSlots[toIndex];
      player.itemSlots[toIndex] = item;
      if (displaced && player.canPlaceQuickItem(displaced)) player.quickSlot = displaced;
      else player.quickSlot = null;
      return true;
    }
    if (dropTarget.classList.contains('inv-chest-slot') && this.chest) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      const displaced = this._placeInSlot('chest', toIndex, item);
      if (displaced && player.canPlaceQuickItem(displaced)) player.quickSlot = displaced;
      else player.quickSlot = null;
      return true;
    }
    return false;
  }

  _placeDragFromThrowable(dropTarget, item, player) {
    if (dropTarget.dataset.dropZone === 'throwable') {
      player.restoreThrowableSlot(item);
      return true;
    }
    if (dropTarget.classList.contains('inv-item-slot')) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      if (!player.isItemSlotUnlocked(toIndex)) return false;
      const displaced = player.itemSlots[toIndex];
      player.itemSlots[toIndex] = item;
      if (displaced && player.canPlaceThrowableItem(displaced)) player.throwableSlot = displaced;
      else player.throwableSlot = null;
      return true;
    }
    if (dropTarget.classList.contains('inv-chest-slot') && this.chest) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      const displaced = this._placeInSlot('chest', toIndex, item);
      if (displaced && player.canPlaceThrowableItem(displaced)) player.throwableSlot = displaced;
      else player.throwableSlot = null;
      return true;
    }
    return false;
  }

  _placeDragFromEquipment(eqIndex, dropTarget, item, player) {
    const incoming = normalizeEquipmentItem(item);
    if (!incoming) return false;
    if (dropTarget.classList.contains('inv-equip-slot')) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      if (toIndex === eqIndex) {
        player.restoreEquipmentSlot(eqIndex, incoming);
        return true;
      }
      const displaced = player.equipmentSlots[toIndex];
      player.equipmentSlots[toIndex] = { ...incoming };
      player.equipmentSlots[eqIndex] = displaced ? { ...displaced } : null;
      return true;
    }
    if (dropTarget.classList.contains('inv-item-slot')) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      if (!player.isItemSlotUnlocked(toIndex)) return false;
      const displaced = player.itemSlots[toIndex];
      player.itemSlots[toIndex] = { ...incoming };
      player.equipmentSlots[eqIndex] = displaced && isEquipmentItem(displaced) ? displaced : null;
      return true;
    }
    if (dropTarget.classList.contains('inv-chest-slot') && this.chest) {
      const toIndex = Number(dropTarget.dataset.slotIndex);
      const displaced = this._placeInSlot('chest', toIndex, incoming);
      player.equipmentSlots[eqIndex] = displaced && isEquipmentItem(displaced) ? displaced : null;
      return true;
    }
    return false;
  }

  _handleDragEnd(e) {
    if (!this.drag) return;
    document.removeEventListener('pointermove', this._onDragMove, this._dragListenerOpts);
    document.removeEventListener('pointerup', this._onDragEnd, this._dragListenerOpts);
    document.removeEventListener('pointercancel', this._onDragEnd, this._dragListenerOpts);
    const { pointerId, sourceEl, fromType, fromIndex, moved } = this.drag;
    if (sourceEl?.hasPointerCapture?.(pointerId)) {
      sourceEl.releasePointerCapture(pointerId);
    }

    if (!moved && this._isShiftClick(e) && (fromType === 'item' || fromType === 'chest')) {
      this._clearDragVisuals();
      this._runShiftClick(fromType, fromIndex);
      this._skipClick = true;
      this.drag = null;
      return;
    }

    const { player, dropTarget, stashedItem } = this.drag;
    this._clearDragVisuals();
    let placed = false;

    if (moved && dropTarget && stashedItem) {
      const fromHand = this._handIndexFromZone(fromType);
      if (fromHand >= 0) {
        placed = this._placeDragFromHand(fromHand, dropTarget, stashedItem, player);
        if (placed) this._skipClick = true;
      } else if (fromType === 'quick') {
        placed = this._placeDragFromQuick(dropTarget, stashedItem, player);
        if (placed) this._skipClick = true;
      } else if (fromType === 'throwable') {
        placed = this._placeDragFromThrowable(dropTarget, stashedItem, player);
        if (placed) this._skipClick = true;
      } else if (fromType === 'equipment') {
        placed = this._placeDragFromEquipment(fromIndex, dropTarget, stashedItem, player);
        if (placed) this._skipClick = true;
      } else if (this._handIndexFromZone(dropTarget.dataset.dropZone) >= 0
        && (stashedItem.kind === 'weapon' || stashedItem.kind === 'melee')) {
        const handIndex = this._handIndexFromZone(dropTarget.dataset.dropZone);
        if (fromType === 'item' && fromIndex != null) {
          placed = player.equipIntoHandSlot(handIndex, stashedItem, fromIndex);
        } else if (fromType === 'chest' && fromIndex != null && this.chest) {
          const outgoing = player.getHandSlotItem(handIndex);
          player.equipIntoHandSlot(handIndex, stashedItem);
          this.chest.slots[fromIndex] = outgoing;
          placed = true;
        }
        if (placed) {
          this.selectedSlot = null;
          this._skipClick = true;
        }
      } else if (dropTarget.dataset.dropZone === 'quick' && isQuickEquipItem(stashedItem)) {
        const incoming = normalizeConsumableItem(stashedItem);
        if (fromType === 'item' && fromIndex != null) {
          const outgoing = player.quickSlot ? normalizeConsumableItem(player.quickSlot) : null;
          player.quickSlot = incoming ? { ...incoming } : null;
          player.itemSlots[fromIndex] = outgoing;
          placed = true;
        } else if (fromType === 'chest' && fromIndex != null && this.chest) {
          const outgoing = player.quickSlot ? normalizeConsumableItem(player.quickSlot) : null;
          player.quickSlot = incoming ? { ...incoming } : null;
          this.chest.slots[fromIndex] = outgoing;
          placed = true;
        } else if (fromType === 'quick') {
          player.restoreQuickSlot(incoming);
          placed = true;
        }
        if (placed) {
          this.selectedSlot = null;
          this._skipClick = true;
        }
      } else if (dropTarget.dataset.dropZone === 'throwable' && isThrowableItem(stashedItem)) {
        if (fromType === 'item' && fromIndex != null) {
          const incoming = normalizeThrowableItem(stashedItem);
          const outgoing = player.throwableSlot ? normalizeThrowableItem(player.throwableSlot) : null;
          player.throwableSlot = incoming ? { ...incoming } : null;
          player.itemSlots[fromIndex] = outgoing;
          placed = true;
        } else if (fromType === 'chest' && fromIndex != null && this.chest) {
          const outgoing = player.throwableSlot;
          player.throwableSlot = { ...stashedItem };
          this.chest.slots[fromIndex] = outgoing;
          placed = true;
        } else if (fromType === 'throwable') {
          player.restoreThrowableSlot(stashedItem);
          placed = true;
        }
        if (placed) {
          this.selectedSlot = null;
          this._skipClick = true;
        }
      } else if (dropTarget.classList.contains('inv-equip-slot') && isEquipmentItem(stashedItem)) {
        const toIndex = Number(dropTarget.dataset.slotIndex);
        const incoming = normalizeEquipmentItem(stashedItem);
        if (fromType === 'item' && fromIndex != null) {
          const outgoing = player.equipmentSlots[toIndex];
          player.equipmentSlots[toIndex] = { ...incoming };
          player.itemSlots[fromIndex] = outgoing;
          placed = true;
        } else if (fromType === 'chest' && fromIndex != null && this.chest) {
          const outgoing = player.equipmentSlots[toIndex];
          player.equipmentSlots[toIndex] = { ...incoming };
          this.chest.slots[fromIndex] = outgoing;
          placed = true;
        } else if (fromType === 'equipment' && fromIndex != null) {
          placed = this._placeDragFromEquipment(fromIndex, dropTarget, stashedItem, player);
        }
        if (placed) {
          this.selectedSlot = null;
          this._skipClick = true;
        }
      } else if (dropTarget.classList.contains('inv-chest-slot')) {
        const toIndex = Number(dropTarget.dataset.slotIndex);
        if (fromType === 'chest' && toIndex === fromIndex) {
          this.chest.slots[fromIndex] = stashedItem;
          placed = true;
        } else {
          const displaced = this._placeInSlot('chest', toIndex, stashedItem);
          if (fromType === 'item') {
            player.itemSlots[fromIndex] = displaced;
            placed = true;
          } else {
            this.chest.slots[fromIndex] = displaced;
            placed = true;
          }
        }
      } else if (dropTarget.classList.contains('inv-item-slot')) {
        const toIndex = Number(dropTarget.dataset.slotIndex);
        if (fromType === 'item' && toIndex === fromIndex) {
          player.itemSlots[fromIndex] = stashedItem;
          placed = true;
        } else if (fromType === 'chest') {
          const displaced = this._placeInSlot('item', toIndex, stashedItem);
          this.chest.slots[fromIndex] = displaced;
          placed = true;
        } else if (toIndex !== fromIndex && player.isItemSlotUnlocked(toIndex)) {
          const displaced = this._placeInSlot('item', toIndex, stashedItem);
          player.itemSlots[fromIndex] = displaced;
          this.selectedSlot = null;
          this._skipClick = true;
          placed = true;
        }
      }
    }

    if (moved && stashedItem && !placed) {
      if (this.game._tryDropFromInventoryDrag(e, stashedItem)) {
        placed = true;
      } else {
        this._restoreDragItem();
      }
    }

    if (placed) {
      const zone = dropTarget?.dataset?.dropZone;
      if (this._handIndexFromZone(zone) >= 0 || zone === 'quick' || zone === 'throwable' || dropTarget?.classList?.contains('inv-equip-slot')) {
        this.game.audio?.inventoryEquip();
      } else {
        this.game.audio?.inventoryPlace();
      }
    }

    this.drag = null;
    if (moved) this.render();
  }

  _clearDragVisuals() {
    this.drag?.ghost?.remove();
    this.drag?.sourceEl?.classList.remove('inv-drag-source');
    this.root?.querySelectorAll('.inv-drop-target').forEach((el) => {
      el.classList.remove('inv-drop-target');
    });
  }

  _cancelDrag() {
    if (!this.drag) return;
    document.removeEventListener('pointermove', this._onDragMove, this._dragListenerOpts);
    document.removeEventListener('pointerup', this._onDragEnd, this._dragListenerOpts);
    document.removeEventListener('pointercancel', this._onDragEnd, this._dragListenerOpts);
    const { pointerId, sourceEl } = this.drag;
    if (sourceEl?.hasPointerCapture?.(pointerId)) {
      sourceEl.releasePointerCapture(pointerId);
    }
    const moved = this.drag.moved;
    this._restoreDragItem();
    this._clearDragVisuals();
    this.drag = null;
    if (moved) this.render();
  }

  _bindPlayerItemSlot(slot, index, player, data) {
    slot.appendChild(this._itemIcon(data));
    this._appendStackCount(slot, this._stackAmount(data));
    this._bindTooltip(slot, getItemDisplayName(data));
    this._bindItemSlotDrag(slot, index, player, 'item');
    this._bindContextMenu(slot, 'item', index);
    this._bindStackDoubleClick(slot, 'item', index, data);

    if (data.kind === 'weapon') {
      slot.addEventListener('click', (e) => {
        if (this._skipClick) { this._skipClick = false; return; }
        if (!this._isShiftClick(e)) return;
        if (!this.chestMode) return;
        if (!this.chest) return;
        e.preventDefault();
        this._shiftInventorySlotToChest(index);
      });
    } else if (data.kind === 'melee') {
      slot.addEventListener('click', (e) => {
        if (this._skipClick) { this._skipClick = false; return; }
        if (!this._isShiftClick(e)) return;
        if (!this.chestMode) return;
        if (!this.chest) return;
        e.preventDefault();
        this._shiftInventorySlotToChest(index);
      });
    } else {
      slot.addEventListener('click', (e) => {
        if (this._skipClick) { this._skipClick = false; return; }
        if (!this._isShiftClick(e)) return;

        // When chest UI is open, shift-click is strictly a transfer.
        if (this.chestMode && this.chest) {
          e.preventDefault();
          this._shiftInventorySlotToChest(index);
          return;
        }

        // Otherwise, shift-click may consume (bandage only; ammo returns false).
        if (this._useConsumable(player, index)) this.render();
      });
    }
  }

  _renderChestSlots() {
    if (!this.chestEl || !this.chest) return;
    const slotCount = this.chest.slots?.length ?? CHEST_SLOT_COUNT;
    if (slotCount === 5) {
      this.chestEl.style.gridTemplateColumns = 'repeat(5, var(--chest-slot-size))';
      this.chestEl.style.gridTemplateRows = 'var(--chest-slot-size)';
      this.chestEl.style.width = 'calc(var(--chest-slot-size) * 5 + 24px)';
    } else {
      this.chestEl.style.gridTemplateColumns = 'repeat(4, var(--chest-slot-size))';
      this.chestEl.style.gridTemplateRows = 'repeat(2, var(--chest-slot-size))';
      this.chestEl.style.width = 'calc(var(--chest-slot-size) * 4 + 18px)';
    }
    this.chestEl.innerHTML = '';
    for (let i = 0; i < slotCount; i++) {
      const slot = this._makeSlot('inv-chest-slot');
      slot.dataset.slotIndex = String(i);
      slot.dataset.slotContainer = 'chest';
      const data = this.chest.slots[i];
      if (data) {
        slot.appendChild(this._itemIcon(data));
        this._appendStackCount(slot, this._stackAmount(data));
        this._bindTooltip(slot, getItemDisplayName(data));
        this._bindItemSlotDrag(slot, i, this.game.player, 'chest');
        this._bindContextMenu(slot, 'chest', i);
        this._bindStackDoubleClick(slot, 'chest', i, data);
        slot.addEventListener('click', (e) => {
          if (this._skipClick) { this._skipClick = false; return; }
          if (!this._isShiftClick(e)) return;
          e.preventDefault();
          const player = this.game.player;
          const result = player.tryStoreItem(data);
          if (result.ok) {
            this.chest.slots[i] = result.remainder;
            this.game.audio?.pickup();
          }
          this.render();
        });
      } else {
        slot.classList.add('inv-empty-slot');
        slot.addEventListener('click', () => { /* no-op: drag/drop only */ });
      }
      this.chestEl.appendChild(slot);
    }
  }

  _tryCraftRecipe(recipe) {
    const player = this.game.player;
    if (!player || !recipe) return;
    if (!craftRecipe(player, recipe)) {
      this.game.items?.setPickupMsg?.('Need materials and inventory space', { error: true });
      return;
    }
    this.game.audio?.inventoryPlace();
    this.game.items?.setPickupMsg?.(`Crafted ${getRecipeLabel(recipe)}`);
    this.render();
  }

  _renderCraftPanel(player) {
    if (!this.craftPickerEl || !this.craftCostGridEl) return;
    const recipes = getCraftableRecipes(player);
    if (!recipes.length) {
      this.selectedCraftRecipeId = null;
      this.craftPickerEl.innerHTML = '';
      this.craftCostGridEl.innerHTML = '';
      if (this.craftBtnEl) {
        this.craftBtnEl.disabled = true;
        this.craftBtnEl.classList.remove('inv-craft-btn-ready');
      }
      return;
    }

    if (!recipes.some((r) => r.id === this.selectedCraftRecipeId)) {
      this.selectedCraftRecipeId = recipes[0].id;
    }

    const pickerFrag = document.createDocumentFragment();
    for (const recipe of recipes) {
      const pick = this._makeCraftPickSlot();
      const canCraft = canCraftRecipe(player, recipe);
      pick.classList.toggle('inv-craft-pick-selected', recipe.id === this.selectedCraftRecipeId);
      pick.classList.toggle('inv-craft-pick-disabled', !canCraft);
      const inner = pick.querySelector('.inv-craft-pick-inner');
      inner?.appendChild(this._itemIcon(recipe.output));
      this._bindTooltip(pick, getRecipeLabel(recipe));
      pick.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectedCraftRecipeId = recipe.id;
        this.render({ keepContextMenu: true });
      });
      pickerFrag.appendChild(pick);
    }
    this.craftPickerEl.replaceChildren(pickerFrag);

    const recipe = recipes.find((r) => r.id === this.selectedCraftRecipeId);
    const costs = recipe ? recipeMaterialCosts(recipe) : [];
    const costFrag = document.createDocumentFragment();
    for (let i = 0; i < CRAFT_MAX_MATERIALS; i++) {
      const costItem = costs[i];
      const slot = this._makeCraftCostSlot();
      const inner = slot.querySelector('.inv-craft-cost-inner');
      if (costItem && inner) {
        inner.appendChild(this._itemIcon(costItem));
        this._appendStackCount(slot, this._stackAmount(costItem));
        const enough = (player.countMaterial(costItem.key) ?? 0) >= costItem.amount;
        slot.classList.toggle('inv-craft-cost-missing', !enough);
        this._bindTooltip(slot, getItemDisplayName(costItem));
      } else {
        slot.classList.add('inv-craft-cost-empty');
      }
      costFrag.appendChild(slot);
    }
    this.craftCostGridEl.replaceChildren(costFrag);

    if (this.craftBtnEl) {
      const canCraft = !!recipe && canCraftRecipe(player, recipe);
      this.craftBtnEl.disabled = !canCraft;
      this.craftBtnEl.classList.toggle('inv-craft-btn-ready', canCraft);
      this._syncCraftBtnLabel();
    }
    this._syncCraftPickerLayoutSoon();
  }

  render(options = {}) {
    const player = this.game.player;
    if (!player || !this.weaponsEl || !this.itemsEl) return;
    if (this.drag?.moved) return;

    const keepContextMenu = !!options.keepContextMenu;
    if (!keepContextMenu) this._hideContextMenu();
    this._hoverTooltipText = null;
    this._hideTooltip();
    this.weaponsEl.innerHTML = '';
    if (this.equipmentEl) this.equipmentEl.innerHTML = '';
    this.itemsEl.innerHTML = '';
    if (this.chestEl) this.chestEl.innerHTML = '';

    if (this.equipmentEl) {
      for (let i = 0; i < EQUIPMENT_SLOT_COUNT; i++) {
        const slot = this._makeSlot('inv-equip-slot');
        slot.dataset.slotIndex = String(i);
        slot.dataset.slotContainer = 'equipment';
        slot.dataset.dropZone = 'equipment';
        const data = player.equipmentSlots[i];
        const label = EQUIPMENT_LABELS[i] ?? 'Gear';
        if (data) {
          slot.appendChild(this._itemIcon(data));
          this._bindTooltip(slot, getItemDisplayName(data));
          this._bindEquipmentSlotDrag(slot, i, player);
          this._bindContextMenu(slot, 'equipment', i);
        } else {
          this._setSlotLabel(slot, label);
          this._bindTooltip(slot, label);
        }
        this.equipmentEl.appendChild(slot);
      }
    }

    for (let h = 0; h < HAND_SLOT_COUNT; h++) {
      const zone = this._handZoneName(h);
      const slot = this._makeSlot('inv-weapon-slot');
      slot.dataset.dropZone = zone;
      if (h === player.activeHandSlot) slot.classList.add('inv-hand-active');
      const handItem = player.getHandSlotItem(h);
      if (handItem) {
        if (handItem.kind === 'weapon') {
          slot.appendChild(this._weaponIcon(WEAPONS[handItem.key]?.sprite ?? handItem.key));
        } else {
          slot.appendChild(this._weaponIcon(MELEE_WEAPONS[handItem.key]?.sprite ?? handItem.key));
        }
        this._bindTooltip(slot, getItemDisplayName(handItem));
        this._bindHandSlotDrag(slot, h, player);
        this._bindContextMenu(slot, zone, -1);
      } else {
        slot.classList.add('inv-empty-slot');
        this._setSlotLabel(slot, HAND_SLOT_LABELS[h] ?? 'W');
        this._bindTooltip(slot, `Weapon slot ${h + 1}`);
        this._bindHandSlotDrag(slot, h, player);
      }
      slot.addEventListener('click', (e) => {
        if (this._skipClick) { this._skipClick = false; return; }
        if (this._isShiftClick(e)) return;
        if (this.game.mobile && handItem) return;
        if (handItem) {
          player.setActiveHandSlot(h);
          this.render();
        }
      });
      this.weaponsEl.appendChild(slot);
    }

    const quickSlot = this._makeSlot('inv-utility-slot inv-quick-slot');
    quickSlot.dataset.dropZone = 'quick';
    if (player.quickSlot) {
      quickSlot.appendChild(this._itemIcon(player.quickSlot));
      this._appendStackCount(quickSlot, this._stackAmount(player.quickSlot));
      this._bindTooltip(quickSlot, getItemDisplayName(player.quickSlot));
      this._bindUtilitySlotDrag(quickSlot, 'quick', player);
      this._bindContextMenu(quickSlot, 'quick', -1);
    } else {
      quickSlot.classList.add('inv-empty-slot');
      this._setSlotLabel(quickSlot, QUICK_SLOT_LABEL);
      this._bindTooltip(quickSlot, 'Quick equip consumables');
      this._bindUtilitySlotDrag(quickSlot, 'quick', player);
    }
    this.weaponsEl.appendChild(quickSlot);

    const throwSlot = this._makeSlot('inv-utility-slot inv-throw-slot');
    throwSlot.dataset.dropZone = 'throwable';
    if (player.throwableSlot) {
      throwSlot.appendChild(this._itemIcon(player.throwableSlot));
      this._bindTooltip(throwSlot, getItemDisplayName(player.throwableSlot));
      this._bindUtilitySlotDrag(throwSlot, 'throwable', player);
      this._bindContextMenu(throwSlot, 'throwable', -1);
    } else {
      throwSlot.classList.add('inv-empty-slot');
      this._setSlotLabel(throwSlot, THROW_SLOT_LABEL);
      this._bindTooltip(throwSlot, 'Throwable items');
      this._bindUtilitySlotDrag(throwSlot, 'throwable', player);
    }
    this.weaponsEl.appendChild(throwSlot);

    if (this.craftOpen) this._renderCraftPanel(player);
    this._syncCraftPickerLayoutSoon();

    for (let i = 0; i < ITEM_STORAGE_SIZE; i++) {
      const unlocked = player.isItemSlotUnlocked(i);
      const slot = this._makeSlot('inv-item-slot', unlocked ? '' : 'inv-locked');
      const data = player.itemSlots[i];

      if (unlocked) {
        slot.dataset.slotIndex = String(i);
        slot.dataset.slotContainer = 'item';
      }

      if (!unlocked) {
        slot.disabled = true;
        slot.appendChild(this._lockIcon());
      } else if (data) {
        if (this.selectedSlot === i) slot.classList.add('inv-selected');
        this._bindPlayerItemSlot(slot, i, player, data);
      } else {
        slot.classList.add('inv-empty-slot');
        slot.addEventListener('click', (e) => {
          if (this._skipClick) { this._skipClick = false; return; }
          // no-op: click does nothing; hold+drag is the mechanic
        });
      }

      this.itemsEl.appendChild(slot);
    }

    if (this.chestMode) this._renderChestSlots();
    if (keepContextMenu) this._reopenContextMenu();
  }
}
