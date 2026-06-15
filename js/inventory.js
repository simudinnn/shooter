import { WEAPONS, ITEM_STORAGE_SIZE, UNLOCKED_ITEM_SLOTS, EQUIPMENT_SLOT_COUNT } from './player.js';
import { weaponSpritePath } from './sprites.js';

const EQUIPMENT_LABELS = ['HEAD', 'BODY', 'LEGS', 'GEAR'];
const ANIM_MS = 240;

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.animating = false;
    this.selectedSlot = null;
    this.drag = null;
    this._skipClick = false;
    this._onDragMove = (e) => this._handleDragMove(e);
    this._onDragEnd = (e) => this._handleDragEnd(e);
    this.root = document.getElementById('inventory');
    this.panel = document.getElementById('inventory-panel');
    this.bgImg = document.getElementById('inventory-bg');
    this.weaponsEl = document.getElementById('inv-weapons-grid');
    this.equipmentEl = document.getElementById('inv-equipment-grid');
    this.itemsEl = document.getElementById('inv-items-grid');

    if (this.bgImg) {
      this.bgImg.addEventListener('error', () => {
        if (this.bgImg.dataset.fallback) return;
        this.bgImg.dataset.fallback = '1';
        this.bgImg.src = InventoryUI.fallbackImage();
      }, { once: true });
    }

    this.backdrop = this.root?.querySelector('.inv-backdrop');
    this.backdrop?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.close();
    });
    this.panel?.addEventListener('click', (e) => e.stopPropagation());
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

  isOpen() {
    return this.open;
  }

  toggle() {
    if (this.animating) return;
    if (this.open) this.close();
    else this.openPanel();
  }

  openPanel() {
    if (!this.running() || this.animating) return;
    this.open = true;
    this.animating = true;
    this.selectedSlot = null;
    this.game.player?.melee && (this.game.player.melee.charging = false);
    this.game.mouseDown = false;
    this.game.prevMouseDown = false;
    this.root?.classList.remove('hidden');
    this.render();
    requestAnimationFrame(() => {
      this.root?.classList.add('open');
      setTimeout(() => { this.animating = false; }, ANIM_MS);
    });
  }

  close() {
    if (!this.open || this.animating) return;
    this._cancelDrag();
    this.animating = true;
    this.selectedSlot = null;
    this.root?.classList.remove('open');
    setTimeout(() => {
      this.root?.classList.add('hidden');
      this.open = false;
      this.animating = false;
    }, ANIM_MS);
  }

  forceClose() {
    this._cancelDrag();
    this.open = false;
    this.animating = false;
    this.selectedSlot = null;
    this.root?.classList.remove('open');
    this.root?.classList.add('hidden');
  }

  running() {
    return this.game.running && this.game.player?.alive;
  }

  _makeSlot(className, extra = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `${className} ${extra}`.trim();
    return el;
  }

  _weaponIcon(sprite) {
    const img = document.createElement('img');
    img.className = 'inv-icon';
    img.src = weaponSpritePath(sprite);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    return img;
  }

  _itemNameLabel(name) {
    const label = document.createElement('span');
    label.className = 'inv-item-name';
    label.textContent = name;
    return label;
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
    this.selectedSlot = null;
    this.render();
  }

  _canDropOnMain() {
    const player = this.drag?.player;
    if (!player || this.drag?.fromType !== 'item') return false;
    const data = this._dragItemData();
    return !!(data?.kind === 'weapon' && WEAPONS[data.key]);
  }

  _dragItemData() {
    if (this.drag?.stashedItem) return this.drag.stashedItem;
    return this.drag?.player?.itemSlots[this.drag?.fromIndex ?? -1] ?? null;
  }

  _pickUpDragItem() {
    const player = this.drag?.player;
    const index = this.drag?.fromIndex;
    if (!player || index == null) return;
    const item = player.itemSlots[index];
    if (!item) return;
    this.drag.stashedItem = item;
    player.itemSlots[index] = null;
    this.render();
  }

  _restoreDragItem() {
    const player = this.drag?.player;
    const index = this.drag?.fromIndex;
    if (!player || index == null || !this.drag?.stashedItem) return;
    if (player.itemSlots[index] == null) {
      player.itemSlots[index] = this.drag.stashedItem;
    }
  }

  _bindItemSlotDrag(slot, index, player) {
    slot.dataset.slotIndex = String(index);
    slot.addEventListener('pointerdown', (e) => {
      if (slot.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      slot.setPointerCapture?.(e.pointerId);
      this._beginDrag(e, 'item', index, player);
    });
  }

  _beginDrag(e, fromType, index, player) {
    this._cancelDrag();
    this.drag = {
      fromType,
      fromIndex: index,
      player,
      stashedItem: null,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ghost: null,
      dropTarget: null,
    };
    document.addEventListener('pointermove', this._onDragMove);
    document.addEventListener('pointerup', this._onDragEnd);
    document.addEventListener('pointercancel', this._onDragEnd);
  }

  _handleDragMove(e) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;
    if (!this.drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      this.drag.moved = true;
      this.selectedSlot = null;
      this._pickUpDragItem();
      this._createDragGhost(e);
    }
    if (this.drag.ghost) {
      this.drag.ghost.style.left = `${e.clientX}px`;
      this.drag.ghost.style.top = `${e.clientY}px`;
    }
    this._updateDropTarget(e);
  }

  _createDragGhost(e) {
    const data = this._dragItemData();
    const ghost = document.createElement('div');
    ghost.className = 'inv-drag-ghost';
    if (data?.kind === 'weapon') {
      const cfg = WEAPONS[data.key];
      ghost.appendChild(this._weaponIcon(cfg.sprite));
    } else {
      ghost.textContent = '—';
    }
    document.body.appendChild(ghost);
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    this.drag.ghost = ghost;
  }

  _updateDropTarget(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    let next = null;
    const main = el?.closest('.inv-weapon-slot.inv-primary[data-drop-zone="main"]');
    const item = el?.closest('.inv-item-slot[data-slot-index]:not(.inv-locked)');

    if (main && this._canDropOnMain()) next = main;
    else if (item) next = item;

    if (this.drag.dropTarget === next) return;
    this.drag.dropTarget?.classList.remove('inv-drop-target');
    this.drag.dropTarget = next;
    next?.classList.add('inv-drop-target');
  }

  _handleDragEnd(e) {
    if (!this.drag) return;
    document.removeEventListener('pointermove', this._onDragMove);
    document.removeEventListener('pointerup', this._onDragEnd);
    document.removeEventListener('pointercancel', this._onDragEnd);

    const { fromIndex, player, moved, dropTarget, stashedItem } = this.drag;
    this._clearDragVisuals();
    let placed = false;

    if (moved && dropTarget && stashedItem) {
      if (dropTarget.dataset.dropZone === 'main') {
        player.itemSlots[fromIndex] = stashedItem;
        if (player.swapItemSlotWithMain(fromIndex)) {
          this.selectedSlot = null;
          this._skipClick = true;
          placed = true;
        } else {
          player.itemSlots[fromIndex] = null;
        }
      } else if (dropTarget.dataset.slotIndex !== undefined) {
        const toIndex = Number(dropTarget.dataset.slotIndex);
        if (toIndex !== fromIndex && player.isItemSlotUnlocked(toIndex)) {
          const displaced = player.itemSlots[toIndex];
          player.itemSlots[toIndex] = stashedItem;
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

    this.drag = null;
    if (moved) this.render();
  }

  _clearDragVisuals() {
    this.drag?.ghost?.remove();
    this.root?.querySelectorAll('.inv-drop-target').forEach((el) => {
      el.classList.remove('inv-drop-target');
    });
  }

  _cancelDrag() {
    if (!this.drag) return;
    document.removeEventListener('pointermove', this._onDragMove);
    document.removeEventListener('pointerup', this._onDragEnd);
    document.removeEventListener('pointercancel', this._onDragEnd);
    const moved = this.drag.moved;
    this._restoreDragItem();
    this._clearDragVisuals();
    this.drag = null;
    if (moved) this.render();
  }

  render() {
    const player = this.game.player;
    if (!player || !this.weaponsEl || !this.equipmentEl || !this.itemsEl) return;

    this.weaponsEl.innerHTML = '';
    this.equipmentEl.innerHTML = '';
    this.itemsEl.innerHTML = '';

    const primary = this._makeSlot('inv-weapon-slot');
    primary.classList.add('inv-primary');
    primary.dataset.dropZone = 'main';
    if (player.weaponKey) {
      if (!player.isMeleeActive()) primary.classList.add('inv-active');
      const cfg = WEAPONS[player.weaponKey];
      primary.appendChild(this._weaponIcon(cfg.sprite));
      const tag = document.createElement('span');
      tag.className = 'inv-slot-tag';
      tag.textContent = 'MAIN';
      primary.appendChild(tag);
      primary.appendChild(this._itemNameLabel(cfg.name));
    } else {
      primary.classList.add('inv-empty-slot');
      primary.textContent = 'MAIN';
    }
    primary.title = 'Main weapon — drop a gun here to equip';
    primary.addEventListener('click', () => {
      if (player.weaponKey) {
        player.setWeaponSlot('gun');
        this.render();
      }
    });
    this.weaponsEl.appendChild(primary);

    const secondary = this._makeSlot('inv-weapon-slot');
    secondary.classList.add('inv-secondary');
    if (player.isMeleeActive()) secondary.classList.add('inv-active');
    secondary.appendChild(this._weaponIcon(player.getActiveMelee().sprite));
    const secTag = document.createElement('span');
    secTag.className = 'inv-slot-tag';
    secTag.textContent = player.getActiveMelee().name;
    secondary.appendChild(secTag);
    secondary.title = 'Melee weapon';
    secondary.addEventListener('click', () => {
      player.equipMelee(player.meleeKey);
      this.render();
    });
    this.weaponsEl.appendChild(secondary);

    for (let i = 0; i < EQUIPMENT_SLOT_COUNT; i++) {
      const slot = this._makeSlot('inv-equip-slot', 'inv-locked');
      slot.disabled = true;
      const label = document.createElement('span');
      label.className = 'inv-lock-label';
      label.textContent = EQUIPMENT_LABELS[i];
      slot.appendChild(label);
      const lock = document.createElement('span');
      lock.className = 'inv-lock-icon';
      lock.textContent = '🔒';
      slot.appendChild(lock);
      this.equipmentEl.appendChild(slot);
    }

    for (let i = 0; i < ITEM_STORAGE_SIZE; i++) {
      const unlocked = player.isItemSlotUnlocked(i);
      const slot = this._makeSlot('inv-item-slot', unlocked ? '' : 'inv-locked');
      const data = player.itemSlots[i];

      if (this.selectedSlot === i) slot.classList.add('inv-selected');

      if (!unlocked) {
        slot.disabled = true;
        slot.appendChild(Object.assign(document.createElement('span'), {
          className: 'inv-lock-icon',
          textContent: '🔒',
        }));
      } else if (data?.kind === 'weapon') {
        const cfg = WEAPONS[data.key];
        const st = player.weaponInventory.get(data.key);
        slot.appendChild(this._weaponIcon(cfg.sprite));
        slot.appendChild(this._itemNameLabel(cfg.name));
        this._bindItemSlotDrag(slot, i, player);
        slot.addEventListener('click', (e) => {
          if (this._skipClick) { this._skipClick = false; return; }
          if (this.selectedSlot !== null || e.shiftKey) {
            this._onItemSlotClick(i, player);
            return;
          }
          player.equipStoredWeapon(data.key);
          this.render();
        });
      } else if (unlocked) {
        slot.classList.add('inv-empty-slot');
        this._bindItemSlotDrag(slot, i, player);
        slot.addEventListener('click', (e) => {
          if (this._skipClick) { this._skipClick = false; return; }
          if (this.selectedSlot !== null || e.shiftKey) {
            this._onItemSlotClick(i, player);
          }
        });
      }

      this.itemsEl.appendChild(slot);
    }
  }
}
