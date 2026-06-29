/**
 * Authoritative multiplayer WebSocket server — attach to any HTTP server.
 * Supports multiple isolated rooms (one GameSim per room).
 */
import { WebSocketServer } from 'ws';
import { GameSim } from './gameSim.mjs';
import { SIM_HZ, SNAPSHOT_HZ, MSG } from '../js/netProtocol.js';

const DT = 1 / SIM_HZ;
const SNAPSHOT_DT = 1 / SNAPSHOT_HZ;

export function attachGameServer(httpServer) {
  const clients = new Map();
  const rooms = new Map();
  let nextId = 1;
  let lastTick = Date.now();

  function getRoom(roomId, seed = null) {
    let room = rooms.get(roomId);
    if (!room) {
      const simSeed = seed != null ? seed >>> 0 : undefined;
      room = {
        id: roomId,
        sim: new GameSim(simSeed),
        clients: new Set(),
        simAcc: 0,
        snapshotAcc: 0,
      };
      rooms.set(roomId, room);
    }
    return room;
  }

  function destroyRoomIfEmpty(roomId) {
    const room = rooms.get(roomId);
    if (room && room.clients.size === 0) rooms.delete(roomId);
  }

  function roomPlayerList(room) {
    const out = [];
    for (const clientId of room.clients) {
      const c = clients.get(clientId);
      if (c) out.push({ id: c.id, name: c.name });
    }
    return out;
  }

  function broadcastRoom(room, msg, exceptId = null) {
    const raw = JSON.stringify(msg);
    for (const clientId of room.clients) {
      if (clientId === exceptId) continue;
      const c = clients.get(clientId);
      if (c?.ws.readyState === 1) c.ws.send(raw);
    }
  }

  function sendWelcome(ws, client, room) {
    ws.send(JSON.stringify({
      t: MSG.WELCOME,
      id: client.id,
      roomId: room.id,
      seed: room.sim.seed,
      players: roomPlayerList(room),
    }));
  }

  function joinClientRoom(client, roomId, seed, name) {
    if (client.roomId) return;

    const room = getRoom(roomId, seed);
    if (name) client.name = name.slice(0, 16) || client.name;

    client.roomId = roomId;
    room.clients.add(client.id);
    room.sim.addPlayer(client.id, client.name);

    sendWelcome(client.ws, client, room);
    broadcastRoom(room, { t: MSG.JOINED, player: { id: client.id, name: client.name } }, client.id);
  }

  function gameLoop() {
    const now = Date.now();
    const frameDt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;

    for (const room of rooms.values()) {
      if (room.clients.size === 0) continue;

      room.simAcc = (room.simAcc ?? 0) + frameDt;
      room.snapshotAcc += frameDt;

      while (room.simAcc >= DT) {
        room.sim.step(DT);
        room.simAcc -= DT;
      }

      if (room.snapshotAcc >= SNAPSHOT_DT) {
        room.snapshotAcc = 0;
        const events = room.sim.drainEvents();
        broadcastRoom(room, {
          t: MSG.SNAPSHOT,
          snapshot: room.sim.packSnapshot(),
          events,
        });
      } else {
        const events = room.sim.drainEvents();
        if (events.length) broadcastRoom(room, { t: MSG.EVENTS, events });
      }
    }

    setImmediate(gameLoop);
  }

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') console.error('[multiplayer]', err.message);
  });

  wss.on('connection', (ws) => {
    const id = `p${nextId++}`;
    const client = { id, ws, name: `Player ${id}`, roomId: null };
    clients.set(id, client);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.t === MSG.JOIN_ROOM && msg.roomId && !client.roomId) {
        joinClientRoom(client, msg.roomId, msg.seed ?? null, msg.name);
        return;
      }

      if (msg.t === 'name' && typeof msg.name === 'string' && client.roomId) {
        client.name = msg.name.slice(0, 16) || client.name;
        const room = rooms.get(client.roomId);
        const entry = room?.sim.players?.get(id);
        if (entry) entry.name = client.name;
        if (room) broadcastRoom(room, { t: MSG.RENAME, id, name: client.name });
        return;
      }

      if (msg.t === MSG.INPUT && msg.input && client.roomId) {
        const room = rooms.get(client.roomId);
        room?.sim.setInput(id, msg.input);
      }
    });

    ws.on('close', () => {
      const roomId = client.roomId;
      if (roomId) {
        const room = rooms.get(roomId);
        room?.sim.removePlayer(id);
        room?.clients.delete(id);
        broadcastRoom(room, { t: MSG.LEFT, id });
        destroyRoomIfEmpty(roomId);
      }
      clients.delete(id);
    });
  });

  gameLoop();
  return wss;
}
