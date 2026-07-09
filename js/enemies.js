import { collectCollisionTargets, moveWithEntityCollision, applyApproachPush, didDisplace, MOTION_IDLE_EPS, entityPushRadius } from './collision.js';
import {
  updateChaseNav,
  canMeleeTarget,
  ensureNavState,
  updateEnemySpotTimer,
  shouldEnemyChase,
  isEnemyAlert,
  hasLostSightForGood,
  clearEnemyCombatState,
  getEnemyDetectRange,
  updateEnemyLastKnown,
  advanceEnemySearchPhase,
  canEnemySeePlayer,
  getEnemyStatusIcon,
  ENEMY_ALERT_WANDER_SPEED,
  noteChaseMoveResult,
  resetNavPlan,
  SPIDER_DETECT_RANGE,
  SCOUT_DETECT_RANGE,
} from './enemyNav.js';
import { getEnemyNativePx, getEnemyDrawScale, spriteFeetOffset, resolveFlipX } from './sprites.js';
import { PLAYER_MOVE_W_PX, PLAYER_MOVE_H_PX } from './player.js';
import { PPU } from './renderConfig.js';
import { TILE } from './worldGen.js';

function playerMoveRadius(ppu) {
  const halfW = (PLAYER_MOVE_W_PX / ppu) * 0.5;
  const halfH = (PLAYER_MOVE_H_PX / ppu) * 0.5;
  return Math.sqrt(halfW * halfH);
}

/** Base robot enemy — `type` selects sprite sheet (spider, walker, scout, …). */
export const SCOUT_SPAWN_SHARE = 0.12;

export class Robot {
  constructor(x, z, wave = 1, type = 'spider') {
    this.type = type;
    this.x = x;
    this.z = z;
    this.spawnWave = wave;
    this.angle = Math.random() * Math.PI * 2;
    const waveScale = 1 + (wave - 1) * 0.1;
    this.health = Math.floor(85 * waveScale);
    this.maxHealth = this.health;
    this.alive = true;
    this.baseSpeed = (10 + Math.random() * 2.2) * (1 + (wave - 1) * 0.05);
    this.speed = this.baseSpeed;
    this.radius = 1.45;
    this.moveRadius = 0.95;
    this.meleeDamage = Math.floor((12 + Math.random() * 10) * (1 + (wave - 1) * 0.07));
    this.meleeRange = 2.1;
    this.attackRate = Math.max(0.45, 0.75 + Math.random() * 0.35 - (wave - 1) * 0.03);
    this.meleeCooldown = 0.3 + Math.random() * 0.5;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderPhase = Math.random() < 0.4 ? 'idle' : 'moving';
    this.wanderTimer = this.wanderPhase === 'idle'
      ? 0.8 + Math.random() * 2
      : 1.2 + Math.random() * 2.5;
    this.chasing = false;
    this.aggroByHit = false;
    this.spotTimer = 0;
    this.lostSightTimer = 0;
    this.moving = false;
    this.moveSpeed = 0;
    this.knockVX = 0;
    this.knockVZ = 0;
    this.stagger = 0;
    this.emerging = false;
    this.emergeTime = 0;
    this.emergeDuration = 0.95;
    this.groundSpewAcc = 0;
    this.emergeSeed = Math.random() * 1000;
    this.statusFxAcc = 0;
    this.jump = {
      active: false,
      charging: false,
      chargeLeft: 0,
      dirX: 0,
      dirZ: 0,
      vx: 0,
      vz: 0,
      until: 0,
      duration: 0,
    };
    this.jumpCooldown = 0;
    this.jumpTryTimer = 0;
    this._stuckTimer = 0;
  }

  get healthRatio() {
    return this.maxHealth > 0 ? this.health / this.maxHealth : 0;
  }

  /** World wall collision — circular feet collider. */
  getWorldCollider(ppu = PPU) {
    const move = this.getMoveCollider(ppu);
    return { kind: 'circle', radius: move.radius };
  }

