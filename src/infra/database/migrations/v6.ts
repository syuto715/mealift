import type * as SQLite from 'expo-sqlite';

const EXTENDED_NUTRIENT_COLUMNS = [
  'sodium_mg',
  'calcium_mg',
  'iron_mg',
  'vitamin_a_ug',
  'vitamin_b1_mg',
  'vitamin_b2_mg',
  'vitamin_c_mg',
  'vitamin_d_ug',
  'vitamin_e_mg',
  'potassium_mg',
  'magnesium_mg',
  'zinc_mg',
  'cholesterol_mg',
  'saturated_fat_g',
  'sugar_g',
  'salt_g',
];

// foods already has fiber_g; others need it
const TABLES_NEEDING_FIBER = [
  'meal_log_items',
  'dishes',
  'dish_ingredients',
];

// All tables that get extended nutrient columns
const ALL_TABLES = [
  'foods',
  'meal_log_items',
  'dishes',
  'dish_ingredients',
  'barcode_foods',
];

export async function migrateV6(db: SQLite.SQLiteDatabase): Promise<void> {
  // Helper: add column if it doesn't exist (ALTER TABLE ADD COLUMN is idempotent-safe via try/catch)
  const addCol = async (table: string, col: string, defaultVal?: string) => {
    const def = defaultVal != null ? ` DEFAULT ${defaultVal}` : '';
    try {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} REAL${def};`);
    } catch {
      // Column already exists — safe to ignore
    }
  };

  // 1. Add fiber_g to tables that don't have it yet
  for (const table of TABLES_NEEDING_FIBER) {
    const def = table === 'meal_log_items' ? '0' : undefined;
    await addCol(table, 'fiber_g', def);
  }

  // 2. Add extended nutrient columns to all tables
  for (const table of ALL_TABLES) {
    const useMealLogDefaults = table === 'meal_log_items';
    for (const col of EXTENDED_NUTRIENT_COLUMNS) {
      await addCol(table, col, useMealLogDefaults ? '0' : undefined);
    }
  }
}
