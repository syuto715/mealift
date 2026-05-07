-- ===========================================================================
-- Build 15 / Session 8 / v28 server companion
-- ---------------------------------------------------------------------------
-- 5-元: user_equipment — per-user gym equipment registry. Drives the
--      AI menu generator's prompt (Phase 4) and the settings equipment
--      editor (Phase 3). 8-cat keys mirror src/constants/equipment.ts
--      from Build 15 5-P; CHECK on the column is the canonical enum
--      enforcement.
--
-- Backfill (Phase 1 sign-off): infer equipment_key set from the legacy
-- profiles.equipment column so existing users have a sensible starting
-- state. Same map as the local v28 migration:
--   'gym'        → all 8 categories
--   'dumbbell'   → dumbbell + bodyweight
--   'bodyweight' → bodyweight only
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING on
-- the (user_id, equipment_key) UNIQUE — re-applying never overwrites
-- user UI customizations and never undeletes soft-deleted rows
-- (deleted rows still occupy the UNIQUE slot).
-- ===========================================================================

create table if not exists public.user_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_key text not null,
  available boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1,
  unique (user_id, equipment_key)
);

alter table public.user_equipment
  drop constraint if exists user_equipment_equipment_key_check;
alter table public.user_equipment
  add constraint user_equipment_equipment_key_check
  check (equipment_key in (
    'barbell', 'dumbbell', 'kettlebell', 'machine',
    'bodyweight', 'cardio', 'stretching', 'other'
  ));

create index if not exists user_equipment_user_updated_idx
  on public.user_equipment (user_id, updated_at desc);

drop trigger if exists user_equipment_set_updated_at on public.user_equipment;
create trigger user_equipment_set_updated_at
  before update on public.user_equipment
  for each row execute function public.set_updated_at();

alter table public.user_equipment enable row level security;
drop policy if exists "users_read_own_equipment" on public.user_equipment;
create policy "users_read_own_equipment" on public.user_equipment
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_equipment" on public.user_equipment;
create policy "users_insert_own_equipment" on public.user_equipment
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_equipment" on public.user_equipment;
create policy "users_update_own_equipment" on public.user_equipment
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_equipment" on public.user_equipment;
create policy "users_delete_own_equipment" on public.user_equipment
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Backfill from profiles.equipment
-- ---------------------------------------------------------------------------
-- profiles.id and auth.users.id are kept in lockstep by the existing
-- profile creation flow (id = auth.uid()), so user_id = p.id is sound.
-- ON CONFLICT DO NOTHING keeps the backfill idempotent across re-applies.
-- ===========================================================================

-- 'gym' → all 8 categories
insert into public.user_equipment (user_id, equipment_key)
select p.id, k
  from public.profiles p
  cross join (
    values ('barbell'), ('dumbbell'), ('kettlebell'), ('machine'),
           ('bodyweight'), ('cardio'), ('stretching'), ('other')
  ) as keys(k)
  where p.equipment = 'gym' and p.deleted_at is null
on conflict (user_id, equipment_key) do nothing;

-- 'dumbbell' → dumbbell + bodyweight
insert into public.user_equipment (user_id, equipment_key)
select p.id, k
  from public.profiles p
  cross join (values ('dumbbell'), ('bodyweight')) as keys(k)
  where p.equipment = 'dumbbell' and p.deleted_at is null
on conflict (user_id, equipment_key) do nothing;

-- 'bodyweight' → bodyweight
insert into public.user_equipment (user_id, equipment_key)
select p.id, 'bodyweight'
  from public.profiles p
  where p.equipment = 'bodyweight' and p.deleted_at is null
on conflict (user_id, equipment_key) do nothing;

-- ===========================================================================
-- Verification queries (manual; not run by migration)
-- ===========================================================================
-- select equipment_key, count(*) from public.user_equipment group by equipment_key;
-- select pg_get_constraintdef(c.oid) from pg_constraint c
--   where conname = 'user_equipment_equipment_key_check';
-- select count(*) from public.user_equipment where user_id = '<test-user-id>';