  /** Feet-level movement circle — slightly larger than the player's. */
  getMoveCollider(ppu = PPU) {
    const nativePx = getEnemyNativePx(this.type);
    const scale = getEnemyDrawScale(this.type);
    const feetSouth = spriteFeetOffset(nativePx, scale) / ppu;
    const base = playerMoveRadius(ppu);
    const sizeMul = (nativePx / 16) * (scale / getEnemyDrawScale('spider'));
    const radius = base * (1.1 + Math.max(0, sizeMul - 1) * 0.08);
    return {
      kind: 'circle',
      radius,
      zOff: feetSouth - radius,
    };
  }

  getPushCollider(ppu = PPU) {
    const move = this.getMoveCollider(ppu);
    return {
      kind: 'circle',
      radius: move.radius * 0.92,
      zOff: move.zOff,
    };
  }

  getHitCollider(ppu = PPU) {
    return this.getPushCollider(ppu);
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
    const knockMult = (opts.knockMult ?? 1) * (opts.fromBullet ? 1.1 : 1);

    const col = this.getWorldCollider();
    const instantPush = damage * 0.035 * knockMult;
    const push = world.moveAxisShape(this.x, this.z, nx * instantPush, nz * instantPush, col);
    this.x = push.x;
    this.z = push.z;

    const force = damage * 0.22 * knockMult;
    const jumpCommit = this.jump.charging || this.jump.active;
    if (!jumpCommit && !opts.noStagger) {
      this.knockVX = nx * force;
      this.knockVZ = nz * force;
      this.stagger = Math.min(0.22, (0.06 + damage * 0.004) * knockMult);
    }

    if (this.health <= 0) {
      this.alive = false;
      this.jump.active = false;
      this.jump.charging = false;
    } else {
      this.chasing = true;
      this.aggroByHit = true;
    }
    return true;
  }

