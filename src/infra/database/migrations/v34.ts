import type * as SQLite from 'expo-sqlite';

// v34: v1.5 Stage 2 Phase 2.1 — restaurants_local +
// restaurant_chain_categories_local + restaurant_aliases_local
// (side-table pattern for aliases since SQLite has no native
// text[] type).
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §5.2
//     (SQLite mirrors; side-table pattern is the Codex round 1
//     Important #3 fix for text[] non-portability)
//   - §3.2 (offline reads — mirror is read-cache, server-
//     authoritative; takedown_flag NOT mirrored client-side
//     because RLS handles it on the server pull path)
//   - §6 (public-read, service-role-write — no per-user RLS on
//     mirror; same row visible to all clients)
//
// The Stage 1 epic's `diagnostic_sessions_local` placeholder for
// v34 (sub-phase 1.3.1 sync note) was already documented as
// deferred. Stage 2 reclaims v34. v33 was the last applied
// migration prior to this one.
//
// CHECK constraints intentionally OMITTED on the SQLite side
// (matches the v26 / v30 / v31 / v32 / v33 convention — server
// enforces; client mirror is permissive).

export async function migrateV34(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS restaurant_chain_categories_local (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS restaurants_local (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      restaurant_type TEXT NOT NULL,
      category_id TEXT,
      official_url TEXT,
      attribution TEXT NOT NULL,
      attribution_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_restaurants_local_type
      ON restaurants_local(restaurant_type);
    CREATE INDEX IF NOT EXISTS idx_restaurants_local_category
      ON restaurants_local(category_id);
    CREATE INDEX IF NOT EXISTS idx_restaurants_local_name
      ON restaurants_local(name);

    CREATE TABLE IF NOT EXISTS restaurant_aliases_local (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      alias_lower TEXT NOT NULL,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants_local(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_restaurant_aliases_local_lower
      ON restaurant_aliases_local(alias_lower);
    CREATE INDEX IF NOT EXISTS idx_restaurant_aliases_local_restaurant
      ON restaurant_aliases_local(restaurant_id);
  `);
}
