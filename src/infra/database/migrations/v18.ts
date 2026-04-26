import type * as SQLite from 'expo-sqlite';

// v18: link dish_ingredients to canonical foods rows.
//
// Sprint 2 of the food-DB expansion adds a recipe calculator that
// reads per-100g nutrition from the `foods` table and derives the
// per-ingredient + total values for a dish. The existing
// `dish_ingredients` table (v3) only carries the cached
// per-ingredient macros and a free-text `food_name` — there is no
// link back to the source `foods` row, so:
//
//   - Per-ingredient extended nutrients (fiber, vitamins, minerals)
//     are all null on every seeded dish, even when the source MEXT
//     row has them.
//   - Updates to the `foods` table can never propagate into existing
//     dishes; the cached macros are frozen at seed/save time.
//
// This migration adds a nullable `food_id TEXT` column. When set, the
// app can recompute the row from `foods.calories_per_serving` etc.;
// when null (legacy AI-estimate rows, ad-hoc text ingredients) the
// cached macros remain authoritative.
//
// Foreign-key behavior: deliberately NOT enforced. The codebase's
// `meal_log_items.food_id` column is similarly a plain nullable TEXT
// reference (v1) — sticking to that pattern keeps the migration
// cheap (SQLite cannot add a FK constraint via ALTER TABLE) and lets
// us soft-delete foods without losing dish history. App-layer reads
// LEFT JOIN against `foods.id`, treating missing rows as "no live
// reference, use cached values".
//
// What this migration deliberately does NOT do:
//   - It does not backfill food_id on existing rows. Matching legacy
//     `food_name` strings against `foods.name_ja` is fuzzy at best
//     (cooking-method qualifiers, brand names, etc.). The Phase 2C
//     seed will write fresh rows with foodId set; the old rows stay
//     as-is.
//   - It does not migrate `total_*` macros on `dishes` — those are
//     already correct (they were computed at seed time as the sum
//     of the per-ingredient cache).
//   - It does not change `dish_ingredients.food_name`. The free-text
//     name is still the display fallback when a food row is missing.
export async function migrateV18(db: SQLite.SQLiteDatabase): Promise<void> {
  // Idempotent: skip the ADD COLUMN if it's already there. Same
  // pattern as v13 (which inspects PRAGMA table_info before adding).
  const cols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(dish_ingredients);',
  );
  const hasFoodId = cols.some((c) => c.name === 'food_id');
  if (!hasFoodId) {
    try {
      await db.execAsync(
        'ALTER TABLE dish_ingredients ADD COLUMN food_id TEXT;',
      );
    } catch {
      // Concurrent migration or partial failure — recheck and continue.
    }
  }

  // Partial index: only ingredients that actually link to a food
  // benefit from the lookup, and the index size stays small even as
  // legacy null rows accumulate.
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_dish_ingredients_food_id
      ON dish_ingredients(food_id)
      WHERE food_id IS NOT NULL;
  `);
}