  _applyKnockback(dt, world, player, robots) {
    if (Math.abs(this.knockVX) < 0.1 && Math.abs(this.knockVZ) < 0.1) {
      this.knockVX = 0;
      this.knockVZ = 0;
      return false;
    }
    const targets = collectCollisionTargets({ player, robots, exclude: this });
    const body = this.getMoveCollider(PPU);
    const worldCol = body;
    const r = moveWithEntityCollision(
      world,
      this.x,
      this.z,
      this.knockVX * dt,
      this.knockVZ * dt,
      body,
      worldCol,
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

  _move(dt, world, player, robots, vx, vz, speedMult = 1, opts = {}) {
    const len = Math.sqrt(vx * vx + vz * vz) || 1;
    const stepX = (vx / len) * this.speed * speedMult * dt;
    const stepZ = (vz / len) * this.speed * speedMult * dt;
    const prevX = this.x;
    const prevZ = this.z;
    const ignoreRobots = opts.ignoreRobots === true;
    const targets = ignoreRobots
      ? []
      : collectCollisionTargets({ player, robots, exclude: this });
    const blockTargets = ignoreRobots && player?.alive && player !== this
      ? [player]
      : targets;
    const worldCol = this.getMoveCollider();
    const moveOpts = { axisSlide: true, ...(opts.buildings ? { buildings: opts.buildings } : {}) };
    const r = moveWithEntityCollision(
      world,
      this.x,
      this.z,
      stepX,
      stepZ,
      worldCol,
      worldCol,
      blockTargets,
      this,
      moveOpts,
    );
    this.x = r.x;
    this.z = r.z;
    if (!ignoreRobots) {
      applyApproachPush(this, prevX, prevZ, this.x, this.z, entityPushRadius(this, PPU), targets, 0.24, world, PPU);
    }
    if (ignoreRobots) this._softSeparateFromRobots(robots);
    if (world.checkCollisionShape(this.x, this.z, worldCol, false, moveOpts)) {
      const dep = world.depenetrateShape(this.x, this.z, worldCol);
      this.x = dep.x;
      this.z = dep.z;
    }
  }

  /** Mild spacing so chasing robots do not stack on the same pixel. */
  _softSeparateFromRobots(robots) {
    for (const other of robots) {
      if (other === this || !other.alive || other.emerging) continue;
      const dx = this.x - other.x;
      const dz = this.z - other.z;
      const dist = Math.hypot(dx, dz);
      const minDist = (this.radius + other.radius) * 0.72;
      if (dist >= minDist || dist < 1e-5) continue;
      const push = ((minDist - dist) / dist) * 0.45;
      this.x += dx * push;
      this.z += dz * push;
    }
  }

  /** Pathfind toward player (or door) while chasing; returns true if position changed. */
  _chaseMove(dt, player, world, robots, buildings, time) {
    const prevX = this.x;
    const prevZ = this.z;
    const nav = updateChaseNav(this, player, world, buildings, time, dt);
    if (nav.forget) {
      resetNavPlan(ensureNavState(this));
      return false;
    }
    const dirX = nav.dirX;
    const dirZ = nav.dirZ;
    const len = Math.hypot(dirX, dirZ) || 1;
    this._move(dt, world, player, robots, dirX / len, dirZ / len, 1, { ignoreRobots: true, buildings });
    const moved = didDisplace(prevX, prevZ, this.x, this.z, TILE * 0.04);
    noteChaseMoveResult(this, moved, dt);
    return moved;
  }

  /** Chase — flow-field path around props; search wander when mind says so. */
  _updateHuntMove(dt, player, world, robots, buildings, time, dx, dz) {
    if (isEnemyAlert(this)) {
      return this._updateWander(dt, world, player, robots, ENEMY_ALERT_WANDER_SPEED, true);
    }
    return this._chaseMove(dt, player, world, robots, buildings, time);
  }

  /** Idle / walk cycles while not chasing — pauses between direction changes. */
  _updateWander(dt, world, player, robots, speedMult = 0.45, aggressive = false) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      if (this.wanderPhase === 'moving') {
        this.wanderPhase = 'idle';
        this.wanderTimer = aggressive
          ? 0.12 + Math.random() * 0.35
          : 0.7 + Math.random() * 2.2;
      } else {
        this.wanderPhase = 'moving';
        this.wanderAngle += (Math.random() - 0.5) * (aggressive ? 3.4 : 2.4);
        this.wanderTimer = aggressive
          ? 0.45 + Math.random() * 0.95
          : 1.4 + Math.random() * 3.2;
      }
    }
    if (this.wanderPhase !== 'moving') return false;
    this._move(dt, world, player, robots, Math.sin(this.wanderAngle), Math.cos(this.wanderAngle), speedMult);
    this.angle = this.wanderAngle;
    return true;
  }

  _applyLocomotion(prevX, prevZ, dt, walkRate = 0) {
    const dx = this.x - prevX;
    const dz = this.z - prevZ;
    this.moveSpeed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    const displaced = (dx * dx + dz * dz) > MOTION_IDLE_EPS * MOTION_IDLE_EPS;
    this.moving = displaced || walkRate > 0;
    if (walkRate > 0) {
      this.walkPhase += dt * walkRate;
    }
    this._flipX = resolveFlipX(this.angle, this._flipX ?? false);
  }

  _endJump() {
    this.jump.active = false;
    this.jump.charging = false;
    this.jump.vx = 0;
    this.jump.vz = 0;
    this.jump.until = 0;
    this.bob = 0;
  }

  _beginJumpCharge(dx, dz, dist) {
    const nx = dx / dist;
    const nz = dz / dist;
    this.jump.charging = true;
    this.jump.chargeLeft = 0.5;
    this.jump.dirX = nx;
    this.jump.dirZ = nz;
    this.jump.active = false;
    this.angle = Math.atan2(dx, dz);
  }

  _launchJump(world) {
    const speed = 21 + Math.random() * 7;
    const duration = 0.48 + Math.random() * 0.2;
    const worldCol = this.getMoveCollider();
    const landX = this.x + this.jump.dirX * speed * duration * 0.55;
    const landZ = this.z + this.jump.dirZ * speed * duration * 0.55;
    if (world?.checkCollisionShape(landX, landZ, worldCol, false)) {
      this._endJump();
      this.jumpCooldown = 0.6;
      return;
    }
    this.jump.charging = false;
    this.jump.active = true;
    this.jump.vx = this.jump.dirX * speed;
    this.jump.vz = this.jump.dirZ * speed;
    this.jump.duration = duration;
    this.jump.until = duration;
    this.jumpCooldown = 1.2 + Math.random() * 1.5;
  }

