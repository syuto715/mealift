import type * as SQLite from 'expo-sqlite';

// v23: sync metadata columns + sync_dead_letter table.
//
// First half of the cloud-sync layer's local-side prep (per
// docs/cloud-sync-design.md cd1a6d8 Part 3-1). The Repository
// SELECT / DELETE modifications that activate soft delete live
// in a follow-up commit (the actual "soft delete migration") —
// this file is just additive: new columns + new table.
//
// What this migration adds:
//   1. `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP` on every
//      user-private table that doesn't already have it. The columns
//      let the sync layer use last-write-wins on a single timestamp.
//      Repository UPDATE statements need to maintain this — that's
//      Phase 2-1's job, not v23.
//   2. `deleted_at TEXT` (nullable) on every user-private table that
//      doesn't already have it. NULL = active, non-NULL = tombstone.
//      Hard DELETE remains the current behavior in repos until Phase 2-1
//      switches to UPDATE-based soft delete.
//   3. `synced_at TEXT` (nullable) on every user-private table. NULL =
//      not yet pushed to Supabase; populated when sync confirms the row
//      is on the server. Provides a per-row backup signal alongside the
//      sync_queue mechanism — handy for "what's pending" queries that
//      would otherwise need a queue join.
//   4. `sync_dead_letter` table: rows from sync_queue that exceeded
//      retry budget get moved here to avoid eternal retry loops while
//      preserving the payload for manual recovery / inspection.
//
// What this migration deliberately does NOT do:
//   - Switch any repository SELECT/DELETE to soft-delete-aware. Those
//     changes ride in the next commit (Phase 2-1) which has its own
//     review checkpoint per the session rules.
//   - Backfill `synced_at`. New rows after this migration have
//     synced_at NULL; whether existing rows are treated as
//     "already synced" or "pending push" is an orchestration choice
//     made when Phase 5 wires up per-resource sync — see Phase 5 plan.
//
// Idempotency: PRAGMA table_info inspected per table; columns added
// only when missing. Same pattern v11/v12/v13/v14 use.
//
// SQLite ALTER TABLE ADD COLUMN constraint: defaults must be constants
// (or constant-tokens like CURRENT_TIMESTAMP). `(datetime('now'))` —
// which the v1 CREATE TABLE statements use — is rejected by SQLite as
// a non-constant default in an ALTER context. CURRENT_TIMESTAMP yields
// the same 'YYYY-MM-DD HH:MM:SS' shape, so existing readers don't
// notice the change.

interface ColumnInfo {
  name: string;
}

// User-private tables that participate in cloud sync. Note: `exercises`
// and `dishes` are mixed (canonical seed + user-created). Adding the
// metadata columns to canonical rows is harmless — the sync filter
// (is_custom=1 / is_my_dish=1) lives in the per-resource sync module,
// not in the schema.
const USER_PRIVATE_TABLES: readonly string[] = [
  'profiles',
  'body_logs',
  'workout_routines',
  'workout_routine_items',
  'workout_sessions',
  'workout_sets',
  'meal_logs',
  'meal_log_items',
  'meal_templates',
  'notes',
  'dishes',
  'dish_ingredients',
  'personal_records',
  'water_logs',
  'adaptive_goal_suggestions',
  'weekly_reports',
  'progress_photos',
  'exercises',
];

async function getExistingColumns(
  db: SQLite.SQLiteDatabase,
  table: string,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<ColumnInfo>(
    `PRAGMA table_info(${table});`,
  );
  return new Set(rows.map((c) => c.name));
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  existing: Set<string>,
  column: string,
  definition: string,
): Promise<void> {
  if (existing.has(column)) return;
  try {
    await db.execAsync(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`,
    );
  } catch {
    // Race / column already exists in some other path — safe to ignore.
  }
}

export async function migrateV23(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const table of USER_PRIVATE_TABLES) {
    const existing = await getExistingColumns(db, table);
    // updated_at: NOT NULL with constant default. CURRENT_TIMESTAMP gives
    // 'YYYY-MM-DD HH:MM:SS' which matches v1 CREATE TABLE conventions.
    await addColumnIfMissing(
      db,
      table,
      existing,
      'updated_at',
      'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    );
    // deleted_at: nullable tombstone. NULL = active.
    await addColumnIfMissing(db, table, existing, 'deleted_at', 'TEXT');
    // synced_at: nullable per-row sync confirmation timestamp.
    await addColumnIfMissing(db, table, existing, 'synced_at', 'TEXT');
  }

  // sync_dead_letter — rows that exhausted sync_queue retry budget. Same
  // shape as sync_queue plus the reason text and the move timestamp, with
  // the original created_at preserved so debugging can trace back to when
  // the row was first enqueued.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_dead_letter (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
      payload TEXT NOT NULL,
      retry_count INTEGER NOT NULL,
      reason TEXT,
      original_created_at TEXT NOT NULL,
      moved_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_sync_dead_letter_moved
      ON sync_dead_letter(moved_at DESC);
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_sync_dead_letter_table
      ON sync_dead_letter(table_name, record_id);
  `);
}
