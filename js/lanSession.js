import { TILE } from './worldGen.js';
import { collectCollisionTargets, moveWithEntityCollision } from './collision.js';
import { CHAR_NATIVE_PX } from './sprites.js';

const STATE_HZ = 15;
const INPUT_HZ = 20;

function defaultPeer(id, name) {
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
    input: null,
    _renderX: 0,
    _renderZ: 0,
    _renderAngle: 0,
  };
}

export class LanSession {
  constructor(game, { isHost, playerId, playerName, url }) {
    this.game = game;
    this.isHost = isHost;
    this.isClient = !isHost;
    this.playerId = playerId;
    this.playerName = playerName;
    this.url = url;
    this.ws = null;
    this.peers = new Map();
    this.connected = false;
    this.sessionSeed = null;
    this._stateAcc = 0;
    this._inputAcc = 0;
    this._onStart = null;
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
        ws.send(JSON.stringify({ t: 'name', name: this.playerName }));
      };

      ws.onerror = () => {
        clearTimeout(failTimer);
        reject(new Error('Could not connect'));
      };

      ws.onclose = () => {
        this.connected = false;
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
      case 'welcome':
        clearTimeout(failTimer);
        this.playerId = msg.id;
        this.isHost = !!msg.isHost;
        this.isClient = !this.isHost;
        this.sessionSeed = msg.seed ?? null;
        this.peers.clear();
        for (const p of msg.players ?? []) {
          if (p.id === this.playerId) continue;
          this.peers.set(p.id, defaultPeer(p.id, p.name));
        }
        if (resolveConnect) {
          resolveConnect(this);
          resolveConnect = null;
        }
        break;
      case 'player_joined':
        if (msg.player?.id && msg.player.id !== this.playerId) {
          const peer = defaultPeer(msg.player.id, msg.player.name);
          if (this.isHost && this.game?.player) {
            peer.x = this.game.player.x + 2.5;
            peer.z = this.game.player.z;
            peer._renderX = peer.x;
            peer._renderZ = peer.z;
          }
          this.peers.set(msg.player.id, peer);
        }
        break;
      case 'player_left':
        this.peers.delete(msg.id);
        break;
      case 'player_rename':
        if (this.peers.has(msg.id)) this.peers.get(msg.id).name = msg.name;
        break;
      case 'start':
        this.sessionSeed = msg.seed ?? null;
        this._onStart?.(this.sessionSeed);
        break;
      case 'input':
        if (this.isHost && msg.from && msg.input) {
          const peer = this.peers.get(msg.from);
          if (peer) peer.input = msg.input;
        }
        break;
      case 'state':
        if (this.isClient && msg.state) this._applyState(msg.state);
        break;
      case 'host_changed':
        this.isHost = msg.hostId === this.playerId;
        this.isClient = !this.isHost;
        break;
      default:
        break;
    }
  }

  onStart(cb) {
    this._onStart = cb;
  }

  sendStart(seed) {
    this._send({ t: 'start', seed: seed >>> 0 });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.peers.clear();
  }

  _send(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  captureInput(game) {
    const player = game.player;
    const { moveX, moveZ } = game._getMoveInput();
    const len = Math.hypot(moveX, moveZ);
    return {
      moveX: len > 0.01 ? moveX / len : 0,
      moveZ: len > 0.01 ? moveZ / len : 0,
      sprint: game._isShiftHeld?.() ?? false,
      angle: player.angle,
      moving: player.isMoving,
    };
  }

  tick(dt, game) {
    if (!this.connected) return;

    this._inputAcc += dt;
    if (this._inputAcc >= 1 / INPUT_HZ) {
      this._inputAcc = 0;
      if (this.isClient) {
        this._send({ t: 'input', input: this.captureInput(game) });
      }
    }

    if (this.isHost) {
      this._simulateRemotePeers(dt, game);
      this._stateAcc += dt;
      if (this._stateAcc >= 1 / STATE_HZ) {
        this._stateAcc = 0;
        this._send({ t: 'state', state: this._packState(game) });
      }
    } else {
      this._lerpPeers(dt);
      this._applyLocalCorrection(game);
    }
  }

  _simulateRemotePeers(dt, game) {
    const player = game.player;
    const speed = player.speed;
    const sprintMult = player.sprintMult;

    for (const peer of this.peers.values()) {
      const inp = peer.input;
      if (!inp) continue;

      peer.angle = inp.angle ?? peer.angle;
      const mx = inp.moveX ?? 0;
      const mz = inp.moveZ ?? 0;
      const len = Math.hypot(mx, mz);
      peer.isMoving = len > 0.05 && (inp.moving ?? true);
      peer.isSprinting = !!(inp.sprint && peer.isMoving);
      peer.moveDirX = len > 0.01 ? mx / len : 0;
      peer.moveDirZ = len > 0.01 ? mz / len : 0;

      if (peer.isMoving) {
        const spd = (inp.sprint ? speed * sprintMult : speed) * dt;
        const shape = player.getMoveCollider(8);
        const targets = collectCollisionTargets({
          player,
          robots: game.robots,
          exclude: null,
        });
        const r = moveWithEntityCollision(
          game.world,
          peer.x,
          peer.z,
          mx / len * spd,
          mz / len * spd,
          shape,
          shape,
          targets.filter((t) => t !== player),
          null,
        );
        peer.x = r.x;
        peer.z = r.z;
        peer.walkPhase += dt * (peer.isSprinting ? 9 : 6);
      }

      peer._renderX = peer.x;
      peer._renderZ = peer.z;
      peer._renderAngle = peer.angle;
    }
  }

  _packState(game) {
    const player = game.player;
    const players = [{
      id: this.playerId,
      name: this.playerName,
      x: player.x,
      z: player.z,
      angle: player.angle,
      health: player.health,
      maxHealth: player.maxHealth,
      isMoving: player.isMoving,
      isSprinting: player.isSprinting,
      moveDirX: player.moveDirX,
      moveDirZ: player.moveDirZ,
      walkPhase: player.walkPhase,
    }];

    for (const peer of this.peers.values()) {
      players.push({
        id: peer.id,
        name: peer.name,
        x: peer.x,
        z: peer.z,
        angle: peer.angle,
        health: peer.health,
        maxHealth: peer.maxHealth,
        isMoving: peer.isMoving,
        isSprinting: peer.isSprinting,
        moveDirX: peer.moveDirX,
        moveDirZ: peer.moveDirZ,
        walkPhase: peer.walkPhase,
      });
    }

    return { players };
  }

  _applyState(state) {
    const local = state.players?.find((p) => p.id === this.playerId);
    if (local) {
      this._localAuth = local;
    }
    for (const p of state.players ?? []) {
      if (p.id === this.playerId) continue;
      let peer = this.peers.get(p.id);
      if (!peer) {
        peer = defaultPeer(p.id, p.name);
        this.peers.set(p.id, peer);
      }
      Object.assign(peer, p);
      if (peer._renderX == null) {
        peer._renderX = peer.x;
        peer._renderZ = peer.z;
        peer._renderAngle = peer.angle;
      }
    }
  }

  _lerpPeers(dt) {
    const t = Math.min(1, dt * 12);
    for (const peer of this.peers.values()) {
      peer._renderX += (peer.x - peer._renderX) * t;
      peer._renderZ += (peer.z - peer._renderZ) * t;
      let da = peer.angle - peer._renderAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      peer._renderAngle += da * t;
    }
  }

  _applyLocalCorrection(game) {
    const auth = this._localAuth;
    if (!auth) return;
    const player = game.player;
    const dx = auth.x - player.x;
    const dz = auth.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > TILE * 4) {
      player.x = auth.x;
      player.z = auth.z;
    } else if (dist > 0.05) {
      player.x += dx * 0.18;
      player.z += dz * 0.18;
    }
    player.angle = auth.angle;
  }

  /** Iterable peers for rendering (excludes self). */
  remoteDrawList() {
    return [...this.peers.values()];
  }
}

export function defaultLanUrl() {
  const host = window.location.hostname || 'localhost';
  return `ws://${host}:8765`;
}
