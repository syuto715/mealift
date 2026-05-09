-- ===========================================================================
-- Build 16 / Phase 4.0 / Feature F — user_deload_recommendations
-- ---------------------------------------------------------------------------
-- Pro-tier auto-detected deload suggestions plus their lifecycle state.
-- Mirrors the local v29 schema; sync module
-- (src/infra/supabase/sync/deloadRecommendationSync.ts) translates
-- profile_id ↔ user_id at the wire boundary.
--
-- State machine (open):
--   detected (row inserted)
--     → applied (user accepts via banner CTA;
--                applied_at + applied_routine_id set)
--     → dismissed (user explicitly rejects;
--                  dismissed_at set, mutually exclusive with applied)
--     → completed (post-deload week finishes;
--                  completed_at set; only valid after applied)
-- Repository helpers enforce these transitions on the client side; the
-- DB schema does not (would over-constrain future state additions).
--
-- source_week_starts and affected_muscles are jsonb arrays. Storing as
-- jsonb instead of text[] keeps the sync layer transport-agnostic and
-- aligned with how user_weekly_reports.data_json is already shipped.
--
-- applied_routine_id is a soft reference into user_workout_routines —
-- no FK constraint, because cross-table sync ordering may delete the
-- routine before the recommendation row catches up. Clients render
-- "deload routine missing" gracefully.
-- ===========================================================================

create table if not exists public.user_deload_recommendations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  detected_at timestamptz not null,
  source_week_starts jsonb not null,
  affected_muscles jsonb not null,
  applied_at timestamptz,
  applied_routine_id uuid,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_version integer not null default 1
);

-- Unique on (user_id, detected_at) — the local ON CONFLICT clause
-- relies on this, and it doubles as a guard against the runtime
-- detector inserting two rows for the same instant from concurrent
-- screen mounts.
create unique index if not exists user_deload_recommendations_user_detected_unique
  on public.user_deload_recommendations (user_id, detected_at)
  where deleted_at is null;

-- Index for the "active recommendations" query the banner UI runs.
create index if not exists user_deload_recommendations_user_active_idx
  on public.user_deload_recommendations (user_id, detected_at desc)
  where deleted_at is null
    and applied_at is null
    and dismissed_at is null;

-- Watermark / pull cursor index — every per-resource sync module pulls
-- by (user_id, updated_at) so add the matching descending index.
create index if not exists user_deload_recommendations_user_updated_idx
  on public.user_deload_recommendations (user_id, updated_at desc);

drop trigger if exists user_deload_recommendations_set_updated_at
  on public.user_deload_recommendations;
create trigger user_deload_recommendations_set_updated_at
  before update on public.user_deload_recommendations
  for each row execute function public.set_updated_at();

alter table public.user_deload_recommendations enable row level security;

drop policy if exists "users_read_own_deload_recommendations"
  on public.user_deload_recommendations;
create policy "users_read_own_deload_recommendations"
  on public.user_deload_recommendations for select
  using (auth.uid() = user_id);

drop policy if exists "users_insert_own_deload_recommendations"
  on public.user_deload_recommendations;
create policy "users_insert_own_deload_recommendations"
  on public.user_deload_recommendations for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_update_own_deload_recommendations"
  on public.user_deload_recommendations;
create policy "users_update_own_deload_recommendations"
  on public.user_deload_recommendations for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users_delete_own_deload_recommendations"
  on public.user_deload_recommendations;
create policy "users_delete_own_deload_recommendations"
  on public.user_deload_recommendations for delete
  using (auth.uid() = user_id);
