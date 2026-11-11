import { Player, WEAPONS } from './player.js';
import { capturePlayerState } from './saveGame.js';
import { getItemDescription, getItemDisplayName, getItemIconSrc } from './loot.js';
import { INV_LOCK_SRC } from './inventory.js';
import { equipmentSlotFor, itemDurability } from './equipment.js';
import { setElementPixelText, setElementWrappedPixelText, PIXEL_TEXT_SCALE_SM } from './pixelText.js';
import { applyRecycleYields, canCraftRecipe, canRecycleItem, craftRecipe, getCraftableRecipes, getRecycleYields, SHOP_RECIPES } from './crafting.js';

export const EXTRACT_RADIUS = 5;
export const EXTRACT_SECONDS = 3;
const CATALOG_CATEGORIES = [
  ['Equipment', ['equipment']],
  ['Weapons', ['weapon', 'melee', 'throwable']],
  ['Ammo', ['ammo']],
  ['Consumables', ['consumable', 'bandage']],
  ['Materials', ['material']],
];

function catalogCategory(item) {
  return CATALOG_CATEGORIES.findIndex(([, kinds]) => kinds.includes(item.kind));
}
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
  { level: 4, price: 32, item: { kind: 'ammo', ammoType: 'shotgun', amount: 12 } },
  { level: 8, price: 44, item: { kind: 'ammo', ammoType: 'rifle', amount: 30 } },
  { level: 12, price: 52, item: { kind: 'ammo', ammoType: 'sniper', amount: 12 } },
  { level: 2, price: 25, item: { kind: 'material', key: 'cloth', amount: 5 } },
  { level: 3, price: 30, item: { kind: 'material', key: 'metal', amount: 5 } },
  { level: 5, price: 38, item: { kind: 'material', key: 'chemicals', amount: 4 } },
  { level: 8, price: 48, item: { kind: 'material', key: 'repair_kit', amount: 1 } },
  { level: 5, price: 48, item: { kind: 'melee', key: 'wooden_bat' } },
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

const ROTATION_MS = 3 * 60 * 60 * 1000;
const ROTATING_CHALLENGES = [
  { title: 'Quick Extraction', metric: 'extractions', goal: 1, xp: 80 },
  { title: 'Robot Sweep', metric: 'extractedKills', goal: 3, xp: 120 },
  { title: 'Workshop Shift', metric: 'crafts', goal: 2, xp: 90 },
  { title: 'Double Return', metric: 'extractions', goal: 2, xp: 140 },
  { title: 'Heavy Patrol', metric: 'extractedKills', goal: 6, xp: 180 },
  { title: 'Supply Run', metric: 'crafts', goal: 4, xp: 150 },
];

export function refreshChallengeRotation(profile, now = Date.now()) {
  const period = Math.floor(now / ROTATION_MS);
  if (profile.challengeRotation?.period === period) return false;
  const index = (period * 2) % ROTATING_CHALLENGES.length;
  profile.challengeRotation = {
    period,
    entries: ROTATING_CHALLENGES.slice(index, index + 2).map((entry) => ({
      ...entry, baseline: profile[entry.metric], claimed: false,
    })),
  };
  return true;
}

export function challengeProgress(profile, raidKills = 0) {
  const rotating = profile.challengeRotation?.entries.map((entry, index) => ({
    ...entry, id: `rotation-${profile.challengeRotation.period}-${index}`, rotationIndex: index,
  })) ?? [];
  return [...CHALLENGES, ...rotating].map((challenge) => ({
    ...challenge,
    progress: Math.min(challenge.goal, profile[challenge.metric] - (challenge.baseline ?? 0)
      + (challenge.metric === 'extractedKills' ? raidKills : 0)),
    claimed: challenge.claimed ?? profile.claimed.includes(challenge.id),
  }));
}

