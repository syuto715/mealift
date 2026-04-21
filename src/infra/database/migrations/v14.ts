import type * as SQLite from 'expo-sqlite';

// v14: user-added + external-source tracking on foods.
//
// Foods already has a `source` text column (from v1) but no flag for rows
// originating from Open Food Facts vs. user manual input, and no tombstone
// for soft-deleting user-added rows.
//
// Adds:
//   foods.external_id   TEXT                   — OFF barcode etc. for re-lookup
//   foods.is_user_added INTEGER NOT NULL DEFAULT 0
//   foods.added_at      TEXT                   — timestamp for user-added rows
//   foods.verified      INTEGER NOT NULL DEFAULT 1
//   foods.deleted_at    TEXT                   — soft-delete tombstone
//
// The existing `source` column values get richer semantics:
//   'mext'            — 八訂 preset (legacy default)
//   'open_food_facts' — OFF lookup saved into foods for search
//   'user'            — user manual entry (food-submit screen)
//   'manual'          — legacy manual (addCustomFood before v14)
//   'curated'         — reserved for future official additions

interface ColumnInfo {
  name: string;
}

interface ColumnSpec {
  name: string;
  type: string;
}

const NEW_COLUMNS: ReadonlyArray<ColumnSpec> = [
  { name: 'external_id', type: 'TEXT' },
  { name: 'is_user_added', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'added_at', type: 'TEXT' },
  { name: 'verified', type: 'INTEGER NOT NULL DEFAULT 1' },
  { name: 'deleted_at', type: 'TEXT' },
];

export async function migrateV14(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<ColumnInfo>(
    `PRAGMA table_info(foods);`,
  );
  const existing = new Set(rows.map((c) => c.name));

  for (const { name, type } of NEW_COLUMNS) {
    if (existing.has(name)) continue;
    try {
      await db.execAsync(`ALTER TABLE foods ADD COLUMN ${name} ${type};`);
    } catch {
      // Column added concurrently — safe to ignore.
    }
  }

  // Barcode lookup index — speeds up foods.barcode fallback when OFF results
  // have been mirrored into the foods table.
  try {
    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_foods_barcode
         ON foods(barcode)
         WHERE barcode IS NOT NULL;`,
    );
  } catch {
    // Non-fatal — scan still works without the index, just slower on large DBs.
  }
}
