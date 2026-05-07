import type * as SQLite from 'expo-sqlite';

// v27: profiles.plate_step_kg column (Build 15 / Feature 5-C client side).
//
// Mirrors the server-side migration which adds the same column with
// `numeric not null default 2.5` plus a CHECK constraint pinning the
// value to one of {0.5, 1.0, 1.25, 2.5}. SQLite ALTER TABLE can't add
// CHECK to existing tables, so the local side relies on app-level
// validation (Profile type narrows to a SetStep union, settings UI
// only offers the four options) and Supabase rejects out-of-enum
// writes during sync.
//
// Default 2.5 matches the JP gym standard plate step. The 4 supported
// options come from docs/build-15-design.md §6.6.4 (long-term-strategy
// §7.3 plate-rounding subtlety): 2.5 (gym standard), 1.25 (fractional
// plates), 1 (Japanese dumbbell rack standard), 0.5 (Olympic micro).
//
// Idempotency: PRAGMA table_info inspected; column added only when
// missing. Same pattern v24/v23/v14/v13/v12/v11 use.

interface ColumnInfo {
  name: string;
}

async function getExistingColumns(
  db: SQLite.SQLiteDatabase,
  table: string,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<ColumnInfo>(
    `PRAGMA table_info(${table});`,
  );
  return new Set(rows.map((c) => c.name));
}

export async function migrateV27(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await getExistingColumns(db, 'profiles');
  if (!existing.has('plate_step_kg')) {
    try {
      await db.execAsync(
        `ALTER TABLE profiles
           ADD COLUMN plate_step_kg REAL NOT NULL DEFAULT 2.5;`,
      );
    } catch {
      // Race / column already added — safe to ignore.
    }
  }
}
