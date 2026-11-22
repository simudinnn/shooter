import { bindTouchSelection } from './touchSelection.js';
import { REMOVED_MATERIAL_KEYS } from './materials.js';
import { moveStacks } from './batchInventory.js';
import { isContainer, isPack, isTieredItem, packTier, openContainer } from './containers.js';
import { cashTotal, changeCash, migrateCash } from './cash.js';
import { storageLayout, applyStorageLayout, itemWidth, itemSize, canEquipHand, styleItemSlot } from './itemFootprint.js';
import economy from './economy-data.js';
import { Player, WEAPONS } from './player.js';
import { capturePlayerState } from './saveGame.js';
import { getItemDescription, getItemDisplayName, getItemIconSrc } from './loot.js';
import { INV_LOCK_SRC } from './inventory.js';
import { equipmentSlotFor, itemDurability, MAX_DURABILITY } from './equipment.js';
import { createPixelTextImg, setElementPixelText, setElementWrappedPixelText, PIXEL_TEXT_SCALE_SM } from './pixelText.js';
import { applyRecycleYields, canCraftRecipe, canRecycleItem, craftRecipe, getCraftableRecipes, getRecycleYields, recycleBatchSize } from './crafting.js';

export const EXTRACT_RADIUS = 5;
export const EXTRACT_SECONDS = 3;
const CATALOG_CATEGORIES = [
  ['Equipment', ['equipment']],
  ['Guns', ['weapon']],
  ['Melee', ['melee']],
  ['Throwables', ['throwable']],
  ['Ammo boxes', ['ammo'] ],
  ['Consumables', ['consumable', 'bandage']],
  ['Supplies & valuables', ['material']],
];

function catalogCategory(item) {
  if(item.kind==='material'&&item.key.endsWith('_box'))return 4;
  return CATALOG_CATEGORIES.findIndex(([, kinds]) => kinds.includes(item.kind));
}

export function getSellPrice(item) {
  const price = economy.sellPrices[item.kind]?.[item.kind==='ammo'?item.ammoType:item.kind==='bandage'?'bandage':item.key];
  if (item.kind === 'material') return Math.max(1,Math.floor((price ?? economy.economy.materialSellCash)*(isTieredItem(item)?[0,0.6,1,1.7][packTier(item)]:1)));
  return price ? Math.max(1, Math.floor(price * itemDurability(item) / MAX_DURABILITY)) : 0;
}
const XP_PER_LEVEL = 300;
const XP_LEVEL_INCREMENT = 150;
const levelCost = (level) => XP_PER_LEVEL + (level - 1) * XP_LEVEL_INCREMENT;
const levelStart = (level) => (level - 1) * (XP_PER_LEVEL + (level - 2) * XP_LEVEL_INCREMENT / 2);

export function raidLevel(profile) {
  let level = 1;
  while (profile.xp >= levelStart(level + 1)) level++;
  return level;
}

export function stashLimit(profile) {
  const level = raidLevel(profile);
  return level >= 40 ? 100 : level >= 30 ? 80 : level >= 20 ? 60 : level >= 10 ? 50 : 40;
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
  const profile = { xp: 0, xpCurveVersion: 2, cash: economy.economy.startingCash, extractions: 0, losses: 0, extractedKills: 0, crafts: 0, claimed: [], stash: [], stashStackVersion: 1, kit: freshKit() };
  if (previous?.player) {
    const player = new Player();
    player.applySaveData(previous.player);
    profile.stash = [
      ...player.drainLockedInventory(),
      ...(previous.groundDrops ?? []).map((drop) => drop.item).filter(Boolean),
    ];
    profile.kit = capturePlayerState(player);
  }
  return migrateCash(profile);
}

export function deployProfile(profile) {
  const kit = freshKit(true);
  kit.learnedBlueprints = [...profile.kit.learnedBlueprints];
  return { ...profile, kit, deployed: true, raidCheckpoint: { carried: profile.kit, seconds: 0, kills: 0, raiderKills: 0 } };
}

export function extractProfile(profile, player, kills) {
  return {
    ...profile,
    deployed: false,
    ...Object.fromEntries(['chestsSearched','packsOpened','healsUsed','trapsPlaced','extractedRaiderKills'].map(key=>[key,(profile[key]??0)+(player.raidStats?.[key]??0)])),
    xp: profile.xp + 120 + kills * 25,
    extractedKills: profile.extractedKills + kills,
    extractions: profile.extractions + 1,
    kit: capturePlayerState(player),
  };
}

export function loseRaidProfile(profile) {
  return { ...profile, deployed: false, losses: profile.losses + 1 };
}

const SHOP = economy.shop.map((offer) => offer.item.kind === 'weapon'
  ? { ...offer, item: { ...offer.item, ammo: WEAPONS[offer.item.key]?.magSize ?? 0 } }
  : offer);

export function normalizeRaidProfile(profile) {
  const { credits, ...saved } = profile;
  const normalized = {
    ...saved,
    cash: saved.cash ?? credits ?? economy.economy.startingCash,
    extractedKills: saved.extractedKills ?? 0,
    crafts: saved.crafts ?? 0,
    claimed: saved.claimed ?? [],
  };
  if((saved.xpCurveVersion??0)<2){
    const xp=Math.max(0,Number(saved.xp)||0);let level=1,oldStart=0;
    const oldCost=n=>saved.xpCurveVersion?100+(n-1)*25:100;
    while(xp>=oldStart+oldCost(level)){oldStart+=oldCost(level);level++;}
    normalized.xp=levelStart(level)+Math.floor((xp-oldStart)/oldCost(level)*levelCost(level));normalized.xpCurveVersion=2;
  }
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
  const retained=item=>item?.kind==='material'&&REMOVED_MATERIAL_KEYS.includes(item.key)?null:item;
  normalized.stash=(normalized.stash??[]).map(retained);
  if(normalized.kit){normalized.kit={...normalized.kit};for(const key of ['itemSlots','handSlots'])if(normalized.kit[key])normalized.kit[key]=normalized.kit[key].map(retained);}
  return migrateCash(normalized);
}

