import * as SQLite from 'expo-sqlite';

export async function migrateV3(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dishes (
      id TEXT PRIMARY KEY,
      name_ja TEXT NOT NULL,
      name_en TEXT,
      category TEXT NOT NULL CHECK (category IN ('japanese', 'western', 'chinese', 'korean', 'other', 'convenience', 'fast_food')),
      serving_description TEXT NOT NULL DEFAULT '1人前',
      total_calories REAL NOT NULL,
      total_protein_g REAL NOT NULL DEFAULT 0,
      total_fat_g REAL NOT NULL DEFAULT 0,
      total_carb_g REAL NOT NULL DEFAULT 0,
      is_custom INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dish_ingredients (
      id TEXT PRIMARY KEY,
      dish_id TEXT NOT NULL,
      food_name TEXT NOT NULL,
      amount_g REAL NOT NULL,
      calories REAL NOT NULL,
      protein_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      carb_g REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_dishes_name ON dishes(name_ja);
    CREATE INDEX IF NOT EXISTS idx_dish_ingredients_dish ON dish_ingredients(dish_id);
  `);
}
