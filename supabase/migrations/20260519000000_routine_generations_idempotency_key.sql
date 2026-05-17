-- v1.5 Stage 1 Phase 1.5 Codex round 2 Critical fix — add an
-- idempotency_key column + partial unique index on
-- routine_generations so the coach-routine EF can hold a
-- persistence-step race-safe contract analogous to:
--   * chat_messages.idempotency_key (Phase 1.1, migration
--     20260518000000 line 88)
--   * coach_advice unique (user_id, scope, period_start)
--     (Phase 1.4, same migration line 128)
--
-- Same-key concurrent first-flight races previously could BOTH
-- pass the read-before-write idempotency lookup, BOTH INSERT a
-- placeholder, BOTH spend quota, BOTH call Gemini. The partial
-- unique index now fires at STEP 7 INSERT instead of at STEP 11
-- UPDATE, aborting the second request BEFORE any mutable state
-- (ai_usage_logs, Gemini call) lands.
--
-- The 24h-retention cleanup hour cron NULLs stale keys; the
-- partial-index predicate `WHERE idempotency_key IS NOT NULL`
-- drops NULLed rows out of the index automatically, matching the
-- chat_messages pattern.

alter table if exists public.routine_generations
  add column if not exists idempotency_key text;

-- Per-user partial unique. Phase 1.5 Codex round 3 fix: the
-- earlier shape (`(idempotency_key)` alone) was technically valid
-- for the per-user race we care about, but a same-key collision
-- across DIFFERENT users would land 23505 + a user-scoped winner
-- lookup miss + a 500. Per-user composite avoids that cross-user
-- false positive while keeping the partial-index NULL retention
-- behavior intact.
create unique index if not exists routine_generations_idempotency_key_unique
  on public.routine_generations (user_id, idempotency_key)
  where idempotency_key is not null;
