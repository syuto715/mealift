-- ai_usage_logs: records every call to Gemini-backed edge functions so we can
-- enforce per-user daily quotas, audit abuse, and debug failures.
--
-- Writes happen from the edge function with the Service Role key (bypassing
-- RLS). Reads from the client are restricted to the owning user via RLS.

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  input jsonb,
  response_status integer not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_date_idx
  on public.ai_usage_logs (user_id, created_at desc);

create index if not exists ai_usage_logs_function_date_idx
  on public.ai_usage_logs (function_name, created_at desc);

alter table public.ai_usage_logs enable row level security;

drop policy if exists "Users can read own usage logs" on public.ai_usage_logs;
create policy "Users can read own usage logs"
  on public.ai_usage_logs for select
  using (auth.uid() = user_id);

-- Ensure profiles has the plan/trial columns the edge function reads for the
-- Pro gate. Noop on installs that already added these in earlier migrations.
alter table if exists public.profiles
  add column if not exists plan text default 'free',
  add column if not exists subscription_status text,
  add column if not exists trial_started_at timestamptz,
  add column if not exists subscription_updated_at timestamptz;