const CHALLENGES = [
 {id:'first_extract',title:'First Return',metric:'extractions',goal:1,xp:100,cash:40},
 {id:'robot_hunter',title:'Zombie Hunter',metric:'extractedKills',goal:10,xp:150,item:{kind:'material',key:'military_pack',tier:1,amount:1}},
 {id:'workshop',title:'Return Trip',metric:'extractions',goal:3,xp:150,item:{kind:'consumable',key:'medkit',amount:2}},
 {id:'extract_5',title:'Reliable Runner',metric:'extractions',goal:5,xp:220,item:{kind:'equipment',key:'backpack_1'},cash:80},
 {id:'search_10',title:'Leave No Drawer',metric:'chestsSearched',goal:10,xp:180,item:{kind:'material',key:'equipment_pack',tier:1,amount:1}},
 {id:'raiders_3',title:'Rival Patrol',metric:'extractedRaiderKills',goal:3,xp:250,item:{kind:'material',key:'military_pack',tier:2,amount:1}},
 {id:'packs_5',title:'Lucky Find',metric:'packsOpened',goal:5,xp:160,item:{kind:'material',key:'archive_pack',tier:2,amount:1}},
 {id:'traps_3',title:'Hold the Line',metric:'trapsPlaced',goal:3,xp:150,item:{kind:'material',key:'barbed_wire',amount:2}},
 {id:'heals_5',title:'Field Medic',metric:'healsUsed',goal:5,xp:140,item:{kind:'consumable',key:'medkit',amount:2}},
 {id:'trade_500',title:'Making a Living',metric:'sellCash',goal:500,xp:250,item:{kind:'material',key:'industrial_pack',tier:2,amount:1}},
 {id:'extract_20',title:'Veteran Runner',metric:'extractions',goal:20,xp:500,item:{kind:'material',key:'equipment_pack',tier:3,amount:1},cash:200},
];
const ROTATION_MS=24*60*60*1000;
const ROTATING_CHALLENGES=[
 {title:'Quick Return',metric:'extractions',goal:1,xp:80,cash:25},
 {title:'Clear the Street',metric:'extractedKills',goal:8,xp:130,item:{kind:'ammo',ammoType:'pistol',amount:24}},
 {title:'Supply Search',metric:'chestsSearched',goal:4,xp:100,item:{kind:'consumable',key:'bandage',amount:3}},
 {title:'Rival Watch',metric:'extractedRaiderKills',goal:1,xp:150,cash:45},
 {title:'Unsealed',metric:'packsOpened',goal:2,xp:100,item:{kind:'material',key:'equipment_pack',tier:1,amount:1}},
 {title:'Field Treatment',metric:'healsUsed',goal:3,xp:90,item:{kind:'consumable',key:'medkit',amount:1}},
 {title:'Blocked Passage',metric:'trapsPlaced',goal:2,xp:110,item:{kind:'material',key:'barbed_wire',amount:2}},
 {title:'Trade Route',metric:'sellCash',goal:200,xp:100,item:{kind:'material',key:'archive_pack',tier:1,amount:1}},
];
const METRIC_LABELS={extractions:'Extract successfully',extractedKills:'Kill zombies and extract',extractedRaiderKills:'Kill raiders and extract',chestsSearched:'Search different chests and extract',packsOpened:'Open packs',trapsPlaced:'Place barbed wire and extract',healsUsed:'Use healing items and extract',sellCash:'Earn cash by selling loot'};
export function refreshChallengeRotation(profile,now=Date.now()){
 const date=new Date(now),period=Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/ROTATION_MS),old=profile.challengeRotation;
 if(old?.period===period&&old.version===3&&!old.entries.every(e=>e.claimed))return false;
 const round=old?.version===3&&old.period===period?(old.round??0)+1:0;
 profile.challengeRotation={period,round,version:3,entries:Array.from({length:3},(_,i)=>{const entry=ROTATING_CHALLENGES[(period*3+round*3+i)%ROTATING_CHALLENGES.length];return {...entry,baseline:Number(profile[entry.metric])||0,claimed:false};})};return true;
}
export function challengeProgress(profile,raidKills=0,raidStats={}){
 const rotation=profile.challengeRotation;
 if(!rotation||rotation.version!==3){const next={...profile};refreshChallengeRotation(next);return challengeProgress(next,raidKills,raidStats);}
 return rotation.entries.map((challenge,index)=>({...challenge,id:'rotation-'+rotation.period+'-'+(rotation.round??0)+'-'+index,rotationIndex:index,description:(METRIC_LABELS[challenge.metric]??challenge.metric)+': '+challenge.goal+'.',progress:Math.max(0,Math.min(challenge.goal,(Number(profile[challenge.metric])||0)-(challenge.baseline??0)+(challenge.metric==='extractedKills'?raidKills:Number(raidStats[challenge.metric])||0))),claimed:!!challenge.claimed}));
}

export function claimChallenge(profile,id){
 if(profile.challengeRotation?.version!==3)refreshChallengeRotation(profile);
 const challenge=challengeProgress(profile).find(entry=>entry.id===id);
 if(!challenge||challenge.claimed||challenge.progress<challenge.goal)return 'Challenge reward is unavailable.';
 const staged=structuredClone(profile);staged.xp+=challenge.xp;
 const rewards=[...(challenge.item?[challenge.item]:[]),...(challenge.cash?[{kind:'material',key:'cash',amount:challenge.cash}]:[])];
 if(rewards.length&&!storeInStash(staged,new Player(),rewards))return 'Make space in your stash to claim this reward.';
 profile.stash=staged.stash;profile.xp=staged.xp;
 if(challenge.rotationIndex===undefined)profile.claimed.push(id);else profile.challengeRotation.entries[challenge.rotationIndex].claimed=true;
}

