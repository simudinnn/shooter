/**
 * Standalone game server on port 8765 (optional — npm start includes multiplayer).
 */
import { createServer } from 'http';
import { attachGameServer } from './gameServer.mjs';

const PORT = Number(process.env.LAN_PORT) || 8765;

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Robot Ruins game server (authoritative)\nUse npm start for game + server together.\n');
});

attachGameServer(httpServer);

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use — another server is probably already running.`);
    console.error('Tip: use "npm start" instead — it serves the game and multiplayer together.\n');
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Game server on ws://0.0.0.0:${PORT}`);
});
