import type * as SQLite from 'expo-sqlite';

// v11: billing / trial state on the profiles row.
//
// Adds three nullable columns used by the Free / Plus / Pro plan system:
//   - trial_started_at   : ISO timestamp when the 7-day Plus trial began
//   - plan_billing_cycle : 'monthly' | 'biannual' | 'annual' | NULL
//   - plan_expires_at    : ISO timestamp when the active paid plan lapses
//
// Idempotency: ALTER TABLE ADD COLUMN is not idempotent on SQLite, so we read
// the current column list via PRAGMA table_info and skip columns that already
// exist. This keeps the migration safe to re-run (e.g., when a dev bumps
// user_version locally after partial testing).

interface ColumnInfo {
  name: string;
}

const NEW_COLUMNS: ReadonlyArray<{ name: string; type: string }> = [
  { name: 'trial_started_at', type: 'TEXT' },
  { name: 'plan_billing_cycle', type: 'TEXT' },
  { name: 'plan_expires_at', type: 'TEXT' },
];

export async function migrateV11(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await db.getAllAsync<ColumnInfo>(
    'PRAGMA table_info(profiles);',
  );
  const existingNames = new Set(existing.map((c) => c.name));

  for (const { name, type } of NEW_COLUMNS) {
    if (existingNames.has(name)) continue;
    try {
      await db.execAsync(
        `ALTER TABLE profiles ADD COLUMN ${name} ${type};`,
      );
    } catch {
      // Column may have been added by a concurrent run — safe to ignore.
    }
  }
}
