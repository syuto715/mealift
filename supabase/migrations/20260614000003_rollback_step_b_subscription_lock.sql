-- v1.6.0 Sprint 1b — 🔴 EMERGENCY ROLLBACK of step B (20260614000002).
--
-- WHY: step B (REVOKE UPDATE/INSERT of plan_expires_at / plan_billing_cycle /
-- trial_started_at from `authenticated`) was applied to production BEFORE the
-- payload-removed client build became the floor. The distributed v1.5.0 client
-- still SETs those 3 columns in its profileSync UPSERT, so every profile push
-- now fails with 42501 → after MAX_RETRIES the row is dead-lettered →
-- profile sync (weight / goals / display_name included) is permanently stuck.
--
-- This forward migration reverses ONLY step B's effect. It does NOT re-grant
-- the step A columns (plan / subscription_status / subscription_updated_at) —
-- those stay LOCKED (the main C-1 escalation hole stays closed).
--
-- Resulting state == exactly the post-step-A state:
--   - LOCKED (server-only):    plan, subscription_status, subscription_updated_at
--   - client-writable again:   plan_expires_at, plan_billing_cycle, trial_started_at
--
-- The allow-lists below are byte-for-byte step A's lists (which already
-- INCLUDE the 3 step-B columns and EXCLUDE the 3 step-A columns), so applying
-- this restores the intended interim state. step B should be RE-APPLIED only
-- after the floor-confirmation SQL in 20260614000002 returns 0.
--
-- Same revoke-table-then-grant-columns pattern (a bare `GRANT UPDATE (col)`
-- without first revoking would still leave step B's restricted table grant in
-- place incorrectly; re-establishing the full table-level revoke + the wider
-- column grant is the deterministic way to land in step-A state).
--
-- ⚠️ MAINTENANCE: this list must mirror step A. If profiles gains a new
--    non-subscription column later, keep step A / this file / step B in sync.

revoke update on public.profiles from authenticated;
grant update (
  created_at, updated_at, display_name, gender, birth_year, height_cm,
  current_weight_kg, target_weight_kg, target_body_fat_pct, goal_type,
  activity_level, training_days_per_week, target_date, equipment,
  target_calories, target_protein_g, target_fat_g, target_carb_g,
  onboarding_completed, adaptive_goal_enabled, adaptive_goal_sensitivity,
  adaptive_goal_last_shown_at, daily_water_target_ml, onboarding_version,
  deleted_at, client_version, notifications_submission_enabled, plate_step_kg,
  nickname, weekly_rate_pct, meal_plan, meal_timings, protein_factor,
  weekly_distribution, cheat_days, onboarding_step, onboarding_started_at,
  estimated_target_date, timezone, last_seen_app_version,
  -- RESTORED by this rollback (step B had removed these):
  plan_expires_at, plan_billing_cycle, trial_started_at
) on public.profiles to authenticated;

revoke insert on public.profiles from authenticated;
grant insert (
  id, created_at, updated_at, display_name, gender, birth_year, height_cm,
  current_weight_kg, target_weight_kg, target_body_fat_pct, goal_type,
  activity_level, training_days_per_week, target_date, equipment,
  target_calories, target_protein_g, target_fat_g, target_carb_g,
  onboarding_completed, adaptive_goal_enabled, adaptive_goal_sensitivity,
  adaptive_goal_last_shown_at, daily_water_target_ml, onboarding_version,
  deleted_at, client_version, notifications_submission_enabled, plate_step_kg,
  nickname, weekly_rate_pct, meal_plan, meal_timings, protein_factor,
  weekly_distribution, cheat_days, onboarding_step, onboarding_started_at,
  estimated_target_date, timezone, last_seen_app_version,
  -- RESTORED by this rollback (step B had removed these):
  plan_expires_at, plan_billing_cycle, trial_started_at
) on public.profiles to authenticated;

-- step A columns (plan / subscription_status / subscription_updated_at) remain
-- absent from both grants on purpose → still server-only / locked.

-- ─────────────────────────────────────────────────────────────────────────
-- Post-apply verification (authenticated user via PostgREST):
--   PATCH /rest/v1/profiles?id=eq.<self> {"plan_expires_at":"2099-01-01"} → 204 OK   (restored)
--   PATCH /rest/v1/profiles?id=eq.<self> {"trial_started_at":"2026-01-01"} → 204 OK  (restored)
--   PATCH /rest/v1/profiles?id=eq.<self> {"plan":"pro"}                    → 42501/403 (still locked)
--   PATCH /rest/v1/profiles?id=eq.<self> {"display_name":"x"}              → 204 OK
--
-- Confirm the column privileges directly:
--   select column_name, privilege_type
--   from information_schema.column_privileges
--   where grantee = 'authenticated' and table_name = 'profiles'
--     and column_name in ('plan_expires_at','plan_billing_cycle','trial_started_at',
--                         'plan','subscription_status','subscription_updated_at')
--   order by column_name, privilege_type;
--   -- expect: the 3 plan_expires_at/billing/trial rows present for UPDATE & INSERT;
--   --         the 3 plan/subscription_* rows ABSENT.
-- ─────────────────────────────────────────────────────────────────────────
