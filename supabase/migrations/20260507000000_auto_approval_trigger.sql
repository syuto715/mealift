-- Auto-approval routing for public_foods (Build 15 / Feature 1).
--
-- Reads the client-supplied approval_score on each new submission and
-- rewrites status BEFORE INSERT so RLS sees the final state. The
-- "authenticated_can_submit" policy checks only submitted_by, not
-- status, so the trigger overwriting status is RLS-safe.
--
-- Score thresholds mirror src/domain/submission/approvalScore.ts:
--   total >= 70  → 'approved'        (auto-passed; submitter UI shows
--                                     公開中, public read-visible)
--   50 <= total <  70 → 'pending_review'  (awaits Syuto manual review)
--   total <  50  → 'rejected'        (auto-failed; submitter sees the
--                                     row in their list and can re-submit)
--
-- reviewed_by stays NULL for all auto-decisions. The application layer
-- treats "status != 'pending_review' AND reviewed_by IS NULL" as
-- "system auto-decided" — useful for build-16 metrics monitoring.
-- reviewed_at is populated for non-pending so the submitter UI can
-- render "承認/却下: <date>" without a separate column.
--
-- Defensive: coalesce(approval_score, 0) routes NULL / missing scores
-- to auto-reject. Prevents a client-side score-calc bug from silently
-- letting unverified rows into the public DB.
--
-- Service Role escape hatch: this trigger fires on EVERY INSERT
-- including those run with the Service Role key. To insert a
-- pre-approved row from the dashboard:
--   set session_replication_role = replica;  -- bypass triggers
--   insert into public.public_foods (...) values (..., 'approved', ...);
--   set session_replication_role = origin;
--
-- Build-16 monitoring queries (run periodically to tune thresholds):
--   -- Status distribution
--   select status, count(*) from public.public_foods group by status;
--   -- Auto-decided vs manually-reviewed
--   select count(*) from public.public_foods
--    where status != 'pending_review' and reviewed_by is null;
--
-- Rollback (if thresholds need re-tuning, just CREATE OR REPLACE the
-- function with new constants — no DROP needed). Full removal:
--   drop trigger if exists trg_auto_route_public_food on public.public_foods;
--   drop function if exists public.auto_route_public_food();

create or replace function public.auto_route_public_food()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_score integer := coalesce(new.approval_score, 0);
begin
  -- Only run on INSERT. UPDATE flows go through the
  -- "own_pending_submissions_updatable" RLS policy and we don't want
  -- to re-route on every edit.
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if effective_score >= 70 then
    new.status := 'approved';
    new.reviewed_at := now();
  elsif effective_score >= 50 then
    new.status := 'pending_review';
  else
    new.status := 'rejected';
    new.reviewed_at := now();
    new.rejection_reason := coalesce(
      new.rejection_reason,
      'スコアが低いため自動却下'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auto_route_public_food on public.public_foods;
create trigger trg_auto_route_public_food
  before insert on public.public_foods
  for each row execute function public.auto_route_public_food();

-- Verification queries (run after apply, before considering this commit
-- ready to ship). Each returns 1 row with the expected status.
--
--   begin;
--   insert into public.public_foods
--     (id, name_ja, calories_per_serving, protein_g, fat_g, carb_g,
--      source_type, submitted_by, approval_score)
--     values
--     (gen_random_uuid(), 'TEST APPROVED 80', 100, 10, 5, 5,
--      'package_label', auth.uid(), 80);
--   select status from public.public_foods where name_ja = 'TEST APPROVED 80';
--   -- expect: 'approved'
--   rollback;
--
--   begin;
--   insert into public.public_foods
--     (id, name_ja, calories_per_serving, protein_g, fat_g, carb_g,
--      source_type, submitted_by, approval_score)
--     values
--     (gen_random_uuid(), 'TEST PENDING 60', 100, 10, 5, 5,
--      'package_label', auth.uid(), 60);
--   select status from public.public_foods where name_ja = 'TEST PENDING 60';
--   -- expect: 'pending_review'
--   rollback;
--
--   begin;
--   insert into public.public_foods
--     (id, name_ja, calories_per_serving, protein_g, fat_g, carb_g,
--      source_type, submitted_by, approval_score)
--     values
--     (gen_random_uuid(), 'TEST REJECTED 20', 100, 10, 5, 5,
--      'package_label', auth.uid(), 20);
--   select status, rejection_reason from public.public_foods
--     where name_ja = 'TEST REJECTED 20';
--   -- expect: ('rejected', 'スコアが低いため自動却下')
--   rollback;
