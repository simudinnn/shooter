/**
 * Optional: set a fixed public game-server WebSocket URL when hosting separately.
 * Leave empty to use the same origin as the page (recommended — one deploy URL for everything).
 */
export const GAME_SERVER_URL = '';

export function resolveGameServerUrl() {
  if (GAME_SERVER_URL) return GAME_SERVER_URL.replace(/\/$/, '');
  const { protocol, hostname, port } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  const hostPort = port ? `${hostname}:${port}` : hostname;
  return `${wsProto}//${hostPort}`;
}
