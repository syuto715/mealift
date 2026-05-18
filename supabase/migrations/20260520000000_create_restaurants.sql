-- v1.5 Stage 2 Phase 2.1 — restaurants + restaurant_chain_categories.
--
-- Architectural SSoT: docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md
-- §5.1 (DDL apply order categories → restaurants — Codex round 1
-- Critical #4 fix) + §6 (public-read, service-role-write RLS) +
-- §10 Phase 2.1.
--
-- Public read, service-role write. Takedown flag defaults false;
-- when flipped the RLS policy on `restaurants` AND the cascading
-- exists() clause on `restaurant_menu_items` (next migration)
-- immediately drops the chain + all its menu items from public
-- visibility.
--
-- set_updated_at trigger lands here so the 7-day delta-pull (§3.2)
-- can rely on `updated_at` advancing on every UPDATE.

-- =====================================================================
-- restaurant_chain_categories (CREATED FIRST so restaurants.category_id
-- FK resolves at parse time).
-- =====================================================================

create table if not exists public.restaurant_chain_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_order int not null default 0,
  -- 'FF' / '牛丼' / '寿司' / 'ファミレス' / 'カフェ' / 'その他' /
  -- 'コンビニ' — fixed list; Phase 2.2 seed migration
  -- (`20260520000003_restaurant_menu_seed.sql`) inserts these
  -- alongside the 36 restaurant rows.
  created_at timestamptz not null default now()
);

alter table public.restaurant_chain_categories enable row level security;

drop policy if exists "Public read categories"
  on public.restaurant_chain_categories;
create policy "Public read categories"
  on public.restaurant_chain_categories for select using (true);

-- =====================================================================
-- restaurants (after categories so the FK resolves).
-- =====================================================================

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- ['マクド', 'マクドナルド', 'McD', ...] — gin-indexed for fuzzy
  -- prefix lookup. Side-table mirror on SQLite (v34) because
  -- text[] is Postgres-only (§5.2 Codex round 1 Important #3 fix).
  aliases text[] not null default '{}',
  restaurant_type text not null check (restaurant_type in (
    'dining', 'convenience', 'cafe_bakery', 'combo_meal'
  )),
  category_id uuid references public.restaurant_chain_categories(id),
  official_url text,
  attribution text not null,
  attribution_url text,
  -- Admin-set; suppresses globally. Drives the RLS gate below AND
  -- cascades into restaurant_menu_items via the parent-join exists()
  -- in the next migration.
  takedown_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phase 2.1 trigger — delta pulls (§3.2) rely on `updated_at`
-- advancing on every write (Codex round 1 Important #4 fix).
create or replace function public.set_updated_at_restaurants()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists set_updated_at_restaurants_trg on public.restaurants;
create trigger set_updated_at_restaurants_trg
  before update on public.restaurants
  for each row execute function public.set_updated_at_restaurants();

create index if not exists restaurants_type_idx
  on public.restaurants (restaurant_type);
create index if not exists restaurants_aliases_idx
  on public.restaurants using gin (aliases);
create index if not exists restaurants_updated_at_idx
  on public.restaurants (updated_at desc);

alter table public.restaurants enable row level security;

drop policy if exists "Public read non-takedown restaurants"
  on public.restaurants;
create policy "Public read non-takedown restaurants"
  on public.restaurants for select
  using (takedown_flag = false);