export function claimChallenge(profile, id) {
  const challenge = challengeProgress(profile).find((entry) => entry.id === id);
  if (!challenge || challenge.claimed || challenge.progress < challenge.goal) {
    return 'Challenge reward is unavailable.';
  }
  const nextXP = profile.xp + challenge.xp;
  if (challenge.item) {
    const staged = { ...profile, xp: nextXP };
    if (!storeInStash(staged, new Player(), [challenge.item])) return 'Make space in your stash to claim this reward.';
    profile.stash = staged.stash;
  }
  profile.xp = nextXP;
  if (challenge.rotationIndex === undefined) profile.claimed.push(id);
  else profile.challengeRotation.entries[challenge.rotationIndex].claimed = true;
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

export function recycleAtBase(profile, player, index, count) {
  const inventory = stashInventory(profile, player);
  const item = inventory.itemSlots[index];
  const total = item?.amount ?? 1;
  const quantity = count ?? total;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > total) return 'Invalid recycle quantity.';
  const yields = getRecycleYields(item, quantity);
  if (!yields?.length) return 'This item cannot be recycled.';
  inventory.itemSlots[index] = quantity === total ? null : { ...item, amount: total - quantity };
  if (applyRecycleYields(inventory, yields).length) return 'Make space for the recovered materials.';
  profile.stash = inventory.itemSlots;
}

