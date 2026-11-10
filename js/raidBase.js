import { Player, WEAPONS } from './player.js';
import { capturePlayerState } from './saveGame.js';
import { getItemDescription, getItemDisplayName, getItemIconSrc } from './loot.js';
import { INV_LOCK_SRC } from './inventory.js';
import { equipmentSlotFor } from './equipment.js';
import { applyRecycleYields, canCraftRecipe, canRecycleItem, craftRecipe, getCraftableRecipes, getRecycleYields, SHOP_RECIPES } from './crafting.js';

export const EXTRACT_RADIUS = 5;
export const EXTRACT_SECONDS = 3;
const XP_PER_LEVEL = 100;
export const raidLevel = (profile) => 1 + Math.floor(profile.xp / XP_PER_LEVEL);

export function stashLimit(profile) {
  const level = raidLevel(profile);
  return level >= 50 ? 120 : level >= 40 ? 100 : level >= 30 ? 80 : level >= 20 ? 60 : level >= 10 ? 50 : 40;
}

function freshKit(empty = false) {
  const player = new Player();
  if (empty) {
    player.itemSlots.fill(null);
    player.handSlots.fill(null);
    player.equipmentSlots.fill(null);
    player._applyActiveHand();
  }
  return capturePlayerState(player);
}

export function newRaidProfile(previous = null) {
  const profile = { xp: 0, cash: 100, extractions: 0, losses: 0, extractedKills: 0, crafts: 0, claimed: [], stash: [], stashStackVersion: 1, kit: freshKit() };
  if (previous?.player) {
    const player = new Player();
    player.applySaveData(previous.player);
    profile.stash = [
      ...player.drainLockedInventory(),
      ...(previous.groundDrops ?? []).map((drop) => drop.item).filter(Boolean),
    ];
    profile.kit = capturePlayerState(player);
  }
  return profile;
}

export function deployProfile(profile) {
  const kit = freshKit(true);
  kit.learnedBlueprints = [...profile.kit.learnedBlueprints];
  return { ...profile, kit, deployed: true };
}

export function extractProfile(profile, player, kills) {
  return {
    ...profile,
    deployed: false,
    xp: profile.xp + 120 + kills * 25,
    cash: profile.cash + 75 + kills * 10,
    extractedKills: profile.extractedKills + kills,
    extractions: profile.extractions + 1,
    kit: capturePlayerState(player),
  };
}

export function loseRaidProfile(profile) {
  return { ...profile, deployed: false, losses: profile.losses + 1 };
}

const SHOP = [
  { level: 1, price: 20, item: { kind: 'ammo', ammoType: 'pistol', amount: 24 } },
  { level: 1, price: 15, item: { kind: 'consumable', key: 'bandage', amount: 2 } },
  { level: 20, price: 90, item: { kind: 'weapon', key: 'glock', ammo: WEAPONS.glock.magSize } },
  { level: 20, price: 100, item: { kind: 'equipment', key: 'backpack_1' } },
  { level: 20, price: 110, item: { kind: 'equipment', key: 'vest' } },
  ...SHOP_RECIPES.map((offer) => offer.item.kind === 'weapon'
    ? { ...offer, item: { ...offer.item, ammo: WEAPONS[offer.item.key].magSize } } : offer),
];

export function normalizeRaidProfile(profile) {
  const { credits, ...saved } = profile;
  const normalized = {
    ...saved,
    cash: saved.cash ?? credits ?? 100,
    extractedKills: saved.extractedKills ?? 0,
    crafts: saved.crafts ?? 0,
    claimed: saved.claimed ?? [],
  };
  if (!normalized.stashStackVersion) {
    const previous = normalized.stash;
    const player = new Player();
    normalized.stash = [];
    for (const item of previous) {
      if (!item) continue;
      if (!storeInStash(normalized, player, [item])) normalized.stash.push(item);
    }
    normalized.stashStackVersion = 1;
  }
  return normalized;
}

const CHALLENGES = [
  { id: 'first_extract', title: 'First Return', description: 'Complete one successful extraction.', metric: 'extractions', goal: 1, xp: 100 },
  { id: 'robot_hunter', title: 'Machine Breaker', description: 'Extract after destroying five robots across raids.', metric: 'extractedKills', goal: 5,
    xp: 150, item: { kind: 'equipment', key: 'vest' } },
  { id: 'workshop', title: 'Field Technician', description: 'Craft three items at the base station.', metric: 'crafts', goal: 3,
    xp: 100, item: { kind: 'material', key: 'mechanical_comp', amount: 3 } },
  { id: 'extract_5', title: 'Reliable Runner', description: 'Complete five successful extractions.', metric: 'extractions', goal: 5,
    xp: 200, item: { kind: 'equipment', key: 'backpack_1' } },
];

