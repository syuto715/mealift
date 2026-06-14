-- v1.6.0 Sprint 6 — account deletion prerequisite.
--
-- Before enabling account deletion (delete-account EF → auth.admin.deleteUser
-- → ON DELETE CASCADE across all user tables), public_foods needs its two FKs
-- to auth.users changed from CASCADE / RESTRICT to SET NULL, so deleting a
-- user does NOT destroy the SHARED community food database they contributed to
-- and does NOT get blocked.
--
--   submitted_by: was `not null ... on delete cascade` → deleting a user would
--     DELETE all their submitted (and possibly approved, in-use-by-others)
--     foods. Change to nullable + ON DELETE SET NULL → the food row survives,
--     anonymized (submitted_by = null). Other users keep using it.
--
--   reviewed_by: was `references auth.users(id)` with NO on-delete clause
--     (= NO ACTION / RESTRICT) → deleting a user who reviewed any food would
--     FAIL with an FK violation, making reviewer/admin accounts undeletable.
--     Change to ON DELETE SET NULL.
--
-- Inline single-column FKs are auto-named `<table>_<column>_fkey` by Postgres.
-- (Verify with: select conname from pg_constraint where conrelid =
--  'public.public_foods'::regclass and contype='f';  before applying.)
--
-- Safe to apply any time (does not delete data). Apply BEFORE the
-- delete-account EF is allowed to run in production.

-- submitted_by: allow null, then swap CASCADE → SET NULL.
alter table public.public_foods
  alter column submitted_by drop not null;

alter table public.public_foods
  drop constraint if exists public_foods_submitted_by_fkey;
alter table public.public_foods
  add constraint public_foods_submitted_by_fkey
  foreign key (submitted_by) references auth.users(id) on delete set null;

-- reviewed_by: already nullable; swap RESTRICT (no action) → SET NULL.
alter table public.public_foods
  drop constraint if exists public_foods_reviewed_by_fkey;
alter table public.public_foods
  add constraint public_foods_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users(id) on delete set null;

-- Note: the unique (submitted_by, name_ja, brand) constraint and the
-- auth.uid() = submitted_by RLS policies still hold — once submitted_by is
-- null, the row is read-only community data (no auth.uid() matches null), and
-- multiple null submitted_by rows don't collide (NULLs are distinct in a
-- UNIQUE constraint).
