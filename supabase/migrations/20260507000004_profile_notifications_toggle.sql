-- profiles.notifications_submission_enabled — opt-out toggle for
-- submission-related push notifications (Build 15 / Feature 3).
--
-- The Edge Function send-push-notifications (Session 4 commit 3) reads
-- this column on every drain run and skips users who have flipped it
-- off. Default true so most users receive notifications without
-- manual opt-in; the OS-level Notifications permission grant is the
-- separate hard gate.
--
-- Generic naming on purpose: Build 16+ adds 'submission_approved'
-- notifications and reuses this same column. The toggle controls
-- "everything submission-related" rather than per-kind switches —
-- avoids settings UI bloat and matches v1's single toggle UX.
--
-- Rollback:
--   alter table public.profiles drop column if exists notifications_submission_enabled;

alter table public.profiles
  add column if not exists notifications_submission_enabled boolean not null default true;

comment on column public.profiles.notifications_submission_enabled is
  'Build 15: gates submission-related push notifications (used / approved). '
  'Default TRUE; user can opt out via Settings → 通知 → 投稿関連通知.';

-- Verification (run AFTER apply, in SQL Editor):
--
--   -- Confirm the column exists with default true:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'profiles'
--      and column_name = 'notifications_submission_enabled';
--   -- Expected: data_type='boolean', is_nullable='NO', column_default='true'
--
--   -- Confirm existing rows have the default applied:
--   select count(*) as total,
--          count(*) filter (where notifications_submission_enabled) as enabled
--     from public.profiles;
--   -- Expected: total = enabled (all true since default true)
