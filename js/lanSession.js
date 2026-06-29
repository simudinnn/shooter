import { INPUT_HZ, MSG, emptyInput } from './netProtocol.js';
import { applySnapshot, interpolateNetState, clearNetEntities } from './netState.js';
import { WEAPONS } from './player.js';
import {
  createRobotHitSparks,
  createBloodSplatter,
  createExplosion,
  createRobotDeathFx,
  createRobotSmoke,
} from './particles.js';

export class LanSession {
  constructor(game, { playerId, playerName, url, roomId, roomSeed }) {
    this.game = game;
    this.isOnline = false;
    this.isClient = true;
    this.isHost = false;
    this.playerId = playerId;
    this.playerName = playerName;
    this.url = url;
    this.roomId = roomId || 'public';
    this.roomSeed = roomSeed != null ? roomSeed >>> 0 : null;
    this.ws = null;
    this.peers = new Map();
    this.connected = false;
    this.sessionSeed = null;
    this._inputAcc = 0;
    this._prevShoot = false;
    this._interactQueued = false;
    this._reloadQueued = false;
    this._localAuth = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }
      this.ws = ws;

      const failTimer = setTimeout(() => {
        reject(new Error('Connection timed out'));
        ws.close();
      }, 8000);

      ws.onopen = () => {
        this.connected = true;
        ws.send(JSON.stringify({
          t: MSG.JOIN_ROOM,
          roomId: this.roomId,
          seed: this.roomSeed,
          name: this.playerName,
        }));
      };

      ws.onerror = () => {
        clearTimeout(failTimer);
        reject(new Error('Could not connect'));
      };

      ws.onclose = () => {
        this.connected = false;
        this.isOnline = false;
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        this._handleMessage(msg, resolve, failTimer);
      };
    });
  }

  _handleMessage(msg, resolveConnect, failTimer) {
    switch (msg.t) {
      case MSG.WELCOME:
        clearTimeout(failTimer);
        this.playerId = msg.id;
        this.sessionSeed = msg.seed ?? null;
        this.isOnline = true;
        this.isClient = true;
        this.isHost = false;
        this.peers.clear();
        for (const p of msg.players ?? []) {
          if (p.id === this.playerId) continue;
          this.peers.set(p.id, this._defaultPeer(p.id, p.name));
        }
        if (resolveConnect) {
          resolveConnect(this);
          resolveConnect = null;
        }
        break;
      case MSG.JOINED:
        if (msg.player?.id && msg.player.id !== this.playerId) {
          this.peers.set(msg.player.id, this._defaultPeer(msg.player.id, msg.player.name));
        }
        break;
      case MSG.LEFT:
        this.peers.delete(msg.id);
        break;
      case MSG.RENAME:
        if (this.peers.has(msg.id)) this.peers.get(msg.id).name = msg.name;
        break;
      case MSG.SNAPSHOT:
        if (msg.snapshot) applySnapshot(this.game, msg.snapshot);
        if (msg.events?.length) this._handleEvents(msg.events);
        break;
      case MSG.EVENTS:
        if (msg.events?.length) this._handleEvents(msg.events);
        break;
      default:
        break;
    }
  }

  _defaultPeer(id, name) {
    return {
      id,
      name,
      x: 0,
      z: 0,
      angle: 0,
      health: 100,
      maxHealth: 100,
      isMoving: false,
      isSprinting: false,
      moveDirX: 0,
      moveDirZ: 0,
      walkPhase: 0,
      _renderX: 0,
      _renderZ: 0,
      _renderAngle: 0,
    };
  }

  queueInteract() {
    this._interactQueued = true;
  }

  queueReload() {
    this._reloadQueued = true;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.isOnline = false;
    this.peers.clear();
    clearNetEntities(this.game);
  }

  _send(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  captureInput(game) {
    const player = game.player;
    const { moveX, moveZ } = game._getMoveInput();
    const len = Math.hypot(moveX, moveZ);
    const shootHeld = !!game.mouseDown;
    const inp = emptyInput();
    inp.moveX = len > 0.01 ? moveX / len : 0;
    inp.moveZ = len > 0.01 ? moveZ / len : 0;
    inp.sprint = game._isShiftHeld?.() ?? false;
    inp.angle = player.angle;
    inp.moving = len > 0.05;
    inp.shootHeld = shootHeld;
    inp.shoot = shootHeld && !this._prevShoot;
    inp.interact = this._interactQueued;
    inp.reload = this._reloadQueued;
    this._prevShoot = shootHeld;
    this._interactQueued = false;
    this._reloadQueued = false;
    return inp;
  }

  tick(dt, game) {
    if (!this.connected || !this.isOnline) return;

    this._inputAcc += dt;
    if (this._inputAcc >= 1 / INPUT_HZ) {
      this._inputAcc = 0;
      this._send({ t: MSG.INPUT, input: this.captureInput(game) });
    }

    interpolateNetState(game, dt);
  }

  _handleEvents(events) {
    const game = this.game;
    if (!game) return;

    for (const ev of events) {
      switch (ev.event) {
        case 'shoot':
          if (ev.fromPlayer) this._playWeaponSound(ev.weaponKey);
          else game.audio?.enemyShot?.();
          break;
        case 'enemy_death': {
          game.audio?.explosion?.();
          game.particles?.push?.(...createExplosion(ev.x, ev.z));
          game.particles?.push?.(...createRobotDeathFx(ev.x, ev.z, 0.9));
          game.particles?.push?.(...createRobotSmoke(ev.x, ev.z, 0.55));
          break;
        }
        case 'player_hit':
          if (ev.playerId === this.playerId) {
            game.audio?.playerHurt?.();
            game.el?.damageFlash?.classList.add('active');
            setTimeout(() => game.el?.damageFlash?.classList.remove('active'), 150);
            const p = game.player;
            if (p) {
              game.particles?.push?.(...createBloodSplatter(
                p.x, p.z, p.x + 1, p.z, (ev.damage ?? 10) * 0.55,
              ));
            }
          }
          break;
        case 'door':
          this._applyDoorEvent(ev);
          break;
        case 'pickup':
          game.audio?.pickup?.();
          break;
        default:
          break;
      }
    }
  }

  _playWeaponSound(weaponKey) {
    const w = WEAPONS[weaponKey];
    const audio = this.game?.audio;
    if (!audio || !w) {
      audio?.m16?.();
      return;
    }
    if (w.sound === 'm870') audio.m870();
    else if (w.sound === 'm24') audio.m24();
    else if (w.sound === 'glock') audio.glock();
    else if (w.sound === 'uzi') audio.uzi();
    else if (w.sound === 'revolver') audio.revolver();
    else if (w.sound === 'famas') audio.famas();
    else if (w.sound === 'fal') audio.fal();
    else audio.m16();
  }

  _applyDoorEvent(ev) {
    const buildings = this.game?.buildings?.buildings;
    if (!buildings) return;
    const building = buildings.find(
      (b) => b.originX === ev.originX && b.originZ === ev.originZ,
    );
    if (!building) return;
    if (building.doorOpen === ev.open) return;
    building.doorOpen = ev.open;
    this.game.buildings._syncDoorObstacle(building);
    this.game.audio?.doorToggle?.(building.doorOpen);
  }

  remoteDrawList() {
    return [...this.peers.values()];
  }
}

export function defaultLanUrl() {
  const { protocol, hostname, port } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  const hostPort = port ? `${hostname}:${port}` : hostname;
  return `${wsProto}//${hostPort}`;
}