export function challengeProgress(profile, raidKills = 0) {
  return CHALLENGES.map((challenge) => ({
    ...challenge,
    progress: Math.min(challenge.goal, profile[challenge.metric] + (challenge.metric === 'extractedKills' ? raidKills : 0)),
    claimed: profile.claimed.includes(challenge.id),
  }));
}

export function claimChallenge(profile, id) {
  const challenge = CHALLENGES.find((entry) => entry.id === id);
  if (!challenge || profile.claimed.includes(id) || profile[challenge.metric] < challenge.goal) {
    return 'Challenge reward is unavailable.';
  }
  const nextXP = profile.xp + challenge.xp;
  if (challenge.item) {
    const staged = { ...profile, xp: nextXP };
    if (!storeInStash(staged, new Player(), [challenge.item])) return 'Make space in your stash to claim this reward.';
    profile.stash = staged.stash;
  }
  profile.xp = nextXP;
  profile.claimed.push(id);
}

function stashInventory(profile, player) {
  const inventory = Object.create(player);
  const limit = stashLimit(profile);
  inventory.itemSlots = Array.from({ length: Math.max(limit, profile.stash.length) }, (_, i) =>
    profile.stash[i] ? { ...profile.stash[i] } : null);
  inventory.isItemSlotUnlocked = (i) => i >= 0 && i < limit;
  return inventory;
}

export function storeInStash(profile, player, items) {
  const inventory = stashInventory(profile, player);
  for (const item of items) {
    const result = inventory.tryStoreItem({ ...item });
    if (!result.ok || result.remainder) return false;
  }
  profile.stash = inventory.itemSlots;
  return true;
}

export function craftAtBase(profile, player, recipe) {
  const inventory = stashInventory(profile, player);
  if (!getCraftableRecipes(player).includes(recipe) || !craftRecipe(inventory, recipe)) {
    return 'Need materials and space in your stash.';
  }
  profile.stash = inventory.itemSlots;
  profile.crafts++;
}

export function recycleAtBase(profile, player, index) {
  const inventory = stashInventory(profile, player);
  const item = inventory.itemSlots[index];
  const yields = getRecycleYields(item, item?.amount ?? 1);
  if (!yields?.length) return 'This item cannot be recycled.';
  inventory.itemSlots[index] = null;
  if (applyRecycleYields(inventory, yields).length) return 'Make space for the recovered materials.';
  profile.stash = inventory.itemSlots;
}

