import type * as SQLite from 'expo-sqlite';

// v35: v1.5 Stage 2 Phase 2.1 — restaurant_menu_items_local +
// restaurant_menu_item_aliases_local (side-table pattern matching
// v34's restaurant_aliases_local).
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §5.2
//     (SQLite mirror minus takedown_flag — server filters on pull)
//   - §3.1 surface ① (search query joins menu_items_local +
//     restaurants_local + the two alias side tables for fuzzy
//     prefix lookup)
//   - §5.1 (jsonb on Supabase side stored as TEXT on SQLite —
//     `ingredient_decomposition_json` is parsed at read time)
//
// use_count is client-mirrored and may transiently advance ahead
// via the Phase 2.3 quick-log read-back path; next sync restores
// authority (§5.2).
//
// CHECK constraints intentionally OMITTED on the SQLite side
// (matches the v26 / v30 / v31 / v32 / v33 / v34 convention).

export async function migrateV35(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS restaurant_menu_items_local (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      serving_size_g REAL NOT NULL DEFAULT 100,
      serving_unit TEXT NOT NULL DEFAULT 'g',
      serving_description TEXT,
      calories_per_serving REAL NOT NULL,
      protein_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      carb_g REAL NOT NULL DEFAULT 0,
      fiber_g REAL,
      sugar_g REAL,
      salt_g REAL,
      sodium_mg REAL,
      saturated_fat_g REAL,
      cholesterol_mg REAL,
      barcode TEXT,
      ingredient_decomposition_json TEXT,
      source TEXT NOT NULL,
      source_url TEXT,
      source_captured_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants_local(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_restaurant_menu_items_local_restaurant
      ON restaurant_menu_items_local(restaurant_id, use_count DESC);
    CREATE INDEX IF NOT EXISTS idx_restaurant_menu_items_local_name
      ON restaurant_menu_items_local(name);
    CREATE INDEX IF NOT EXISTS idx_restaurant_menu_items_local_barcode
      ON restaurant_menu_items_local(barcode);

    CREATE TABLE IF NOT EXISTS restaurant_menu_item_aliases_local (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      alias_lower TEXT NOT NULL,
      FOREIGN KEY (menu_item_id) REFERENCES restaurant_menu_items_local(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_restaurant_menu_item_aliases_local_lower
      ON restaurant_menu_item_aliases_local(alias_lower);
    CREATE INDEX IF NOT EXISTS idx_restaurant_menu_item_aliases_local_menu
      ON restaurant_menu_item_aliases_local(menu_item_id);
  `);
}
