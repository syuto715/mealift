-- ===========================================================================
-- Build 15 / Session 6 / v26 server companion
-- ---------------------------------------------------------------------------
-- 5-B: user_estimated_1rm — append-only working-set 1RM observation log.
--      No UNIQUE(user_id, exercise_id) per Session 6 sign-off (Option β):
--      every significant working set produces a row; chart pulls last 90
--      days, current = ORDER BY observed_at DESC LIMIT 1.
--
-- 5-O: user_workout_sets.set_type — enum-like marker for set role
--      (warmup / working / top / drop / failure). CHECK constraint on
--      this table (and on user_workout_routine_items.set_pattern) is the
--      server-side gate — local SQLite ALTER TABLE can't add CHECK to
--      existing tables, so the canonical enum lives here.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP CONSTRAINT IF EXISTS before re-adding CHECK so re-applying the
-- migration is safe.
-- ===========================================================================

-- ===========================================================================
-- Table: public.user_estimated_1rm
-- ===========================================================================

create table if not exists public.user_estimated_1rm (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null,
  e1rm_kg numeric not null,
  formula text not null check (formula in ('epley', 'brzycki', 'avg')),
  source_set_id uuid,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

-- Composite index covers both query shapes (chart history /
-- current-latest). updated_at index supports the sync pull pattern.
create index if not exists user_estimated_1rm_user_exercise_observed_idx
  on public.user_estimated_1rm (user_id, exercise_id, observed_at);
create index if not exists user_estimated_1rm_user_updated_idx
  on public.user_estimated_1rm (user_id, updated_at desc);

drop trigger if exists user_estimated_1rm_set_updated_at on public.user_estimated_1rm;
create trigger user_estimated_1rm_set_updated_at
  before update on public.user_estimated_1rm
  for each row execute function public.set_updated_at();

alter table public.user_estimated_1rm enable row level security;
drop policy if exists "users_read_own_estimated_1rm" on public.user_estimated_1rm;
create policy "users_read_own_estimated_1rm" on public.user_estimated_1rm
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_estimated_1rm" on public.user_estimated_1rm;
create policy "users_insert_own_estimated_1rm" on public.user_estimated_1rm
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_estimated_1rm" on public.user_estimated_1rm;
create policy "users_update_own_estimated_1rm" on public.user_estimated_1rm
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users_delete_own_estimated_1rm" on public.user_estimated_1rm;
create policy "users_delete_own_estimated_1rm" on public.user_estimated_1rm
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- ALTER: public.user_workout_sets.set_type
-- ---------------------------------------------------------------------------
-- Enum (CHECK): warmup | working | top | drop | failure (5 values).
-- AMRAP deferred to v2 per Session 6 sign-off; not in the constraint.
-- DEFAULT 'working' so existing rows backfill cleanly.
-- ===========================================================================

alter table public.user_workout_sets
  add column if not exists set_type text not null default 'working';

alter table public.user_workout_sets
  drop constraint if exists user_workout_sets_set_type_check;
alter table public.user_workout_sets
  add constraint user_workout_sets_set_type_check
  check (set_type in ('warmup', 'working', 'top', 'drop', 'failure'));

-- Backfill: existing is_warmup=true rows get set_type='warmup'.
-- Idempotent — only touches rows still on the default.
update public.user_workout_sets
   set set_type = 'warmup'
 where is_warmup = true and set_type = 'working';

-- ===========================================================================
-- ALTER: public.user_workout_routine_items.set_pattern + pattern_config
-- ---------------------------------------------------------------------------
-- set_pattern: NULL (standard) | '5x5' | 'top_set' | 'drop_set'.
-- pattern_config: optional JSON for parameters (e.g. drop count / percents).
-- Both nullable; existing routines remain valid (NULL = standard).
-- ===========================================================================

alter table public.user_workout_routine_items
  add column if not exists set_pattern text;

alter table public.user_workout_routine_items
  drop constraint if exists user_workout_routine_items_set_pattern_check;
alter table public.user_workout_routine_items
  add constraint user_workout_routine_items_set_pattern_check
  check (set_pattern is null or set_pattern in ('5x5', 'top_set', 'drop_set'));

alter table public.user_workout_routine_items
  add column if not exists pattern_config text;

-- ===========================================================================
-- Verification queries (manual; not run by migration)
-- ===========================================================================
-- select count(*) from public.user_estimated_1rm;  -- expect 0 on fresh apply
-- select set_type, count(*) from public.user_workout_sets group by set_type;
-- select set_pattern, count(*) from public.user_workout_routine_items group by set_pattern;
