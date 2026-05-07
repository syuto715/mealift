import type * as SQLite from 'expo-sqlite';

// v26: 5-B (estimated_1rm history) + 5-O (set_type / set_pattern columns).
//
// Build 15 / Session 6 schema. After this migration:
//   - estimated_1rm table exists as an append-only history of working-set
//     1RM observations. NO UNIQUE(profile_id, exercise_id) — multiple
//     points per (user, exercise) over time feed the pr-detail line chart.
//     Current e1rm = ORDER BY observed_at DESC LIMIT 1.
//   - workout_sets has set_type column (default 'working'). Existing rows
//     with is_warmup=1 are backfilled to set_type='warmup' so the legacy
//     boolean stays in sync with the new enum surface. is_warmup is kept
//     for backward compat in this migration; downstream code may
//     gradually pivot to reading set_type.
//   - workout_routine_items has set_pattern + pattern_config columns
//     (both nullable; NULL set_pattern = standard routine).
//
// Asymmetry note: Postgres user_workout_sets.set_type and
// user_workout_routine_items.set_pattern carry CHECK constraints (server
// migration <ts>_estimated_1rm_and_set_patterns.sql). SQLite ALTER TABLE
// can't add CHECK to existing tables, so the local side relies on
// app-level validation (constants/setPatterns.ts + types/workout.ts
// SetType / SetPattern unions) and Supabase rejects out-of-enum on
// sync.
//
// Idempotency: CREATE TABLE / INDEX / ALTER all guarded
// (IF NOT EXISTS / addColumnIfMissing). UPDATE is_warmup→set_type
// uses a WHERE that filters already-converted rows, so re-running the
// migration is a no-op.

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

export async function migrateV26(db: SQLite.SQLiteDatabase): Promise<void> {
  // 1. estimated_1rm table — append-only working-set 1RM history.
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS estimated_1rm (
       id TEXT PRIMARY KEY,
       profile_id TEXT NOT NULL,
       exercise_id TEXT NOT NULL,
       e1rm_kg REAL NOT NULL,
       formula TEXT NOT NULL,
       source_set_id TEXT,
       observed_at TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       deleted_at TEXT,
       synced_at TEXT
     );`,
  );

  // Composite index for the two hot queries:
  //   - chart history: WHERE profile_id=? AND exercise_id=?
  //                      AND observed_at > now-90d
  //                    ORDER BY observed_at
  //   - current latest: WHERE profile_id=? AND exercise_id=?
  //                    ORDER BY observed_at DESC LIMIT 1
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_e1rm_profile_exercise_observed
       ON estimated_1rm(profile_id, exercise_id, observed_at);`,
  );

  // 2. workout_sets.set_type — enum-like marker for set role.
  //    Allowed values (validated at app + server CHECK):
  //    'warmup' | 'working' | 'top' | 'drop' | 'failure'
  const setsCols = await getExistingColumns(db, 'workout_sets');
  await addColumnIfMissing(
    db,
    'workout_sets',
    setsCols,
    'set_type',
    `TEXT NOT NULL DEFAULT 'working'`,
  );

  // 2b. Backfill set_type='warmup' for legacy is_warmup=1 rows.
  //     The WHERE filter excludes rows already migrated, making this
  //     idempotent across re-runs.
  await db.execAsync(
    `UPDATE workout_sets
        SET set_type = 'warmup'
      WHERE is_warmup = 1 AND set_type != 'warmup';`,
  );

  // 3. workout_routine_items.set_pattern + pattern_config —
  //    routine-level template marker. NULL set_pattern = standard
  //    (existing routines unaffected).
  //    Allowed set_pattern values: NULL | '5x5' | 'top_set' | 'drop_set'
  //    pattern_config: optional JSON for parameters (e.g. drop count).
  const itemsCols = await getExistingColumns(db, 'workout_routine_items');
  await addColumnIfMissing(
    db,
    'workout_routine_items',
    itemsCols,
    'set_pattern',
    'TEXT',
  );
  await addColumnIfMissing(
    db,
    'workout_routine_items',
    itemsCols,
    'pattern_config',
    'TEXT',
  );
}
