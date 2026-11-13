export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.muted = false;
    this.volume = 0.45;
    this.buffers = {};
    this.uiSounds = new Map(['click1', 'button1', 'buy', 'deploy'].map((name) => {
      const audio = new Audio(`sounds/ui/${name}.ogg`);
      audio.preload = 'auto';
      return [name, audio];
    }));

    this._lastCasingLand = 0;
    this._lastFootstep = 0;
    this._lastEnemyStep = 0;
    this._lastScoutStomp = 0;
  }

  async init() {
    if (this.ctx) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.enabled = true;

    await this.loadSounds();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setEnabled(enabled, volume = this.volume) {
    this.muted = !enabled;
    this.volume = volume;
    if (this.master) this.master.gain.value = enabled ? volume : 0;
  }

  playUi(name) {
    if (this.muted || this.volume <= 0) return;
    const audio = this.uiSounds.get(name);
    if (!audio) return;
    audio.volume = this.volume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
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
      weaponSwitch: [
        'sounds/player/weapon-switch-1.ogg'
      ],
      hitEnemy: [
        'sounds/entities/hit-enemy-1.ogg',
        'sounds/entities/hit-enemy-2.ogg',
        'sounds/entities/hit-enemy-3.ogg',
      ],
      playerHurt: [
        'sounds/player/hurt1.ogg',
        'sounds/player/hurt2.ogg',
        'sounds/player/hurt3.ogg',
      ],
      explosion: [
        'sounds/world/explosion-1.ogg',
        'sounds/world/explosion-2.ogg',
        'sounds/world/explosion-3.ogg',
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

  play(name, volume = 1, playbackRate = 1, offset = null) {
    if (!this.enabled || !this.ctx || volume <= 0) return;

    const variants = this.buffers[name];
    if (!variants || variants.length === 0) return;

    const buffer = variants[Math.floor(Math.random() * variants.length)];

    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();

    src.buffer = buffer;
    src.playbackRate.value = playbackRate;
    gain.gain.value = volume;

    src.connect(gain);
    let output = gain;
    if (offset) {
      const distance = Math.hypot(offset.x, offset.z);
      if (!offset.nearOpening && (offset.occluded || offset.outside || distance > 60)) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const distanceCutoff = Math.max(6200, 16000 / (1 + Math.max(0, distance - 60) * 0.018));
        const wallCutoff = offset.outside ? 3000 : 4100;
        filter.frequency.value = offset.occluded || offset.outside
          ? Math.min(wallCutoff, distanceCutoff) : distanceCutoff;
        filter.Q.value = 0.5;
        output.connect(filter);
        output = filter;
      }
    }
    if (offset && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0.55 * offset.x / Math.max(6, Math.hypot(offset.x, offset.z));
      output.connect(panner);
      output = panner;
    }
    output.connect(this.master);
    src.start();
    return src;
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
  melee(offset = null) {
    this.play('melee', 0.5, 0.95 + Math.random() * 0.2, offset);
  }


  reload() {
    this.play('reload', 0.75);
  }

  weaponSwitch() {
    this.play('weaponSwitch', 0.5);
  }

  hitEnemy(offset = null) {
    this.play('hitEnemy', 0.6 * this._effectVolume(offset, 32), 1, offset);
  }

  explosion(offset = null) {
    this.play('explosion', 1 * this._effectVolume(offset, 165), 1, offset);
  }

  _effectVolume(offset, range) {
    return offset ? this._distanceAtten(Math.hypot(offset.x, offset.z), 5, range) : 1;
  }

  playerHurt(offset = null) {
    this.play('playerHurt', 0.9 * this._effectVolume(offset, 45), 1, offset);
  }

  pickup() {
    this.play('pickup', 0.75);
  }

  chestOpen(offset = null) {
    this.play('chestOpen', 0.75, 1, offset);
  }

  doorToggle(opening, offset = null, volume = 1) {
    this.play(opening ? 'doorOpen' : 'doorClose', 0.75 * volume, 1, offset);
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

  enemyFootstep(distance = 0, offset = null) {
    if (!this.enabled || !this.ctx) return;

    const vol = this._distanceAtten(distance);
    if (vol <= 0) return;

    const now = this.ctx.currentTime;
    if (now - this._lastEnemyStep < 0.18) return;
    this._lastEnemyStep = now;

    const pitch = 0.9 + Math.random() * 0.12;
    this.play('enemyFootstep', 0.4 * vol, pitch, offset);
  }

  scoutStomp(distance = 0, offset = null) {
    if (!this.enabled || !this.ctx) return;

    const vol = this._distanceAtten(distance, 5, 42);
    if (vol <= 0) return;

    const now = this.ctx.currentTime;
    if (now - this._lastScoutStomp < 0.34) return;
    this._lastScoutStomp = now;

    const pitch = 0.9 + Math.random() * 0.08;
    this.play('scoutStomp', 0.33 * vol, pitch, offset);
  }

  scoutChargeStart(distance = 0, offset = null) {
    if (!this.enabled || !this.ctx) return;

    const vol = this._distanceAtten(distance, 10, 45);
    if (vol <= 0) return;

    this.play('scoutChargeStart', 1.5 * vol, 1, offset);
  }

  enemyShot(distance = 0, offset = null, sound = 'enemyShot') {
    if (!this.enabled || !this.ctx) return;

    const vol = this._distanceAtten(distance, 12, sound === 'enemyShot' ? 110 : 125);
    if (vol <= 0) return;
    this.play(sound, (sound === 'enemyShot' ? 0.56 : 0.68) * vol, 0.95 + Math.random() * 0.2, offset);
  }


  casingEject() {
    this.play('casingEject', 0.25, 0.95 + Math.random() * 0.15);
  }

  casingLand(offset = null) {
    if (!this.enabled || !this.ctx) return;

    const now = this.ctx.currentTime;
    if (now - this._lastCasingLand < 0.045) return;

    this._lastCasingLand = now;
    this.play('casingLand', 0.25 * this._effectVolume(offset, 18), 0.95 + Math.random() * 0.15, offset);
  }

  regenStart() {
    this.play('regenStart', 0.65);
  }

  win() {
    this.play('win', 0.85);
  }

  lose() {
    this.stopLose();
    const source = this.play('lose', 0.85);
    this.loseSource = source;
    source?.addEventListener('ended', () => {
      if (this.loseSource === source) this.loseSource = null;
    }, { once: true });
  }

  stopLose() {
    const source = this.loseSource;
    this.loseSource = null;
    source?.stop();
  }
}
