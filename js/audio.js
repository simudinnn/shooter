export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);
    this.enabled = true;
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  _noise(duration, volume = 0.3, filterFreq = 800) {
    if (!this.enabled) return;
    const { ctx, master } = this;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  _tone(freq, duration, volume = 0.15, type = 'square') {
    if (!this.enabled) return;
    const { ctx, master } = this;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  rifleShot() {
    this._noise(0.08, 0.35, 1200);
    this._tone(90, 0.06, 0.2, 'sawtooth');
  }

  pistolShot() {
    this._noise(0.05, 0.4, 2000);
    this._tone(150, 0.04, 0.15, 'square');
  }

  enemyShot() {
    this._noise(0.06, 0.15, 900);
    this._tone(70, 0.05, 0.08, 'sawtooth');
  }

  reload() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    [0, 0.12, 0.28].forEach((delay, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 200 + i * 80;
      gain.gain.setValueAtTime(0.12, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.06);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t + delay);
      osc.stop(t + delay + 0.07);
    });
  }

  weaponSwitch() {
    this._tone(440, 0.04, 0.08, 'triangle');
  }

  hitEnemy() {
    this._tone(180, 0.08, 0.2, 'square');
    this._noise(0.04, 0.15, 400);
  }

  explosion() {
    this._noise(0.35, 0.5, 300);
    this._tone(60, 0.3, 0.25, 'sawtooth');
  }

  playerHurt() {
    this._tone(120, 0.15, 0.25, 'sawtooth');
    this._noise(0.1, 0.2, 500);
  }

  pickup() {
    this._tone(660, 0.08, 0.12, 'sine');
    this._tone(880, 0.1, 0.1, 'triangle');
  }

  mysteryOpen() {
    this._noise(0.12, 0.2, 600);
    [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this._tone(f, 0.12, 0.1, 'sine'), i * 70));
  }

  shotgunShot() {
    this._noise(0.14, 0.45, 700);
    this._tone(70, 0.1, 0.22, 'sawtooth');
  }

  sniperShot() {
    this._noise(0.1, 0.4, 1500);
    this._tone(110, 0.08, 0.18, 'square');
  }

  jump() {
    this._tone(320, 0.06, 0.06, 'triangle');
  }

  regenStart() {
    this._tone(520, 0.12, 0.06, 'sine');
  }

  win() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.2, 0.15, 'sine'), i * 120));
  }

  lose() {
    [300, 220, 150].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 0.2, 'sawtooth'), i * 200));
  }
}
