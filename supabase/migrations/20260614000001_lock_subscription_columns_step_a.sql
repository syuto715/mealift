-- v1.6.0 Sprint 1b — C-1 column lock STEP A.
--
-- ⚠️ APPLY ONLY AFTER the revenuecat-webhook EF is deployed and verified.
--    (Before that, nothing writes `plan` server-side, so locking it strands
--    paying users at free. Order: deploy EFs → verify webhook → apply step A.)
--
-- Locks the 3 ALWAYS-server-written subscription columns against the
-- `authenticated` role:
--     plan, subscription_status, subscription_updated_at
--
-- These are SAFE to lock immediately because NO client (not even the
-- distributed v1.5.0) ever writes them through profileSync — the only client
-- writer was applyCustomerInfoToProfile's direct update, which on v1.5.0
-- no-ops (0-row `.eq('user_id')`) and is removed entirely in v1.6.
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHY revoke-table-then-grant-columns (NOT `revoke update (cols)`):
--   Supabase grants the `authenticated` role TABLE-LEVEL update/insert on
--   public tables by default. A column-level `REVOKE UPDATE (plan) ...` does
--   NOT subtract a column from a table-level grant — it only removes a
--   column-level grant, so it would be a silent NO-OP here. The correct
--   pattern is: REVOKE the table-level privilege, then GRANT it back on the
--   explicit allow-list of NON-locked columns.
--
-- ⚠️ MAINTENANCE: this allow-list must list EVERY non-locked profiles column.
--    When a future migration ADDs a (non-subscription) column to profiles,
--    it must be appended to these GRANTs or the client can no longer
--    write it. (Subscription columns are intentionally excluded.)
-- ─────────────────────────────────────────────────────────────────────────

-- Step-A allow-list = every profiles column EXCEPT { plan, subscription_status,
-- subscription_updated_at }. It STILL INCLUDES { plan_expires_at,
-- plan_billing_cycle, trial_started_at } because the distributed v1.5.0 client
-- still SETs those in its profileSync upsert — removing them here (instead of
-- in step B, after the payload-removed build is the floor) would 42501 the
-- whole profile upsert and dead-letter sync.

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
  -- still client-writable until step B:
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
  -- still client-insertable until step B:
  plan_expires_at, plan_billing_cycle, trial_started_at
) on public.profiles to authenticated;

-- service_role keeps full access (the EFs bypass these grants entirely);
-- nothing to do — service_role is never revoked here.

-- Post-apply verification (run as an authenticated user via PostgREST):
--   PATCH /rest/v1/profiles?id=eq.<self> { "plan": "pro" }   → 42501 / 403
--   PATCH /rest/v1/profiles?id=eq.<self> { "display_name": "x" } → 204 OK