export class RaidBase {
  constructor(root, { save, deploy, exit }) {
    this.root = root;
    this.save = save;
    this.status = root.querySelector('[role=status]');
    this.dialogStatus = root.querySelector('#raid-deploy-status');
    this.selection = root.querySelector('#raid-selection');
    this.slotPositions = new WeakMap();
    document.addEventListener('pointerdown', (event) => {
      if (!this.selection.classList.contains('hidden') && !this.selection.contains(event.target)) {
        this.closeSelection();
      }
    }, true);
    this.stashPanel = root.querySelector('[data-base-panel="stash"]');
    this.workspace = this.stashPanel.parentElement;
    this.deployDialog = root.querySelector('#raid-deploy-dialog');
    this.station = 'deploy';
    this.catalogSelection = null;
    this.music = new Audio('sounds/ui/menu_song.ogg');
    this.music.loop = true;
    this.music.preload = 'none';
    this.music.volume = 0.28;
    root.addEventListener('pointerdown', () => this.startMusic());
    root.addEventListener('keydown', () => this.startMusic());
    root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button && button.id !== 'raid-deploy-confirm') this.playCue([520]);
    }, true);
    root.querySelector('#raid-deploy').addEventListener('click', () => {
      const review = this.deployDialog.querySelector('.raid-deploy-review');
      review.append(this.stashPanel, this.selection);
      this.dialogStatus.textContent = '';
      this.deployDialog.showModal();
      this.render();
    });
    root.querySelector('#raid-deploy-cancel').addEventListener('click', () => this.deployDialog.close());
    root.querySelector('#raid-deploy-confirm').addEventListener('click', () => {
      this.playCue([330, 440, 660]);
      this.deployDialog.close();
      deploy();
    });
    this.deployDialog.addEventListener('close', () => {
      this.workspace.append(this.stashPanel, this.selection);
      if (!this.root.classList.contains('hidden')) this.render();
    });
    root.querySelector('#raid-base-exit').addEventListener('click', exit);
    for (const tab of root.querySelectorAll('[data-station]')) {
      tab.addEventListener('click', () => {
        if (this.station === tab.dataset.station) return;
        this.station = tab.dataset.station;
        this.catalogSelection = null;
        this.render();
        const panel = root.querySelector(`[data-base-panel="${this.station}"]`);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          panel.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 180, easing: 'ease-out' });
        }
      });
    }
  }

  show(profile, message = '') {
    const entering = this.root.classList.contains('hidden');
    if (entering) {
      this.station = 'deploy';
      this.catalogSelection = null;
    }
    this.profile = profile;
    this.root.classList.remove('hidden');
    if (entering) this.startMusic();
    this.setStatus(message);
    this.render();
  }

  hide() {
    if (this.deployDialog.open) this.deployDialog.close();
    this.closeSelection();
    this.root.classList.add('hidden');
    this.music.pause();
    if (this.music.readyState > 0) this.music.currentTime = 0;
  }

  startMusic() {
    if (!this.root.classList.contains('hidden') && this.music.paused) {
      this.music.play().catch(() => {});
    }
  }

  playCue(notes) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = this.audioContext ??= new Context();
    const play = () => {
      const now = context.currentTime;
      for (const [index, frequency] of notes.entries()) {
        const start = now + index * 0.075;
        const tone = context.createOscillator();
        const gain = context.createGain();
        tone.type = 'triangle';
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(notes.length === 1 ? 0.025 : 0.065, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
        tone.connect(gain);
        gain.connect(context.destination);
        tone.start(start);
        tone.stop(start + 0.075);
      }
    };
    if (context.state === 'running') play();
    else context.resume().then(play).catch(() => {});
  }

  setStatus(message) {
    this.status.textContent = message;
    this.dialogStatus.textContent = message;
  }

  transact(change) {
    const next = structuredClone(this.profile);
    const player = new Player();
    player.applySaveData(next.kit);
    const error = change(next, player);
    if (error) {
      this.setStatus(error);
      return;
    }
    next.kit = capturePlayerState(player);
    if (!this.save(next)) {
      this.setStatus('Could not save the change.');
      return;
    }
    this.show(next, 'Saved to base.');
    return true;
  }

  render() {
    const profile = this.profile;
    this.root.querySelector('#raid-stats').textContent =
      `Level ${raidLevel(profile)}  ·  ${profile.xp % XP_PER_LEVEL}/${XP_PER_LEVEL} XP  ·  ${profile.extractions} extracts  ·  ${profile.losses} lost raids`;
    this.root.querySelector('#raid-cash').textContent = `${profile.cash.toLocaleString()} Cash`;
    for (const tab of this.root.querySelectorAll('[data-station]')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.station === this.station));
    }
    for (const panel of this.root.querySelectorAll('[data-base-panel]')) {
      const station = this.deployDialog.open ? 'stash' : this.station;
      panel.classList.toggle('hidden', panel.dataset.basePanel !== station);
    }
    this.selection.classList.add('hidden');
    const catalog = !this.deployDialog.open && ['craft', 'shop'].includes(this.station);
    this.workspace.classList.toggle('raid-catalog-active', catalog);
    if (this.deployDialog.open || this.station === 'stash') this.renderStash();
    else if (this.station === 'deploy') this.renderChallenges();
    if (this.station === 'craft') this.renderCraft();
    if (this.station === 'shop') this.renderShop();
  }

  renderChallenges() {
    const grid = this.root.querySelector('#raid-challenges');
    grid.replaceChildren();
    for (const challenge of challengeProgress(this.profile)) {
      const card = document.createElement('article');
      const title = document.createElement('h3');
      title.textContent = challenge.title;
      const desc = document.createElement('p');
      desc.textContent = challenge.description;
      const progress = document.createElement('progress');
      progress.max = challenge.goal;
      progress.value = challenge.progress;
      progress.setAttribute('aria-label', challenge.title);
      const reward = document.createElement('p');
      reward.textContent = `${progress.value}/${progress.max} · ${challenge.xp} XP${challenge.item ? ` + ${getItemDisplayName(challenge.item)}` : ''}`;
      const claimed = challenge.claimed;
      card.append(title, desc, progress, reward, this.button(claimed ? 'Claimed' : 'Claim reward',
        () => this.transact((next) => claimChallenge(next, challenge.id)), claimed || progress.value < progress.max));
      grid.appendChild(card);
    }
  }

  transferItem(source, key, index) {
    this.transact((next, loadout) => {
      if (source === 'stash') {
        const item = next.stash[index];
        if (!item) return 'Item is no longer in the stash.';
        const result = loadout.tryLootItem(item);
        if (!result.ok) return 'No space in your loadout.';
        if (result.remainder) next.stash[index] = result.remainder;
        else next.stash[index] = null;
        return;
      }
      const item = key === 'handSlots' ? loadout.suspendHandSlotForDrag(index)
        : key === 'equipmentSlots' ? loadout.suspendEquipmentForDrag(index) : loadout.itemSlots[index];
      if (!item) return 'Item is no longer in the loadout.';
      if (key === 'itemSlots') loadout.itemSlots[index] = null;
      const deposit = [item, ...loadout.drainLockedInventory()];
      if (!storeInStash(next, loadout, deposit)) return 'Not enough stash space.';
    });
  }

  rearrangeSlots(from, to) {
    if (from.key === to.key && from.index === to.index) return;
    this.transact((next, player) => {
      const slots = (position) => position.source === 'stash' ? next.stash : player[position.key];
      const item = slots(from)[from.index];
      const displaced = slots(to)[to.index] ?? null;
      const accepts = ({ source, key, index }, entry) => {
        if (source === 'stash') return !entry || index < stashLimit(next);
        if (key === 'itemSlots') return player.isItemSlotUnlocked(index);
        if (key === 'equipmentSlots') return !entry || equipmentSlotFor(entry) === index;
        return !entry || entry.kind === 'weapon' || entry.kind === 'melee';
      };
      if (!item || !accepts(to, item) || !accepts(from, displaced)) return 'Item does not fit in that slot.';
      if (displaced && (!to.key || to.key === 'itemSlots')) {
        const target = Object.create(player);
        target.itemSlots = [{ ...displaced }];
        target.isItemSlotUnlocked = (index) => index === 0;
        const merged = target.tryStoreItem(item);
        if (merged.ok) {
          slots(to)[to.index] = target.itemSlots[0];
          slots(from)[from.index] = merged.remainder;
          return;
        }
        if (item.kind === displaced.kind && ['ammo', 'material', 'consumable'].includes(item.kind)
          && item.key === displaced.key && item.ammoType === displaced.ammoType) return 'That stack is full.';
      }
      const write = ({ source, key, index }, entry) => {
        if (source === 'stash') {
          while (next.stash.length <= index) next.stash.push(null);
          next.stash[index] = entry;
        } else if (key === 'handSlots') {
          player.suspendHandSlotForDrag(index);
          if (entry) player.restoreHandSlot(index, entry);
        } else {
          player[key][index] = entry;
        }
      };
      write(from, displaced);
      write(to, item);
      if (player.itemSlots.some((entry, index) => entry && !player.isItemSlotUnlocked(index))) {
        return 'Empty the backpack slots before removing it.';
      }
    });
  }

  bindTransfer(slot, source, key, index) {
    const transfer = () => this.transferItem(source, key, index);
    slot.classList.add('raid-transfer-slot');
    let drag = null;
    const target = this.root.querySelector(source === 'stash' ? '#raid-kit' : '#raid-stash').closest('.raid-base-section');
    const overTarget = (event) => {
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      return target.contains(hovered);
    };
    const move = (event) => {
      if (drag?.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) {
        drag.moved = true;
        slot.classList.add('raid-dragging');
        if (!drag.ghost) {
          drag.ghost = slot.cloneNode(true);
          drag.ghost.classList.remove('raid-dragging');
          drag.ghost.classList.add('raid-drag-ghost');
          drag.ghost.setAttribute('aria-hidden', 'true');
          drag.ghost.tabIndex = -1;
          drag.ghost.style.width = `${slot.offsetWidth}px`;
          drag.ghost.style.height = `${slot.offsetHeight}px`;
          (this.deployDialog.open ? this.deployDialog : this.root).appendChild(drag.ghost);
        }
        drag.ghost.style.left = `${event.clientX}px`;
        drag.ghost.style.top = `${event.clientY}px`;
      }
      target.classList.toggle('raid-drop-target', drag.moved && overTarget(event));
    };
    const cleanup = () => {
      drag?.listeners.abort();
      drag?.ghost?.remove();
      drag = null;
      slot.classList.remove('raid-dragging');
      target.classList.remove('raid-drop-target');
    };
    const end = (event) => {
      if (drag?.id !== event.pointerId) return;
      const moved = drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6;
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      const destination = this.slotPositions.get(hovered?.closest('.raid-base-slot'));
      const commit = event.type === 'pointerup' && moved;
      cleanup();
      if (moved) this._suppressSlotClick = slot;
      if (!commit) return;
      if (destination?.source === source) this.rearrangeSlots({ source, key, index }, destination);
      else if (target.contains(hovered)) transfer();
    };
    slot.addEventListener('pointerdown', (event) => {
      this._suppressSlotClick = null;
      if (event.button !== 0 || event.shiftKey || drag) return;
      event.preventDefault();
      const listeners = new AbortController();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, listeners };
      const options = { capture: true, signal: listeners.signal };
      window.addEventListener('pointermove', move, options);
      window.addEventListener('pointerup', end, options);
      window.addEventListener('pointercancel', end, options);
      window.addEventListener('blur', cleanup, options);
    });
    slot.addEventListener('click', (event) => {
      if (this._suppressSlotClick === slot || event.shiftKey) {
        event.stopImmediatePropagation();
        const suppressed = this._suppressSlotClick === slot;
        this._suppressSlotClick = null;
        if (!suppressed) transfer();
      }
    }, true);
  }

  renderStash() {
    const { kit, stash } = this.profile;
    const limit = stashLimit(this.profile);
    this.root.querySelector('#raid-stash-title').textContent = `Stash · ${stash.filter(Boolean).length}/${limit}`;
    const kitGrid = this.root.querySelector('#raid-kit');
    const gearGrid = this.root.querySelector('#raid-gear');
    const stashGrid = this.root.querySelector('#raid-stash');
    stashGrid.style.setProperty('--raid-stash-rows', Math.max(1, Math.ceil(Math.max(limit, stash.length) / 10)));
    const stashScroll = stashGrid.scrollTop;
    kitGrid.replaceChildren();
    gearGrid.replaceChildren();
    stashGrid.replaceChildren();
    const player = new Player();
    player.applySaveData(kit);
    for (const key of ['equipmentSlots', 'handSlots', 'itemSlots']) {
      kit[key].forEach((entry, index) => {
        const locked = key === 'itemSlots' && !player.isItemSlotUnlocked(index);
        const item = locked ? null : entry;
        const slot = this.slot(key === 'itemSlots' ? kitGrid : gearGrid, item, item ? (anchor) => this.inspectKit(item, key, index, anchor) : null, '',
          locked ? INV_LOCK_SRC : key === 'handSlots' ? ['assets/ui/weapon1.png', 'assets/ui/weapon2.png'][index]
            : key === 'equipmentSlots' ? ['assets/ui/vest.png', 'assets/ui/backpack.png'][index] : null);
        if (locked) slot.setAttribute('aria-label', 'Locked inventory slot');
        this.slotPositions.set(slot, { source: 'kit', key, index });
        if (item) this.bindTransfer(slot, 'kit', key, index);
      });
    }
    for (let i = 0; i < Math.max(limit, stash.length); i++) {
      const item = stash[i];
      const slot = this.slot(stashGrid, item, item ? (anchor) => {
        const actions = [['Take into loadout', () => this.transferItem('stash', null, i)]];
        const detail = document.createElement('div');
        const description = document.createElement('p');
        description.textContent = getItemDescription(item);
        detail.append(description);
        if (canRecycleItem(item)) {
          const yields = getRecycleYields(item, item.amount ?? 1)
            .map((entry) => getItemDisplayName({ kind: 'material', ...entry })).join(', ');
          const salvage = document.createElement('p');
          salvage.textContent = `Recycle yield · ${yields}`;
          detail.append(salvage);
          actions.push(['Recycle stack', () => this.transact((next, loadout) => recycleAtBase(next, loadout, i))]);
        }
        this.addSplitAction(item, actions, detail, (next, amount) => {
          const empty = Array.from({ length: stashLimit(next) }).findIndex((_, index) => !next.stash[index]);
          if (empty < 0) return 'Stash is full.';
          const source = next.stash[i];
          next.stash[empty] = { ...source, amount };
          next.stash[i] = { ...source, amount: source.amount - amount };
        });
        if (raidLevel(this.profile) >= 10 && item.kind === 'material') {
          const price = (item.amount ?? 1) * 2;
          actions.push([`Sell · ${price} Cash`, () => this.transact((next) => {
            next.stash[i] = null;
            next.cash += price;
          })]);
        }
        this.inspect(item, actions, detail, anchor);
      } : null);
      this.slotPositions.set(slot, { source: 'stash', key: null, index: i });
      if (item) this.bindTransfer(slot, 'stash', null, i);
    }
    stashGrid.scrollTop = stashScroll;
  }

  inspectKit(item, key, index, anchor) {
    const actions = [['Move to stash', () => this.transferItem('kit', key, index)]];
    const detail = document.createElement('div');
    const description = document.createElement('p');
    description.textContent = getItemDescription(item);
    detail.append(description);
    if (key === 'itemSlots') {
      this.addSplitAction(item, actions, detail, (next, amount, player) => {
        const empty = player.itemSlots.findIndex((entry, i) => !entry && player.isItemSlotUnlocked(i));
        if (empty < 0) return 'No empty loadout slot.';
        const source = player.itemSlots[index];
        player.itemSlots[empty] = { ...source, amount };
        player.itemSlots[index] = { ...source, amount: source.amount - amount };
      });
    }
    if (canRecycleItem(item)) {
      actions.push(['Recycle to stash', () => this.transact((next, player) => {
        const current = key === 'handSlots' ? player.suspendHandSlotForDrag(index)
          : key === 'equipmentSlots' ? player.suspendEquipmentForDrag(index) : player.itemSlots[index];
        if (key === 'itemSlots') player.itemSlots[index] = null;
        const empty = Array.from({ length: stashLimit(next) }).findIndex((_, index) => !next.stash[index]);
        if (empty < 0) return 'Make room in the stash first.';
        next.stash[empty] = current;
        return recycleAtBase(next, player, empty);
      })]);
    }
    this.inspect(item, actions, detail, anchor);
  }

  addSplitAction(item, actions, detail, split) {
    if (!['material', 'ammo', 'consumable', 'bandage', 'throwable'].includes(item.kind) || !(item.amount > 1)) return;
    const label = document.createElement('label');
    label.className = 'raid-split';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(item.amount - 1);
    slider.value = String(Math.floor(item.amount / 2));
    const amountLabel = document.createElement('span');
    const update = () => { amountLabel.textContent = `Split quantity · ${slider.value}`; };
    slider.addEventListener('input', update);
    update();
    label.append(amountLabel, slider);
    detail.append(label);
    actions.push(['Split stack', () => this.transact((next, player) => split(next, Number(slider.value), player))]);
  }

  renderCraft() {
    const grid = this.root.querySelector('#raid-recipes');
    grid.replaceChildren();
    const player = new Player();
    player.applySaveData(this.profile.kit);
    const inventory = stashInventory(this.profile, player);
    const recipes = getCraftableRecipes(player).map((recipe) => ({ recipe, ready: canCraftRecipe(inventory, recipe) }));
    recipes.sort((a, b) => Number(b.ready) - Number(a.ready));
    for (const { recipe, ready } of recipes) {
      const hasMaterials = inventory.hasMaterials(recipe.costs);
      const status = ready ? 'Ready' : hasMaterials ? 'Stash full' : 'Missing materials';
      const card = document.createElement('div');
      card.className = 'raid-recipe-card';
      card.dataset.ready = String(ready);
      const detail = document.createElement('div');
      const requirements = document.createElement('ul');
      requirements.className = 'raid-recipe-materials';
      for (const [key, amount] of Object.entries(recipe.costs)) {
        const have = inventory.countMaterial(key);
        const row = document.createElement('li');
        row.dataset.enough = String(have >= amount);
        const icon = document.createElement('img');
        icon.src = getItemIconSrc({ kind: 'material', key });
        icon.alt = '';
        row.append(icon, `${getItemDisplayName({ kind: 'material', key })} · ${have}/${amount}`);
        requirements.appendChild(row);
      }
      detail.append(status, requirements);
      const select = (anchor, keepPosition = false) => {
        this.catalogSelection = recipe.id;
        this.inspect(recipe.output,
          [['Craft to stash', () => this.transact((next, loadout) => craftAtBase(next, loadout, recipe)), !ready]], detail, anchor, keepPosition);
      };
      const slot = this.slot(card, recipe.output, select);
      slot.removeAttribute('title');
      const label = document.createElement('small');
      label.textContent = status;
      card.append(label);
      grid.appendChild(card);
      if (recipe.id === this.catalogSelection) select(slot, true);
    }
  }

  renderShop() {
    const grid = this.root.querySelector('#raid-shop');
    grid.replaceChildren();
    const entries = SHOP.map((offer, index) => ({ offer, index }));
    for (const { offer, index } of entries) {
      const unlocked = raidLevel(this.profile) >= offer.level;
      const price = `${offer.price} Cash`;
      const select = (anchor, keepPosition = false) => {
        this.catalogSelection = index;
        this.inspect(offer.item, [[unlocked ? `Buy · ${price}` : `Unlocks at level ${offer.level}`,
        () => {
          if (!this.transact((next, player) => {
            if (next.cash < offer.price) return 'Not enough cash.';
            if (!storeInStash(next, player, [offer.item])) return 'Stash is full.';
            next.cash -= offer.price;
          })) return;
          this.playCue([660, 880]);
          if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.root.querySelector('.raid-base-balance').animate(
              [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', color: '#f5ce86' }, { transform: 'scale(1)' }],
              { duration: 250, easing: 'ease-out' });
          }
        }, !unlocked || this.profile.cash < offer.price]], price, anchor, keepPosition);
      };
      const slot = this.slot(grid, offer.item, select, unlocked ? '' : `Lv ${offer.level}`);
      if (index === this.catalogSelection) select(slot, true);
    }
  }

  inspect(item, actions, detail, anchor, keepPosition = false) {
    const title = document.createElement('h2');
    title.textContent = getItemDisplayName(item);
    const description = detail instanceof HTMLElement ? detail : document.createElement('p');
    if (typeof detail === 'string') description.textContent = detail || getItemDescription(item);
    title.className = 'inv-context-title';
    description.classList.add('inv-context-desc');
    const buttons = document.createElement('div');
    buttons.className = 'inv-context-actions';
    const close = this.button('Close', () => this.closeSelection());
    buttons.append(...actions.map((action) => this.button(...action)), close);
    this.selection.replaceChildren(title, description, buttons);
    this.selection.classList.remove('hidden');
    if (keepPosition) return;
    const rect = anchor.getBoundingClientRect();
    const width = this.selection.offsetWidth;
    const height = this.selection.offsetHeight;
    const viewport = window.visualViewport;
    const maxX = viewport?.width ?? window.innerWidth;
    const maxY = viewport?.height ?? window.innerHeight;
    const left = rect.right + width + 8 <= maxX ? rect.right + 5 : rect.left - width - 5;
    this.selection.style.left = `${Math.max(8, Math.min(left, maxX - width - 8))}px`;
    this.selection.style.top = `${Math.max(8, Math.min(rect.top, maxY - height - 8))}px`;
  }

  closeSelection() {
    this.catalogSelection = null;
    this.selection.classList.add('hidden');
  }

  slot(parent, item, action, badge = '', placeholderIcon = null) {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'inv-slot-sprite raid-base-slot';
    slot.disabled = !action;
    if (item) {
      const label = getItemDisplayName(item);
      slot.title = label;
      slot.setAttribute('aria-label', label);
      const src = getItemIconSrc(item);
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.draggable = false;
        slot.appendChild(img);
      }
      if ((item.amount ?? 1) > 1 && !badge) badge = String(item.amount);
      slot.addEventListener('click', () => action?.(slot));
      if (action) slot.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        action(slot);
      });
    }
    if (placeholderIcon && !item) {
      const marker = document.createElement('img');
      marker.className = 'raid-gear-placeholder';
      marker.src = placeholderIcon;
      marker.alt = '';
      slot.appendChild(marker);
    }
    if (badge) {
      const tag = document.createElement('span');
      tag.textContent = badge;
      slot.appendChild(tag);
    }
    parent.appendChild(slot);
    return slot;
  }

  button(label, action, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-slice-button';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', action);
    return button;
  }
}
