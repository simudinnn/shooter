export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.buffers = {};

    this._lastCasingLand = 0;
    this._lastFootstep = 0;
    this._lastEnemyStep = 0;
    this._lastScoutStomp = 0;
  }

  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);
    this.enabled = true;

    await this.loadSounds();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  async loadSounds() {
    const sounds = {
      m16: ['sounds/guns/m16.ogg'],
      glock: ['sounds/guns/glock.ogg'],
      m870: ['sounds/guns/m870.ogg'],
      m24: ['sounds/guns/m24.ogg'],
      uzi: ['sounds/guns/uzi.ogg'],
      revolver: ['sounds/guns/revolver.ogg'],
      famas: ['sounds/guns/famas.ogg'],
      fal: ['sounds/guns/fal.ogg'],
      melee: ['sounds/player/melee.ogg'],

      enemyShot: [
        'sounds/guns/enemy-shot.ogg'
      ],
      reload: [
        'sounds/guns/reload.ogg'
      ],
      weaponSwitch: [
        'sounds/player/weapon-switch-1.ogg'
      ],
      hitEnemy: [
        'sounds/entities/hit-enemy-1.ogg',
        'sounds/entities/hit-enemy-2.ogg',
        'sounds/entities/hit-enemy-3.ogg',
      ],
      explosion: [
        'sounds/world/explosion-1.ogg',
        'sounds/world/explosion-2.ogg',
        'sounds/world/explosion-3.ogg',
      ],
      playerHurt: [
        'sounds/player/player-hurt-1.ogg',
        'sounds/player/player-hurt-2.ogg',
        'sounds/player/player-hurt-3.ogg',
      ],
      pickup: [
        'sounds/ui/pickup.ogg'
      ],
      chestOpen: [
        'sounds/world/chest-open-1.ogg',
        'sounds/world/chest-open-2.ogg',
        'sounds/world/chest-open-3.ogg',
      ],
      doorOpen: [
        'sounds/world/door-open-1.ogg',
        'sounds/world/door-open-2.ogg',
        'sounds/world/door-open-3.ogg',
      ],
      doorClose: [
        'sounds/world/door-close-1.ogg',
        'sounds/world/door-close-2.ogg',
        'sounds/world/door-close-3.ogg',
      ],
      inventoryMove: [
        'sounds/ui/inventory-move-1.ogg',
        'sounds/ui/inventory-move-2.ogg',
        'sounds/ui/inventory-move-3.ogg',
      ],
      inventoryPlace: [
        'sounds/ui/inventory-place-1.ogg',
        'sounds/ui/inventory-place-2.ogg',
        'sounds/ui/inventory-place-3.ogg',
      ],
      inventoryEquip: [
        'sounds/ui/inventory-equip-1.ogg',
        'sounds/ui/inventory-equip-2.ogg',
        'sounds/ui/inventory-equip-3.ogg',
      ],
      footstep: [
        'sounds/player/footstep-1.ogg',
        'sounds/player/footstep-2.ogg',
        'sounds/player/footstep-3.ogg',
      ],
      enemyFootstep: [
        'sounds/entities/enemy-footstep-1.ogg',
        'sounds/entities/enemy-footstep-2.ogg',
        'sounds/entities/enemy-footstep-3.ogg',
      ],
      scoutStomp: [
        'sounds/entities/scout-stomp-1.ogg',
        'sounds/entities/scout-stomp-2.ogg',
        'sounds/entities/scout-stomp-3.ogg',
      ],
      scoutChargeStart: [
        'sounds/entities/scout-charge-start-1.ogg',
        'sounds/entities/scout-charge-start-2.ogg',
        'sounds/entities/scout-charge-start-3.ogg',
      ],
      casingEject: [
        'sounds/guns/casing-eject-1.ogg',
        'sounds/guns/casing-eject-2.ogg',
        'sounds/guns/casing-eject-3.ogg'
      ],
      casingLand: [
      ],
      regenStart: [
        'sounds/player/regen-start.ogg'
      ],
      win: [
        'sounds/ui/win.ogg'
      ],
      lose: [
        'sounds/ui/lose.ogg'
      ],
    };

    for (const [name, paths] of Object.entries(sounds)) {
      this.buffers[name] = [];

      for (const path of paths) {
        try {
          const res = await fetch(path);
          if (!res.ok) throw new Error(`Missing sound: ${path}`);

          const arrayBuffer = await res.arrayBuffer();
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

          this.buffers[name].push(audioBuffer);
        } catch (err) {
          console.warn(err.message);
        }
      }
    }
  }

  play(name, volume = 1, playbackRate = 1) {
    if (!this.enabled || !this.ctx) return;

    const variants = this.buffers[name];
    if (!variants || variants.length === 0) return;

    const buffer = variants[Math.floor(Math.random() * variants.length)];

    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();

    src.buffer = buffer;
    src.playbackRate.value = playbackRate;
    gain.gain.value = volume;

    src.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  /** 0 beyond maxDist, 1 at or inside fullDist, smooth falloff between. */
  _distanceAtten(dist, fullDist = 5, maxDist = 28) {
    if (dist >= maxDist) return 0;
    if (dist <= fullDist) return 1;

    const t = (maxDist - dist) / (maxDist - fullDist);
    return t * t;
  }

  m16() {const pitch = 0.95 + Math.random() * 0.2;
    this.play('m16', 1, pitch);}
  glock() {const pitch = 0.95 + Math.random() * 0.2;this.play('glock', 1, pitch);}
  m870() {const pitch = 0.95 + Math.random() * 0.2;this.play('m870', 1, pitch);}
  m24() {const pitch = 0.95 + Math.random() * 0.2;this.play('m24', 1, pitch);}
  uzi() {const pitch = 0.95 + Math.random() * 0.2;this.play('uzi', 1, pitch);}
  revolver() {const pitch = 0.95 + Math.random() * 0.2;this.play('revolver', 1, pitch);}
  famas() {const pitch = 0.95 + Math.random() * 0.2;this.play('famas', 1, pitch);}
  fal() {const pitch = 0.95 + Math.random() * 0.2;this.play('fal', 1, pitch);}
  melee() {const pitch = 0.95 + Math.random() * 0.2;this.play('melee', 1, pitch);}

  enemyShot() {const pitch = 0.95 + Math.random() * 0.2;this.play('enemyShot', 1, pitch);}

  reload() {
    this.play('reload', 0.75);
  }

  weaponSwitch() {
    this.play('weaponSwitch', 0.5);
  }

  hitEnemy() {
    this.play('hitEnemy', 0.6);
  }

  explosion() {
    this.play('explosion', 1);
  }

  playerHurt() {
    this.play('playerHurt', 0.9);
  }

  pickup() {
    this.play('pickup', 0.75);
  }

  chestOpen() {
    this.play('chestOpen', 0.75);
  }

  doorToggle(opening) {
    this.play(opening ? 'doorOpen' : 'doorClose', 0.75);
  }

  inventoryMove() {
    this.play('inventoryMove', 0.55);
  }

  inventoryPlace() {
    this.play('inventoryPlace', 0.6);
  }

  inventoryEquip() {
    this.play('inventoryEquip', 0.65);
  }

  footstep(sprinting = false) {
    if (!this.enabled || !this.ctx) return;

    const now = this.ctx.currentTime;
    const minGap = sprinting ? 0.09 : 0.14;

    if (now - this._lastFootstep < minGap) return;
    this._lastFootstep = now;

    const volume = sprinting ? 0.2 : 0.2;
    const pitch = 1.15 + Math.random() * 0.1;

    this.play('footstep', volume, pitch);
  }

  enemyFootstep(distance = 0) {
    if (!this.enabled || !this.ctx) return;

    const vol = this._distanceAtten(distance);
    if (vol <= 0) return;

    const now = this.ctx.currentTime;
    if (now - this._lastEnemyStep < 0.18) return;
    this._lastEnemyStep = now;

    const pitch = 0.9 + Math.random() * 0.12;
    this.play('enemyFootstep', 0.4 * vol, pitch);
  }

  scoutStomp(distance = 0) {
    if (!this.enabled || !this.ctx) return;

    const vol = this._distanceAtten(distance, 6, 32);
    if (vol <= 0) return;

    const now = this.ctx.currentTime;
    if (now - this._lastScoutStomp < 0.34) return;
    this._lastScoutStomp = now;

    const pitch = 0.9 + Math.random() * 0.08;
    this.play('scoutStomp', 1 * vol, pitch);
  }

  scoutChargeStart(distance = 0) {
    if (!this.enabled || !this.ctx) return;

    const vol = this._distanceAtten(distance, 10, 36);
    if (vol <= 0) return;

    this.play('scoutChargeStart', 1.5 * vol);
  }

  casingEject() {
    this.play('casingEject', 0.25, 0.95 + Math.random() * 0.15);
  }

  casingLand() {
    if (!this.enabled || !this.ctx) return;

    const now = this.ctx.currentTime;
    if (now - this._lastCasingLand < 0.045) return;

    this._lastCasingLand = now;
    this.play('casingLand', 0.25, 0.95 + Math.random() * 0.15);
  }

  regenStart() {
    this.play('regenStart', 0.65);
  }

  win() {
    this.play('win', 0.85);
  }

  lose() {
    this.play('lose', 0.85);
  }
}