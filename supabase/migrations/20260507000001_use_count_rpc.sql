-- Server-side use_count increment RPC for public_foods (Build 15 /
-- Feature 3 prerequisite).
--
-- Why this exists:
--   Currently `public_foods.use_count` is never incremented server-side.
--   The local foods table's use_count gets +1 each time a user logs a
--   meal containing that food (foodRepository.ts:187), but the same
--   write doesn't propagate to the public_foods row. This means the
--   server's row stays at 0 forever, and the upcoming "your submission
--   was used" notification (Feature 3) has nothing to fire on.
--
-- This RPC is the bridge: client calls it after a meal-log INSERT;
-- the function atomically bumps the count and returns the new value
-- so the client (or a future AFTER UPDATE trigger) can detect
-- threshold crossings without a follow-up SELECT.
--
-- Why SECURITY DEFINER:
--   public_foods's UPDATE RLS policy ("own_pending_submissions_updatable")
--   only lets the SUBMITTER update their own PENDING row. A user who
--   logs an APPROVED food submitted by someone else is correctly
--   blocked from direct UPDATEs — but use_count needs to increment
--   regardless of submitter identity. SECURITY DEFINER bypasses RLS
--   for the bump while keeping the policy intact for genuine edits.
--
-- The function only touches one column (use_count). It cannot be used
-- to escalate privileges to general row mutation.
--
-- Idempotency / race safety:
--   The UPDATE is a single atomic increment. Concurrent calls from
--   multiple devices logging the same food at the same instant will
--   each see a unique post-increment value (Postgres MVCC).
--
-- Throttling:
--   Not done here. Caller (mealLog INSERT path, wired in Session 3+)
--   should call this once per meal-log save. If a user logs the same
--   food twice in a session, both increments count — that matches the
--   "use count" semantics (it counts uses, not unique users).
--
-- Returns 0 if food_id doesn't exist or the row isn't approved
-- (only approved rows count toward use_count for fair statistics).
-- Returns the new count otherwise.
--
-- Rollback:
--   revoke execute on function public.increment_public_food_use_count(uuid) from authenticated;
--   drop function if exists public.increment_public_food_use_count(uuid);

create or replace function public.increment_public_food_use_count(
  food_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update public.public_foods
     set use_count = use_count + 1,
         updated_at = now()
   where id = food_id
     and status = 'approved'
   returning use_count into new_count;

  return coalesce(new_count, 0);
end;
$$;

-- Allow authenticated users to call this. anon is intentionally
-- excluded — only logged-in users can log meals, so only they can
-- legitimately call this.
revoke all on function public.increment_public_food_use_count(uuid) from public;
grant execute on function public.increment_public_food_use_count(uuid) to authenticated;

-- Verification queries (run after apply):
--
--   -- Pick any approved row to test against:
--   select id, use_count from public.public_foods where status = 'approved' limit 1;
--
--   -- Call the RPC and see the count go up:
--   select public.increment_public_food_use_count('<that-id>');
--   -- expect: integer = previous use_count + 1
--
--   -- Verify it really persisted:
--   select use_count from public.public_foods where id = '<that-id>';
--
--   -- Non-existent id returns 0:
--   select public.increment_public_food_use_count(gen_random_uuid());
--   -- expect: 0
--
--   -- Non-approved row returns 0 (use_count not incremented):
--   select id, use_count from public.public_foods
--    where status = 'pending_review' limit 1;
--   -- (note the use_count, then call the RPC with that id, then re-check
--   --  use_count — it should be unchanged.)
