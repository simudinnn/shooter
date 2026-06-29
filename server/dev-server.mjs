/**
 * All-in-one dev server: serves the game + authoritative multiplayer on one port.
 * Run: npm start
 */
import { createServer } from 'http';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join, extname, normalize } from 'path';
import { fileURLToPath } from 'url';
import { attachGameServer } from './gameServer.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const START_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_TRIES = 15;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveFile(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = normalize(join(ROOT, urlPath));
  if (!filePath.startsWith(normalize(ROOT))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let target = filePath;
  try {
    let st = await stat(target);
    if (st.isDirectory()) {
      target = join(target, 'index.html');
      st = await stat(target);
    }
    const ext = extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function listenOnPort(httpServer, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onListening = () => {
      cleanup();
      resolve(port);
    };
    const cleanup = () => {
      httpServer.off('error', onError);
      httpServer.off('listening', onListening);
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, '0.0.0.0');
  });
}

async function listenWithFallback(httpServer, startPort) {
  for (let i = 0; i < MAX_PORT_TRIES; i++) {
    const port = startPort + i;
    try {
      return await listenOnPort(httpServer, port);
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      if (i === 0) {
        console.log(`Port ${port} is already in use (old server still running).`);
      }
      console.log(`Trying port ${port + 1}...`);
    }
  }
  throw new Error(`No free port between ${startPort} and ${startPort + MAX_PORT_TRIES - 1}`);
}

const httpServer = createServer((req, res) => {
  serveFile(req, res).catch(() => {
    res.writeHead(500);
    res.end('Server error');
  });
});

attachGameServer(httpServer);

const port = await listenWithFallback(httpServer, START_PORT);
console.log(`\nRobot Ruins → http://localhost:${port}`);
console.log('Share that link with friends. Multiplayer uses the same URL automatically.\n');
