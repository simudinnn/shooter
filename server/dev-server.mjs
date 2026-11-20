import { serveStructures } from './structures.mjs';
import { scanMapAssets } from './map-assets.mjs';
/**
 * Run: npm start
 */
import { createServer } from 'http';
import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, extname, normalize } from 'path';
import { fileURLToPath } from 'url';

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
  if(await serveStructures(req,res,ROOT,urlPath))return;
  if (urlPath === '/maps/catalog.json') {
    const entries = await readdir(join(ROOT, 'maps'), { withFileTypes: true });
    const maps = entries.filter((entry) => entry.isFile() && /\.json$/i.test(entry.name)
      && entry.name.toLowerCase() !== 'catalog.json').map((entry) => entry.name).sort();
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(maps));
    return;
  }
  if (urlPath === '/tools/map-editor-assets.json') {
    const catalog = await scanMapAssets(ROOT);
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(catalog));
    return;
  }
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
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match ? (match[1] ? Number(match[1]) : Math.max(0, st.size - Number(match[2]))) : NaN;
      const end = match ? (match[1] && match[2] ? Math.min(Number(match[2]), st.size - 1) : st.size - 1) : NaN;
      if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= st.size) {
        res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + st.size });
        res.end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size });
      if (req.method === 'HEAD') res.end();
      else createReadStream(target, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(target).pipe(res);
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


const port = await listenWithFallback(httpServer, START_PORT);
console.log(`\nRobot Ruins → http://localhost:${port}`);

if (process.argv.includes('--content-editor')) {
  const url = `http://localhost:${port}/tools/content-editor.html`;
  console.log(`Content editor → ${url}`);
  if (process.platform === 'win32') {
    const browser = spawn('explorer.exe', [url], { stdio: 'ignore', windowsHide: true });
    browser.on('error', () => {});
    browser.unref();
  }
}
