-- v1.5 Stage 1 Phase 1.1 — chat / advice / generation / diagnostic tables.
--
-- Architectural SSoT: docs/plans/v1.5_stage_1_ai_chat_epic.md §5.1.
--
-- Tables introduced:
--   1. chat_conversations
--   2. chat_messages (status enum incl. 'pending'; idempotency_key
--      with partial unique index for the C2 idempotency lookup)
--   3. coach_advice (period_start bucket + unique (user_id, scope, period_start))
--   4. routine_generations (applied_routine_id TEXT soft FK to local SQLite)
--   5. diagnostic_sessions
--
-- Plus: ALTER profiles ADD COLUMN timezone (S1 resolution).
--
-- RLS: own-user-only for every table. Service Role writes via the
-- Edge Function (auth.uid() is the gating mechanism).
--
-- TOCTOU caveat (inherited from `generate-workout-menu` and
-- `estimate-nutrition-vision`): the per-user quota counter is a
-- count-then-insert pattern in the coach EFs (see §2.2). v1.5+
-- candidate to migrate to an atomic counter RPC; Stage 1 keeps
-- parity with existing EFs.

-- =====================================================================
-- profiles.timezone (S1 resolution, §5.1.2)
-- =====================================================================

alter table if exists public.profiles
  add column if not exists timezone text not null default 'Asia/Tokyo';

-- =====================================================================
-- chat_conversations
-- =====================================================================

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  model text not null default 'gemini-2.5-flash',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_idx
  on public.chat_conversations (user_id, updated_at desc);

alter table public.chat_conversations enable row level security;

drop policy if exists "Users manage own conversations"
  on public.chat_conversations;
create policy "Users manage own conversations"
  on public.chat_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
-- chat_messages (Drafting 97 + 98 + Phase 1.0.2 idempotency model)
-- =====================================================================

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  model text,
  input_tokens int,
  output_tokens int,
  status text not null default 'pending'
    check (status in ('pending', 'final', 'partial', 'error')),
  -- Drafting 98 idempotency: same key on retry returns the same
  -- assistantMessageId without a second Gemini call. The 24h
  -- retention window is enforced by the cleanup EF which NULLs
  -- the column after the window; the partial unique index then
  -- automatically frees the key for reuse (NewI2 resolution).
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

-- Partial unique index — only enforces uniqueness while
-- idempotency_key is non-null. The cleanup EF (hourly cron) NULLs
-- stale keys after the 24h retention window, automatically
-- removing them from the index.
create unique index if not exists chat_messages_idempotency_key_unique
  on public.chat_messages (idempotency_key)
  where idempotency_key is not null;

alter table public.chat_messages enable row level security;

drop policy if exists "Users manage own messages" on public.chat_messages;
create policy "Users manage own messages"
  on public.chat_messages for all
  using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

-- =====================================================================
-- coach_advice (I1 resolution: bucket key + unique per period)
-- =====================================================================

create table if not exists public.coach_advice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('weekly', 'daily')),
  -- §3 advice row: weekly = profile-tz Monday of that week,
  -- daily = profile-tz date.
  period_start date not null,
  content text not null,
  -- Persisted snapshot stores the projected safe subset only,
  -- never the raw client-side context (§5.1.1 + §6.4 I5 resolution).
  source_data_snapshot_json jsonb not null,
  generated_at timestamptz not null default now(),
  unique (user_id, scope, period_start)
);

create index if not exists coach_advice_lookup_idx
  on public.coach_advice (user_id, scope, period_start desc);

alter table public.coach_advice enable row level security;

drop policy if exists "Users read own advice" on public.coach_advice;
create policy "Users read own advice"
  on public.coach_advice for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
-- routine_generations (I4 resolution: applied_routine_id TEXT soft FK)
-- =====================================================================

create table if not exists public.routine_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Same projected-safe-subset rule as coach_advice (§5.1.1).
  prompt_context_json jsonb not null,
  generated_routine_json jsonb not null,
  -- Soft FK to local SQLite workout_routines.id (TEXT model). No
  -- hard FK because Supabase doesn't see the local table; the
  -- client resolves the relation at apply time.
  applied_routine_id text,
  status text not null default 'draft'
    check (status in ('draft', 'applied', 'discarded')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists routine_generations_user_status_idx
  on public.routine_generations (user_id, status, created_at desc);

alter table public.routine_generations enable row level security;

drop policy if exists "Users manage own generations" on public.routine_generations;
create policy "Users manage own generations"
  on public.routine_generations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
-- diagnostic_sessions
-- =====================================================================

create table if not exists public.diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  answers_json jsonb not null,
  generated_routine_id uuid
    references public.routine_generations(id) on delete set null,
  completed_at timestamptz not null default now()
);

create index if not exists diagnostic_sessions_user_idx
  on public.diagnostic_sessions (user_id, completed_at desc);

alter table public.diagnostic_sessions enable row level security;

drop policy if exists "Users read own diagnostics" on public.diagnostic_sessions;
create policy "Users read own diagnostics"
  on public.diagnostic_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
