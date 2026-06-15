import { collectCollisionTargets, moveWithEntityCollision } from './collision.js';

/** Base robot enemy — `type` selects sprite sheet (spider, walker, scout, …). */
export class Robot {
  constructor(x, z, wave = 1, type = 'spider') {
    this.type = type;
    this.x = x;
    this.z = z;
    this.spawnWave = wave;
    this.angle = Math.random() * Math.PI * 2;
    const waveScale = 1 + (wave - 1) * 0.1;
    this.health = Math.floor(45 * waveScale);
    this.maxHealth = this.health;
    this.alive = true;
    this.baseSpeed = (10 + Math.random() * 2.2) * (1 + (wave - 1) * 0.05);
    this.speed = this.baseSpeed;
    this.radius = 1.45;
    this.moveRadius = 0.62;
    this.meleeDamage = Math.floor((10 + Math.random() * 8) * (1 + (wave - 1) * 0.07));
    this.meleeRange = 1.55;
    this.attackRate = Math.max(0.45, 0.75 + Math.random() * 0.35 - (wave - 1) * 0.03);
    this.meleeCooldown = 0.3 + Math.random() * 0.5;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderTimer = 0;
    this.chasing = false;
    this.moving = false;
    this.knockVX = 0;
    this.knockVZ = 0;
    this.stagger = 0;
    this.emerging = false;
    this.emergeTime = 0;
    this.emergeDuration = 0.95;
    this.groundSpewAcc = 0;
    this.emergeSeed = Math.random() * 1000;
    this.statusFxAcc = 0;
  }

  get healthRatio() {
    return this.maxHealth > 0 ? this.health / this.maxHealth : 0;
  }

  static createEmerging(x, z, wave, world, type = 'spider') {
    const robot = new Robot(x, z, wave, type);
    robot.emerging = true;
    robot.emergeTime = 0;
    robot.emergeDuration = 0.85 + Math.random() * 0.25;
    robot.groundSpewAcc = 0;
    robot.alive = true;
    return robot;
  }

  getEmergeT() {
    if (!this.emerging) return 1;
    const t = Math.min(1, this.emergeTime / this.emergeDuration);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }

  getEmergeShake() {
    if (!this.emerging) return { x: 0, y: 0 };
    const fade = 1 - this.getEmergeT();
    const t = this.emergeTime + this.emergeSeed;
    return {
      x: (Math.sin(t * 44) * 3.5 + Math.sin(t * 71) * 2) * fade,
      y: (Math.sin(t * 53) * 2.5 + Math.cos(t * 37) * 1.5) * fade,
    };
  }

  applyHit(damage, fromX, fromZ, world, opts = {}) {
    if (!this.alive || this.emerging) return false;
    this.health -= damage;

    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    const knockMult = opts.fromBullet ? 1.1 : 1;

    const mr = this.moveRadius;
    const instantPush = damage * 0.035 * knockMult;
    const push = world.moveAxis(this.x, this.z, nx * instantPush, nz * instantPush, mr);
    this.x = push.x;
    this.z = push.z;

    const force = damage * 0.22 * knockMult;
    this.knockVX = nx * force;
    this.knockVZ = nz * force;
    this.stagger = Math.min(0.22, (0.06 + damage * 0.004) * knockMult);

    if (this.health <= 0) this.alive = false;
    return true;
  }

