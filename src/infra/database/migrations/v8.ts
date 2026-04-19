import type * as SQLite from 'expo-sqlite';

// v8: add foods.is_common (boolean flag) used to rank commonly-searched items
// higher in the food search. The MEXT import script populates this field for
// ~30 high-frequency items (white rice, chicken breast, eggs, ...).
export async function migrateV8(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await db.execAsync(
      'ALTER TABLE foods ADD COLUMN is_common INTEGER NOT NULL DEFAULT 0;',
    );
  } catch {
    // already exists — idempotent
  }
  try {
    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_foods_is_common ON foods(is_common);',
    );
  } catch {
    // index already exists
  }
}
