-- push_tokens — Expo push token storage for remote notifications
-- (Build 15 / Feature 3, server side).
--
-- One row per (user_id, expo_push_token). A user can have multiple
-- devices (iPhone + iPad), so user_id alone is not unique. The
-- expo_push_token is what the Expo Push API actually sends to;
-- platform is recorded for later debugging (e.g. iOS-only campaign,
-- Android-only fallback).
--
-- Token lifecycle on the client side:
--   1. After login (loginSyncBootstrap.runLoginSync) → request
--      Notifications permission → Notifications.getExpoPushTokenAsync
--      → upsert this table with onConflict (user_id, expo_push_token).
--   2. Per-device, the tuple stays stable until reinstall or token
--      rotation. last_seen_at is bumped on each register so a future
--      cleanup job can prune tokens not seen in >90 days.
--   3. On logout: not deleted in v1 (see TODO below). Future delete-on-
--      logout would prevent stale-shared-device cross-talk.
--
-- TODO (Build 16+): cross-user stale token mitigation.
-- Current schema allows the same expo_push_token to coexist across
-- different user_id rows (e.g., shared device after logout/relogin).
-- Mitigation: on token register, DELETE rows matching the same
-- expo_push_token with a different user_id; or delete on logout.
-- Acceptable for Build 15 (single-user fitness app, low collision risk).
--
-- Rollback:
--   drop policy if exists "own_tokens_deletable" on public.push_tokens;
--   drop policy if exists "own_tokens_updatable" on public.push_tokens;
--   drop policy if exists "own_tokens_insertable" on public.push_tokens;
--   drop policy if exists "own_tokens_readable" on public.push_tokens;
--   drop index if exists public.push_tokens_user_idx;
--   drop table if exists public.push_tokens;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  device_id text,                     -- optional, helps dedupe across reinstalls
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "own_tokens_readable" on public.push_tokens;
create policy "own_tokens_readable"
  on public.push_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "own_tokens_insertable" on public.push_tokens;
create policy "own_tokens_insertable"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "own_tokens_updatable" on public.push_tokens;
create policy "own_tokens_updatable"
  on public.push_tokens for update
  using (auth.uid() = user_id);

drop policy if exists "own_tokens_deletable" on public.push_tokens;
create policy "own_tokens_deletable"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

-- Verification (run AFTER apply, in SQL Editor where auth.uid() is NULL).
-- Uncomment the DO block below and run. Self-cleaning: inserts a dummy
-- token row for the first auth.users row, verifies it landed, then
-- deletes it. Safe to run multiple times.
--
-- do $$
-- declare
--   any_user_id uuid;
--   test_token text := 'ExponentPushToken[VERIFICATION_'
--                   || extract(epoch from now())::text || ']';
-- begin
--   select id into any_user_id from auth.users limit 1;
--   if any_user_id is null then
--     raise exception 'No auth.users rows present; create a user first';
--   end if;
--
--   insert into public.push_tokens (user_id, expo_push_token, platform)
--   values (any_user_id, test_token, 'ios');
--
--   if not exists (
--     select 1 from public.push_tokens where expo_push_token = test_token
--   ) then
--     raise exception 'Insert failed (RLS or constraint?)';
--   end if;
--
--   delete from public.push_tokens where expo_push_token = test_token;
--   raise notice 'push_tokens verification: insert + delete OK';
-- end $$;