  _applyKnockback(dt, world, player, robots) {
    if (Math.abs(this.knockVX) < 0.1 && Math.abs(this.knockVZ) < 0.1) {
      this.knockVX = 0;
      this.knockVZ = 0;
      return false;
    }
    const targets = collectCollisionTargets({ player, robots, exclude: this });
    const r = moveWithEntityCollision(
      world,
      this.x,
      this.z,
      this.knockVX * dt,
      this.knockVZ * dt,
      this.radius,
      this.moveRadius,
      targets,
      this,
    );
    this.x = r.x;
    this.z = r.z;
    const friction = Math.exp(-9 * dt);
    this.knockVX *= friction;
    this.knockVZ *= friction;
    return true;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) this.alive = false;
    return true;
  }

  _move(dt, world, player, robots, vx, vz, speedMult = 1) {
    const len = Math.sqrt(vx * vx + vz * vz) || 1;
    const stepX = (vx / len) * this.speed * speedMult * dt;
    const stepZ = (vz / len) * this.speed * speedMult * dt;
    const targets = collectCollisionTargets({ player, robots, exclude: this });
    const r = moveWithEntityCollision(
      world,
      this.x,
      this.z,
      stepX,
      stepZ,
      this.radius,
      this.moveRadius,
      targets,
      this,
    );
    this.x = r.x;
    this.z = r.z;
  }

  update(dt, player, world, robots, onMeleeHit) {
    if (!this.alive) return;
    this.meleeCooldown -= dt;

    if (this.emerging) {
      this.emergeTime += dt;
      if (this.emergeTime >= this.emergeDuration) this.emerging = false;
      this.moving = false;
      const shakeAmt = (1 - this.getEmergeT()) * 0.22;
      this.bob = Math.sin(this.emergeTime * 18) * shakeAmt;
      return;
    }

    if (this.stagger > 0) {
      this.stagger -= dt;
      this._applyKnockback(dt, world, player, robots);
      this.moving = false;
      this.bob = 0;
      return;
    }

    let moving = false;

    if (!player.alive) {
      this.chasing = false;
      this.bob = 0;
      this.moving = false;
      return;
    }

    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const detectRange = 48;
    const hasLOS = dist < detectRange && world.hasLineOfSight(this.x, this.z, player.x, player.z, 0.3);

    if (hasLOS || (this.chasing && dist < 58)) {
      this.chasing = true;
      this.angle = Math.atan2(dx, dz);
      const steer = this.angle + (Math.random() - 0.5) * 0.08;
      this._move(dt, world, player, robots, Math.sin(steer), Math.cos(steer), 1);
      moving = true;

      if (dist < this.meleeRange + player.radius && this.meleeCooldown <= 0) {
        onMeleeHit(this);
        this.meleeCooldown = this.attackRate;
      }
    } else if (!this.chasing) {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderAngle += (Math.random() - 0.5) * 2.2;
        this.wanderTimer = 2 + Math.random() * 3;
      }
      this._move(dt, world, player, robots, Math.sin(this.wanderAngle), Math.cos(this.wanderAngle), 0.45);
      this.angle = this.wanderAngle;
      moving = true;
    } else if (dist > 60) {
      this.chasing = false;
    }

    this.walkPhase += dt * (moving ? 6 : 0);
    this.moving = moving;
  }

  static findSpawnPoint(world, existing, minPlayerDist = 14, player = null) {
    const spawnR = 0.85;

    if (world.usesImageMap()) {
      for (let i = 0; i < 300; i++) {
        const pt = world.randomMapPoint(6);
        if (!pt) continue;
        if (Robot._isValidSpawn(world, pt.x, pt.z, spawnR, existing, player, minPlayerDist)) {
          return pt;
        }
      }
      const px = player?.x ?? 0;
      const pz = player?.z ?? 0;
      return world.imageMap.findWalkableNear(px, pz, 28);
    }

    const minD = minPlayerDist;
    const maxD = 58;
    for (let i = 0; i < 200; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minD + Math.random() * (maxD - minD);
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (Robot._isValidSpawn(world, x, z, spawnR, existing, player, minPlayerDist)) {
        return { x, z };
      }
    }
    return world.getPlayerSpawn();
  }

  static _isValidSpawn(world, x, z, radius, existing, player, minPlayerDist) {
    if (world.checkCollision(x, z, radius)) return false;
    if (player) {
      const pdx = x - player.x;
      const pdz = z - player.z;
      if (pdx * pdx + pdz * pdz < minPlayerDist * minPlayerDist) return false;
    }
    const minSep = (radius + 0.9) ** 2;
    return existing.every((other) => {
      const dx = x - other.x;
      const dz = z - other.z;
      return dx * dx + dz * dz >= minSep;
    });
  }
}

export { updateParticles } from './particles.js';

export function createGroundSpew(x, z, intensity = 1) {
  const particles = [];
  const count = 2 + Math.floor(Math.random() * 3 * intensity);
  for (let i = 0; i < count; i++) {
    const a = (Math.random() - 0.5) * Math.PI * 1.6;
    const speed = 3 + Math.random() * 7 * intensity;
    particles.push({
      x: x + (Math.random() - 0.5) * 0.35,
      z: z + (Math.random() - 0.5) * 0.35,
      vx: Math.sin(a) * speed,
      vz: Math.cos(a) * speed * 0.35,
      life: 0.25 + Math.random() * 0.65,
      color: i % 3 === 0 ? '#3a3020' : (i % 3 === 1 ? '#5a4830' : '#7a6848'),
      size: 0.04 + Math.random() * 0.12,
      drag: 0.78 + Math.random() * 0.12,
      lift: 0,
      liftVel: 2 + Math.random() * 8,
      kind: 'spew',
    });
  }
  return particles;
}

export function createGroundErupt(x, z) {
  const particles = [];
  for (let i = 0; i < 28; i++) {
    const a = (Math.random() - 0.5) * Math.PI * 2;
    const speed = 3 + Math.random() * 8;
    particles.push({
      x: x + (Math.random() - 0.5) * 0.5,
      z: z + (Math.random() - 0.5) * 0.5,
      vx: Math.sin(a) * speed,
      vz: Math.cos(a) * speed * 0.5,
      life: 0.35 + Math.random() * 0.85,
      color: i % 4 === 0 ? '#2a2818' : (i % 4 === 1 ? '#4a4030' : '#6a5840'),
      size: 0.05 + Math.random() * 0.14,
      drag: 0.76 + Math.random() * 0.14,
      lift: 0,
      liftVel: 3 + Math.random() * 10,
      kind: 'spew',
    });
  }
  return particles;
}

export function createExplosion(x, z) {
  const particles = [];
  const count = 4 + Math.floor(Math.random() * 3);
  const colors = ['#ffe060', '#c84820', '#9098a8', '#fff8c0'];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5.5;
    const life = 0.2 + Math.random() * 0.45;
    particles.push({
      x: x + (Math.random() - 0.5) * 0.4,
      z: z + (Math.random() - 0.5) * 0.4,
      vx: Math.sin(a) * speed,
      vz: Math.cos(a) * speed,
      life,
      lifeMax: life,
      animOffset: Math.random() * 0.12,
      color: colors[i % colors.length],
      size: 0.06 + Math.random() * 0.14,
      drag: 0.82 + Math.random() * 0.1,
      screenRise: 0,
      screenRiseVel: -(20 + Math.random() * 50),
      screenRiseDrag: 0.9 + Math.random() * 0.06,
      sprite: 'particle_spark',
      kind: 'spark',
    });
  }
  return particles;
}
