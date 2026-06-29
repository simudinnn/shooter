/**
 * Authoritative game simulation — runs on the dedicated server only.
 */
import { setWorldSeed, rollWorldSeed } from '../js/worldGen.js';
import { World } from '../js/world.js';
import { Player, BulletPool } from '../js/player.js';
import { collectCollisionTargets, moveWithEntityCollision, applyApproachPush, updateLocomotion, isSprintAnimSpeed } from '../js/collision.js';
import { tickTileFlowField } from '../js/enemyNav.js';
import { GroundDropManager } from '../js/groundDrops.js';
import { BuildingManager } from '../js/buildings.js';
import { ChestManager } from '../js/chests.js';
import { DayNightCycle } from '../js/dayNight.js';
import { ChunkEntityManager } from '../js/chunkEntities.js';
import { captureBuildingsForNet } from '../js/saveGame.js';
import { BUILDING_SNAPSHOT_EVERY } from '../js/netProtocol.js';
import { isMovingForward } from '../js/sprites.js';

const PPU_SIM = 8;

export class GameSim {
  constructor(seed = null) {
    const s = seed != null ? seed >>> 0 : rollWorldSeed();
    setWorldSeed(s);
    this.seed = s;
    this.world = new World();
    this.world.build();
    this.bullets = new BulletPool();
    this.robots = [];
    this.groundDrops = new GroundDropManager(this.world);
    this.chests = new ChestManager(this.world);
    this.buildings = new BuildingManager(this.world, this.chests);
    this.buildings.spawnAllTowns(this.world);
    this.world.finalizeWorldGeneration();
    this.dayNight = new DayNightCycle();
    this.kills = 0;
    this.players = new Map();
    this.events = [];
    this.time = 0;
    this.tick = 0;
    this._nextEntityId = 1;
    this._nextPlayerSlot = 0;
    this._buildingsDirty = true;

    this.ctx = {
      world: this.world,
      robots: this.robots,
      bullets: this.bullets,
      buildings: this.buildings,
      chests: this.chests,
      groundDrops: this.groundDrops,
      dayNight: this.dayNight,
      kills: 0,
      netOnline: false,
      particles: [],
      _anchorPlayer: null,
      get player() {
        return this._anchorPlayer;
      },
      set player(p) {
        this._anchorPlayer = p;
      },
    };
    this.chunkEntities = new ChunkEntityManager(this.world, this.ctx);
    this._hookRobotSpawns();
  }

  _hookRobotSpawns() {
    const robots = this.robots;
    const sim = this;
    const origPush = robots.push.bind(robots);
    robots.push = (...items) => {
      for (const r of items) {
        if (r && r.netId == null) r.netId = sim._allocId();
      }
      return origPush(...items);
    };
  }

  _allocId() {
    return this._nextEntityId++;
  }

