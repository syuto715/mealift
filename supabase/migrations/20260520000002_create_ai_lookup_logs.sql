-- v1.5 Stage 2 Phase 2.1 — ai_lookup_logs (user-scoped quota +
-- idempotency replay store for the restaurant-menu lookup +
-- estimate EFs).
--
-- Architectural SSoT: docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md
-- §5.1 ai_lookup_logs DDL + §7.1 STEP 2 / STEP 8 (response_payload
-- is load-bearing for idempotency replay — Codex round 3 OPEN #2
-- fix) + §10 Phase 2.1.
--
-- This table lands in Phase 2.1 (not Phase 2.5) — Codex round 1
-- Critical #1 fix. The atomic counter RPC (v1.5+ B) is a perf
-- upgrade on top of this table and lands later in Phase 2.5a
-- (migration `20260520000005_atomic_counter_rpc.sql`).
--
-- Drafting 109 — idempotency_key + partial unique landing at the
-- INITIAL migration, not via post-hoc ALTER. The hourly
-- `cleanup-idempotency-keys` EF (Phase 1.1 baseline, Phase 2.1
-- extension) NULLs stale keys, automatically freeing them from
-- the partial unique index.

create table if not exists public.ai_lookup_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'restaurant-menu-lookup' / 'restaurant-menu-estimate'
  function_name text not null,
  -- Parsed request body { chainName, menuName, barcode, mode }.
  input jsonb not null,
  -- Cached items[] payload returned on idempotency replay.
  -- Nullable: failed requests (response_status != 200) don't
  -- cache a payload, but the row still counts in the quota
  -- denominator (response_status filter on the quota gate
  -- excludes them — see §7.1 STEP 4).
  response_payload jsonb,
  -- HTTP status code; quota gate filters on 200 only.
  response_status int not null,
  -- Nullable so the hourly cleanup cron can NULL it without
  -- losing the quota row.
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists ai_lookup_logs_user_month_idx
  on public.ai_lookup_logs (user_id, function_name, created_at desc);

-- Drafting 109 — idempotency_key + partial unique at initial
-- migration. cleanup-idempotency-keys EF NULLs stale keys; the
-- partial index automatically drops NULL rows.
create unique index if not exists ai_lookup_logs_idempotency_key_unique
  on public.ai_lookup_logs (user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.ai_lookup_logs enable row level security;

drop policy if exists "Users read own lookup logs" on public.ai_lookup_logs;
create policy "Users read own lookup logs"
  on public.ai_lookup_logs for select
  using (auth.uid() = user_id);
