-- ===========================================================================
-- Build 15 / Session 7 / v27 server companion
-- ---------------------------------------------------------------------------
-- 5-C: profiles.plate_step_kg — per-user plate rounding granularity for
--      the Easy/Normal/Hard recommendation engine. CHECK pins value to
--      one of {0.5, 1.0, 1.25, 2.5} kg per design §6.6.4.
--
-- 5-C / Phase 3 front-load: extend user_estimated_1rm.formula CHECK
--      with 'adjusted' so Phase 3's RPE adjustment row inserts (§7.3
--      ±% adjustments to e1rm) pass server-side validation. Pulling
--      this CHECK update into Phase 1's migration avoids a separate
--      migration round-trip when Phase 3 ships.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS
-- before re-adding CHECK so re-applying the migration is safe.
-- ===========================================================================

-- ===========================================================================
-- ALTER: public.profiles.plate_step_kg
-- ---------------------------------------------------------------------------
-- numeric not null default 2.5 + CHECK (one of 0.5 / 1.0 / 1.25 / 2.5).
-- ===========================================================================

alter table public.profiles
  add column if not exists plate_step_kg numeric not null default 2.5;

alter table public.profiles
  drop constraint if exists profiles_plate_step_kg_check;
alter table public.profiles
  add constraint profiles_plate_step_kg_check
  check (plate_step_kg in (0.5, 1.0, 1.25, 2.5));

-- ===========================================================================
-- ALTER: public.user_estimated_1rm.formula CHECK extension
-- ---------------------------------------------------------------------------
-- 'adjusted' joins {epley, brzycki, avg}. Used by Phase 3's RPE
-- adjustment hook to insert post-feedback observations distinguishable
-- from the raw formula output. The chart renders both kinds; future
-- analytics can split by formula to tell "raw observation" from
-- "feedback-adjusted observation".
-- ===========================================================================

alter table public.user_estimated_1rm
  drop constraint if exists user_estimated_1rm_formula_check;
alter table public.user_estimated_1rm
  add constraint user_estimated_1rm_formula_check
  check (formula in ('epley', 'brzycki', 'avg', 'adjusted'));

-- ===========================================================================
-- Verification queries (manual; not run by migration)
-- ===========================================================================
-- select plate_step_kg, count(*) from public.profiles group by plate_step_kg;
-- expect: 2.5 / N (existing rows defaulted)
--
-- select pg_get_constraintdef(c.oid) from pg_constraint c
--   where conname = 'user_estimated_1rm_formula_check';
-- expect: CHECK ((formula = ANY (ARRAY['epley', 'brzycki', 'avg', 'adjusted'])))
