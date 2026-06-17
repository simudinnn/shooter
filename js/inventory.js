import { WEAPONS, MELEE_WEAPONS, ITEM_STORAGE_SIZE, UNLOCKED_ITEM_SLOTS, EQUIPMENT_SLOT_COUNT } from './player.js';
import { weaponItemSpritePath } from './sprites.js';
import { CHEST_SLOT_COUNT, getItemDisplayName, getItemDescription, getItemIconSrc } from './loot.js';
import {
  AMMO_STACK_MAX,
  BANDAGE_STACK_MAX,
  ammoItemsMatch,
  bandageItemsMatch,
  mergeAmmoStacks,
  mergeBandageStacks,
} from './ammo.js';

const EQUIPMENT_LABELS = ['Head', 'Body', 'Legs', 'Gear'];
const ANIM_MS = 240;

export const INV_SLOT_SRC = 'assets/ui/inv_slot.png';
export const INV_CURSOR_SRC = 'assets/ui/inv_cursor.png';
export const INV_LOCK_SRC = 'assets/items/lock.png';

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
    this._onDragMove = (e) => this._handleDragMove(e);
    this._onDragEnd = (e) => this._handleDragEnd(e);
    this._dragListenerOpts = { capture: true };
    this._onInvPointerMove = (e) => this._moveInvCursor(e);
    this.root = document.getElementById('inventory');
    this.panel = document.getElementById('inventory-panel');
    this.dualWrap = document.getElementById('inventory-dual-wrap');
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

    this.backdrop = this.root?.querySelector('.inv-backdrop');
    this.backdrop?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.close();
    });
    this.panel?.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('pointerdown', (e) => this._onDocumentPointerDown(e));
  }

  _onDocumentPointerDown(e) {
    if (!this._contextMenuEl || this._contextMenuEl.classList.contains('hidden')) return;
    if (e.target.closest('.inv-context-menu')) return;
    if (e.target.closest('.inv-context-btn')) return;
    if (e.target.closest('.inv-item-slot, .inv-chest-slot') === this._contextAnchorEl) return;
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
    if (!this.game.chests?.isInInteractRange(this.game.player, chest)) return;
    this.chestMode = true;
    this.chest = chest;
    chest.opened = true;
    this.game.audio?.chestOpen();
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
    this._enableInvCursor();
    this.render();
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

  _slotIcon(src) {
    const img = document.createElement('img');
    img.className = 'inv-slot-icon';
    img.src = src;
    img.alt = '';
    img.draggable = false;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    return img;
  }

  _appendStackCount(slot, amount) {
    if (!amount || amount <= 1) return;
    const label = document.createElement('span');
    label.className = 'inv-stack-count';
    label.textContent = String(amount);
    slot.appendChild(label);
  }

  _stackAmount(data) {
    if (data?.kind === 'ammo') return data.amount;
    if (data?.kind === 'bandage') return data.amount ?? 1;
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
    this._tooltipEl.textContent = text;
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
    const item = container === 'chest'
      ? this.chest?.slots[index]
      : this.game.player?.itemSlots[index];
    if (!item || !anchorEl) return;

    e.preventDefault();
    e.stopPropagation();
    this._hoverTooltipText = null;
    this._hideTooltip();
    this._ensureContextMenu();
    this._contextSlot = { container, index };
    this._contextAnchorEl = anchorEl;

    const desc = this._contextMenuEl.querySelector('.inv-context-desc');
    const actions = this._contextMenuEl.querySelector('.inv-context-actions');
    desc.textContent = getItemDescription(item);
    actions.innerHTML = '';

    if (item.kind === 'weapon' && WEAPONS[item.key]) {
      if (container === 'item') {
        const equipBtn = document.createElement('button');
        equipBtn.type = 'button';
        equipBtn.className = 'inv-context-btn';
        equipBtn.textContent = 'Equip';
        this._bindContextAction(equipBtn, () => {
          this._contextEquipWeapon(index, container);
        });
        actions.appendChild(equipBtn);
      }

      const magAmmo = Math.max(0, Math.floor(item.ammo ?? 0));
      if (magAmmo > 0) {
        const ammoBtn = document.createElement('button');
        ammoBtn.type = 'button';
        ammoBtn.className = 'inv-context-btn';
        ammoBtn.textContent = 'Take ammo';
        this._bindContextAction(ammoBtn, () => {
          this._contextTakeAmmo(index, container);
        });
        actions.appendChild(ammoBtn);
      }
    } else if (item.kind === 'melee' && MELEE_WEAPONS[item.key]) {
      if (container === 'item') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inv-context-btn';
        btn.textContent = 'Equip';
        this._bindContextAction(btn, () => {
          this._contextEquipMelee(index, container);
        });
        actions.appendChild(btn);
      }
    } else if (item.kind === 'bandage') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inv-context-btn';
      btn.textContent = 'Use';
      this._bindContextAction(btn, () => {
        if (container === 'item') this._useConsumable(this.game.player, index);
        this._hideContextMenu();
        this.render();
      });
      actions.appendChild(btn);
    }

    this._positionContextMenu(anchorEl);
    this._syncInvCursorAt(e.clientX, e.clientY);
  }

  _syncInvCursorAt(clientX, clientY) {
    if (!this.open || !this._cursorEl || this.game.mobile) return;
    this._cursorEl.style.visibility = 'visible';
    this._cursorEl.style.left = `${clientX}px`;
    this._cursorEl.style.top = `${clientY}px`;
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
      this.game.items.pickupMsg = `+${result.taken} ammo`;
      this.game.items.pickupMsgTimer = 2;
      this.game.audio.pickup();
    }
    this._hideContextMenu();
    this.render();
  }

  _bindContextMenu(slot, container, index) {
    slot.addEventListener('contextmenu', (e) => {
      if (slot.disabled) return;
      this._showContextMenu(e, container, index, slot);
    });
    slot.addEventListener('pointerleave', (e) => this._onContextSlotPointerLeave(e));
    if (this.game.mobile) {
      slot.addEventListener('click', (e) => {
        if (slot.disabled || this._skipClick || this.drag) return;
        const item = container === 'chest'
          ? this.chest?.slots[index]
          : this.game.player?.itemSlots[index];
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        this._showContextMenu(e, container, index, slot);
      });
    }
  }

  _useConsumable(player, index) {
    const item = player.itemSlots[index];
    if (!item) return false;
    if (item.kind === 'ammo') return false;
    if (item.kind === 'bandage') {
      if (player.health >= player.maxHealth) {
        this.game.items.pickupMsg = 'Already at full health';
        this.game.items.pickupMsgTimer = 2;
        return false;
      }
      if (!player.heal(30)) return false;
      const left = (item.amount ?? 1) - 1;
      if (left <= 0) player.itemSlots[index] = null;
      else player.itemSlots[index] = { kind: 'bandage', amount: left };
      this.game.items.pickupMsg = '+30 HP';
      this.game.items.pickupMsgTimer = 2;
      this.game.audio.pickup();
      return true;
    }
    return false;
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
    const data = this._dragItemData();
    return !!(data?.kind === 'weapon' && WEAPONS[data.key]);
  }

  _canDropOnMelee() {
    const data = this._dragItemData();
    return !!(data?.kind === 'melee' && MELEE_WEAPONS[data.key]);
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
    if (fromType === 'chest') {
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
    if (fromType === 'chest') {
      if (this.chest?.slots[fromIndex] == null) this.chest.slots[fromIndex] = stashedItem;
    } else if (player && fromIndex != null && player.itemSlots[fromIndex] == null) {
      player.itemSlots[fromIndex] = stashedItem;
    }
  }

  _bindItemSlotDrag(slot, index, player, container = 'item') {
    slot.dataset.slotIndex = String(index);
    slot.dataset.slotContainer = container;
    slot.addEventListener('pointerdown', (e) => {
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
    if (data?.kind === 'ammo' || (data?.kind === 'bandage' && (data.amount ?? 1) > 1)) {
      const count = document.createElement('span');
      count.className = 'inv-stack-count';
      count.textContent = String(this._stackAmount(data));
      ghost.appendChild(count);
    }
    document.body.appendChild(ghost);
    this.drag.ghost = ghost;
  }

  _dropTargetFromElement(el) {
    if (!el?.closest) return null;
    const main = el.closest('.inv-weapon-slot.inv-primary[data-drop-zone="main"]');
    if (main && this._canDropOnMain()) return main;
    const melee = el.closest('.inv-weapon-slot.inv-secondary[data-drop-zone="melee"]');
    if (melee && this._canDropOnMelee()) return melee;
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

  _handleDragEnd() {
    if (!this.drag) return;
    document.removeEventListener('pointermove', this._onDragMove, this._dragListenerOpts);
    document.removeEventListener('pointerup', this._onDragEnd, this._dragListenerOpts);
    document.removeEventListener('pointercancel', this._onDragEnd, this._dragListenerOpts);
    const { pointerId, sourceEl } = this.drag;
    if (sourceEl?.hasPointerCapture?.(pointerId)) {
      sourceEl.releasePointerCapture(pointerId);
    }

    const { fromType, fromIndex, player, moved, dropTarget, stashedItem } = this.drag;
    this._clearDragVisuals();
    let placed = false;

    if (moved && dropTarget && stashedItem) {
      if (dropTarget.dataset.dropZone === 'main' && stashedItem.kind === 'weapon' && WEAPONS[stashedItem.key]) {
        if (fromType === 'item' && fromIndex != null) {
          placed = player.equipWeaponIntoSlot(fromIndex, stashedItem);
        } else if (fromType === 'chest' && fromIndex != null && this.chest) {
          placed = player.equipWeaponFromChest(this.chest.slots, fromIndex, stashedItem);
        }
        if (placed) {
          this.selectedSlot = null;
          this._skipClick = true;
        }
      } else if (dropTarget.dataset.dropZone === 'melee' && stashedItem.kind === 'melee' && MELEE_WEAPONS[stashedItem.key]) {
        if (fromType === 'item' && fromIndex != null) {
          placed = player.equipMeleeFromSlot(fromIndex, stashedItem);
        } else if (fromType === 'chest' && fromIndex != null && this.chest) {
          player.equipMeleeFromChest(this.chest.slots, fromIndex, stashedItem);
          placed = true;
        } else if (fromType === 'item' && fromIndex != null) {
          player.itemSlots[fromIndex] = stashedItem;
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
      this._restoreDragItem();
    }

    if (placed) {
      const zone = dropTarget?.dataset?.dropZone;
      if (zone === 'main' || zone === 'melee') this.game.audio?.inventoryEquip();
      else this.game.audio?.inventoryPlace();
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

    if (data.kind === 'weapon') {
      slot.addEventListener('click', (e) => {
        if (this._skipClick) { this._skipClick = false; return; }
        if (!e.shiftKey) return;
        if (!this.chestMode) return;
        if (!this.chest) return;
        e.preventDefault();
        this._shiftInventorySlotToChest(index);
      });
    } else if (data.kind === 'melee') {
      slot.addEventListener('click', (e) => {
        if (this._skipClick) { this._skipClick = false; return; }
        if (!e.shiftKey) return;
        if (!this.chestMode) return;
        if (!this.chest) return;
        e.preventDefault();
        this._shiftInventorySlotToChest(index);
      });
    } else {
      slot.addEventListener('click', (e) => {
        if (this._skipClick) { this._skipClick = false; return; }
        if (!e.shiftKey) return;

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
    this.chestEl.innerHTML = '';
    for (let i = 0; i < CHEST_SLOT_COUNT; i++) {
      const slot = this._makeSlot('inv-chest-slot');
      slot.dataset.slotIndex = String(i);
      slot.dataset.slotContainer = 'chest';
      const data = this.chest.slots[i];
      if (this.selectedChestSlot === i) slot.classList.add('inv-selected');
      if (data) {
        slot.appendChild(this._itemIcon(data));
        this._appendStackCount(slot, this._stackAmount(data));
        this._bindTooltip(slot, getItemDisplayName(data));
        this._bindItemSlotDrag(slot, i, this.game.player, 'chest');
        this._bindContextMenu(slot, 'chest', i);
        slot.addEventListener('click', (e) => {
          if (this._skipClick) { this._skipClick = false; return; }
          if (!e.shiftKey) return;
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

  render() {
    const player = this.game.player;
    if (!player || !this.weaponsEl || !this.equipmentEl || !this.itemsEl) return;
    if (this.drag?.moved) return;

    this._hideContextMenu();
    this._hoverTooltipText = null;
    this._hideTooltip();
    this.weaponsEl.innerHTML = '';
    this.equipmentEl.innerHTML = '';
    this.itemsEl.innerHTML = '';
    if (this.chestEl) this.chestEl.innerHTML = '';

    const primary = this._makeSlot('inv-weapon-slot');
    primary.classList.add('inv-primary');
    primary.dataset.dropZone = 'main';
    if (player.weaponKey) {
      if (!player.isMeleeActive()) primary.classList.add('inv-active');
      const cfg = WEAPONS[player.weaponKey];
      primary.appendChild(this._weaponIcon(cfg.sprite));
      this._bindTooltip(primary, cfg.name);
    } else {
      primary.classList.add('inv-empty-slot');
      primary.textContent = 'Main';
      this._bindTooltip(primary, 'Main weapon');
    }
    primary.addEventListener('click', () => {
      if (player.weaponKey) {
        player.setWeaponSlot('gun');
        this.render();
      }
    });
    this.weaponsEl.appendChild(primary);

    const secondary = this._makeSlot('inv-weapon-slot');
    secondary.classList.add('inv-secondary');
    secondary.dataset.dropZone = 'melee';
    if (player.isMeleeActive()) secondary.classList.add('inv-active');
    secondary.appendChild(this._weaponIcon(player.getActiveMelee().sprite));
    this._bindTooltip(secondary, player.getActiveMelee().name);
    secondary.addEventListener('click', () => {
      player.equipMelee(player.meleeKey);
      this.render();
    });
    this.weaponsEl.appendChild(secondary);

    for (let i = 0; i < EQUIPMENT_SLOT_COUNT; i++) {
      const slot = this._makeSlot('inv-equip-slot', 'inv-locked');
      slot.disabled = true;
      slot.appendChild(this._lockIcon());
      this.equipmentEl.appendChild(slot);
    }

    for (let i = 0; i < ITEM_STORAGE_SIZE; i++) {
      const unlocked = player.isItemSlotUnlocked(i);
      const slot = this._makeSlot('inv-item-slot', unlocked ? '' : 'inv-locked');
      const data = player.itemSlots[i];

      if (unlocked) {
        slot.dataset.slotIndex = String(i);
        slot.dataset.slotContainer = 'item';
      }

      if (this.selectedSlot === i) slot.classList.add('inv-selected');

      if (!unlocked) {
        slot.disabled = true;
        slot.appendChild(this._lockIcon());
      } else if (data) {
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
  }
}
