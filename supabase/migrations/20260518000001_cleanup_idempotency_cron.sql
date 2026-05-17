-- v1.5 Stage 1 Phase 1.1.2 — pg_cron schedule for the
-- cleanup-idempotency-keys Edge Function.
--
-- Phase 1.1 §5.1 retention contract: every 24h, the
-- `chat_messages.idempotency_key` column is NULLed for rows older
-- than the retention window so the partial unique index frees
-- the key for reuse. The EF performs the UPDATE; this migration
-- schedules the hourly hit.
--
-- ─────────────────────────────────────────────────────────────────────
-- IMPORTANT — secret is NOT stored in this migration.
-- ─────────────────────────────────────────────────────────────────────
--
-- This file references `vault.decrypted_secrets` at job-fire time.
-- The secret itself must be created ONCE in the SQL Editor by
-- hand. Mirrors the established precedent in
-- `20260507000005_send_push_notifications_cron.sql`.
--
-- Operator procedure (run ONCE in the Supabase SQL Editor before
-- applying this migration):
--
--   select vault.create_secret(
--     '<the-CRON_SECRET-hex-value>',
--     'cron_secret_cleanup_idempotency_keys',
--     'CRON_SECRET for cleanup-idempotency-keys EF'
--   );
--
-- The same secret value also lives in the Edge Function's
-- CRON_SECRET env var (set via Supabase Dashboard → Functions →
-- Settings). Rotation requires updating both.
--
-- Rollback:
--   select cron.unschedule('cleanup-idempotency-keys-hourly');
--   -- (vault secret stays; explicit vault.delete_secret(...) if desired)
--
-- Prerequisites (already enabled in the Mealift project, per the
-- send_push_notifications_cron precedent):
--   - pg_cron        (scheduler)
--   - pg_net         (HTTP client for net.http_post)
--   - supabase_vault (decrypted_secrets view)

select cron.schedule(
  'cleanup-idempotency-keys-hourly',
  '0 * * * *',  -- top of every hour
  $$
  select net.http_post(
    url := 'https://ycjenvbckffljwnekkll.supabase.co/functions/v1/cleanup-idempotency-keys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'cron_secret_cleanup_idempotency_keys'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Verification (run AFTER apply, in SQL Editor):
--
--   -- 1. Confirm the job is registered.
--   select jobid, schedule, jobname, active
--     from cron.job
--    where jobname = 'cleanup-idempotency-keys-hourly';
--   -- Expected: 1 row, schedule='0 * * * *', active=true
--
--   -- 2. Wait ≥ 1 hour (or trigger via direct EF call to confirm
--   --    the EF + CRON_SECRET path works), then check the job
--   --    is firing:
--   select status, return_message, start_time, end_time
--     from cron.job_run_details
--    where jobid = (
--      select jobid from cron.job
--       where jobname = 'cleanup-idempotency-keys-hourly'
--    )
--    order by start_time desc
--    limit 5;
--   -- Expected: status='succeeded'; return_message contains
--   -- {"cleared":<n>,"cutoff":"<iso>","function_name":"cleanup-idempotency-keys"}.
--
--   -- 3. Common failure surface — Vault secret missing:
--   --    return_message will contain a NULL Authorization header
--   --    and the EF will return 401. Resolution: run the
--   --    `vault.create_secret(...)` block above.
