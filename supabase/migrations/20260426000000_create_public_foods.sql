-- public_foods + food_reports — the Supabase side of the user-submission
-- pipeline (Commit 1).
--
-- Lifecycle:
--   1. Client inserts a row with status='pending_review' (and
--      submitted_by = auth.uid()) at submit time. RLS lets only the
--      submitter read their own pending row; the public can only read
--      status='approved' rows.
--   2. An admin (Service Role, bypassing RLS) sets status='approved'
--      after manual review and populates reviewed_by / reviewed_at.
--   3. Approved rows are then visible globally and can fold into the
--      app's search results.
--
-- Column names mirror src/infra/database/migrations/v16.ts so the sync
-- layer in Commit 4 is a straight column-by-column copy.
--
-- Numeric CHECKs are deliberately broad — they only catch unit-scale
-- mistakes (mg/g typos, per-100g pasted into per-serving). Tighter
-- nutrition validation runs at app submit time.

create table if not exists public.public_foods (
  id uuid primary key default gen_random_uuid(),

  name_ja text not null,
  name_en text,
  brand text,
  barcode text,
  serving_size_g real not null default 100,
  serving_unit text not null default 'g',
  serving_description text,

  calories_per_serving real not null check (calories_per_serving >= 0 and calories_per_serving < 3000),
  protein_g real not null default 0 check (protein_g >= 0 and protein_g < 200),
  fat_g real not null default 0 check (fat_g >= 0 and fat_g < 200),
  carb_g real not null default 0 check (carb_g >= 0 and carb_g < 500),

  fiber_g real,
  sugar_g real,
  salt_g real,
  sodium_mg real,
  saturated_fat_g real,
  cholesterol_mg real,
  calcium_mg real,
  iron_mg real,
  vitamin_a_ug real,
  vitamin_b1_mg real,
  vitamin_b2_mg real,
  vitamin_c_mg real,
  vitamin_d_ug real,
  vitamin_e_mg real,
  potassium_mg real,
  magnesium_mg real,
  zinc_mg real,

  source_type text not null check (source_type in (
    'package_label', 'menu_board', 'official_site', 'estimation', 'other'
  )),
  source_photo_url text,
  notes text,

  status text not null default 'pending_review' check (status in (
    'pending_review', 'approved', 'rejected', 'flagged'
  )),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  approval_score integer not null default 0,
  flag_count integer not null default 0,
  use_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Same user cannot submit the same name+brand twice. brand may be
  -- null; the partial unique below covers the brand-is-null case
  -- because PostgreSQL treats nulls as distinct in a normal UNIQUE.
  unique (submitted_by, name_ja, brand)
);

create unique index if not exists public_foods_unique_per_submitter_no_brand
  on public.public_foods (submitted_by, name_ja)
  where brand is null;

create index if not exists public_foods_status_idx
  on public.public_foods (status);

create index if not exists public_foods_barcode_idx
  on public.public_foods (barcode)
  where barcode is not null;

create index if not exists public_foods_search_idx
  on public.public_foods
  using gin (to_tsvector('simple', name_ja || ' ' || coalesce(brand, '')));

create index if not exists public_foods_submitted_by_idx
  on public.public_foods (submitted_by, created_at desc);

alter table public.public_foods enable row level security;

drop policy if exists "approved_foods_readable_by_all" on public.public_foods;
create policy "approved_foods_readable_by_all"
  on public.public_foods for select
  using (status = 'approved');

drop policy if exists "own_submissions_readable" on public.public_foods;
create policy "own_submissions_readable"
  on public.public_foods for select
  using (auth.uid() = submitted_by);

drop policy if exists "authenticated_can_submit" on public.public_foods;
create policy "authenticated_can_submit"
  on public.public_foods for insert
  with check (auth.uid() = submitted_by);

-- Submitters may UPDATE their own row only while it is still pending —
-- once an admin moves it to approved/rejected/flagged, the row freezes
-- (further changes go through admin via the Service Role).
drop policy if exists "own_pending_submissions_updatable" on public.public_foods;
create policy "own_pending_submissions_updatable"
  on public.public_foods for update
  using (auth.uid() = submitted_by and status = 'pending_review')
  with check (auth.uid() = submitted_by and status = 'pending_review');

-- ---------------------------------------------------------------------------
-- food_reports — user-driven misinfo / abuse reports against public_foods.
-- Approval-flow workers will aggregate flag_count from this table.
-- ---------------------------------------------------------------------------

create table if not exists public.food_reports (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.public_foods(id) on delete cascade,
  reported_by uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in (
    'incorrect_nutrition', 'wrong_name', 'duplicate', 'inappropriate', 'other'
  )),
  detail text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),

  -- Same user can only file one open report per food row.
  unique (food_id, reported_by)
);

create index if not exists food_reports_food_idx
  on public.food_reports (food_id);

create index if not exists food_reports_unresolved_idx
  on public.food_reports (food_id)
  where resolved = false;

alter table public.food_reports enable row level security;

drop policy if exists "own_reports_readable" on public.food_reports;
create policy "own_reports_readable"
  on public.food_reports for select
  using (auth.uid() = reported_by);

drop policy if exists "authenticated_can_report" on public.food_reports;
create policy "authenticated_can_report"
  on public.food_reports for insert
  with check (auth.uid() = reported_by);
