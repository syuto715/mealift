-- Cloud Sync Layer — Supabase server-side tables for build 14.
-- See docs/cloud-sync-design.md (commit cd1a6d8) Part 2-1.
--
-- This migration creates one server-side table per user-private local
-- resource so the existing local SQLite data can round-trip via the
-- per-resource sync modules added in subsequent commits.
--
-- Conventions used throughout:
--   - id is the canonical row id, type uuid. Clients reuse the local
--     TEXT UUID (expo-crypto.randomUUID() yields RFC 4122 v4 strings
--     that Postgres accepts as uuid). public.profiles is the only
--     exception: its `id` IS the auth.users.id (1:1 with the user).
--   - user_id is the auth.users.id every other table scopes to.
--     Clients send auth.uid() at push time; RLS enforces it at write.
--   - updated_at is auto-maintained by the set_updated_at() trigger
--     defined below. Clients never need to set it.
--   - deleted_at is the soft-delete tombstone. Pull observers see
--     `deleted_at IS NOT NULL` rows and apply a local hard delete.
--   - client_version is reserved for future causal-clock work; for v1
--     we use last-write-wins on updated_at. Default 1, no client logic.
--
-- Idempotency:
--   - CREATE TABLE IF NOT EXISTS throughout, so re-applying the
--     migration on a partially-built database is safe.
--   - public.profiles is the one table that may already exist (likely
--     created via the Supabase dashboard during build 13 setup).
--     Columns are added via ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--     so an existing table is augmented rather than replaced.
--
-- Existing migrations (untouched by this file):
--   20260421000000_create_ai_usage_logs.sql      — AI usage / RLS
--   20260426000000_create_public_foods.sql       — public_foods + reports
--   20260430000000_add_food_category.sql         — food_category column
--
-- Apply order in the Supabase Dashboard (or `supabase db push`):
--   1. 20260421000000_create_ai_usage_logs.sql   (likely already applied)
--   2. 20260426000000_create_public_foods.sql    (status TBD — check Dashboard)
--   3. 20260430000000_add_food_category.sql      (depends on #2)
--   4. THIS FILE                                  (independent of #2/#3)
--
-- After this file is applied, all 17 user-private tables exist with
-- RLS, triggers, and indexes ready for the sync layer.

-- ===========================================================================
-- Shared trigger function for updated_at maintenance.
-- ===========================================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ===========================================================================
-- Table 0: public.profiles
-- ---------------------------------------------------------------------------
-- 1 row per user. PRIMARY KEY = auth.users.id (id IS user_id, no separate
-- user_id column). Existing build-13 columns (plan, subscription_status,
-- trial_started_at, subscription_updated_at) added by the ai_usage_logs
-- migration are preserved.
-- ===========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Build-13 columns. Idempotent because the dashboard or earlier migrations
-- may have added some of these.
alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists subscription_updated_at timestamptz;

-- Build-14 columns mirroring src/types/profile.ts. SQLite REAL → numeric,
-- INTEGER 0/1 → boolean, ISO date strings → date.
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists gender text
  check (gender is null or gender in ('male', 'female', 'other'));
alter table public.profiles add column if not exists birth_year integer;
alter table public.profiles add column if not exists height_cm numeric;
alter table public.profiles add column if not exists current_weight_kg numeric;
alter table public.profiles add column if not exists target_weight_kg numeric;
alter table public.profiles add column if not exists target_body_fat_pct numeric;
alter table public.profiles add column if not exists goal_type text
  check (goal_type is null or goal_type in ('cut', 'bulk', 'maintain', 'recomp'));
alter table public.profiles add column if not exists activity_level text
  check (activity_level is null or activity_level in
    ('sedentary', 'light', 'moderate', 'active', 'very_active'));
alter table public.profiles add column if not exists training_days_per_week integer default 3;
alter table public.profiles add column if not exists target_date date;
alter table public.profiles add column if not exists equipment text
  check (equipment is null or equipment in ('gym', 'dumbbell', 'bodyweight'));
alter table public.profiles add column if not exists target_calories integer;
alter table public.profiles add column if not exists target_protein_g integer;
alter table public.profiles add column if not exists target_fat_g integer;
alter table public.profiles add column if not exists target_carb_g integer;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists adaptive_goal_enabled boolean not null default true;
alter table public.profiles add column if not exists adaptive_goal_sensitivity text not null default 'standard';
alter table public.profiles add column if not exists adaptive_goal_last_shown_at timestamptz;
alter table public.profiles add column if not exists daily_water_target_ml integer not null default 2500;
alter table public.profiles add column if not exists onboarding_version integer not null default 1;
alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles add column if not exists plan_billing_cycle text
  check (plan_billing_cycle is null or plan_billing_cycle in ('monthly', 'biannual', 'annual'));
alter table public.profiles add column if not exists plan_expires_at timestamptz;
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists client_version integer not null default 1;

create index if not exists profiles_updated_idx on public.profiles (updated_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "users_read_own_profile" on public.profiles;
create policy "users_read_own_profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "users_insert_own_profile" on public.profiles;
create policy "users_insert_own_profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "users_update_own_profile" on public.profiles;
create policy "users_update_own_profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- No DELETE policy — profile rows live for the lifetime of the auth user
-- and cascade on auth.users delete. Soft delete via deleted_at if needed.

-- ===========================================================================
-- Table 1: public.user_body_logs
-- ---------------------------------------------------------------------------
-- 1 row per (user, date). Local schema (v1) has UNIQUE(profile_id, date);
-- server-side we use a partial unique that ignores soft-deleted rows.
-- ===========================================================================

create table if not exists public.user_body_logs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric,
  body_fat_pct numeric,
  muscle_mass_kg numeric,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create unique index if not exists user_body_logs_user_date_unique
  on public.user_body_logs (user_id, date)
  where deleted_at is null;
create index if not exists user_body_logs_user_updated_idx
  on public.user_body_logs (user_id, updated_at desc);
create index if not exists user_body_logs_user_deleted_idx
  on public.user_body_logs (user_id, deleted_at);

drop trigger if exists user_body_logs_set_updated_at on public.user_body_logs;
create trigger user_body_logs_set_updated_at
  before update on public.user_body_logs
  for each row execute function public.set_updated_at();

alter table public.user_body_logs enable row level security;
drop policy if exists "users_read_own_body_logs" on public.user_body_logs;
create policy "users_read_own_body_logs" on public.user_body_logs
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_body_logs" on public.user_body_logs;
create policy "users_insert_own_body_logs" on public.user_body_logs
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_body_logs" on public.user_body_logs;
create policy "users_update_own_body_logs" on public.user_body_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_body_logs" on public.user_body_logs;
create policy "users_delete_own_body_logs" on public.user_body_logs
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 2: public.user_workout_routines
-- ===========================================================================

create table if not exists public.user_workout_routines (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_workout_routines_user_updated_idx
  on public.user_workout_routines (user_id, updated_at desc);
create index if not exists user_workout_routines_user_deleted_idx
  on public.user_workout_routines (user_id, deleted_at);

drop trigger if exists user_workout_routines_set_updated_at on public.user_workout_routines;
create trigger user_workout_routines_set_updated_at
  before update on public.user_workout_routines
  for each row execute function public.set_updated_at();

alter table public.user_workout_routines enable row level security;
drop policy if exists "users_read_own_workout_routines" on public.user_workout_routines;
create policy "users_read_own_workout_routines" on public.user_workout_routines
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_workout_routines" on public.user_workout_routines;
create policy "users_insert_own_workout_routines" on public.user_workout_routines
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_workout_routines" on public.user_workout_routines;
create policy "users_update_own_workout_routines" on public.user_workout_routines
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_workout_routines" on public.user_workout_routines;
create policy "users_delete_own_workout_routines" on public.user_workout_routines
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 3: public.user_workout_routine_items
-- ---------------------------------------------------------------------------
-- Child of user_workout_routines. routine_id has ON DELETE CASCADE so a
-- hard delete of a routine takes its items with it. Soft delete is
-- propagated client-side per design Part 2-4.
-- ===========================================================================

create table if not exists public.user_workout_routine_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references public.user_workout_routines(id) on delete cascade,
  exercise_id text not null,
  target_sets integer not null default 3,
  target_reps text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_workout_routine_items_user_updated_idx
  on public.user_workout_routine_items (user_id, updated_at desc);
create index if not exists user_workout_routine_items_user_routine_idx
  on public.user_workout_routine_items (user_id, routine_id);

drop trigger if exists user_workout_routine_items_set_updated_at on public.user_workout_routine_items;
create trigger user_workout_routine_items_set_updated_at
  before update on public.user_workout_routine_items
  for each row execute function public.set_updated_at();

alter table public.user_workout_routine_items enable row level security;
drop policy if exists "users_read_own_routine_items" on public.user_workout_routine_items;
create policy "users_read_own_routine_items" on public.user_workout_routine_items
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_routine_items" on public.user_workout_routine_items;
create policy "users_insert_own_routine_items" on public.user_workout_routine_items
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_routine_items" on public.user_workout_routine_items;
create policy "users_update_own_routine_items" on public.user_workout_routine_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_routine_items" on public.user_workout_routine_items;
create policy "users_delete_own_routine_items" on public.user_workout_routine_items
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 4: public.user_workout_sessions
-- ---------------------------------------------------------------------------
-- routine_id is nullable (ad-hoc sessions don't reference a saved routine).
-- ===========================================================================

create table if not exists public.user_workout_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.user_workout_routines(id) on delete set null,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_seconds integer,
  estimated_calories integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_workout_sessions_user_updated_idx
  on public.user_workout_sessions (user_id, updated_at desc);
create index if not exists user_workout_sessions_user_started_idx
  on public.user_workout_sessions (user_id, started_at desc);
create index if not exists user_workout_sessions_user_deleted_idx
  on public.user_workout_sessions (user_id, deleted_at);

drop trigger if exists user_workout_sessions_set_updated_at on public.user_workout_sessions;
create trigger user_workout_sessions_set_updated_at
  before update on public.user_workout_sessions
  for each row execute function public.set_updated_at();

alter table public.user_workout_sessions enable row level security;
drop policy if exists "users_read_own_workout_sessions" on public.user_workout_sessions;
create policy "users_read_own_workout_sessions" on public.user_workout_sessions
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_workout_sessions" on public.user_workout_sessions;
create policy "users_insert_own_workout_sessions" on public.user_workout_sessions
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_workout_sessions" on public.user_workout_sessions;
create policy "users_update_own_workout_sessions" on public.user_workout_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_workout_sessions" on public.user_workout_sessions;
create policy "users_delete_own_workout_sessions" on public.user_workout_sessions
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 5: public.user_workout_sets
-- ---------------------------------------------------------------------------
-- Child of user_workout_sessions. Cardio columns (duration_minutes,
-- distance_km, calories_burned, perceived_intensity) added in v12.
-- ===========================================================================

create table if not exists public.user_workout_sets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.user_workout_sessions(id) on delete cascade,
  exercise_id text not null,
  set_number integer not null,
  weight_kg numeric,
  reps integer,
  rpe numeric,
  rir integer,
  is_warmup boolean not null default false,
  duration_minutes numeric,
  distance_km numeric,
  calories_burned numeric,
  perceived_intensity integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_workout_sets_user_updated_idx
  on public.user_workout_sets (user_id, updated_at desc);
create index if not exists user_workout_sets_user_session_idx
  on public.user_workout_sets (user_id, session_id);

drop trigger if exists user_workout_sets_set_updated_at on public.user_workout_sets;
create trigger user_workout_sets_set_updated_at
  before update on public.user_workout_sets
  for each row execute function public.set_updated_at();

alter table public.user_workout_sets enable row level security;
drop policy if exists "users_read_own_workout_sets" on public.user_workout_sets;
create policy "users_read_own_workout_sets" on public.user_workout_sets
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_workout_sets" on public.user_workout_sets;
create policy "users_insert_own_workout_sets" on public.user_workout_sets
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_workout_sets" on public.user_workout_sets;
create policy "users_update_own_workout_sets" on public.user_workout_sets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_workout_sets" on public.user_workout_sets;
create policy "users_delete_own_workout_sets" on public.user_workout_sets
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 6: public.user_meal_logs
-- ---------------------------------------------------------------------------
-- 1 row per (user, date, meal_type) — the local schema lacks a UNIQUE
-- constraint here, but the UI flow only ever creates one per slot, so we
-- enforce uniqueness server-side via a partial index.
-- ===========================================================================

create table if not exists public.user_meal_logs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create unique index if not exists user_meal_logs_user_date_meal_unique
  on public.user_meal_logs (user_id, date, meal_type)
  where deleted_at is null;
create index if not exists user_meal_logs_user_updated_idx
  on public.user_meal_logs (user_id, updated_at desc);
create index if not exists user_meal_logs_user_deleted_idx
  on public.user_meal_logs (user_id, deleted_at);

drop trigger if exists user_meal_logs_set_updated_at on public.user_meal_logs;
create trigger user_meal_logs_set_updated_at
  before update on public.user_meal_logs
  for each row execute function public.set_updated_at();

alter table public.user_meal_logs enable row level security;
drop policy if exists "users_read_own_meal_logs" on public.user_meal_logs;
create policy "users_read_own_meal_logs" on public.user_meal_logs
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_meal_logs" on public.user_meal_logs;
create policy "users_insert_own_meal_logs" on public.user_meal_logs
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_meal_logs" on public.user_meal_logs;
create policy "users_update_own_meal_logs" on public.user_meal_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_meal_logs" on public.user_meal_logs;
create policy "users_delete_own_meal_logs" on public.user_meal_logs
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 7: public.user_meal_log_items
-- ---------------------------------------------------------------------------
-- Child of user_meal_logs. food_id is a soft-FK (text, no constraint) —
-- it points to canonical foods that are not synced to Supabase.
-- Extended nutrient set mirrors v6 + v9 of the local schema.
-- ===========================================================================

create table if not exists public.user_meal_log_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_log_id uuid not null references public.user_meal_logs(id) on delete cascade,
  food_id text,
  food_name text not null,
  serving_amount numeric not null default 1,
  serving_unit text not null default 'g',
  calories numeric not null,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  carb_g numeric not null default 0,
  fiber_g numeric,
  sodium_mg numeric,
  calcium_mg numeric,
  iron_mg numeric,
  vitamin_a_ug numeric,
  vitamin_b1_mg numeric,
  vitamin_b2_mg numeric,
  vitamin_b6_mg numeric,
  vitamin_b12_ug numeric,
  folate_ug numeric,
  vitamin_c_mg numeric,
  vitamin_d_ug numeric,
  vitamin_e_mg numeric,
  potassium_mg numeric,
  magnesium_mg numeric,
  zinc_mg numeric,
  cholesterol_mg numeric,
  saturated_fat_g numeric,
  sugar_g numeric,
  salt_g numeric,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_meal_log_items_user_updated_idx
  on public.user_meal_log_items (user_id, updated_at desc);
create index if not exists user_meal_log_items_user_meal_idx
  on public.user_meal_log_items (user_id, meal_log_id);

drop trigger if exists user_meal_log_items_set_updated_at on public.user_meal_log_items;
create trigger user_meal_log_items_set_updated_at
  before update on public.user_meal_log_items
  for each row execute function public.set_updated_at();

alter table public.user_meal_log_items enable row level security;
drop policy if exists "users_read_own_meal_log_items" on public.user_meal_log_items;
create policy "users_read_own_meal_log_items" on public.user_meal_log_items
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_meal_log_items" on public.user_meal_log_items;
create policy "users_insert_own_meal_log_items" on public.user_meal_log_items
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_meal_log_items" on public.user_meal_log_items;
create policy "users_update_own_meal_log_items" on public.user_meal_log_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_meal_log_items" on public.user_meal_log_items;
create policy "users_delete_own_meal_log_items" on public.user_meal_log_items
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 8: public.user_meal_templates
-- ---------------------------------------------------------------------------
-- items column is jsonb (locally TEXT JSON) — server can validate shape,
-- and queries can filter on individual food ids if needed later.
-- ===========================================================================

create table if not exists public.user_meal_templates (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  meal_type text check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  items jsonb not null,
  use_count integer not null default 0,
  description text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_meal_templates_user_updated_idx
  on public.user_meal_templates (user_id, updated_at desc);
create index if not exists user_meal_templates_user_deleted_idx
  on public.user_meal_templates (user_id, deleted_at);

drop trigger if exists user_meal_templates_set_updated_at on public.user_meal_templates;
create trigger user_meal_templates_set_updated_at
  before update on public.user_meal_templates
  for each row execute function public.set_updated_at();

alter table public.user_meal_templates enable row level security;
drop policy if exists "users_read_own_meal_templates" on public.user_meal_templates;
create policy "users_read_own_meal_templates" on public.user_meal_templates
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_meal_templates" on public.user_meal_templates;
create policy "users_insert_own_meal_templates" on public.user_meal_templates
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_meal_templates" on public.user_meal_templates;
create policy "users_update_own_meal_templates" on public.user_meal_templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_meal_templates" on public.user_meal_templates;
create policy "users_delete_own_meal_templates" on public.user_meal_templates
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 9: public.user_notes
-- ===========================================================================

create table if not exists public.user_notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  category text not null check (category in ('training', 'nutrition', 'condition', 'general')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_notes_user_updated_idx
  on public.user_notes (user_id, updated_at desc);
create index if not exists user_notes_user_date_idx
  on public.user_notes (user_id, date desc);
create index if not exists user_notes_user_deleted_idx
  on public.user_notes (user_id, deleted_at);

drop trigger if exists user_notes_set_updated_at on public.user_notes;
create trigger user_notes_set_updated_at
  before update on public.user_notes
  for each row execute function public.set_updated_at();

alter table public.user_notes enable row level security;
drop policy if exists "users_read_own_notes" on public.user_notes;
create policy "users_read_own_notes" on public.user_notes
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_notes" on public.user_notes;
create policy "users_insert_own_notes" on public.user_notes
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_notes" on public.user_notes;
create policy "users_update_own_notes" on public.user_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_notes" on public.user_notes;
create policy "users_delete_own_notes" on public.user_notes
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 10: public.user_dishes
-- ---------------------------------------------------------------------------
-- Only is_my_dish=true rows sync — canonical seeded dishes stay local.
-- The is_my_dish column is here for symmetry with the local schema; clients
-- only push rows where it's true.
-- ===========================================================================

create table if not exists public.user_dishes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name_ja text not null,
  name_en text,
  category text not null check (category in
    ('japanese', 'western', 'chinese', 'korean', 'other', 'convenience', 'fast_food')),
  serving_description text not null default '1人前',
  total_calories numeric not null,
  total_protein_g numeric not null default 0,
  total_fat_g numeric not null default 0,
  total_carb_g numeric not null default 0,
  is_my_dish boolean not null default true,
  is_favorite boolean not null default false,
  use_count integer not null default 0,
  last_used_at timestamptz,
  user_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_dishes_user_updated_idx
  on public.user_dishes (user_id, updated_at desc);
create index if not exists user_dishes_user_deleted_idx
  on public.user_dishes (user_id, deleted_at);

drop trigger if exists user_dishes_set_updated_at on public.user_dishes;
create trigger user_dishes_set_updated_at
  before update on public.user_dishes
  for each row execute function public.set_updated_at();

alter table public.user_dishes enable row level security;
drop policy if exists "users_read_own_dishes" on public.user_dishes;
create policy "users_read_own_dishes" on public.user_dishes
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_dishes" on public.user_dishes;
create policy "users_insert_own_dishes" on public.user_dishes
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_dishes" on public.user_dishes;
create policy "users_update_own_dishes" on public.user_dishes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_dishes" on public.user_dishes;
create policy "users_delete_own_dishes" on public.user_dishes
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 11: public.user_dish_ingredients
-- ---------------------------------------------------------------------------
-- Child of user_dishes. food_id is soft-FK to canonical foods (text).
-- ===========================================================================

create table if not exists public.user_dish_ingredients (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dish_id uuid not null references public.user_dishes(id) on delete cascade,
  food_id text,
  food_name text not null,
  amount_g numeric not null,
  calories numeric not null,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  carb_g numeric not null default 0,
  fiber_g numeric,
  sodium_mg numeric,
  calcium_mg numeric,
  iron_mg numeric,
  vitamin_a_ug numeric,
  vitamin_b1_mg numeric,
  vitamin_b2_mg numeric,
  vitamin_b6_mg numeric,
  vitamin_b12_ug numeric,
  folate_ug numeric,
  vitamin_c_mg numeric,
  vitamin_d_ug numeric,
  vitamin_e_mg numeric,
  potassium_mg numeric,
  magnesium_mg numeric,
  zinc_mg numeric,
  cholesterol_mg numeric,
  saturated_fat_g numeric,
  sugar_g numeric,
  salt_g numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_dish_ingredients_user_updated_idx
  on public.user_dish_ingredients (user_id, updated_at desc);
create index if not exists user_dish_ingredients_user_dish_idx
  on public.user_dish_ingredients (user_id, dish_id);

drop trigger if exists user_dish_ingredients_set_updated_at on public.user_dish_ingredients;
create trigger user_dish_ingredients_set_updated_at
  before update on public.user_dish_ingredients
  for each row execute function public.set_updated_at();

alter table public.user_dish_ingredients enable row level security;
drop policy if exists "users_read_own_dish_ingredients" on public.user_dish_ingredients;
create policy "users_read_own_dish_ingredients" on public.user_dish_ingredients
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_dish_ingredients" on public.user_dish_ingredients;
create policy "users_insert_own_dish_ingredients" on public.user_dish_ingredients
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_dish_ingredients" on public.user_dish_ingredients;
create policy "users_update_own_dish_ingredients" on public.user_dish_ingredients
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_dish_ingredients" on public.user_dish_ingredients;
create policy "users_delete_own_dish_ingredients" on public.user_dish_ingredients
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 12: public.user_personal_records
-- ---------------------------------------------------------------------------
-- session_id is a soft-FK (text, no constraint): PRs survive session
-- deletion. record_type CHECK matches v15 of the local schema.
-- ===========================================================================

create table if not exists public.user_personal_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null,
  record_type text not null check (record_type in (
    'estimated_1rm', 'max_weight', 'max_volume_session', 'max_reps_at_weight',
    'max_duration', 'max_distance', 'max_calories'
  )),
  value numeric not null,
  weight_kg numeric not null,
  reps integer not null,
  achieved_at timestamptz not null,
  session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_personal_records_user_updated_idx
  on public.user_personal_records (user_id, updated_at desc);
create index if not exists user_personal_records_user_exercise_idx
  on public.user_personal_records (user_id, exercise_id, record_type, value desc);
create index if not exists user_personal_records_user_achieved_idx
  on public.user_personal_records (user_id, achieved_at desc);

drop trigger if exists user_personal_records_set_updated_at on public.user_personal_records;
create trigger user_personal_records_set_updated_at
  before update on public.user_personal_records
  for each row execute function public.set_updated_at();

alter table public.user_personal_records enable row level security;
drop policy if exists "users_read_own_personal_records" on public.user_personal_records;
create policy "users_read_own_personal_records" on public.user_personal_records
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_personal_records" on public.user_personal_records;
create policy "users_insert_own_personal_records" on public.user_personal_records
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_personal_records" on public.user_personal_records;
create policy "users_update_own_personal_records" on public.user_personal_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_personal_records" on public.user_personal_records;
create policy "users_delete_own_personal_records" on public.user_personal_records
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 13: public.user_water_logs
-- ===========================================================================

create table if not exists public.user_water_logs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ml integer not null,
  logged_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_water_logs_user_updated_idx
  on public.user_water_logs (user_id, updated_at desc);
create index if not exists user_water_logs_user_logged_idx
  on public.user_water_logs (user_id, logged_at desc);
create index if not exists user_water_logs_user_deleted_idx
  on public.user_water_logs (user_id, deleted_at);

drop trigger if exists user_water_logs_set_updated_at on public.user_water_logs;
create trigger user_water_logs_set_updated_at
  before update on public.user_water_logs
  for each row execute function public.set_updated_at();

alter table public.user_water_logs enable row level security;
drop policy if exists "users_read_own_water_logs" on public.user_water_logs;
create policy "users_read_own_water_logs" on public.user_water_logs
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_water_logs" on public.user_water_logs;
create policy "users_insert_own_water_logs" on public.user_water_logs
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_water_logs" on public.user_water_logs;
create policy "users_update_own_water_logs" on public.user_water_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_water_logs" on public.user_water_logs;
create policy "users_delete_own_water_logs" on public.user_water_logs
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 14: public.user_adaptive_goal_suggestions
-- ===========================================================================

create table if not exists public.user_adaptive_goal_suggestions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestion_json jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_adaptive_goal_user_updated_idx
  on public.user_adaptive_goal_suggestions (user_id, updated_at desc);
create index if not exists user_adaptive_goal_user_created_idx
  on public.user_adaptive_goal_suggestions (user_id, created_at desc);

drop trigger if exists user_adaptive_goal_set_updated_at on public.user_adaptive_goal_suggestions;
create trigger user_adaptive_goal_set_updated_at
  before update on public.user_adaptive_goal_suggestions
  for each row execute function public.set_updated_at();

alter table public.user_adaptive_goal_suggestions enable row level security;
drop policy if exists "users_read_own_adaptive_goal" on public.user_adaptive_goal_suggestions;
create policy "users_read_own_adaptive_goal" on public.user_adaptive_goal_suggestions
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_adaptive_goal" on public.user_adaptive_goal_suggestions;
create policy "users_insert_own_adaptive_goal" on public.user_adaptive_goal_suggestions
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_adaptive_goal" on public.user_adaptive_goal_suggestions;
create policy "users_update_own_adaptive_goal" on public.user_adaptive_goal_suggestions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_adaptive_goal" on public.user_adaptive_goal_suggestions;
create policy "users_delete_own_adaptive_goal" on public.user_adaptive_goal_suggestions
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 15: public.user_weekly_reports
-- ---------------------------------------------------------------------------
-- 1 row per (user, week_start). Cache-like — re-derivable from raw data,
-- but persisting saves recomputation across devices.
-- ===========================================================================

create table if not exists public.user_weekly_reports (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  data_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create unique index if not exists user_weekly_reports_user_week_unique
  on public.user_weekly_reports (user_id, week_start)
  where deleted_at is null;
create index if not exists user_weekly_reports_user_updated_idx
  on public.user_weekly_reports (user_id, updated_at desc);

drop trigger if exists user_weekly_reports_set_updated_at on public.user_weekly_reports;
create trigger user_weekly_reports_set_updated_at
  before update on public.user_weekly_reports
  for each row execute function public.set_updated_at();

alter table public.user_weekly_reports enable row level security;
drop policy if exists "users_read_own_weekly_reports" on public.user_weekly_reports;
create policy "users_read_own_weekly_reports" on public.user_weekly_reports
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_weekly_reports" on public.user_weekly_reports;
create policy "users_insert_own_weekly_reports" on public.user_weekly_reports
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_weekly_reports" on public.user_weekly_reports;
create policy "users_update_own_weekly_reports" on public.user_weekly_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_weekly_reports" on public.user_weekly_reports;
create policy "users_delete_own_weekly_reports" on public.user_weekly_reports
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 16: public.user_progress_photos
-- ---------------------------------------------------------------------------
-- METADATA ONLY (per design Part 4-3): no Storage bucket binding in this
-- migration. photo_uri is whatever the client recorded — typically a
-- file:// URI from the device's document directory. After device transfer
-- the URI won't resolve; rendering code falls back to a placeholder.
-- A future phase can add a Storage bucket + path column.
-- ===========================================================================

create table if not exists public.user_progress_photos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  photo_uri text not null,
  pose_type text not null default 'front',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_progress_photos_user_updated_idx
  on public.user_progress_photos (user_id, updated_at desc);
create index if not exists user_progress_photos_user_date_idx
  on public.user_progress_photos (user_id, date desc);

drop trigger if exists user_progress_photos_set_updated_at on public.user_progress_photos;
create trigger user_progress_photos_set_updated_at
  before update on public.user_progress_photos
  for each row execute function public.set_updated_at();

alter table public.user_progress_photos enable row level security;
drop policy if exists "users_read_own_progress_photos" on public.user_progress_photos;
create policy "users_read_own_progress_photos" on public.user_progress_photos
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_progress_photos" on public.user_progress_photos;
create policy "users_insert_own_progress_photos" on public.user_progress_photos
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_progress_photos" on public.user_progress_photos;
create policy "users_update_own_progress_photos" on public.user_progress_photos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_progress_photos" on public.user_progress_photos;
create policy "users_delete_own_progress_photos" on public.user_progress_photos
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- Table 17: public.user_custom_exercises
-- ---------------------------------------------------------------------------
-- Only is_custom=true rows from local exercises sync. Canonical seeded
-- exercises stay local — they're identical across all users. exercise_type
-- and met_value (v12) supported.
-- ===========================================================================

create table if not exists public.user_custom_exercises (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name_ja text not null,
  name_en text,
  muscle_group text not null,
  secondary_muscles text,
  equipment text,
  default_rest_seconds integer not null default 90,
  exercise_type text not null default 'strength'
    check (exercise_type in ('strength', 'cardio', 'sports', 'other')),
  met_value numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

create index if not exists user_custom_exercises_user_updated_idx
  on public.user_custom_exercises (user_id, updated_at desc);
create index if not exists user_custom_exercises_user_deleted_idx
  on public.user_custom_exercises (user_id, deleted_at);

drop trigger if exists user_custom_exercises_set_updated_at on public.user_custom_exercises;
create trigger user_custom_exercises_set_updated_at
  before update on public.user_custom_exercises
  for each row execute function public.set_updated_at();

alter table public.user_custom_exercises enable row level security;
drop policy if exists "users_read_own_custom_exercises" on public.user_custom_exercises;
create policy "users_read_own_custom_exercises" on public.user_custom_exercises
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_custom_exercises" on public.user_custom_exercises;
create policy "users_insert_own_custom_exercises" on public.user_custom_exercises
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_custom_exercises" on public.user_custom_exercises;
create policy "users_update_own_custom_exercises" on public.user_custom_exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_custom_exercises" on public.user_custom_exercises;
create policy "users_delete_own_custom_exercises" on public.user_custom_exercises
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- End of user-sync table creation.
-- 17 tables + profiles ALTER. After this file applies, the server side has
-- the full surface that the cloud sync layer (next commits) writes against.
-- ===========================================================================
