import type * as SQLite from 'expo-sqlite';

// v17: composite index on foods(source, brand, name_ja).
//
// Sprint 1 of the food-DB expansion brings in USDA FDC Branded Foods,
// which can grow `foods` from ~2k MEXT rows to tens of thousands once
// a full Branded subset is seeded. The current single-column
// `idx_foods_name` (v1) helps name lookups but degrades for the
// "filter by source, then by brand, then search by name" pattern the
// new search UI needs (Settings → "Show: MEXT only / USDA only").
//
// `foods.source` is plain TEXT with no CHECK constraint (defined in
// v1 as `source TEXT NOT NULL DEFAULT 'manual'`), so new values like
// 'usda_fdc_branded' and 'usda_fdc_foundation' can land via the seed
// step without an ALTER. This migration just adds the index.
//
// What this migration does NOT do:
//   - It does not seed any USDA rows. The Sprint 1 deliverable is
//     scripts/food-import/run-usda.ts producing a review CSV; the
//     actual seed write happens in a follow-up after human review.
//   - It does not rebuild idx_foods_name. The single-column index is
//     still useful for name-only searches (favorites, recent, etc.).
export async function migrateV17(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_foods_source_brand_name
      ON foods(source, brand, name_ja);
  `);
}
