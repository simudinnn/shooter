import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabaseConfig.js';
import { rollWorldSeed } from './worldGen.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let client = null;

export function defaultServerUrl() {
  const { protocol, hostname, port } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  const hostPort = port ? `${hostname}:${port}` : hostname;
  return `${wsProto}//${hostPort}`;
}

function db() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

function randomCode(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export { isSupabaseConfigured };

export async function createRoom(hostName = 'Host', serverUrl = null) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured — edit js/supabaseConfig.js');
  }

  const name = hostName.slice(0, 16) || 'Host';
  const seed = rollWorldSeed();
  const wsUrl = serverUrl || defaultServerUrl();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data, error } = await db()
      .from('game_rooms')
      .insert({
        code,
        host_name: name,
        seed,
        player_count: 1,
        status: 'open',
        server_url: wsUrl,
      })
      .select()
      .single();

    if (!error) return data;
    if (error.code !== '23505') throw new Error(error.message);
  }

  throw new Error('Could not create room — try again');
}

export async function findRoomByCode(code) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured — edit js/supabaseConfig.js');
  }

  const normalized = String(code || '').trim().toUpperCase();
  if (normalized.length < 4) throw new Error('Enter a valid room code');

  const { data, error } = await db()
    .from('game_rooms')
    .select('*')
    .eq('code', normalized)
    .eq('status', 'open')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Room not found — check the code');
  if (data.player_count >= data.max_players) throw new Error('Room is full');

  return data;
}

export async function registerJoin(roomId) {
  if (!isSupabaseConfigured()) return;

  const { data: room, error: readErr } = await db()
    .from('game_rooms')
    .select('player_count, max_players')
    .eq('id', roomId)
    .maybeSingle();

  if (readErr || !room) return;
  if (room.player_count >= room.max_players) return;

  await db()
    .from('game_rooms')
    .update({ player_count: room.player_count + 1 })
    .eq('id', roomId);
}

export async function closeRoom(roomId) {
  if (!isSupabaseConfigured() || !roomId) return;
  await db().from('game_rooms').update({ status: 'closed' }).eq('id', roomId);
}