  addPlayer(id, name) {
    const p = new Player();
    const spawn = this.world.getPlayerSpawn();
    const slot = this._nextPlayerSlot++;
    p.x = spawn.x + slot * 3;
    p.z = spawn.z + (slot % 2) * 2;
    p.angle = 0;
    const entry = {
      id,
      name,
      player: p,
      input: null,
      prevShoot: false,
      prevInteract: false,
    };
    this.players.set(id, entry);
    return entry;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  setInput(id, input) {
    const entry = this.players.get(id);
    if (entry) entry.input = input;
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  _pushEvent(ev) {
    this.events.push(ev);
  }

  _anchorPlayer() {
    return this.players.values().next().value?.player ?? null;
  }

  _nearestPlayer(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const entry of this.players.values()) {
      const p = entry.player;
      if (!p.alive) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  step(dt) {
    this.time += dt;
    this.tick++;
    this.dayNight.update(dt);

    const anchor = this._anchorPlayer();
    this.ctx._anchorPlayer = anchor;
    this.ctx.kills = this.kills;

    const allPlayers = [...this.players.values()].map((e) => e.player);
    if (allPlayers.length) {
      this.buildings.update(anchor, dt);
      this.chunkEntities._despawnBuildingsFarFromAll(allPlayers);
      const buildingCountBefore = this.buildings.buildings.length;
      for (const p of allPlayers) {
        this.chunkEntities._populateBuildingsOnly(p);
      }
      if (this.buildings.buildings.length !== buildingCountBefore) {
        this._buildingsDirty = true;
      }
      this.chunkEntities._despawnFar(anchor, { includeBuildings: false });
      this.chunkEntities._populateEnemiesOnly(anchor);
    }

    for (const entry of this.players.values()) {
      this._simPlayer(entry, dt);
    }

    tickTileFlowField(this.time, this.world, this.buildings, anchor, this.robots);

    for (const robot of [...this.robots]) {
      const target = this._nearestPlayer(robot.x, robot.z) ?? anchor;
      if (!target) continue;
      robot.update(
        dt,
        target,
        this.world,
        this.robots,
        (r) => this._robotMelee(r, target),
        (r, angle, damage) => this._enemyShoot(r, angle, damage),
        this.buildings,
        this.time,
      );
    }

    this.bullets.update(dt, this.world, (b) => this._onBulletHit(b), anchor);
  }

  _simPlayer(entry, dt) {
    const player = entry.player;
    const inp = entry.input;
    if (!inp || !player.alive) return;

    player.angle = inp.angle ?? player.angle;

    const mx = inp.moveX ?? 0;
    const mz = inp.moveZ ?? 0;
    const len = Math.hypot(mx, mz);
    const wantsMove = len > 0.05 && (inp.moving ?? true);
    const prevX = player.x;
    const prevZ = player.z;

    if (wantsMove) {
      player.moveDirX = mx / len;
      player.moveDirZ = mz / len;
      const walkSpeed = player.speed * player.getSpeedMult(this.time);
      const sprintSpeed = walkSpeed * player.sprintMult;
      const wantsSprint = !!(inp.sprint && isMovingForward(player));
      const speed = wantsSprint ? sprintSpeed : walkSpeed;
      const stepX = (mx / len) * speed * dt;
      const stepZ = (mz / len) * speed * dt;
      const targets = collectCollisionTargets({
        player,
        robots: this.robots,
        exclude: player,
      });
      const shape = player.getMoveCollider(PPU_SIM);
      const r = moveWithEntityCollision(
        this.world,
        player.x,
        player.z,
        stepX,
        stepZ,
        shape,
        shape,
        targets,
        player,
        { axisSlide: true, buildings: this.buildings },
      );
      player.x = r.x;
      player.z = r.z;
      applyApproachPush(
        player, prevX, prevZ, player.x, player.z,
        player.radius, targets, 0.42, this.world, PPU_SIM,
      );
    }

    const locomotion = updateLocomotion(prevX, prevZ, player.x, player.z, dt);
    player.isMoving = locomotion.moving;
    player.moveSpeed = locomotion.speed;
    if (player.isMoving) {
      const walkSpeed = player.speed * player.getSpeedMult(this.time);
      const sprintSpeed = walkSpeed * player.sprintMult;
      player.isSprinting = isSprintAnimSpeed(player.moveSpeed, walkSpeed, sprintSpeed);
      player.walkPhase += dt * (player.isSprinting ? 9 : 6);
    } else {
      player.isSprinting = false;
    }

    player.updateReload(this.time);

    const shootHeld = !!(inp.shootHeld || inp.shoot);
    const shootEdge = shootHeld && !entry.prevShoot;
    const wantsShoot = player.isAutomaticWeapon() ? shootHeld : shootEdge;
    if (wantsShoot && player.canShoot(this.time)) {
      this._fireGun(player, entry.id);
    } else if (shootEdge && player.wantsAutoReload?.(this.time)) {
      player.startReload(this.time);
    }
    if (inp.reload) player.startReload(this.time);

    if (inp.interact && !entry.prevInteract) {
      this._tryInteract(player, entry.id);
    }

    entry.prevShoot = shootHeld;
    entry.prevInteract = !!inp.interact;
  }

  _fireGun(player, playerId) {
    const w = player.shoot(this.time);
    if (!w) return;
    const dmgMult = player.getDamageMult(this.time);
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const shot = { ...w, damage: w.damage * dmgMult };
      const b = this.bullets.spawn(player.x, player.z, player.angle, shot, true, this.world);
      if (b) {
        b.netId = this._allocId();
        this._pushEvent({
          event: 'shoot',
          bulletId: b.netId,
          fromPlayer: true,
          playerId,
          weaponKey: player.weaponKey,
        });
      }
    }
    const recoil = player.applyShootRecoil();
    const targets = collectCollisionTargets({ player, robots: this.robots, exclude: player });
    const shape = player.getMoveCollider(PPU_SIM);
    const rk = moveWithEntityCollision(
      this.world, player.x, player.z, recoil.x, recoil.z,
      shape, shape, targets, player, { axisSlide: true },
    );
    player.x = rk.x;
    player.z = rk.z;
  }

  _enemyShoot(robot, angle, damage = 10) {
    if (!robot?.alive || robot.emerging) return;
    const spread = robot.shoot?.bulletSpread ?? 0.28;
    const b = this.bullets.spawn(
      robot.x, robot.z, angle,
      { damage, bulletSpeed: 72, spread },
      false,
      this.world,
    );
    if (b) {
      b.netId = this._allocId();
      this._pushEvent({ event: 'shoot', bulletId: b.netId, fromPlayer: false });
    }
  }

  _onBulletHit(bullet) {
    if (bullet.fromPlayer) {
      for (const robot of this.robots) {
        if (!robot.alive) continue;
        const dx = bullet.x - robot.x;
        const dz = bullet.z - robot.z;
        if (dx * dx + dz * dz < (robot.radius + 0.5) ** 2) {
          const fromX = bullet.x - bullet.vx * 0.02;
          const fromZ = bullet.z - bullet.vz * 0.02;
          this._damageRobot(robot, bullet.damage, fromX, fromZ, bullet);
          return;
        }
      }
      return;
    }

    for (const entry of this.players.values()) {
      const p = entry.player;
      if (!p.alive) continue;
      const dx = bullet.x - p.x;
      const dz = bullet.z - p.z;
      if (dx * dx + dz * dz < (p.radius + 0.45) ** 2) {
        if (p.takeDamage(bullet.damage, this.time)) {
          this._pushEvent({ event: 'player_hit', playerId: entry.id, damage: bullet.damage });
        }
        bullet.active = false;
        return;
      }
    }
  }

  _damageRobot(robot, damage, fromX, fromZ, bullet = null) {
    if (!robot.applyHit(damage, fromX, fromZ, this.world, { fromBullet: !!bullet })) return;
    if (bullet) bullet.active = false;
    if (!robot.alive) {
      this.kills++;
      const idx = this.robots.indexOf(robot);
      if (idx >= 0) this.robots.splice(idx, 1);
      this._pushEvent({
        event: 'enemy_death',
        id: robot.netId,
        x: robot.x,
        z: robot.z,
        type: robot.type,
      });
    }
  }

  _robotMelee(robot, target) {
    if (target.takeDamage(robot.meleeDamage, this.time)) {
      target.applyMeleeKnockback(robot.x, robot.z, 2.2 + robot.meleeDamage * 0.04);
    }
  }

  _tryInteract(player, playerId) {
    const door = this.buildings.getNearbyDoor(player);
    if (door && this.buildings.toggleDoor(door, player)) {
      this._buildingsDirty = true;
      this._pushEvent({
        event: 'door',
        originX: door.originX,
        originZ: door.originZ,
        open: door.doorOpen,
      });
      return;
    }
    const drop = this.groundDrops.getNearby(player);
    if (drop && this.groundDrops.isInPickupRange(player, drop)) {
      const result = player.tryStoreItem(drop.item);
      if (result.ok) {
        if (result.remainder) drop.item = result.remainder;
        else {
          this._pushEvent({ event: 'pickup', dropId: drop.id, playerId });
          this.groundDrops.remove(drop);
        }
      }
    }
  }

  _ensureRobotNetIds() {
    for (const r of this.robots) {
      if (r.netId == null) r.netId = this._allocId();
    }
  }

  _ensureDropNetIds() {
    for (const d of this.groundDrops.drops) {
      if (d.id == null) d.id = this._allocId();
    }
  }

  packSnapshot() {
    this._ensureRobotNetIds();
    this._ensureDropNetIds();

    const players = [];
    for (const entry of this.players.values()) {
      const p = entry.player;
      players.push({
        id: entry.id,
        name: entry.name,
        x: p.x,
        z: p.z,
        angle: p.angle,
        health: p.health,
        maxHealth: p.maxHealth,
        weaponKey: p.weaponKey,
        weaponSlot: p.weaponSlot,
        ammo: p.ammo,
        isMoving: p.isMoving,
        isSprinting: p.isSprinting,
        moveDirX: p.moveDirX,
        moveDirZ: p.moveDirZ,
        walkPhase: p.walkPhase,
      });
    }

    const enemies = this.robots.map((r) => ({
      id: r.netId,
      type: r.type,
      x: r.x,
      z: r.z,
      angle: r.angle ?? 0,
      health: r.health,
      maxHealth: r.maxHealth,
      alive: r.alive,
      emerging: !!r.emerging,
      chasing: !!r.chasing,
      wave: r.spawnWave ?? 1,
    }));

    const bullets = [];
    for (const b of this.bullets.bullets) {
      if (!b.active || b.netId == null) continue;
      bullets.push({
        id: b.netId,
        x: b.x,
        z: b.z,
        vx: b.vx,
        vz: b.vz,
        damage: b.damage,
        fromPlayer: !!b.fromPlayer,
        life: b.life,
      });
    }

    const drops = this.groundDrops.drops.map((d) => ({
      id: d.id,
      x: d.x,
      z: d.z,
      item: d.item,
    }));

    const snap = {
      tick: this.tick,
      time: this.time,
      kills: this.kills,
      dayNight: {
        timeMinutes: this.dayNight.timeMinutes,
        day: this.dayNight.day,
      },
      players,
      enemies,
      bullets,
      drops,
    };

    if (this._buildingsDirty || this.tick % BUILDING_SNAPSHOT_EVERY === 0) {
      snap.buildings = captureBuildingsForNet(this.buildings);
      this._buildingsDirty = false;
    }

    return snap;
  }
}
