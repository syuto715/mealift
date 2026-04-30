-- food_category on public_foods — mirrors the v21 SQLite migration.
--
-- Default 'other' lets the column be NOT NULL without breaking
-- existing approved rows. The CHECK constraint matches the seven
-- enum values shared with src/types/userSubmittedFood.ts (FoodCategory)
-- and the SQLite-side CHECK in v21.ts. Drift between the two would
-- show up as upload errors against the public_foods CHECK; keeping
-- both in lockstep prevents that.
--
-- Index on food_category supports category-filtered search in Part 2
-- onwards. Cardinality is low (7 values) but the filter sits on top
-- of larger predicates (status='approved'), so a btree index here
-- pays off when paired with the existing public_foods_status_idx.

alter table public.public_foods
  add column if not exists food_category text not null default 'other'
  check (food_category in (
    'home_cooking',
    'restaurant',
    'convenience_store',
    'packaged_food',
    'beverage',
    'supplement',
    'other'
  ));

create index if not exists public_foods_food_category_idx
  on public.public_foods (food_category);
