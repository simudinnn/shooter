/**
 * LAN relay — run: npm run lan-server
 * Players connect with ws://HOST_IP:8765 from the game menu.
 */
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.LAN_PORT) || 8765;
const clients = new Map();
let hostId = null;
let sessionSeed = null;
let nextId = 1;

function broadcast(msg, exceptId = null) {
  const raw = JSON.stringify(msg);
  for (const [id, c] of clients) {
    if (id === exceptId) continue;
    if (c.ws.readyState === 1) c.ws.send(raw);
  }
}

function playerList() {
  return [...clients.values()].map((c) => ({
    id: c.id,
    name: c.name,
    isHost: c.id === hostId,
  }));
}

function sendWelcome(ws, client) {
  ws.send(JSON.stringify({
    t: 'welcome',
    id: client.id,
    isHost: client.id === hostId,
    hostId,
    seed: sessionSeed,
    players: playerList(),
  }));
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Robot Ruins LAN server\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const id = `p${nextId++}`;
  const client = { id, ws, name: `Player ${id}` };
  clients.set(id, client);

  if (!hostId) hostId = id;

  sendWelcome(ws, client);
  broadcast({ t: 'player_joined', player: { id, name: client.name, isHost: id === hostId } }, id);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.t === 'name' && typeof msg.name === 'string') {
      client.name = msg.name.slice(0, 16) || client.name;
      broadcast({ t: 'player_rename', id, name: client.name });
      return;
    }

    if (msg.t === 'start' && id === hostId) {
      sessionSeed = (msg.seed >>> 0) || 1;
      broadcast({ t: 'start', seed: sessionSeed, hostId });
      return;
    }

    if (msg.t === 'input' && id !== hostId) {
      if (hostId && clients.has(hostId)) {
        const host = clients.get(hostId);
        if (host.ws.readyState === 1) {
          host.ws.send(JSON.stringify({ t: 'input', from: id, input: msg.input }));
        }
      }
      return;
    }

    if (msg.t === 'state' && id === hostId) {
      broadcast({ t: 'state', state: msg.state }, id);
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    if (hostId === id) {
      hostId = clients.keys().next().value ?? null;
      if (!hostId) sessionSeed = null;
      broadcast({ t: 'host_changed', hostId });
    }
    broadcast({ t: 'player_left', id });
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`LAN server on ws://0.0.0.0:${PORT}`);
});