  _updateJumpCharge(dt, world) {
    this.jump.chargeLeft -= dt;
    const chargeT = 1 - this.jump.chargeLeft / 0.5;
    this.bob = -0.12 - chargeT * 0.28;
    this.moving = false;
    if (this.jump.chargeLeft <= 0) this._launchJump(world);
  }

  _updateJump(dt, world, player, robots) {
    const prevX = this.x;
    const prevZ = this.z;
    const worldCol = this.getMoveCollider();
    const steps = 4;
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      const prevRX = this.x;
      const prevRZ = this.z;
      const stepX = this.jump.vx * subDt;
      const stepZ = this.jump.vz * subDt;
      const nextX = this.x + stepX;
      const nextZ = this.z + stepZ;
      if (world.checkCollisionShape(nextX, nextZ, worldCol, false)) {
        this._endJump();
        return;
      }
      const targets = collectCollisionTargets({ player, robots, exclude: this });
      const r = moveWithEntityCollision(
        world,
        this.x,
        this.z,
        stepX,
        stepZ,
        worldCol,
        worldCol,
        targets,
        this,
      );
      this.x = r.x;
      this.z = r.z;
      if (player?.alive) {
        const pdx = player.x - this.x;
        const pdz = player.z - this.z;
        const hitR = this.radius + player.radius;
        if (pdx * pdx + pdz * pdz < hitR * hitR) {
          this.x = prevRX;
          this.z = prevRZ;
          this._endJump();
          return;
        }
      }
      if (!didDisplace(prevRX, prevRZ, this.x, this.z, MOTION_IDLE_EPS * 3) && Math.hypot(stepX, stepZ) > 0.008) {
        this._endJump();
        return;
      }
    }

    const dep = world.depenetrateShape(this.x, this.z, worldCol);
    this.x = dep.x;
    this.z = dep.z;

