-- v1.6.0 Sprint 1b — C-1 column lock STEP B.
--
-- 🛑 DO NOT APPLY until the payload-removed client build (the one that drops
--    plan_expires_at / plan_billing_cycle / trial_started_at from the
--    profileSync push payload — SUBSCRIPTION_PAYLOAD_SCHEMA = 2) is the FLOOR
--    of active clients. Applying earlier makes every older client's profile
--    upsert fail with 42501 (it still SETs those columns), which dead-letters
--    the ENTIRE profile sync (display_name / weight / goals included) after
--    MAX_RETRIES — a permanent sync stop, not a transient error.
--
-- Floor-confirmation query (run before applying; must return 0):
--
--   select count(*) as stragglers
--   from public.profiles
--   where deleted_at is null
--     and updated_at > now() - interval '30 days'   -- "recently active"
--     and (last_seen_app_version is null or last_seen_app_version < 2);
--
--   - last_seen_app_version is stamped by markAppVersionSeen() on launch
--     (= SUBSCRIPTION_PAYLOAD_SCHEMA). NULL ⇒ a pre-v1.6 client that never
--     stamped it ⇒ still pushes the 3 columns ⇒ NOT safe to lock yet.
--   - Widen/narrow the 30-day window to taste; the invariant is "no active
--     client below schema 2 remains".
--
-- ─────────────────────────────────────────────────────────────────────────
-- Locks the remaining 3 subscription columns (now server-only, written by
-- start-trial + sync-subscription/webhook):
--     plan_expires_at, plan_billing_cycle, trial_started_at
--
-- Same revoke-table-then-grant-columns pattern as step A (a column-level
-- REVOKE would be a no-op against Supabase's default table-level grant).
-- This GRANT list is step A's list MINUS the 3 now-locked columns → all 6
-- subscription columns are server-only after this.
-- ─────────────────────────────────────────────────────────────────────────

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
  estimated_target_date, timezone, last_seen_app_version
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
  estimated_target_date, timezone, last_seen_app_version
) on public.profiles to authenticated;

-- After this, all 6 of { plan, subscription_status, subscription_updated_at,
-- plan_expires_at, plan_billing_cycle, trial_started_at } are server-only.
-- deriveEffectivePlan's client-pushed-column escalation (plan_expires_at /
-- trial_started_at → Plus) is closed: the client can no longer write them.
--
-- Post-apply verification (authenticated user via PostgREST):
--   PATCH profiles { "plan_expires_at": "2099-01-01" } → 42501 / 403
--   PATCH profiles { "trial_started_at": "2026-01-01" } → 42501 / 403
--   profileSync of display_name / weight / goals → still 204 OK
