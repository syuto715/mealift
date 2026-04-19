import type * as SQLite from 'expo-sqlite';

// v9: add vitamin B6 / B12 / folate to the full extended-nutrient set.
// Symmetric with v6 — adds the same three columns to every table that stores
// per-item nutrient values so sums and joins Just Work.
const NEW_COLUMNS = ['vitamin_b6_mg', 'vitamin_b12_ug', 'folate_ug'];

const ALL_TABLES = [
  'foods',
  'meal_log_items',
  'dishes',
  'dish_ingredients',
  'barcode_foods',
];

export async function migrateV9(db: SQLite.SQLiteDatabase): Promise<void> {
  const addCol = async (table: string, col: string, defaultVal?: string) => {
    const def = defaultVal != null ? ` DEFAULT ${defaultVal}` : '';
    try {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} REAL${def};`);
    } catch {
      // already exists — ALTER TABLE is not idempotent, so swallow
    }
  };

  for (const table of ALL_TABLES) {
    // meal_log_items stores absolute intake per item and downstream code reads
    // the column unconditionally, so default-0 keeps the sum path safe for
    // legacy rows. Other tables are per-100g reference values where NULL means
    // "not measured" and must be preserved.
    const useZeroDefault = table === 'meal_log_items';
    for (const col of NEW_COLUMNS) {
      await addCol(table, col, useZeroDefault ? '0' : undefined);
    }
  }
}