    this.jump.until -= dt;
    if (this.jump.until <= 0) {
      this._endJump();
      return;
    }
    const dur = this.jump.duration || 0.5;
    const t = 1 - this.jump.until / dur;
    this.bob = Math.sin(t * Math.PI) * 0.72;
    this._applyLocomotion(prevX, prevZ, dt, 14);
  }

  update(dt, player, world, robots, onMeleeHit, onShoot = null, buildings = null, time = 0) {
    if (!this.alive) return;
    this.meleeCooldown -= dt;
    this.jumpCooldown -= dt;

    if (this.emerging) {
      this.emergeTime += dt;
      if (this.emergeTime >= this.emergeDuration) this.emerging = false;
      this.moving = false;
      const shakeAmt = (1 - this.getEmergeT()) * 0.22;
      this.bob = Math.sin(this.emergeTime * 18) * shakeAmt;
      return;
    }

    if (this.jump.charging) {
      this._updateJumpCharge(dt, world);
      this.moving = false;
      return;
    }

    if (this.jump.active) {
      this._updateJump(dt, world, player, robots);
      return;
    }

    if (this.stagger > 0) {
      this.stagger -= dt;
      this._applyKnockback(dt, world, player, robots);
      this.moving = false;
      this.bob = 0;
      return;
    }

    const prevX = this.x;
    const prevZ = this.z;
    let moving = false;

    if (!player.alive) {
      this.chasing = false;
      this.aggroByHit = false;
      this.bob = 0;
      this.moving = false;
      return;
    }

    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const chaseRange = 58 * (player.getStealthMult?.() ?? 1);
    const detectRange = getEnemyDetectRange(this, player, SPIDER_DETECT_RANGE);
    const canSee = canEnemySeePlayer(this, player, world, buildings, detectRange);
    updateEnemySpotTimer(this, canSee, dt);
    updateEnemyLastKnown(this, player, canSee);

    const search = advanceEnemySearchPhase(this, canSee, dt, player, buildings);
    if (search.forget) {
      clearEnemyCombatState(this);
    }

    if (shouldEnemyChase(this, dist, chaseRange, canSee)) {
      this.chasing = true;
      this.angle = Math.atan2(dx, dz);

      const jumpMin = 2.6;
      const jumpMax = 7.2;
      if (!isEnemyAlert(this) && this.type === 'spider' && dist < jumpMax && dist > jumpMin && this.jumpCooldown <= 0 && !this.jump.charging && !this.jump.active) {
        this.jumpTryTimer -= dt;
        if (this.jumpTryTimer <= 0) {
          this.jumpTryTimer = 0.38 + Math.random() * 0.32;
          if (Math.random() < 0.62) {
            this._beginJumpCharge(dx, dz, dist);
            return;
          }
        }
      } else if (dist >= jumpMax) {
        this.jumpTryTimer = 0;
      }

      moving = this._updateHuntMove(dt, player, world, robots, buildings, time, dx, dz);

      if (
        canSee
        && dist < this.meleeRange + player.radius
        && this.meleeCooldown <= 0
        && canMeleeTarget(world, this.x, this.z, player.x, player.z)
      ) {
        onMeleeHit(this);
        this.meleeCooldown = this.attackRate;
      }
    } else if (!this.chasing) {
      moving = this._updateWander(dt, world, player, robots, 0.45);
    }

    this._applyLocomotion(prevX, prevZ, dt, moving ? (this.chasing ? 10 : 6) : 0);
  }

  static findSpawnPoint(world, existing, minPlayerDist = 14, player = null) {
    const spawnR = 1.05;
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

/** Larger ranged robot — charges, fires a burst, then reloads while walking. */
export class Scout extends Robot {
  constructor(x, z, wave = 1) {
    super(x, z, wave, 'scout');
    const waveScale = 1 + (wave - 1) * 0.1;
    this.health = Math.floor(280 * waveScale);
    this.maxHealth = this.health;
    this.baseSpeed = (4 + Math.random() * 1.0) * (1 + (wave - 1) * 0.04);
    this.speed = this.baseSpeed;
    this.radius = 1.6;
    this.moveRadius = 1.1;
    this.meleeDamage = Math.floor((18 + Math.random() * 14) * (1 + (wave - 1) * 0.07));
    this.meleeRange = 3;
    this.attackRate = Math.max(0.5, 0.8 + Math.random() * 0.35 - (wave - 1) * 0.02);
    this.shoot = {
      phase: 'ready',
      chargeLeft: 0,
      reloadLeft: 0,
      burstLeft: 0,
      burstTimer: 0,
      animStart: null,
      chargeDuration: 2,
      reloadDuration: 4,
      burstCount: 10,
      burstInterval: 0.10,
      bulletDamage: 8,
      /** Radians — random ±spread/2 per shot in the burst (shotgun-style cone). */
      bulletSpread: 0.32,
    };
  }

  static createEmerging(x, z, wave, world) {
    const scout = new Scout(x, z, wave);
    scout.emerging = true;
    scout.emergeTime = 0;
    scout.emergeDuration = 0.9 + Math.random() * 0.28;
    scout.groundSpewAcc = 0;
    scout.alive = true;
    return scout;
  }

  applyHit(damage, fromX, fromZ, world, opts = {}) {
    return super.applyHit(damage, fromX, fromZ, world, {
      ...opts,
      knockMult: 0.28,
      noStagger: true,
    });
  }

  _abortShoot(force = false) {
    if (!force && (this.shoot.phase === 'charging' || this.shoot.phase === 'firing')) return;
    this.shoot.phase = 'ready';
    this.shoot.chargeLeft = 0;
    this.shoot.burstLeft = 0;
    this.shoot.burstTimer = 0;
    this.shoot.animStart = null;
    this.bob = 0;
  }

  _beginBurst(onShoot) {
    this.shoot.phase = 'firing';
    this.shoot.burstLeft = this.shoot.burstCount;
    this.shoot.burstTimer = 0;
    this._fireBurstShot(onShoot);
  }

  _fireBurstShot(onShoot) {
    if (this.shoot.burstLeft <= 0 || !onShoot) return;
    onShoot(this, this.angle, this.shoot.bulletDamage);
    this.shoot.burstLeft -= 1;
    this.shoot.burstTimer = this.shoot.burstInterval;
  }

  update(dt, player, world, robots, onMeleeHit, onShoot = null, buildings = null, time = 0) {
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

    const inAttackEarly = this.shoot.phase === 'charging' || this.shoot.phase === 'firing';
    if (this.stagger > 0) {
      this.stagger -= dt;
      this._applyKnockback(dt, world, player, robots);
      if (!inAttackEarly) {
        this.moving = false;
        this.moveSpeed = 0;
        return;
      }
    }

    const prevX = this.x;
    const prevZ = this.z;
    let moving = false;

    if (!player.alive) {
      this.chasing = false;
      this.aggroByHit = false;
      this._abortShoot(true);
      this.bob = 0;
      this.moving = false;
      return;
    }

    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const chaseRange = 58 * (player.getStealthMult?.() ?? 1);
    const detectRange = getEnemyDetectRange(this, player, SCOUT_DETECT_RANGE);
    const canSee = canEnemySeePlayer(this, player, world, buildings, detectRange);
    updateEnemySpotTimer(this, canSee, dt);
    updateEnemyLastKnown(this, player, canSee);

    const search = advanceEnemySearchPhase(this, canSee, dt, player, buildings);
    if (search.forget) {
      clearEnemyCombatState(this);
      this._abortShoot(true);
    }

    const meleeDist = this.meleeRange + player.radius;
    const inAttack = this.shoot.phase === 'charging' || this.shoot.phase === 'firing';

    if (shouldEnemyChase(this, dist, chaseRange, canSee) || inAttack) {
      this.chasing = true;
      this.angle = Math.atan2(dx, dz);

      if (inAttack) {
        if (this.shoot.phase === 'charging') {
          this.shoot.chargeLeft -= dt;
          this.bob = 0;
          if (this.shoot.chargeLeft <= 0) this._beginBurst(onShoot);
        } else {
          this.shoot.burstTimer -= dt;
          while (this.shoot.burstTimer <= 0 && this.shoot.burstLeft > 0) {
            this._fireBurstShot(onShoot);
          }
          if (this.shoot.burstLeft <= 0) {
            this.shoot.phase = 'ready';
            this.shoot.reloadLeft = this.shoot.reloadDuration;
            this.shoot.animStart = null;
            this.bob = 0;
          }
        }
      } else if (canSee && dist < meleeDist) {
        this._abortShoot();
        moving = this._updateHuntMove(dt, player, world, robots, buildings, time, dx, dz);
        if (
          moving
          && this.meleeCooldown <= 0
          && canMeleeTarget(world, this.x, this.z, player.x, player.z)
        ) {
          onMeleeHit(this);
          this.meleeCooldown = this.attackRate;
        }
      } else if (canSee && dist < detectRange && onShoot) {
        if (this.shoot.reloadLeft > 0) {
          this.shoot.reloadLeft -= dt;
          this._abortShoot();
          moving = this._updateHuntMove(dt, player, world, robots, buildings, time, dx, dz);
        } else if (this.shoot.phase === 'ready') {
          this.shoot.phase = 'charging';
          this.shoot.chargeLeft = this.shoot.chargeDuration;
          this.shoot.animStart = performance.now() / 1000;
        }
      } else if (isEnemyAlert(this)) {
        this._abortShoot();
        moving = this._updateWander(dt, world, player, robots, ENEMY_ALERT_WANDER_SPEED, true);
      } else {
        this._abortShoot();
        moving = this._updateHuntMove(dt, player, world, robots, buildings, time, dx, dz);
      }
    } else if (!this.chasing) {
      this._abortShoot();
      moving = this._updateWander(dt, world, player, robots, 0.45);
    }

    this._applyLocomotion(prevX, prevZ, dt, moving ? (this.chasing ? 10 : 6) : 0);
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
  const count = 3 + Math.floor(Math.random() * 2);
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
