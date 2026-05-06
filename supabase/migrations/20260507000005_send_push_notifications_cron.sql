-- pg_cron schedule for the notification_outbox drainer
-- (Build 15 / Feature 3, Session 4 commit 4).
--
-- Runs every minute. Reads the cron-auth secret from Supabase Vault
-- and POSTs to the send-push-notifications Edge Function (deployed
-- separately via `supabase functions deploy`).
--
-- ─────────────────────────────────────────────────────────────────────
-- IMPORTANT — secret is NOT stored in this migration.
-- ─────────────────────────────────────────────────────────────────────
--
-- This file references vault.decrypted_secrets at job-fire time. The
-- secret itself must be created ONCE in the SQL Editor by hand (see
-- Hard stop #1 procedure). Re-running `vault.create_secret(...)` with
-- the same name raises a uniqueness error — do NOT include the secret
-- creation in any committed file.
--
-- The same secret value also lives in the Edge Function's CRON_SECRET
-- env var (set via Supabase Dashboard → Functions → Settings). Rotation
-- requires updating both.
--
-- Rollback:
--   select cron.unschedule('drain-notification-outbox');
--   -- (vault secret stays; explicit `vault.delete_secret(...)` if desired)

-- Prerequisites (must be enabled in the Supabase project; verified
-- by Syuto in Session 4 sign-off):
--   - pg_cron     (scheduler)
--   - pg_net      (HTTP client for net.http_post)
--   - supabase_vault (decrypted_secrets view)

select cron.schedule(
  'drain-notification-outbox',
  '* * * * *',  -- every minute
  $$
  select net.http_post(
    url := 'https://ycjenvbckffljwnekkll.supabase.co/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'cron_secret_send_push_notifications'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verification (run AFTER apply, in SQL Editor):
--
--   -- 1. Confirm the job is registered.
--   select jobid, schedule, jobname, active
--     from cron.job
--    where jobname = 'drain-notification-outbox';
--   -- Expected: 1 row, schedule='* * * * *', active=true
--
--   -- 2. Wait ≥ 1 minute, then confirm the job is firing.
--   select status, return_message, start_time, end_time
--     from cron.job_run_details
--    where jobid = (
--      select jobid from cron.job where jobname = 'drain-notification-outbox'
--    )
--    order by start_time desc
--    limit 5;
--   -- Expected first run: status='succeeded' and return_message
--   -- contains the Edge Function's JSON response
--   -- (e.g. {"processed":0,"sent":0,"batch_limit":50}).
--
--   -- 3. Common failure surface — Vault secret missing:
--   --    return_message will contain a NULL Authorization header and
--   --    the Edge Function returns 401 'unauthorized'. Resolution:
--   --    create the secret per the Hard stop #1 procedure.
--
--   -- 4. End-to-end smoke test (combined with notification_outbox
--   --    trigger from migration 20260507000003):
--   begin;
--     select id, name_ja, submitted_by from public.public_foods
--      where status = 'approved' limit 1;
--     update public.public_foods set use_count = 0 where id = '<paste-id>';
--     update public.public_foods set use_count = 1 where id = '<paste-id>';
--     -- (verify outbox row materialized)
--     select id, sent_at from public.notification_outbox
--      where user_id = '<paste-submitted_by>'
--      order by created_at desc limit 1;
--     -- (wait ≥ 1 min, then check sent_at is no longer NULL)
--   rollback;  -- discard the use_count flip; the outbox row stays since
--              -- it was inserted via a separate trigger transaction