export class RaidBase {
  constructor(root, { save, deploy, setSound }) {
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
    const settings = root.querySelector('#raid-settings');
    const musicEnabled = root.querySelector('#raid-music-enabled');
    const soundEnabled = root.querySelector('#raid-sound-enabled');
    const musicVolume = root.querySelector('#raid-music-volume');
    const soundVolume = root.querySelector('#raid-sound-volume');
    try {
      musicEnabled.checked = localStorage.getItem('raid-base-music') !== 'off';
      soundEnabled.checked = localStorage.getItem('raid-sound-effects') !== 'off';
      musicVolume.value = localStorage.getItem('raid-music-volume') ?? musicVolume.value;
      soundVolume.value = localStorage.getItem('raid-effects-volume') ?? soundVolume.value;
    } catch {}
    this.music.muted = !musicEnabled.checked;
    this.soundEnabled = soundEnabled.checked;
    const applyVolume = () => {
      this.musicVolume = Number(musicVolume.value) / 100;
      if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
      else this.music.volume = this.musicVolume;
      this.soundVolume = Number(soundVolume.value) / 100;
      setSound(this.soundEnabled, this.soundVolume);
    };
    applyVolume();
    for (const [slider, key] of [[musicVolume, 'raid-music-volume'], [soundVolume, 'raid-effects-volume']]) {
      slider.addEventListener('input', applyVolume);
      slider.addEventListener('change', () => {
        try { localStorage.setItem(key, slider.value); } catch {}
      });
    }
    const saveToggle = (key, enabled) => {
      try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {}
    };
    musicEnabled.addEventListener('change', () => {
      this.music.muted = !musicEnabled.checked;
      if (musicEnabled.checked) this.startMusic();
      else this.music.pause();
      saveToggle('raid-base-music', musicEnabled.checked);
    });
    soundEnabled.addEventListener('change', () => {
      this.soundEnabled = soundEnabled.checked;
      applyVolume();
      saveToggle('raid-sound-effects', this.soundEnabled);
    });
    const settingsButton = root.querySelector('#raid-settings-open');
    settingsButton.addEventListener('click', () => settings.showModal());
    settings.addEventListener('close', () => settingsButton.focus({ preventScroll: true }));
    for (const label of root.querySelectorAll('nav button, #raid-settings-open, .raid-base-overview h2, .raid-base-mission p, .raid-transfer-hint, .raid-station-description, [data-base-panel="craft"] > h2, [data-base-panel="shop"] > h2, #raid-settings :is(h2, legend, label span)')) {
      this.pixelLabel(label, label.textContent.trim(), label.matches('p') ? 320 : undefined);
    }
    root.addEventListener('click', () => this.startMusic(true));
    root.addEventListener('keydown', () => this.startMusic(true));
    root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button && button.id !== 'raid-deploy-confirm') this.playCue([520]);
    }, true);
    root.querySelector('#raid-deploy').addEventListener('click', () => {
      const review = this.deployDialog.querySelector('.raid-deploy-review');
      review.append(this.stashPanel, this.selection);
      this.dialogStatus.textContent = '';
      this.deployDialog.showModal();
      const intro = this.deployDialog.querySelector('header p');
      this.pixelLabel(this.deployDialog.querySelector('h2'), 'Check your loadout');
      this.pixelLabel(intro, intro.getAttribute('aria-label') || intro.textContent, intro.clientWidth);
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
      if (!this.root.classList.contains('hidden')) {
        this.render();
        root.querySelector('#raid-deploy').focus({ preventScroll: true });
      }
    });
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
    this.refreshChallenges();
    this.root.classList.remove('hidden');
    if (entering) this.startMusic();
    if (entering) this.challengeTimer = setInterval(() => {
      if (this.refreshChallenges() && this.station === 'deploy' && !this.deployDialog.open) this.renderChallenges();
    }, 15_000);
    this.setStatus(message);
    this.render();
  }

  hide() {
    clearInterval(this.challengeTimer);
    if (this.deployDialog.open) this.deployDialog.close();
    this.closeSelection();
    this.root.classList.add('hidden');
    this.music.pause();
    if (this.music.readyState > 0) this.music.currentTime = 0;
  }

  startMusic(fromInteraction = false) {
    if (fromInteraction && !this.musicGain) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) {
        const context = this.audioContext ??= new Context();
        const source = context.createMediaElementSource(this.music);
        this.musicGain = context.createGain();
        this.musicGain.gain.value = this.musicVolume;
        this.music.volume = 1;
        source.connect(this.musicGain);
        this.musicGain.connect(context.destination);
      }
    }
    if (fromInteraction && this.audioContext && this.audioContext.state !== 'running') {
      this.audioContext.resume().catch(() => {});
    }
    if (!this.music.muted && !this.root.classList.contains('hidden') && this.music.paused) {
      this.music.play().catch(() => {});
    }
  }

  playCue(notes) {
    if (!this.soundEnabled || this.soundVolume === 0) return;
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
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001,
          (notes.length === 1 ? 0.025 : 0.065) * this.soundVolume / 0.45), start + 0.008);
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

  refreshChallenges() {
    const next = structuredClone(this.profile);
    let changed = false;
    for (const challenge of challengeProgress(next)) {
      if (!challenge.claimed && challenge.progress >= challenge.goal && !claimChallenge(next, challenge.id)) {
        changed = true;
      }
    }
    changed = refreshChallengeRotation(next) || changed;
    if (!changed || !this.save(next)) return false;
    this.profile = next;
    return true;
  }

  pixelLabel(element, label, width) {
    element.setAttribute('aria-label', label);
    if (width) setElementWrappedPixelText(element, label, width, PIXEL_TEXT_SCALE_SM);
    else setElementPixelText(element, label, PIXEL_TEXT_SCALE_SM);
  }

  setStatus(message) {
    this.pixelLabel(this.status, message, 420);
    this.pixelLabel(this.dialogStatus, message);
  }

  transact(change) {
    this.refreshChallenges();
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
    this.show(next);
    return true;
  }

  render() {
    const profile = this.profile;
    this.pixelLabel(this.root.querySelector('#raid-stats'),
      `Level ${raidLevel(profile)}  /  ${profile.xp % XP_PER_LEVEL}/${XP_PER_LEVEL} XP`);
    this.pixelLabel(this.root.querySelector('#raid-extract-count'), `Extracts: ${profile.extractions}`);
    this.pixelLabel(this.root.querySelector('#raid-loss-count'), `Lost raids: ${profile.losses}`);
    this.pixelLabel(this.root.querySelector('#raid-cash'), `${profile.cash.toLocaleString()} Cash`);
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
    for (const challenge of challengeProgress(this.profile).filter((entry) => !entry.claimed)) {
      const card = document.createElement('article');
      const title = document.createElement('h3');
      const goal = challenge.goal;
      const task = {
        extractions: `Return to Safe Zone through a hatch in ${goal === 1 ? 'one raid' : goal + ' raids'}.`,
        extractedKills: `Destroy ${goal} robots across raids. Only kills from raids you extract from count.`,
        crafts: `Complete ${goal} crafting orders at the Safe Zone station. Each craft counts once.`,
      }[challenge.metric];
      this.pixelLabel(title, challenge.title);
      const objective = document.createElement('p');
      this.pixelLabel(objective, task, 350);
      const progress = document.createElement('progress');
      progress.max = challenge.goal;
      progress.value = challenge.progress;
      progress.setAttribute('aria-label', challenge.title);
      const rewards = document.createElement('div');
      rewards.className = 'raid-challenge-rewards';
      const count = document.createElement('span');
      this.pixelLabel(count, `${progress.value}/${progress.max}`);
      const xpIcon = document.createElement('span');
      xpIcon.className = 'raid-xp-icon';
      xpIcon.setAttribute('aria-hidden', 'true');
      const xp = document.createElement('span');
      this.pixelLabel(xp, `${challenge.xp} XP`);
      rewards.append(count, xpIcon, xp);
      if (challenge.item) {
        const icon = document.createElement('img');
        icon.src = getItemIconSrc(challenge.item);
        icon.alt = getItemDisplayName(challenge.item);
        icon.title = icon.alt;
        rewards.append(icon);
        if (challenge.item.amount > 1) {
          const quantity = document.createElement('span');
          this.pixelLabel(quantity, `x${challenge.item.amount}`);
          rewards.append(quantity);
        }
      }
      card.append(title, objective, progress, rewards);
      if (progress.value >= progress.max) {
        card.append(this.button('Claim reward', () => this.transact((next) => claimChallenge(next, challenge.id))));
      }
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
      slot.focus({ preventScroll: true });
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
    this.pixelLabel(this.root.querySelector('#raid-stash-title'), `Stash ${stash.filter(Boolean).length}/${limit}`);
    this.pixelLabel(this.stashPanel.querySelector('h2'), 'Loadout');
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
        if (locked) {
          slot.dataset.locked = 'true';
          slot.setAttribute('aria-label', 'Locked inventory slot');
        }
        this.slotPositions.set(slot, { source: 'kit', key, index });
        if (item) this.bindTransfer(slot, 'kit', key, index);
      });
    }
    for (let i = 0; i < Math.max(limit, stash.length); i++) {
      const item = stash[i];
      const slot = this.slot(stashGrid, item, item ? (anchor) => {
        const actions = [];
        const detail = document.createElement('div');
        const description = document.createElement('p');
        description.textContent = getItemDescription(item);
        detail.append(description);
        this.addRecycleAction(item, actions, (next, player, quantity) => recycleAtBase(next, player, i, quantity));
        this.addSplitAction(item, actions, (next, amount) => {
          const empty = Array.from({ length: stashLimit(next) }).findIndex((_, index) => !next.stash[index]);
          if (empty < 0) return 'Stash is full.';
          const source = next.stash[i];
          next.stash[empty] = { ...source, amount };
          next.stash[i] = { ...source, amount: source.amount - amount };
        });
        if (raidLevel(this.profile) >= 10 && item.kind === 'material') {
          actions.push(['Sell', () => this.openQuantityDialog('Sell', item, item.amount ?? 1, (next, player, quantity) => {
            const remaining = (item.amount ?? 1) - quantity;
            next.stash[i] = remaining ? { ...item, amount: remaining } : null;
            next.cash += quantity * 2;
          })]);
        }
        this.inspect(item, actions, detail, anchor, { showClose: false });
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
      this.addSplitAction(item, actions, (next, amount, player) => {
        const empty = player.itemSlots.findIndex((entry, i) => !entry && player.isItemSlotUnlocked(i));
        if (empty < 0) return 'No empty loadout slot.';
        const source = player.itemSlots[index];
        player.itemSlots[empty] = { ...source, amount };
        player.itemSlots[index] = { ...source, amount: source.amount - amount };
      });
    }
    this.addRecycleAction(item, actions, (next, player, quantity) => {
        const current = key === 'handSlots' ? player.suspendHandSlotForDrag(index)
          : key === 'equipmentSlots' ? player.suspendEquipmentForDrag(index) : player.itemSlots[index];
        const yields = getRecycleYields(current, quantity);
        if (!yields?.length) return 'This item cannot be recycled.';
        const remaining = (current.amount ?? 1) - quantity;
        if (key === 'itemSlots') player.itemSlots[index] = remaining > 0 ? { ...current, amount: remaining } : null;
        const stash = stashInventory(next, player);
        if (applyRecycleYields(stash, yields).length) return 'Make space for the recovered materials.';
        next.stash = stash.itemSlots;
        if (!storeInStash(next, player, player.drainLockedInventory())) return 'Not enough stash space.';
    });
    this.inspect(item, actions, detail, anchor);
  }

  addRecycleAction(item, actions, recycle) {
    if (canRecycleItem(item)) {
      actions.push(['Recycle', () => this.openQuantityDialog('Recycle', item, item.amount ?? 1, recycle)]);
    }
  }

  addSplitAction(item, actions, split) {
    if (!['material', 'ammo', 'consumable', 'bandage', 'throwable'].includes(item.kind) || !(item.amount > 1)) return;
    actions.push(['Split', () => this.openQuantityDialog('Split', item, item.amount - 1,
      (next, player, quantity) => split(next, quantity, player))]);
  }

  openQuantityDialog(action, item, maximum, change) {
    const anchor = this.selectionAnchor;
    this.closeSelection();
    const dialog = document.createElement('dialog');
    dialog.className = 'raid-quantity-dialog';
    dialog.setAttribute('aria-label', action + ' ' + getItemDisplayName(item));
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(maximum);
    slider.value = '1';
    slider.setAttribute('aria-label', 'Quantity');
    const preview = document.createElement('div');
    preview.className = 'raid-recycle-preview';
    const quantity = document.createElement('div');
    quantity.className = 'raid-quantity-value';
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    const update = () => {
      const count = slider.valueAsNumber;
      const fill = maximum > 1 ? (count - 1) / (maximum - 1) * 100 : 100;
      slider.style.setProperty('--raid-slider-fill', fill + '%');
      this.pixelLabel(quantity, count + ' / ' + maximum + (action === 'Sell' ? '  /  ' + count * 2 + ' Cash' : ''));
      if (action === 'Sell') {
        const cash = document.createElement('img');
        cash.className = 'raid-shop-price-icon';
        cash.src = 'assets/items/misc/cash.png';
        cash.alt = '';
        quantity.append(cash);
      }
      const original = document.createElement('div');
      const originalIcon = document.createElement('img');
      originalIcon.src = getItemIconSrc(item);
      originalIcon.alt = getItemDisplayName({ ...item, amount: 1 });
      const originalAmount = document.createElement('span');
      this.pixelLabel(originalAmount, String(count));
      original.append(originalIcon, originalAmount);
      const equals = document.createElement('span');
      this.pixelLabel(equals, '=');
      preview.replaceChildren(original, equals);
      const materials = getRecycleYields(item, count);
      if (!materials?.length) {
        const empty = document.createElement('span');
        this.pixelLabel(empty, 'No materials');
        preview.append(empty);
        return;
      }
      for (const material of materials) {
        const reward = document.createElement('div');
        const icon = document.createElement('img');
        const entry = { kind: 'material', ...material };
        icon.src = getItemIconSrc(entry);
        icon.alt = getItemDisplayName({ ...entry, amount: 1 });
        icon.title = icon.alt;
        const amount = document.createElement('span');
        this.pixelLabel(amount, String(material.amount));
        reward.append(icon, amount);
        preview.append(reward);
      }
    };
    slider.addEventListener('input', update);
    update();
    const controls = document.createElement('div');
    controls.className = 'raid-quantity-actions';
    controls.append(this.button('Cancel', () => dialog.close()), this.button(action, () => {
      if (this.transact((next, player) => change(next, player, slider.valueAsNumber))) dialog.close();
      else this.pixelLabel(status, this.status.getAttribute('aria-label'), 270);
    }));
    dialog.append(preview);
    if (maximum > 1) dialog.append(slider);
    if (action !== 'Recycle') dialog.append(quantity);
    dialog.append(status, controls);
    let pressedBackdrop = false;
    const outsideDialog = (event) => {
      const bounds = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < bounds.left || event.clientX >= bounds.right
        || event.clientY < bounds.top || event.clientY >= bounds.bottom);
    };
    dialog.addEventListener('pointerdown', (event) => { pressedBackdrop = outsideDialog(event); });
    dialog.addEventListener('click', (event) => {
      if (pressedBackdrop && outsideDialog(event)) dialog.close();
      pressedBackdrop = false;
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    }, { once: true });
    this.root.append(dialog);
    dialog.showModal();
    if (maximum > 1) slider.focus({ preventScroll: true });
  }

  renderCraft() {
    const grid = this.root.querySelector('#raid-recipes');
    grid.replaceChildren();
    const player = new Player();
    player.applySaveData(this.profile.kit);
    const inventory = stashInventory(this.profile, player);
    const recipes = getCraftableRecipes(player).map((recipe) => ({ recipe, ready: canCraftRecipe(inventory, recipe) }));
    recipes.sort((a, b) => catalogCategory(a.recipe.output) - catalogCategory(b.recipe.output)
      || Number(b.ready) - Number(a.ready));
    let previousCategory = null;
    for (const { recipe, ready } of recipes) {
      const category = catalogCategory(recipe.output);
      if (category !== previousCategory) this.appendCatalogHeading(grid, category);
      previousCategory = category;
      const hasMaterials = inventory.hasMaterials(recipe.costs);
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
        const label = document.createElement('span');
        this.pixelLabel(label, `${getItemDisplayName({ kind: 'material', key })} ${have}/${amount}`, 240);
        row.append(icon, label);
        requirements.appendChild(row);
      }
      if (!ready && hasMaterials) {
        const availability = document.createElement('p');
        this.pixelLabel(availability, 'Stash full');
        detail.append(availability);
      }
      detail.append(requirements);
      const select = (anchor, keepPosition = false) => {
        this.catalogSelection = recipe.id;
        this.inspect(recipe.output,
          [['Craft', () => this.transact((next, loadout) => craftAtBase(next, loadout, recipe)), !ready]], detail, anchor, { keepPosition });
      };
      const slot = this.slot(grid, recipe.output, select);
      slot.dataset.locked = String(!ready);
      slot.removeAttribute('title');
      if (recipe.id === this.catalogSelection) select(slot, true);
    }
  }

  renderShop() {
    const grid = this.root.querySelector('#raid-shop');
    grid.replaceChildren();
    const entries = SHOP.map((offer, index) => ({ offer, index }));
    entries.sort((a, b) => catalogCategory(a.offer.item) - catalogCategory(b.offer.item));
    let previousCategory = null;
    for (const { offer, index } of entries) {
      const category = catalogCategory(offer.item);
      if (category !== previousCategory) this.appendCatalogHeading(grid, category);
      previousCategory = category;
      const unlocked = raidLevel(this.profile) >= offer.level;
      const price = `${offer.price} Cash`;
      const select = (anchor, keepPosition = false) => {
        this.catalogSelection = index;
        this.inspect(offer.item, [['BUY',
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
        }, !unlocked || this.profile.cash < offer.price]], price, anchor, { keepPosition });
      };
      const card = document.createElement('div');
      card.className = 'raid-shop-offer';
      const slot = this.slot(card, offer.item, select, unlocked ? '' : `Lv ${offer.level}`);
      slot.dataset.locked = String(!unlocked);
      slot.setAttribute('aria-label', `${getItemDisplayName(offer.item)}, ${price}${unlocked ? '' : `, level ${offer.level} required`}`);
      const priceTag = document.createElement('div');
      priceTag.className = 'raid-shop-price';
      const cash = document.createElement('img');
      cash.src = 'assets/items/misc/cash.png';
      cash.alt = '';
      const amount = document.createElement('span');
      this.pixelLabel(amount, offer.price.toLocaleString());
      priceTag.append(cash, amount);
      card.append(priceTag);
      grid.append(card);
      if (index === this.catalogSelection) select(slot, true);
    }
  }

  appendCatalogHeading(grid, category) {
    const heading = document.createElement('h3');
    heading.className = 'raid-catalog-heading';
    this.pixelLabel(heading, CATALOG_CATEGORIES[category]?.[0] ?? 'Other');
    grid.append(heading);
  }

  inspect(item, actions, detail, anchor, { keepPosition = false, showClose = true } = {}) {
    const title = document.createElement('h2');
    this.pixelLabel(title, getItemDisplayName(item), 260);
    const description = detail instanceof HTMLElement ? detail : document.createElement('p');
    if (typeof detail === 'string') this.pixelLabel(description, detail || getItemDescription(item), 250);
    else for (const line of description.querySelectorAll('p')) {
      if (line.textContent) this.pixelLabel(line, line.textContent, 250);
    }
    title.className = 'inv-context-title';
    description.classList.add('inv-context-desc');
    const buttons = document.createElement('div');
    buttons.className = 'inv-context-actions';
    buttons.append(...actions.map((action) => this.button(...action)));
    if (showClose) buttons.append(this.button('Close', () => this.closeSelection()));
    this.selection.replaceChildren(title, description);
    if (buttons.childElementCount) this.selection.append(buttons);
    this.selection.classList.remove('hidden');
    this.selectionAnchor = anchor;
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

  closeSelection(restoreFocus = false) {
    this.catalogSelection = null;
    this.selection.classList.add('hidden');
    if (restoreFocus && this.selectionAnchor?.isConnected) {
      this.selectionAnchor.focus({ preventScroll: true });
    }
    this.selectionAnchor = null;
  }

  handleMenuKey(event, scope = this.root) {
    if (scope.classList.contains('hidden') || event.altKey || event.ctrlKey || event.metaKey) return false;
    const modal = scope === this.root ? [...scope.querySelectorAll('dialog[open]')].at(-1) : null;
    if (event.code === 'Escape' && scope === this.root) {
      if (event.repeat) return true;
      if (modal) modal.close();
      else if (!this.selection.classList.contains('hidden')) this.closeSelection(true);
      return true;
    }

    const key = event.code;
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(key)) return false;
    const horizontal = key === 'KeyA' || key === 'KeyD';
    const step = key === 'KeyA' || key === 'KeyW' ? -1 : 1;
    const focused = document.activeElement;
    if (horizontal && focused?.matches('input[type="range"]:enabled') && (modal ?? scope).contains(focused)) {
      if (step < 0) focused.stepDown();
      else focused.stepUp();
      focused.dispatchEvent(new Event('input', { bubbles: true }));
      focused.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    const tooltipOpen = scope === this.root && !this.selection.classList.contains('hidden');
    if (!modal && !tooltipOpen && horizontal && scope === this.root && focused?.matches('[data-station]')) {
      const tabs = [...scope.querySelectorAll('[data-station]')];
      const index = tabs.findIndex((tab) => tab.dataset.station === this.station);
      const tab = tabs[(index + step + tabs.length) % tabs.length];
      tab.focus();
      tab.click();
      return true;
    }

    const options = [...(modal ?? (tooltipOpen ? this.selection : scope))
      .querySelectorAll('button:enabled, input:enabled')]
      .filter((element) => element.getClientRects().length > 0);
    if (options.length) {
      const index = options.indexOf(focused);
      if (index >= 0) {
        const current = focused.getBoundingClientRect();
        const centerX = current.left + current.width / 2;
        const centerY = current.top + current.height / 2;
        let closest = null;
        let bestDistance = Infinity;
        for (const option of options) {
          const bounds = option.getBoundingClientRect();
          const y = bounds.top + bounds.height / 2;
          const x = bounds.left + bounds.width / 2;
          const forward = step * (horizontal ? x - centerX : y - centerY);
          const sideways = Math.abs(horizontal ? y - centerY : x - centerX);
          if (forward <= 4 || sideways > forward * 2) continue;
          const distance = forward + sideways * 2;
          if (distance < bestDistance) {
            closest = option;
            bestDistance = distance;
          }
        }
        closest?.focus();
        return true;
      }
      const next = index < 0 ? (step > 0 ? 0 : options.length - 1) : (index + step + options.length) % options.length;
      options[next].focus();
    }
    return true;
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
      this.pixelLabel(tag, badge);
      slot.appendChild(tag);
    }
    if (item && ['weapon', 'melee', 'equipment'].includes(item.kind) && itemDurability(item) < 100) {
      const durability = itemDurability(item);
      const bar = document.createElement('div');
      bar.className = 'raid-slot-durability';
      bar.style.setProperty('--durability', `${durability}%`);
      bar.style.setProperty('--durability-color', durability <= 25 ? '#d64b3b' : durability <= 60 ? '#d4a24a' : '#74a95c');
      bar.setAttribute('aria-label', `Durability ${Math.ceil(durability)}%`);
      slot.append(bar);
    }
    parent.appendChild(slot);
    return slot;
  }

  button(label, action, disabled = false, iconSrc = null) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-slice-button';
    this.pixelLabel(button, label, 120);
    if (iconSrc) {
      button.setAttribute('aria-label', `${label} Cash`);
      const icon = document.createElement('img');
      icon.className = 'raid-shop-price-icon';
      icon.src = iconSrc;
      icon.alt = '';
      button.append(icon);
    }
    button.disabled = disabled;
    button.addEventListener('click', action);
    return button;
  }
}
