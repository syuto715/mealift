import * as SQLite from 'expo-sqlite';

export async function migrateV4(db: SQLite.SQLiteDatabase): Promise<void> {
  // Add is_favorite to foods
  await db.execAsync(
    `ALTER TABLE foods ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`,
  );

  // Add is_favorite to dishes
  await db.execAsync(
    `ALTER TABLE dishes ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`,
  );

  // Barcode foods table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS barcode_foods (
      id TEXT PRIMARY KEY,
      barcode TEXT NOT NULL UNIQUE,
      name_ja TEXT NOT NULL,
      brand TEXT,
      serving_size_g REAL NOT NULL DEFAULT 100,
      serving_unit TEXT NOT NULL DEFAULT 'g',
      serving_description TEXT,
      calories_per_serving REAL NOT NULL,
      protein_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      carb_g REAL NOT NULL DEFAULT 0,
      fiber_g REAL,
      image_url TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_barcode_foods_barcode ON barcode_foods(barcode);
  `);
}
