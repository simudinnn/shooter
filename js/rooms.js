import {
  resolveSupabaseUrl,
  SUPABASE_ANON_KEY,
  isSupabaseConfigured,
} from './supabaseConfig.js';
import { resolveGameServerUrl } from './gameConfig.js';
import { rollWorldSeed } from './worldGen.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function apiHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, options = {}) {
  const base = resolveSupabaseUrl();
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: apiHeaders(options.headers),
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.message || body.error || body.hint || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function randomCode(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export { isSupabaseConfigured };

export async function createRoom(hostName = 'Host') {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured — edit js/supabaseConfig.js');
  }

  const name = hostName.slice(0, 16) || 'Host';
  const seed = rollWorldSeed();
  const serverUrl = resolveGameServerUrl();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const rows = await rest('game_rooms', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          code,
          host_name: name,
          seed,
          player_count: 1,
          status: 'open',
          server_url: serverUrl,
        }),
      });
      const room = Array.isArray(rows) ? rows[0] : rows;
      if (room) return normalizeRoom(room);
    } catch (err) {
      if (String(err.message).includes('duplicate') || String(err.message).includes('unique')) continue;
      throw err;
    }
  }

  throw new Error('Could not create room — try again');
}

export async function findRoomByCode(code) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured — edit js/supabaseConfig.js');
  }

  const normalized = String(code || '').trim().toUpperCase();
  if (normalized.length < 4) throw new Error('Enter a valid room code');

  const rows = await rest(
    `game_rooms?code=eq.${encodeURIComponent(normalized)}&status=eq.open&select=*&limit=1`,
  );
  const room = Array.isArray(rows) ? rows[0] : rows;
  if (!room) throw new Error('Room not found — check the code');

  const parsed = normalizeRoom(room);
  if (parsed.player_count >= parsed.max_players) throw new Error('Room is full');
  return parsed;
}

export async function registerJoin(roomId) {
  if (!isSupabaseConfigured() || !roomId) return;

  const rows = await rest(
    `game_rooms?id=eq.${encodeURIComponent(roomId)}&select=player_count,max_players&limit=1`,
  );
  const room = Array.isArray(rows) ? rows[0] : rows;
  if (!room || room.player_count >= room.max_players) return;

  await rest(`game_rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ player_count: room.player_count + 1 }),
  });
}

export async function closeRoom(roomId) {
  if (!isSupabaseConfigured() || !roomId) return;
  await rest(`game_rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'closed' }),
  });
}

function normalizeRoom(room) {
  return {
    ...room,
    seed: Number(room.seed) >>> 0,
    player_count: Number(room.player_count) || 0,
    max_players: Number(room.max_players) || 8,
    server_url: room.server_url || resolveGameServerUrl(),
  };
}

export function roomWebSocketUrl(room) {
  return room?.server_url || resolveGameServerUrl();
}
