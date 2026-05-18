-- v1.5 Stage 2 Phase 2.1 — restaurant_menu_items + restaurant_menu_item_versions.
--
-- Architectural SSoT: docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md
-- §5.1 restaurant_menu_items DDL + §6 RLS chain-cascade policy
-- (Codex round 1 Critical #3 fix — takedown_flag on the parent
-- chain must suppress all menu items via an EXISTS join, not just
-- the per-row flag).

-- =====================================================================
-- restaurant_menu_items
-- =====================================================================

create table if not exists public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants(id) on delete cascade,
  name text not null,
  -- ['ビッグマック', 'BigMac', ...] — gin-indexed; SQLite mirror
  -- via restaurant_menu_item_aliases_local side table (§5.2).
  aliases text[] not null default '{}',
  category text,  -- 'バーガー' / 'サイド' / 'ドリンク' (chain's own taxonomy)

  -- PFC, mirrors existing foods schema bands so the food picker
  -- can interleave restaurant rows alongside foods + public_foods
  -- + barcode_foods without per-source unit conversion.
  serving_size_g real not null default 100,
  serving_unit text not null default 'g',
  serving_description text,  -- '1 個' / '1 杯' / '1 食' etc.
  calories_per_serving real not null
    check (calories_per_serving >= 0 and calories_per_serving < 3000),
  protein_g real not null default 0
    check (protein_g >= 0 and protein_g < 200),
  fat_g real not null default 0
    check (fat_g >= 0 and fat_g < 300),
  carb_g real not null default 0
    check (carb_g >= 0 and carb_g < 500),

  -- Optional micronutrients (mirrors public_foods extended set).
  fiber_g real,
  sugar_g real,
  salt_g real,
  sodium_mg real,
  saturated_fat_g real,
  cholesterol_mg real,

  -- Convenience PB SKUs carry a barcode; dining menu items don't.
  barcode text,

  -- Optional ingredient decomposition for dining items; Phase 2.5
  -- may fill this via Gemini estimate. Null = unknown.
  ingredient_decomposition_json jsonb,

  -- Source attribution.
  source text not null check (source in (
    'official_disclosure', 'package_label', 'ai_estimate', 'manual'
  )),
  source_url text,
  source_captured_at timestamptz,

  -- Version tracking (chain menu refreshes).
  version int not null default 1,

  -- Search ranking signal (server-authoritative; client mirrors and
  -- may transiently advance ahead via quick-log read-back path,
  -- but next sync restores authority — §5.2).
  use_count int not null default 0,

  takedown_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (restaurant_id, name)
);

create index if not exists restaurant_menu_items_restaurant_idx
  on public.restaurant_menu_items (restaurant_id, use_count desc);
create index if not exists restaurant_menu_items_aliases_idx
  on public.restaurant_menu_items using gin (aliases);
create index if not exists restaurant_menu_items_barcode_idx
  on public.restaurant_menu_items (barcode)
  where barcode is not null;
create index if not exists restaurant_menu_items_updated_at_idx
  on public.restaurant_menu_items (updated_at desc);

-- Phase 2.1 trigger — see set_updated_at_restaurants in the prior
-- migration. Delta pulls rely on this.
create or replace function public.set_updated_at_restaurant_menu_items()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists set_updated_at_restaurant_menu_items_trg
  on public.restaurant_menu_items;
create trigger set_updated_at_restaurant_menu_items_trg
  before update on public.restaurant_menu_items
  for each row execute function public.set_updated_at_restaurant_menu_items();

alter table public.restaurant_menu_items enable row level security;

-- Codex round 1 Critical #3 fix — chain-level takedown must
-- suppress the chain's menu items too. The policy joins back to
-- `restaurants.takedown_flag = false` so flipping the chain flag
-- immediately drops all child menu rows from public read.
drop policy if exists "Public read non-takedown menu items"
  on public.restaurant_menu_items;
create policy "Public read non-takedown menu items"
  on public.restaurant_menu_items for select
  using (
    takedown_flag = false
    and exists (
      select 1 from public.restaurants r
       where r.id = restaurant_menu_items.restaurant_id
         and r.takedown_flag = false
    )
  );

-- =====================================================================
-- restaurant_menu_item_versions — audit trail for chain menu
-- refreshes (jsonb snapshot of the row at each version bump).
-- =====================================================================

create table if not exists public.restaurant_menu_item_versions (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null
    references public.restaurant_menu_items(id) on delete cascade,
  version int not null,
  payload jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by text not null  -- 'seed_migration' / 'service_role_admin'
);

create index if not exists restaurant_menu_item_versions_item_idx
  on public.restaurant_menu_item_versions (menu_item_id, version desc);

-- Phase 2.2a Codex round 1 Important fix — history capture
-- trigger. The seed migration (Phase 2.2) bumps `version` on
-- every re-apply via `ON CONFLICT DO UPDATE`; without this
-- trigger, the prior payload is lost and the
-- `restaurant_menu_item_versions` audit table never receives a
-- row. The trigger fires AFTER UPDATE when the version column
-- has actually advanced, snapshotting the PRIOR (pre-update)
-- payload into the versions table so the audit trail walks
-- backwards by version DESC.
create or replace function public.capture_restaurant_menu_item_version()
returns trigger language plpgsql as $$
begin
  if new.version is distinct from old.version then
    insert into public.restaurant_menu_item_versions (
      menu_item_id, version, payload, changed_by
    ) values (
      old.id,
      old.version,
      to_jsonb(old.*),
      coalesce(current_setting('app.history_actor', true), 'seed_migration')
    );
  end if;
  return new;
end $$;

drop trigger if exists capture_restaurant_menu_item_version_trg
  on public.restaurant_menu_items;
create trigger capture_restaurant_menu_item_version_trg
  after update on public.restaurant_menu_items
  for each row execute function public.capture_restaurant_menu_item_version();

alter table public.restaurant_menu_item_versions enable row level security;

-- Codex Phase 2.1 round 1 Important fix — takedown must also
-- suppress version history. Earlier draft used `using (true)`,
-- which leaks historical snapshots of taken-down chains. The
-- policy now joins the parent menu item AND the parent chain
-- through the same EXISTS gate the menu items table uses.
drop policy if exists "Public read versions"
  on public.restaurant_menu_item_versions;
create policy "Public read non-takedown versions"
  on public.restaurant_menu_item_versions for select
  using (
    exists (
      select 1
        from public.restaurant_menu_items mi
        join public.restaurants r on r.id = mi.restaurant_id
       where mi.id = restaurant_menu_item_versions.menu_item_id
         and mi.takedown_flag = false
         and r.takedown_flag = false
    )
  );
