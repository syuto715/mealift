import type * as SQLite from 'expo-sqlite';

// v13: "My Dish" (mai-ryouri) support on the dishes table.
//
// The existing `is_custom` column marks dishes saved from AI estimates.
// `is_my_dish` specifically flags dishes the user composed by hand from the
// food database — these drive the "マイ料理" tab on the food-add screen and
// are the only dishes the user can edit/delete.
//
// Adds:
//   dishes.is_my_dish   INTEGER NOT NULL DEFAULT 0
//   dishes.last_used_at TEXT              — null until first use; powers sort
//   dishes.user_note    TEXT              — optional short memo
//   dishes.deleted_at   TEXT              — soft-delete tombstone
//
// Idempotent: inspects PRAGMA table_info first and skips columns that already
// exist. `use_count` already exists from v3, so we don't re-add it.

interface ColumnInfo {
  name: string;
}

interface ColumnSpec {
  name: string;
  type: string;
}

const NEW_COLUMNS: ReadonlyArray<ColumnSpec> = [
  { name: 'is_my_dish', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'last_used_at', type: 'TEXT' },
  { name: 'user_note', type: 'TEXT' },
  { name: 'deleted_at', type: 'TEXT' },
];

export async function migrateV13(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<ColumnInfo>(
    `PRAGMA table_info(dishes);`,
  );
  const existing = new Set(rows.map((c) => c.name));

  for (const { name, type } of NEW_COLUMNS) {
    if (existing.has(name)) continue;
    try {
      await db.execAsync(`ALTER TABLE dishes ADD COLUMN ${name} ${type};`);
    } catch {
      // Column may have been added concurrently — safe to ignore.
    }
  }

  // Index to keep the "my-dish list ordered by last used" query cheap once
  // users accumulate many entries.
  try {
    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_dishes_my_last_used
         ON dishes(is_my_dish, last_used_at);`,
    );
  } catch {
    // Non-fatal — the query still works without the index, just slower.
  }
}
