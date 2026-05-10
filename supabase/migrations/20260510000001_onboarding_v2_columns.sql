-- ===========================================================================
-- v1.3.0 / Onboarding v2 — profiles columns
-- ---------------------------------------------------------------------------
-- Mirrors src/infra/database/migrations/v30.ts. 10 new columns on
-- profiles for the multi-step onboarding the v1.3.0 client introduces.
-- Existing rows are preserved; new columns default NULL and get
-- populated as users run through the new flow.
--
-- CHECK constraints live here (server-side) per the v26 convention:
-- the SQLite client relies on TypeScript-union app-level validation,
-- and the server CHECK rejects any out-of-domain row that slips
-- through (or is hand-edited / produced by a future client bug).
--
-- All ADDs are guarded with IF NOT EXISTS so re-running is safe.
-- RLS policies on the existing profiles table apply transparently
-- to the new columns — no separate policy needed.
-- ===========================================================================

alter table public.profiles add column if not exists nickname text;

alter table public.profiles add column if not exists weekly_rate_pct real
  check (weekly_rate_pct is null or weekly_rate_pct between -1.5 and 0.5);

alter table public.profiles add column if not exists meal_plan text
  check (meal_plan is null or meal_plan in
    ('balanced', 'washoku', 'high_protein', 'low_carb', 'fasting'));

alter table public.profiles add column if not exists meal_timings jsonb;

alter table public.profiles add column if not exists protein_factor real
  check (protein_factor is null or protein_factor in (1.0, 1.6, 2.2, 3.0));

alter table public.profiles add column if not exists weekly_distribution text
  check (weekly_distribution is null or weekly_distribution in
    ('even', 'cheat_days'));

alter table public.profiles add column if not exists cheat_days jsonb;

alter table public.profiles add column if not exists onboarding_step
  integer not null default 0;

alter table public.profiles add column if not exists onboarding_started_at
  timestamptz;

alter table public.profiles add column if not exists estimated_target_date
  timestamptz;
