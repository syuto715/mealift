-- v1.6.0 Sprint 1b — C-1 subscription server-source-of-truth infrastructure.
--
-- This migration is SAFE to apply immediately (it only ADDS objects; it does
-- not REVOKE anything). The column-lock REVOKEs live in two SEPARATE, later
-- migrations whose application is gated on operational conditions:
--   - 20260614000001_lock_subscription_columns_step_a.sql  (apply after the
--     revenuecat-webhook EF is deployed & verified)
--   - 20260614000002_lock_subscription_columns_step_b.sql  (apply ONLY after
--     the payload-removed client build is the floor — see that file's header)
--
-- Adds:
--   1. revenuecat_events — idempotency / audit ledger for webhook events.
--   2. profiles.last_seen_app_version — non-subscription column the client
--      writes on launch so we can MEASURE the step-B floor (lowest active
--      client version) before locking the sync-pushed subscription columns.

-- ---------------------------------------------------------------------------
-- 1. revenuecat_events — every webhook/REST reconcile event, keyed by the RC
--    event id for idempotency (INSERT ... ON CONFLICT DO NOTHING → duplicate
--    deliveries are no-ops). Service-role only; RLS on with NO policies =
--    deny-by-default for the client.
-- ---------------------------------------------------------------------------
create table if not exists public.revenuecat_events (
  -- RC `event.id` (string). For REST-reconcile rows we synthesize a stable id.
  event_id text primary key,
  app_user_id text,
  -- The resolved Supabase auth uid (= profiles.id) when app_user_id was a
  -- valid UUID; null when the event was for an anonymous / unmatched id.
  user_id uuid references auth.users(id) on delete set null,
  event_type text,
  event_timestamp_ms bigint,
  -- Outcome: 'applied' | 'ignored_old' | 'ignored_anonymous' | 'no_profile'.
  outcome text not null,
  raw jsonb,
  received_at timestamptz not null default now()
);

create index if not exists revenuecat_events_user_idx
  on public.revenuecat_events (user_id, received_at desc);

alter table public.revenuecat_events enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) reads /
-- writes this ledger. Clients have zero access.

-- ---------------------------------------------------------------------------
-- 2. profiles.last_seen_app_version — client writes its integer build number
--    on launch. NON-subscription column → stays client-writable after the
--    step-A/B REVOKEs (those name only the 6 subscription columns).
--    Used to confirm the step-B floor: "no active client below the
--    payload-removed build remains" (see step-B migration header SQL).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_seen_app_version integer;