function stashInventory(profile, player) {
  const inventory = Object.create(player);
  const limit = stashLimit(profile);
  inventory.itemSlots = Array.from({ length: Math.max(limit, profile.stash.length) }, (_, i) =>
    profile.stash[i] ? { ...profile.stash[i] } : null);
  inventory.raidLevel = raidLevel(profile);
  inventory.storageCapacity = limit;
  inventory.storageColumns = 10;
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
  if (!getCraftableRecipes(inventory).includes(recipe) || !craftRecipe(inventory, recipe)) {
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
  const yields = getRecycleYields(item, quantity, raidLevel(profile));
  if (!yields?.length) return 'This item cannot be recycled.';
  inventory.itemSlots[index] = quantity === total ? null : { ...item, amount: total - quantity };
  if (applyRecycleYields(inventory, yields).length) return 'Make space for the recovered materials.';
  profile.stash = inventory.itemSlots;
}

export class RaidBase {
  constructor(root, { save, deploy, setSound, playUi }) {
    this.root = root;
    this.save = save;
    const transferAll = root.querySelector('#raid-transfer-all');
    this.pixelLabel(transferAll, 'Transfer all');
    transferAll.addEventListener('click', () => {
      this.transact((next, player) => {
        const items = player.itemSlots.filter(Boolean);
        if (!items.length) return 'Loadout inventory is empty.';
        if (!storeInStash(next, player, items)) return 'Not enough stash space.';
        player.itemSlots.fill(null);
      });
    });
    const sort = root.querySelector('#raid-stash-sort');
    this.pixelLabel(sort, 'Sort stash');
    const sortModes = [['cash', 'Cash value'], ['type', 'Type'], ['amount', 'Quantity']];
    let sortIndex = -1;
    sort.addEventListener('click', () => {
      const nextIndex = (sortIndex + 1) % sortModes.length;
      const [mode, label] = sortModes[nextIndex];
      if (!this.transact((next) => {
        const amount = (item) => item.amount ?? 1;
        const value = (item) => amount(item) * getSellPrice(item);
        next.stash = next.stash.filter(Boolean).map(item=>{const entry={...item};delete entry.storageCell;return entry;}).sort((a, b) => {
          if (mode === 'cash') return value(b) - value(a);
          if (mode === 'amount') return amount(b) - amount(a);
          return a.kind.localeCompare(b.kind) || getItemDisplayName(a).localeCompare(getItemDisplayName(b));
        });
      })) return;
      sortIndex = nextIndex;
      sort.dataset.label = 'Sort: ' + label;
      this.pixelLabel(sort, sort.dataset.label);
    });
    const reset = root.querySelector('#raid-reset-dialog');
    root.querySelector('#raid-reset-open').addEventListener('click', () => {
      reset.returnValue = '';
      reset.showModal();
    });
    reset.addEventListener('close', () => {
      if (reset.returnValue !== 'reset') return;
      const profile = newRaidProfile();
      root.querySelector('#raid-settings').close();
      if (this.save(profile)) this.show(profile);
      else this.setStatus('Could not reset progress.');
    });
    this.status = root.querySelector('[role=status]');
    this.dialogStatus = root.querySelector('#raid-deploy-status');
    this.selection = root.querySelector('#raid-selection');
    root.addEventListener('pointerover', (event) => {
      const slot = event.target.closest('[data-item-name]');
      if (!slot || slot.contains(event.relatedTarget)
        || !this.selection.classList.contains('hidden')) return;
      if (event.pointerType !== 'mouse') return;
      const host = slot.closest('dialog[open]') ?? root;
      this.itemName ??= document.createElement('div');
      this.itemName.className = 'inv-tooltip visible';
      host.append(this.itemName);
      this.pixelLabel(this.itemName, slot.dataset.itemName, 240);
      this.positionItemName(event);
    });
    root.addEventListener('pointermove', (event) => {
      if (this.itemName?.classList.contains('visible')) this.positionItemName(event);
    });
    root.addEventListener('pointerout', (event) => {
      const slot = event.target.closest('[data-item-name]');
      if (slot && !slot.contains(event.relatedTarget)) this.hideItemName();
    });
    root.addEventListener('pointerdown', () => this.hideItemName(), true);
    this.slotPositions = new WeakMap();
    document.addEventListener('pointerdown', (event) => {
      if (event.target === this.workspace || event.target === this.root.querySelector('#raid-stash')) return;
      if (!this.selection.classList.contains('hidden') && !this.selection.contains(event.target)) {
        this.closeSelection();
      }
    }, true);
    this.stashPanel = root.querySelector('[data-base-panel="stash"]');
    this.workspace = this.stashPanel.parentElement;
    this._stashCellObserver = new ResizeObserver(() => this._scheduleStashCellSync());
    this._stashCellObserver.observe(root.querySelector('#raid-kit'));
    this._stashCellObserver.observe(root.querySelector('#raid-stash'));
    const repositionSelection = (event) => {
      if (event?.target === this.selection) return;
      if (this.selectionAnchor?.isConnected && !this.selection.classList.contains('hidden')) {
        this.positionSelection(this.selectionAnchor);
      }
    };
    root.addEventListener('scroll', repositionSelection, { capture: true, passive: true });
    window.addEventListener('resize', repositionSelection, { passive: true });
    window.visualViewport?.addEventListener('resize', repositionSelection, { passive: true });
    this.deployDialog = root.querySelector('#raid-deploy-dialog');
    this.station = 'deploy';
    this.catalogSelection = null;
    this.playUi = playUi;
    this.music = new Audio('sounds/ui/menu_song.ogg');
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.addEventListener('ended', () => {
      this.music.currentTime = 0;
      this.startMusic();
    });
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
      this.styleSlider(slider);
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
    for(const [id,key] of [['raid-shadows-enabled','raid-shadows'],['raid-debug-enabled','raid-debug']]){
      const input=root.querySelector('#'+id);
      try{input.checked=localStorage.getItem(key)!=='off';}catch{}
      input.addEventListener('change',()=>saveToggle(key,input.checked));
    }
    const settingsButton = root.querySelector('#raid-settings-open');
    settingsButton.addEventListener('click', () => {
      settings.showModal();
      const title=settings.querySelector('h2');
      title.tabIndex=-1; title.focus({preventScroll:true});
      settings.scrollTop=0;
      requestAnimationFrame(()=>{settings.scrollTop=0;});
    });
    settings.addEventListener('close', () => settingsButton.focus({ preventScroll: true }));
    for (const label of root.querySelectorAll('nav button, #raid-settings-open, .raid-base-overview h2, .raid-base-mission p, .raid-transfer-hint, .raid-station-description, [data-base-panel="craft"] > h2, [data-base-panel="shop"] > h2, #raid-settings :is(h2, legend, label span)')) {
      this.pixelLabel(label, label.textContent.trim(), label.matches('p') ? 320 : undefined);
    }
    root.addEventListener('click', () => this.startMusic(true));
    root.addEventListener('keydown', () => this.startMusic(true));
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
    this.batchSelection?.clear();if(this.batchBar)this.batchBar.hidden=true;
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
    if (this.audioContext && this.audioContext.state !== 'running') {
      this.audioContext.resume().catch(() => {});
    }
    if (!this.music.muted && !this.root.classList.contains('hidden') && this.music.paused) {
      this.music.play().catch(() => {});
    }
  }

  styleSlider(slider) {
    const track = document.createElement('div');
    track.className = 'inv-context-slider-track raid-smooth-slider';
    const thumb = document.createElement('span');
    thumb.className = 'inv-context-slider-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    slider.replaceWith(track);
    track.append(thumb, slider);
    slider.classList.add('inv-context-amount-slider');
    const update = () => {
      const min = Number(slider.min);
      const span = Number(slider.max) - min;
      track.style.setProperty('--slider-progress', `${span > 0 ? (slider.valueAsNumber - min) / span * 100 : 100}%`);
    };
    slider.addEventListener('input', update);
    update();
    return track;
  }

  refreshChallenges() {
    const next = structuredClone(this.profile);
    let changed = refreshChallengeRotation(next);
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
    if (!message) return;
    const notice = this.deployDialog.open ? this.dialogStatus : this.status;
    this.pixelLabel(notice, message, 280);
    this.statusAnimation?.cancel();
    this.statusAnimation = notice.animate(
      [{ opacity: 0, translate: '-50% 6px' }, { opacity: 1, translate: '-50% 0', offset: 0.12 },
        { opacity: 1, translate: '-50% -4px', offset: 0.72 }, { opacity: 0, translate: '-50% -18px' }],
      { duration: 1800, easing: 'ease-out' });
    this.statusAnimation.onfinish = () => this.pixelLabel(notice, '');
  }

  transact(change, reportError = (message) => this.setStatus(message)) {
    this.refreshChallenges();
    const next = structuredClone(this.profile);
    const player = new Player();
    player.applySaveData(next.kit);
    player.raidLevel = raidLevel(next);
    const error = change(next, player);
    if (error) {
      reportError(error);
      return;
    }
    const cashDelta=next.cash-this.profile.cash;
    next.kit=capturePlayerState(player);
    if(cashDelta && !changeCash(next,cashDelta)) {reportError('Not enough cash.');return;}
    player.itemSlots=next.kit.itemSlots;
    next.cash=cashTotal(next);
    const stashOverflow = storageLayout(next.stash, stashLimit(next), 10).overflow;
    const previousStashOverflow = storageLayout(this.profile.stash, stashLimit(this.profile), 10).overflow;
    const kitOverflow = storageLayout(player.itemSlots, player.inventoryCapacity, 5).overflow;
    const previousPlayer = new Player();
    previousPlayer.applySaveData(this.profile.kit);
    const previousKitOverflow = storageLayout(previousPlayer.itemSlots, previousPlayer.inventoryCapacity, 5).overflow;
    if (stashOverflow > previousStashOverflow || kitOverflow > previousKitOverflow) {
      reportError('Not enough adjacent space for this item.');
      return;
    }
    next.kit = capturePlayerState(player);
    if (!this.save(next)) {
      reportError('Could not save the change.');
      return;
    }
    const scrollTop = this.workspace.scrollTop;
    this.workspace.scrollTo({ top: scrollTop, behavior: 'instant' });
    this.show(next);
    this.workspace.scrollTo({ top: scrollTop, behavior: 'instant' });
    return true;
  }

  render() {
    this._initBatchSelection();
    this.hideItemName();
    this.pixelLabel(this.root.querySelector('#raid-transfer-all'), 'Transfer all');
    const sort = this.root.querySelector('#raid-stash-sort');
    this.pixelLabel(sort, sort.dataset.label || 'Sort stash');
    const profile = this.profile;
    const level = raidLevel(profile);
    const xpProgress = this.root.querySelector('#raid-xp-progress');
    xpProgress.max = levelCost(level);
    xpProgress.value = profile.xp - levelStart(level);
    this.pixelLabel(this.root.querySelector('#raid-stats'),
      `Level ${level}  /  ${profile.xp - levelStart(level)}/${levelCost(level)} XP`);
    this.pixelLabel(this.root.querySelector('#raid-extract-count'), `Extracts: ${profile.extractions}`);
    this.pixelLabel(this.root.querySelector('#raid-loss-count'), `Lost raids: ${profile.losses}`);
    this.pixelLabel(this.root.querySelector('#raid-cash'), `${profile.cash.toLocaleString()}`);
    for (const tab of this.root.querySelectorAll('[data-station]')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.station === this.station));
    }
    for (const panel of this.root.querySelectorAll('[data-base-panel]')) {
      const station = this.deployDialog.open ? 'stash' : this.station;
      panel.classList.toggle('hidden', panel.dataset.basePanel !== station);
    }
    if (this.catalogSelection == null && !this._keepSelection) this.selection.classList.add('hidden');
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
      this.pixelLabel(title, challenge.title);
      const objective = document.createElement('p');
      this.pixelLabel(objective, challenge.description, 350);
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
      if(challenge.cash){const cash=document.createElement('img');cash.src='assets/items/misc/cash.png';cash.alt='Cash';const amount=document.createElement('span');this.pixelLabel(amount,String(challenge.cash));rewards.append(amount,cash);}
      card.append(title, objective, progress, rewards);
      if (progress.value >= progress.max) {
        card.append(this.button('Claim reward', () => this.transact((next) => claimChallenge(next, challenge.id))));
      }
      grid.appendChild(card);
    }
  }

  _initBatchSelection(){
    if(this.batchSelection)return;this.batchSelection=new Map();
    bindTouchSelection(this.root,{
      enabled:()=>document.body.classList.contains('mobile-ui')&&!this.root.classList.contains('hidden'),
      resolve:target=>{const slot=target.closest('.raid-base-slot'),p=this.slotPositions.get(slot);if(!p||(p.key&&p.key!=='itemSlots'))return null;const container=p.source==='stash'?'stash':'kit';const item=container==='stash'?this.profile.stash[p.index]:this.profile.kit.itemSlots[p.index];return item?{slot,container,index:p.index}:null;},
      clear:()=>{this.batchSelection.clear();this._syncBatchSelection();},
      cancelDrag:id=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:id})),
      toggle:({container,index})=>{const token=container+':'+index;if(this.batchSelection.has(token))this.batchSelection.delete(token);else this.batchSelection.set(token,{container,index});this._quickTap=null;this.closeSelection();this._syncBatchSelection();}
    });
    this.root.addEventListener('pointerdown',e=>{
      if(e.touchMultiSelection||e.ctrlKey||e.metaKey||!this.batchSelection.size||e.target.closest('.inventory-batch-actions,dialog'))return;
      const slot=e.target.closest('.raid-base-slot');
      const selected=slot?.classList.contains('item-multi-selected');
      const clear=()=>{this.batchSelection.clear();this._syncBatchSelection();};
      if(!selected){clear();return;}
      const x=e.clientX,y=e.clientY;
      document.addEventListener('pointerup',up=>{if(Math.hypot(up.clientX-x,up.clientY-y)<5)clear();},{once:true,capture:true});
    },true);
    document.addEventListener('pointerdown',e=>{if(!e.ctrlKey&&!e.metaKey&&this.batchSelection.size&&!this.root.contains(e.target)){this.batchSelection.clear();this._syncBatchSelection();}},true);

    this.root.addEventListener('pointerdown',e=>{
      if(!(e.ctrlKey||e.metaKey)||e.button!==0)return;
      const slot=e.target.closest('.raid-base-slot'),position=this.slotPositions.get(slot);
      if(!position||position.key&&position.key!=='itemSlots')return;
      const container=position.source==='stash'?'stash':'kit';
      const item=container==='stash'?this.profile.stash[position.index]:this.profile.kit.itemSlots[position.index];if(!item)return;
      e.preventDefault();e.stopImmediatePropagation();
      const token=container+':'+position.index;
      if(this.batchSelection.has(token))this.batchSelection.delete(token);else this.batchSelection.set(token,{container,index:position.index});
      this.closeSelection();this._syncBatchSelection();
    },true);
    this.root.addEventListener('click',e=>{if((e.ctrlKey||e.metaKey)&&e.target.closest('.raid-base-slot')){e.preventDefault();e.stopImmediatePropagation();}},true);
  }
  _syncBatchSelection(){
    if(!this.batchSelection)return;
    for(const [token,p] of this.batchSelection){const item=p.container==='stash'?this.profile.stash[p.index]:this.profile.kit.itemSlots[p.index];if(!item)this.batchSelection.delete(token);}
    for(const grid of [this.root.querySelector('#raid-stash'),this.root.querySelector('#raid-kit')])for(const slot of grid?.children??[]){const p=this.slotPositions.get(slot);slot.classList.toggle('item-multi-selected',!!p&&this.batchSelection.has((p.source==='stash'?'stash':'kit')+':'+p.index));}
    if(!this.batchBar){this.batchBar=document.createElement('div');this.batchBar.className='inventory-batch-actions';this.root.append(this.batchBar);}
    const host=this.deployDialog.open?this.deployDialog:this.root;if(this.batchBar.parentElement!==host)host.append(this.batchBar);
    this.batchBar.replaceChildren();this.batchBar.hidden=!this.batchSelection.size;if(!this.batchSelection.size)return;
    let value=0;for(const p of this.batchSelection.values()){const item=p.container==='stash'?this.profile.stash[p.index]:this.profile.kit.itemSlots[p.index];if(item?.key!=='cash')value+=getSellPrice(item)*(item.amount??1);}
    this.batchBar.append(this.button('Sell selected',()=>this._sellBatch(),!value));
  }
  _moveBatch(to){
    if(to.key&&to.key!=='itemSlots'){this.setStatus('Drop a group into stash or inventory.');return;}
    const selected=[...this.batchSelection.values()];
    const moved=this.transact((next,player)=>{const result=moveStacks({stash:next.stash,kit:player.itemSlots},selected,{container:to.source==='stash'?'stash':'kit',index:to.index},{stash:stashLimit(next),kit:player.inventoryCapacity});if(!result)return 'Not enough room for the selected items.';next.stash=result.stash;player.itemSlots=result.kit;});
    if(moved){this.batchSelection.clear();this._syncBatchSelection();}
  }
  _sellBatch(){
    const selected=[...this.batchSelection.values()].map(position=>({position,item:structuredClone(position.container==='stash'?this.profile.stash[position.index]:this.profile.kit.itemSlots[position.index])})).filter(({item})=>item&&item.key!=='cash'&&getSellPrice(item)>0);
    if(!selected.length)return;
    const dialog=this.openQuantityDialog('Sell',selected[0].item,1,(next,player)=>{
      let cash=0;
      for(const {position:p,item:expected} of selected){const slots=p.container==='stash'?next.stash:player.itemSlots,item=slots[p.index];if(!item||item.kind!==expected.kind||item.key!==expected.key||item.ammoType!==expected.ammoType||(item.amount??1)!==(expected.amount??1))return 'The selected items changed. Select them again.';cash+=getSellPrice(item)*(item.amount??1);slots[p.index]=null;}
      next.cash+=cash;next.sellCash=(next.sellCash??0)+cash;
    },null,null,selected.map(entry=>entry.item));
    dialog.addEventListener('close',()=>{if(dialog.dataset.committed){this.batchSelection.clear();this._syncBatchSelection();}},{once:true});
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
    if (from.source === to.source && from.key === to.key && from.index === to.index) {
      if(from.rotated!=null && (!from.key || from.key==='itemSlots')) this.transact((next,player)=>{
        const item=from.source==='stash'?next.stash[from.index]:player.itemSlots[from.index];
        if(item)item.rotated=from.rotated;
      });
      return;
    }
    this.transact((next, player) => {
      const slots = (position) => position.source === 'stash' ? next.stash : player[position.key];
      const read = (position) => position.key === 'handSlots'
        ? player.getHandSlotItem(position.index)
        : slots(position)[position.index] ?? null;
      const item = read(from);
      if(item && from.rotated!=null) item.rotated=from.rotated;
      const displaced = read(to);
      if(item && to.cell!=null && (!to.key || to.key==='itemSlots')) item.storageCell=Number(to.cell);
      if(displaced) delete displaced.storageCell;
      const accepts = ({ source, key, index }, entry) => {
        if (source === 'stash') return !entry || index < stashLimit(next);
        if (key === 'itemSlots') return player.isItemSlotUnlocked(index);
        if (key === 'equipmentSlots') return !entry || equipmentSlotFor(entry) === index;
        return canEquipHand(index, entry);
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
      if(storageLayout(player.itemSlots,player.inventoryCapacity,5).overflow) return 'Not enough adjacent space for this item.';
      const overflow = player.drainLockedInventory();
      if (overflow.length && !storeInStash(next, player, overflow)) return 'Not enough stash space.';
    });
  }

  bindTransfer(slot, source, key, index) {
    const transfer = () => this.transferItem(source, key, index);
    slot.addEventListener('click', event => {
      if (!document.body.classList.contains('mobile-ui') || this._suppressSlotClick === slot) return;
      const tapKey = source + ':' + key + ':' + index, now = performance.now();
      const doubleTap = this._quickTap?.key === tapKey && now - this._quickTap.time < 400;
      this._quickTap = doubleTap ? null : { key: tapKey, time: now };
      if (doubleTap) { event.preventDefault(); event.stopImmediatePropagation(); this.closeSelection(); transfer(); }
    }, true);
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
          const icon = slot.querySelector(':scope > img');
          if (!icon) return;
          if(this.batchSelection?.size>1){drag.ghost=document.createElement('div');const preview=icon.cloneNode(false);preview.style.cssText='width:100%;height:100%;object-fit:contain';const count=document.createElement('span');count.className='batch-drag-count';count.textContent=String(this.batchSelection.size);drag.ghost.append(preview,count);}else drag.ghost = icon.cloneNode(false);
          drag.ghost.className = 'raid-drag-ghost';
          drag.ghost.setAttribute('aria-hidden', 'true');
          drag.ghost.tabIndex = -1;
          drag.ghost.style.width = `${slot.offsetWidth}px`;
          drag.ghost.style.height = `${slot.offsetHeight}px`;
          const entry=source==='stash'?this.profile.stash[index]:this.profile.kit[key][index];
          drag.rotated=!!entry?.rotated;
          if(drag.rotated&&itemWidth(entry)>1){drag.ghost.style.width=slot.offsetHeight+'px';drag.ghost.style.height=slot.offsetWidth+'px';drag.ghost.style.transform='translate(-50%, -50%) rotate(90deg)';}
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
      const destinationSlot=hovered?.closest('.raid-base-slot');
      const targetPosition=this.slotPositions.get(destinationSlot);
      const destination=targetPosition ? {...targetPosition,cell:destinationSlot.dataset.storageCell}:null;
      const rotated=drag.rotated;
      const commit = event.type === 'pointerup' && moved;
      cleanup();
      if (moved) this._suppressSlotClick = slot;
      if (!commit) return;
      if(destination&&this.batchSelection?.size>1&&this.batchSelection.has((source==='stash'?'stash':'kit')+':'+index))this._moveBatch(destination);
      else if (destination) this.rearrangeSlots({ source, key, index, rotated }, destination);
      else if(target.contains(hovered)&&this.batchSelection?.size>1&&this.batchSelection.has((source==='stash'?'stash':'kit')+':'+index))this._moveBatch({source:source==='stash'?'kit':'stash',key:source==='stash'?'itemSlots':null,index:0});
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
      window.addEventListener('keydown', (e)=>{
        if(e.code!=='KeyR'||e.repeat||!drag?.moved)return;
        const entry=source==='stash'?this.profile.stash[index]:this.profile.kit[key][index];
        if(itemWidth(entry)<=1)return;
        e.preventDefault();e.stopImmediatePropagation();drag.rotated=!(drag.rotated??entry.rotated);
        const size=itemSize({...entry,rotated:drag.rotated});
        const cell=slot.offsetWidth/(Number(slot.style.getPropertyValue('--item-width'))||1);
        if(drag.ghost){drag.ghost.style.width=cell*itemWidth(entry)+'px';drag.ghost.style.height=cell+'px';drag.ghost.style.transform=drag.rotated?'translate(-50%, -50%) rotate(90deg)':'translate(-50%, -50%)';}
      }, options);
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

  _scheduleStashCellSync() {
    if(this._stashCellSyncPending)return;
    this._stashCellSyncPending=true;
    requestAnimationFrame(()=>{this._stashCellSyncPending=false;this._syncStashCellSize();});
  }

  _syncStashCellSize() {
    const stash=this.root.querySelector('#raid-stash');
    const slot=this.root.querySelector('#raid-kit > .raid-base-slot');
    if(!stash || !slot || !stash.getClientRects().length)return;
    const measured=slot.getBoundingClientRect().width;
    if(measured<=0)return;
    const cell=document.body.classList.contains('mobile-ui')?Math.max(48,measured):measured;
    if(cell<=0 || Math.abs(cell-(this._stashCellSize??0))<0.1)return;
    this._stashCellSize=cell;
    stash.style.setProperty('--raid-stash-cell',cell+'px');
    stash.style.gridTemplateColumns='repeat(auto-fill, '+cell+'px)';
  }

  renderStash() {
    const { kit, stash } = this.profile;
    const limit = stashLimit(this.profile);
    this.pixelLabel(this.root.querySelector('#raid-stash-title'), `Stash ${storageLayout(stash, limit, 10).used}/${limit}`);
    this.pixelLabel(this.stashPanel.querySelector('h2'), 'Loadout');
    const kitGrid = this.root.querySelector('#raid-kit');
    const gearGrid = this.root.querySelector('#raid-gear');
    const stashGrid = this.root.querySelector('#raid-stash');
    const stashScroll = stashGrid.scrollTop;
    const player = new Player();
    player.applySaveData(kit);
    for (const key of ['equipmentSlots', 'handSlots', 'itemSlots']) {
      kit[key].forEach((entry, index) => {
        const locked = key === 'itemSlots' && !player.isItemSlotUnlocked(index);
        const item = locked ? null : entry;
        const grid = key === 'itemSlots' ? kitGrid : gearGrid;
        const position = key === 'handSlots' ? kit.equipmentSlots.length + index : index;
        const signature = JSON.stringify([item, locked]);
        if (grid.children[position]?.dataset.renderSignature === signature) return;
        const previous = grid.children[position];
        const slot = this.slot(grid, item, item ? (anchor) => this.inspectKit(item, key, index, anchor) : null, '',
          locked ? INV_LOCK_SRC : key === 'handSlots' ? ['assets/ui/weapon1.png', 'assets/ui/weapon2.png'][index]
            : key === 'equipmentSlots' ? ['assets/ui/vest.png', 'assets/ui/backpack.png'][index] : null);
        if(key==='handSlots'){styleItemSlot(slot,null,index===0?3:2);slot.dataset.handWidth='1';}
        if (locked) {
          slot.dataset.locked = 'true';
          slot.setAttribute('aria-label', 'Locked inventory slot');
        }
        if (previous) previous.replaceWith(slot);
        slot.dataset.renderSignature = signature;
        this.slotPositions.set(slot, { source: 'kit', key, index });
        if (item) this.bindTransfer(slot, 'kit', key, index);
      });
    }
    for (let i = 0; i < Math.max(limit, stash.length); i++) {
      const item = stash[i];
      const signature = JSON.stringify(item ?? null);
      const previous = stashGrid.children[i];
      if (previous?.dataset.renderSignature === signature) continue;
      const slot = this.slot(stashGrid, item, item ? (anchor) => {
        const actions = [];
        if(itemWidth(item)>1) actions.push(['Rotate',()=>this.transact(next=>{const entry=next.stash[i];entry.rotated=!entry.rotated;})]);
        const detail = document.createElement('div');
        const description = document.createElement('p');
        description.textContent = getItemDescription(item);
        detail.append(description);
        if (isContainer(item)) actions.push(['Open',()=>this.openStoredContainer('stash',i)]);
        this.addRepairAction(item, actions, (next) => next.stash[i]);
        this.addRecycleAction(item, actions, (next, player, quantity) => recycleAtBase(next, player, i, quantity));
        this.addSplitAction(item, actions, (next, amount) => {
          const empty = Array.from({ length: stashLimit(next) }).findIndex((_, index) => !next.stash[index]);
          if (empty < 0) return 'Stash is full.';
          const source = next.stash[i];
          next.stash[empty] = { ...source, amount };
          next.stash[i] = { ...source, amount: source.amount - amount };
        });
        this.addSellAction(item, actions, (next, _player, quantity) => {
          const current = next.stash[i];
          const remaining = (current.amount ?? 1) - quantity;
          next.stash[i] = remaining ? { ...current, amount: remaining } : null;
        });
        this.inspect(item, actions, detail, anchor, { showClose: false });
      } : null);
      if (previous) previous.replaceWith(slot);
      slot.dataset.renderSignature = signature;
      this.slotPositions.set(slot, { source: 'stash', key: null, index: i });
      if (item) this.bindTransfer(slot, 'stash', null, i);
    }
    while (stashGrid.childElementCount > Math.max(limit, stash.length)) stashGrid.lastElementChild.remove();
    applyStorageLayout(stashGrid, stash, Math.max(limit, stash.length), 10);
    applyStorageLayout(kitGrid, kit.itemSlots, kit.itemSlots.length, 5, player.inventoryCapacity);
    stashGrid.scrollTop = stashScroll;
    this._scheduleStashCellSync();
    this._syncBatchSelection();
  }

  openStoredContainer(source,index) {
    const position={left:this.selection.style.left,top:this.selection.style.top};
    this._keepSelection=true;
    let opened;
    try {opened=this.transact((next,player)=>{
      if(source==='stash'){
        const storage=stashInventory(next,player);
        if(!openContainer(storage,index))return 'Not enough room to open this container.';
        next.stash=storage.itemSlots;
      } else if(!openContainer(player,index))return 'Not enough room to open this container.';
      if(isPack(source==='stash'?this.profile.stash[index]:this.profile.kit.itemSlots[index]))next.packsOpened=(next.packsOpened??0)+1;
    });} finally {this._keepSelection=false;}
    if(!opened)return;
    const entry=source==='stash'?this.profile.stash[index]:this.profile.kit.itemSlots[index];
    const slot=this.root.querySelector(source==='stash'?'#raid-stash':'#raid-kit')?.children[index];
    if(!entry||!slot){this.closeSelection();return;}
    if(source==='stash')slot.click();else this.inspectKit(entry,'itemSlots',index,slot);
    Object.assign(this.selection.style,position);
  }

  inspectKit(item, key, index, anchor) {
    const actions = [];
    if(key==='itemSlots'&&itemWidth(item)>1)actions.push(['Rotate',()=>this.transact((next,player)=>{player.itemSlots[index].rotated=!player.itemSlots[index].rotated;})]);
    const detail = document.createElement('div');
    const description = document.createElement('p');
    description.textContent = getItemDescription(item);
    detail.append(description);
    this.addRepairAction(item, actions,
      (_, player) => key === 'handSlots' ? player.getHandSlotItem(index) : player[key][index],
      key === 'handSlots' ? (player, repaired) => player.restoreHandSlot(index, repaired) : null);
    if(key==='itemSlots'&&isContainer(item))actions.push(['Open',()=>this.openStoredContainer('kit',index)]);
    if (key === 'itemSlots') {
      this.addSplitAction(item, actions, (next, amount, player) => {
        const empty = player.itemSlots.findIndex((entry, i) => !entry && player.isItemSlotUnlocked(i));
        if (empty < 0) return 'No empty loadout slot.';
        const source = player.itemSlots[index];
        player.itemSlots[empty] = { ...source, amount };
        player.itemSlots[index] = { ...source, amount: source.amount - amount };
      });
    }
    const removeFromKit = (player, quantity) => {
      if (key === 'handSlots') return player.suspendHandSlotForDrag(index);
      if (key === 'equipmentSlots') return player.suspendEquipmentForDrag(index);
      const current = player.itemSlots[index];
      const remaining = (current.amount ?? 1) - quantity;
      player.itemSlots[index] = remaining > 0 ? { ...current, amount: remaining } : null;
      return current;
    };
    this.addRecycleAction(item, actions, (next, player, quantity) => {
      const current = removeFromKit(player, quantity);
      const yields = getRecycleYields(current, quantity, raidLevel(next));
      if (!yields?.length) return 'This item cannot be recycled.';
      const stash = stashInventory(next, player);
      if (applyRecycleYields(stash, yields).length) return 'Make space for the recovered materials.';
      next.stash = stash.itemSlots;
      if (!storeInStash(next, player, player.drainLockedInventory())) return 'Not enough stash space.';
    });
    this.addSellAction(item, actions, (next, player, quantity) => {
      removeFromKit(player, quantity);
      if (!storeInStash(next, player, player.drainLockedInventory())) return 'Not enough stash space.';
    });
    this.inspect(item, actions, detail, anchor);
  }

  addRepairAction(item, actions, getItem, equip = null) {
    if (itemDurability(item) >= MAX_DURABILITY) return;
    const equipment = item.kind === 'equipment';
    if (!equipment && item.kind !== 'weapon' && item.kind !== 'melee') return;
    const costs = equipment
      ? { sewing_kit: 1 }
      : { repair_kit: 1 };
    actions.push(['Repair', () => this.openQuantityDialog('Repair', item, 1, (next, player) => {
      const current = getItem(next, player);
      if (!current || itemDurability(current) >= MAX_DURABILITY) return 'Item does not need repair.';
      const inventory = stashInventory(next, player);
      if (!inventory.consumeMaterials(costs)) return 'Missing repair materials in stash.';
      next.stash = inventory.itemSlots;
      const repaired = getItem(next, player);
      repaired.durability = MAX_DURABILITY;
      if (equip) equip(player, repaired);
    }, costs),!stashInventory(this.profile,new Player()).hasMaterials(costs)]);
  }

  addRecycleAction(item, actions, recycle) {
    if (canRecycleItem(item, raidLevel(this.profile))) {
      actions.push(['Recycle', () => this.openQuantityDialog('Recycle', item, item.amount ?? 1, recycle)]);
    }
  }

  addSellAction(item, actions, remove) {
    if(item.kind==='material'&&item.key==='cash')return;
    const price = getSellPrice(item);
    if (!price) return;
    actions.push(['Sell', () => this.openQuantityDialog('Sell', item, item.amount ?? 1, (next, player, quantity) => {
      const error = remove(next, player, quantity);
      if (error) return error;
      next.cash += quantity * price;
      next.sellCash=(next.sellCash??0)+quantity*price;
    })]);
  }

  addSplitAction(item, actions, split) {
    if (!['material', 'ammo', 'consumable', 'bandage', 'throwable'].includes(item.kind) || !(item.amount > 1)) return;
    actions.push(['Split', () => this.openQuantityDialog('Split', item, item.amount - 1,
      (next, player, quantity) => split(next, quantity, player))]);
  }

  openQuantityDialog(action, item, maximum, change, repairCosts = null, raid = null, batchItems = null) {
    const anchor = raid?.anchor ?? this.selectionAnchor;
    if (!raid) this.closeSelection();
    const dialog = document.createElement('dialog');
    dialog.className = 'raid-quantity-dialog';
    dialog.dataset.action = action.toLowerCase();
    dialog.setAttribute('aria-label', action + ' ' + getItemDisplayName(item));
    const slider = document.createElement('input');
    slider.type = 'range';
    const batch = action === 'Recycle' ? recycleBatchSize(item) : 1;
    const sliderMax = Math.floor(maximum / batch) * batch;
    slider.min = String(batch);
    slider.max = String(sliderMax);
    slider.step = String(batch);
    slider.value = String(batch);
    slider.setAttribute('aria-label', 'Quantity');
    const preview = document.createElement('div');
    preview.className = 'raid-recycle-preview';
    const status = document.createElement('div');
    status.className = 'raid-quantity-notice';
    status.setAttribute('role', 'status');
    let repairUnavailable = false;
    const update = () => {
      if(batchItems){
        preview.replaceChildren();
        const pile=document.createElement('div');pile.className='raid-sale-pile';let cash=0;
        for(const entry of batchItems){const group=document.createElement('div');const icon=document.createElement('img');icon.src=getItemIconSrc(entry);icon.alt=getItemDisplayName(entry);icon.title=icon.alt;group.style.zIndex=String(pile.children.length+1);group.append(icon);pile.append(group);cash+=getSellPrice(entry)*(entry.amount??1);}
        const equals=document.createElement('span');this.pixelLabel(equals,'=');const reward=document.createElement('div');const icon=document.createElement('img');icon.src='assets/items/misc/cash.png';icon.alt='Cash';const count=document.createElement('span');this.pixelLabel(count,String(cash));reward.append(count,icon);const total=document.createElement('div');total.className='raid-sale-total';total.append(equals,reward);preview.classList.add('raid-batch-sale-preview');preview.append(pile,total);return;
      }
      if (repairCosts) {
        const stash = stashInventory(this.profile, new Player());
        const terms = [...Object.entries(repairCosts).map(([key, amount]) => ({
          item: { kind: 'material', key }, label: String(amount), missing: stash.countMaterial(key) < amount,
        })), { item, label: '100%' }];
        repairUnavailable = terms.some((term) => term.missing);
        terms.forEach(({ item: term, label, missing }, index) => {
          if (index > 0) {
            const operator = document.createElement('span');
            this.pixelLabel(operator, index === terms.length - 1 ? '=' : '+');
            preview.append(operator);
          }
          const group = document.createElement('div');
          if (missing) group.classList.add('raid-repair-missing');
          const icon = document.createElement('img');
          icon.src = getItemIconSrc(term);
          icon.alt = getItemDisplayName(term);
          icon.title = missing ? `${icon.alt} (${stash.countMaterial(term.key)}/${label})` : icon.alt;
          const amount = document.createElement('span');
          this.pixelLabel(amount, label);
          group.append(icon, amount);
          preview.append(group);
        });
        return;
      }
      const count = slider.valueAsNumber;
      const original = document.createElement('div');
      const originalIcon = document.createElement('img');
      originalIcon.src = getItemIconSrc(item);
      originalIcon.alt = getItemDisplayName({ ...item, amount: 1 });
      const originalAmount = document.createElement('span');
      this.pixelLabel(originalAmount, String(count));
      original.append(originalIcon, originalAmount);
      const equals = document.createElement('span');
      this.pixelLabel(equals, action === 'Split' ? '/' : '=');
      preview.replaceChildren(original, equals);
      if (action === 'Split' || action === 'Sell') {
        const result = original.cloneNode(true);
        const icon = result.querySelector('img');
        if (action === 'Sell') {
          icon.src = 'assets/items/misc/cash.png';
          icon.alt = 'Cash';
          result.querySelector('span').hidden=false;
          result.replaceChildren(result.querySelector('span'),icon);
        }
        this.pixelLabel(result.querySelector('span'), String(action === 'Sell' ? count * getSellPrice(item) : maximum + 1 - count));
        preview.append(result);
        return;
      }
      const materials = getRecycleYields(item, count, raid?.level);
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
      const report = (message) => {
          this.pixelLabel(status, message, 270);
          status.animate([{ opacity: 0, translate: '0 5px' }, { opacity: 1, offset: 0.15 },
            { opacity: 1, offset: 0.75 }, { opacity: 0, translate: '0 -12px' }],
          { duration: 1800, easing: 'ease-out' });
      };
      const committed = raid ? change(slider.valueAsNumber, report)
        : this.transact((next, player) => change(next, player, slider.valueAsNumber), report);
      if (committed) {dialog.dataset.committed='true';dialog.close();}
    }, repairUnavailable));
    controls.lastElementChild.classList.add('ui-action-red');
    dialog.append(preview);
    if (!batchItems && sliderMax > batch) {
      dialog.append(slider);
      this.styleSlider(slider);
    }
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
      anchor?.blur?.();
      if(!dialog.dataset.committed){
        this.batchSelection?.clear();this._syncBatchSelection?.();
        anchor?.classList?.remove('inv-selected','item-multi-selected');
      }
      document.activeElement?.blur?.();
    }, { once: true });
    (raid?.host ?? this.root).append(dialog);
    dialog.showModal();
    if (!batchItems && sliderMax > batch) slider.focus({ preventScroll: true });
    return dialog;
  }

  renderCraft() {
    const grid = this.root.querySelector('#raid-recipes');
    grid.replaceChildren();
    const player = new Player();
    player.applySaveData(this.profile.kit);
    player.raidLevel = raidLevel(this.profile);
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
    const level=raidLevel(this.profile);
    entries.sort((a,b)=>catalogCategory(a.offer.item)-catalogCategory(b.offer.item)||Number(level<a.offer.level)-Number(level<b.offer.level)||a.offer.price-b.offer.price);
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
          this.playUi('buy');
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
      priceTag.classList.toggle('option-unavailable',!unlocked);
      const cash = document.createElement('img');
      cash.src = 'assets/items/misc/cash.png';
      cash.alt = '';
      const amount = document.createElement('span');
      this.pixelLabel(amount, offer.price.toLocaleString());
      priceTag.append(amount, cash);
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

    this.hideItemName();
    this.selection.replaceChildren(title, description);
    if (buttons.childElementCount) this.selection.append(buttons);
    this.selection.classList.remove('hidden');
    this.selectionAnchor = anchor;
    const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const catalog = touch && anchor.closest('#raid-shop, #raid-recipes');
    if (catalog && !keepPosition) {
      const workspace = this.workspace.getBoundingClientRect();
      const item = anchor.getBoundingClientRect();
      this.workspace.scrollTo({
        top: this.workspace.scrollTop + item.top + item.height / 2 - workspace.top - workspace.height / 2,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
    if (!keepPosition || !this.selection.style.left) this.positionSelection(anchor);
  }

  positionSelection(anchor) {
    const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const rect = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const maxX = viewport?.width ?? window.innerWidth;
    const maxY = viewport?.height ?? window.innerHeight;
    if (touch) {
      const bounds = (this.deployDialog.open ? this.deployDialog : this.root.querySelector('.raid-base-frame')).getBoundingClientRect();
      const leftEdge = Math.max(bounds.left, viewport?.offsetLeft ?? 0) + 8;
      const topEdge = Math.max(bounds.top, viewport?.offsetTop ?? 0) + 32;
      const rightEdge = Math.min(bounds.right, (viewport?.offsetLeft ?? 0) + maxX) - 8;
      const bottomEdge = Math.min(bounds.bottom, (viewport?.offsetTop ?? 0) + maxY) - 8;
      this.selection.style.maxWidth = `${rightEdge - leftEdge}px`;
      this.selection.style.maxHeight = `${bottomEdge - topEdge}px`;
      const box = this.selection.getBoundingClientRect();
      const x = rect.right + box.width + 5 <= rightEdge ? rect.right + 5 : rect.left - box.width - 5;
      this.selection.style.left = `${Math.max(leftEdge, Math.min(x, rightEdge - box.width))}px`;
      this.selection.style.top = `${Math.max(topEdge, Math.min(rect.top + 16, bottomEdge - box.height))}px`;
      return;
    }
    this.selection.style.maxWidth = `${maxX - 16}px`;
    this.selection.style.maxHeight = `${maxY - 16}px`;
    const { width, height } = this.selection.getBoundingClientRect();
    const left = rect.right + width + 8 <= maxX ? rect.right + 5 : rect.left - width - 5;
    this.selection.style.left = `${Math.max(8, Math.min(left, maxX - width - 8))}px`;
    this.selection.style.top = `${Math.max(8, Math.min(rect.top, maxY - height - 8))}px`;
  }

  positionItemName({ clientX, clientY }) {
    const { offsetWidth: width, offsetHeight: height } = this.itemName;
    this.itemName.style.left = Math.max(8, Math.min(clientX - width / 2, innerWidth - width - 8)) + 'px';
    this.itemName.style.top = Math.max(8, clientY - height - 12) + 'px';
  }

  hideItemName() {
    this.itemName?.classList.remove('visible');
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

    const key = ({ArrowUp:'KeyW',ArrowLeft:'KeyA',ArrowDown:'KeyS',ArrowRight:'KeyD'})[event.code]??event.code;
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
      slot.dataset.itemName = getItemDisplayName({ ...item, amount: 1 });
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
      if(isTieredItem(item)){
        const tier=document.createElement('span');tier.className='inv-pack-tier';
        tier.append(createPixelTextImg(['','I','II','III'][packTier(item)],PIXEL_TEXT_SCALE_SM,{fillColor:'#e5bc50',outlineColor:[220,112,24]}));
        slot.append(tier);
      }
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
      tag.className='raid-item-count';
      tag.append(createPixelTextImg(badge,PIXEL_TEXT_SCALE_SM,/^\d+$/.test(badge)?{outlineColor:[0,0,0]}:{}));
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
    if (/^(buy|use|craft)$/i.test(label)) button.classList.add('ui-action-red');
    this.pixelLabel(button, label, 120);
    if (iconSrc) {
      button.setAttribute('aria-label', `${label} Cash`);
      const icon = document.createElement('img');
      icon.className = 'raid-shop-price-icon';
      icon.src = iconSrc;
      icon.alt = '';
      button.append(icon);
    }
    if (label === 'BUY') button.dataset.uiCue = 'manual';
    button.disabled = disabled;
    button.addEventListener('click', action);
    return button;
  }
}
