-- notification_outbox + first-use trigger (Build 15 / Feature 3).
--
-- Purpose: queue a "your submission was used by someone else" push
-- notification when public_foods.use_count transitions 0 → 1 on an
-- approved row. The Edge Function send-push-notifications drains this
-- queue every minute (Session 4 commit 4) and POSTs to Expo Push API.
--
-- Build 15 scope: 'submission_used' kind only. Build 16+ extends with
-- 'submission_approved' (manual review queue → approved transition).
-- The kind enum CHECK is intentionally narrow today; widening is a
-- single ALTER TABLE statement.
--
-- Self-notification suppression: WHEN clause includes
-- `auth.uid() is distinct from new.submitted_by` so submitters logging
-- their own food don't notify themselves. NULL caller (e.g., SQL
-- Editor admin updates) is treated as distinct from a non-NULL
-- submitter UUID, so manual verification updates still fire the
-- trigger. submitter UUIDs are NOT NULL on public_foods.submitted_by
-- (FK to auth.users).
--
-- Rollback:
--   drop trigger if exists trg_queue_first_use_notification on public.public_foods;
--   drop function if exists public.queue_first_use_notification();
--   drop index if exists public.notification_outbox_pending_idx;
--   drop table if exists public.notification_outbox;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('submission_used')),
  title text not null,
  body text not null,
  payload jsonb,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Partial index speeds up the cron drainer's "give me the unsent rows"
-- read path. attempt_count cap is enforced at SELECT time, not as a
-- partial-index condition, so the index stays small even when failed
-- rows accumulate.
create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (created_at) where sent_at is null;

-- RLS enabled; deny-by-default. The only consumer is the Edge Function
-- (Session 4 commit 3), which uses the service role key and bypasses
-- RLS. Authenticated users have no need to read or write this table
-- directly — the toggle goes through profiles.notifications_submission_enabled.
alter table public.notification_outbox enable row level security;

-- Trigger function: on a 0→1 use_count transition for an approved row
-- where the user logging the food is NOT the submitter, enqueue a
-- push notification addressed at the submitter.
create or replace function public.queue_first_use_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_outbox (user_id, kind, title, body, payload)
  values (
    new.submitted_by,
    'submission_used',
    '投稿が使われました',
    '「' || new.name_ja || '」が他のユーザーに使われました',
    jsonb_build_object('food_id', new.id, 'name_ja', new.name_ja)
  );
  return new;
end;
$$;

drop trigger if exists trg_queue_first_use_notification on public.public_foods;
create trigger trg_queue_first_use_notification
  after update of use_count on public.public_foods
  for each row
  when (
    old.use_count = 0
    and new.use_count = 1
    and new.status = 'approved'
    and auth.uid() is distinct from new.submitted_by
  )
  execute function public.queue_first_use_notification();

-- Verification (run AFTER apply, in SQL Editor where auth.uid() is NULL).
-- Self-cleaning: rolls back so no test data persists. Uses an existing
-- approved row + its submitter; safe because we ROLLBACK after asserting.
--
-- begin;
--   -- 1. Pick an approved row to test with. Note any name and submitter.
--   select id, name_ja, submitted_by, use_count
--     from public.public_foods
--    where status = 'approved'
--    limit 1;
--
--   -- 2. Reset its use_count to 0 (in case of prior tests).
--   update public.public_foods set use_count = 0 where id = '<paste-id>';
--
--   -- 3. Bump 0 → 1. Trigger should fire (auth.uid() in SQL Editor is
--   --    NULL, which `is distinct from` the non-NULL submitted_by → TRUE).
--   update public.public_foods set use_count = 1 where id = '<paste-id>';
--
--   -- 4. Confirm outbox row was queued.
--   select kind, title, body, sent_at
--     from public.notification_outbox
--    where user_id = '<paste-submitted_by>'
--    order by created_at desc
--    limit 1;
--   -- Expected: kind='submission_used' / title='投稿が使われました' /
--   --           body='「<name_ja>」が他のユーザーに使われました' /
--   --           sent_at=NULL (cron will set it after the drainer ships).
--
-- rollback;
--
-- Self-suppression cannot be exercised from SQL Editor (auth.uid() is
-- NULL) — it's verified at code-review time. When the production
-- meal-log path runs, auth.uid() = the logging user; if that equals
-- submitted_by, the WHEN clause is FALSE and no outbox row appears.
