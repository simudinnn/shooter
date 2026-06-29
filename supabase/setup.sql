-- Run this in Supabase → SQL Editor → New query → Run

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_name text not null default 'Host',
  seed bigint not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  player_count int not null default 1,
  max_players int not null default 8,
  server_url text,
  created_at timestamptz not null default now()
);

create index if not exists game_rooms_code_idx on public.game_rooms (code);

alter table public.game_rooms add column if not exists server_url text;

alter table public.game_rooms enable row level security;

drop policy if exists "read rooms" on public.game_rooms;
drop policy if exists "create rooms" on public.game_rooms;
drop policy if exists "update rooms" on public.game_rooms;

create policy "read rooms" on public.game_rooms for select using (true);
create policy "create rooms" on public.game_rooms for insert with check (true);
create policy "update rooms" on public.game_rooms for update using (true);
