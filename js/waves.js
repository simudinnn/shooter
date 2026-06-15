import { Robot, createGroundErupt } from './enemies.js';

export class WaveManager {
  constructor(world, game) {
    this.world = world;
    this.game = game;
    this.wave = 0;
    this.queue = [];
    this.state = 'between';
    this.betweenTimer = 2;
  }

  reset() {
    this.wave = 0;
    this.queue = [];
    this.state = 'between';
    this.betweenTimer = 2;
  }

  update(dt) {
    if (this.state === 'between') {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) this._beginWave();
      return;
    }

    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i].timer -= dt;
      if (this.queue[i].timer <= 0) {
        const { x, z } = this.queue[i];
        this.queue.splice(i, 1);
        const robot = Robot.createEmerging(x, z, this.wave, this.world, 'spider');
        this.game.robots.push(robot);
        this.game.particles.push(...createGroundErupt(x, z));
      }
    }

    if (this.state === 'spawning' && this.queue.length === 0) {
      this.state = 'fighting';
    }

    if (this.state === 'fighting' && this._aliveThisWave() === 0) {
      this.state = 'between';
      this.betweenTimer = Math.max(1.8, 3.5 - this.wave * 0.12);
      this.game.showWaveBanner('WAVE CLEARED', 1.6);
    }
  }

  _aliveThisWave() {
    return this.game.robots.filter((r) => r.spawnWave === this.wave && (r.alive || r.emerging)).length;
  }

  aliveCount() {
    return this.game.robots.filter((r) => r.alive || r.emerging).length;
  }

  _beginWave() {
    this.wave += 1;
    this.state = 'spawning';
    this.game.showWaveBanner(`WAVE ${this.wave}`, 2.2);
    this.game.items?.spawnWaveItems(this.wave);
    const count = 4 + this.wave * 2;
    const interval = Math.max(0.28, 0.62 - this.wave * 0.025);
    const placeholders = [];

    for (let i = 0; i < count; i++) {
      const pos = Robot.findSpawnPoint(
        this.world,
        [...this.game.robots, ...placeholders],
        14,
        this.game.player,
      );
      placeholders.push({ x: pos.x, z: pos.z });
      this.queue.push({
        timer: 0.35 + i * interval,
        x: pos.x,
        z: pos.z,
      });
    }
  }
}
