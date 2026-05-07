-- 8-cat equipment CHECK constraint on user_custom_exercises
-- (Build 15 / Feature 5-A defense-in-depth).
--
-- Mirrors the local SQLite migration v25 (Build 15, Session 5) which
-- normalizes the existing canonical exercises table to the 8-category
-- equipment enum derived from Gymwork's gym-shelf taxonomy
-- (long-term-strategy.md §2.2 / §8 #10):
--
--   barbell / dumbbell / kettlebell / machine /
--   bodyweight / cardio / stretching / other
--
-- SQLite ALTER TABLE can't add CHECK constraints to existing tables,
-- so the local side relies on app-level validation only (5-P UI's
-- 8-cat picker is the gate). Postgres has no such limitation —
-- adding the CHECK here defends the server side against future bugs
-- where a client-side path leaks an invalid value (e.g., a refactor
-- accidentally re-introduces 'cable' or 'ab_roller').
--
-- Pre-condition: 0 user_custom_exercises rows present (verified by
-- Syuto in Session 5 sign-off). Adding a CHECK to a populated table
-- with violating rows would fail; we know the row count is 0 so the
-- ALTER is safe to run unconditionally.
--
-- exercise_type already has a CHECK constraint (build 14 / Phase 5-B)
-- with the same 'strength' / 'cardio' / 'sports' / 'other' enum we
-- want to keep. This new constraint is the equipment counterpart.
--
-- Rollback:
--   alter table public.user_custom_exercises drop constraint if exists user_custom_exercises_equipment_check;

alter table public.user_custom_exercises
  drop constraint if exists user_custom_exercises_equipment_check;

alter table public.user_custom_exercises
  add constraint user_custom_exercises_equipment_check
  check (
    equipment is null
    or equipment in (
      'barbell',
      'dumbbell',
      'kettlebell',
      'machine',
      'bodyweight',
      'cardio',
      'stretching',
      'other'
    )
  );

-- Verification (run AFTER apply):
--
--   -- 1. Confirm the constraint is registered.
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname = 'user_custom_exercises_equipment_check';
--   -- Expected: 1 row, the CHECK clause text matches the 8-cat enum.
--
--   -- 2. (Smoke) An invalid insert should fail with a 23514 violation.
--   begin;
--     insert into public.user_custom_exercises
--       (id, user_id, name_ja, muscle_group, equipment)
--       values (gen_random_uuid(),
--               (select id from auth.users limit 1),
--               'TEST INVALID EQUIPMENT',
--               'chest',
--               'cable');                  -- not in 8-cat
--   rollback;
--   -- Expected: ERROR 23514 new row violates check constraint
--
--   -- 3. (Smoke) A valid insert succeeds.
--   begin;
--     insert into public.user_custom_exercises
--       (id, user_id, name_ja, muscle_group, equipment)
--       values (gen_random_uuid(),
--               (select id from auth.users limit 1),
--               'TEST VALID EQUIPMENT',
--               'chest',
--               'machine');
--     select equipment from public.user_custom_exercises
--      where name_ja = 'TEST VALID EQUIPMENT';
--   rollback;
--   -- Expected: 'machine' returned, no error.
