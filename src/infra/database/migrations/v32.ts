import type * as SQLite from 'expo-sqlite';

// v32: v1.5 Stage 1 Phase 1.4 — coach_advice_local read-cache mirror.
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_1_ai_chat_epic.md §5.1 (coach_advice
//     Supabase table with unique (user_id, scope, period_start))
//   - §5.2 (read-cache only, NO sync_queue integration)
//
// The Supabase `coach_advice` table is authoritative. The local
// mirror is a read cache populated by:
//   - the coach-advice EF response (UPSERT after the EF returns),
//   - the periodic `syncCoachAdviceFromSupabase` pull (reconciliation
//     of cross-device deletes).
//
// CHECK constraints intentionally OMITTED on the SQLite side
// (matches the v26 / v30 / v31 convention): Postgres carries the
// scope CHECK ('weekly' | 'daily'); the client trusts the server-
// side guarantee and uses TypeScript unions for app-level safety.

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

export async function migrateV32(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS coach_advice_local (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      period_start TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_advice_local_bucket
      ON coach_advice_local(user_id, scope, period_start);

    CREATE INDEX IF NOT EXISTS idx_coach_advice_local_user_scope
      ON coach_advice_local(user_id, scope, period_start DESC);
  `);

  // Defensive: a partial v32 apply may have created the table
  // without the new columns. addColumnIfMissing keeps re-runs safe.
  const existing = await getExistingColumns(db, 'coach_advice_local');
  if (!existing.has('content')) {
    try {
      await db.execAsync(
        `ALTER TABLE coach_advice_local ADD COLUMN content TEXT NOT NULL DEFAULT '';`,
      );
    } catch (err) {
      const msg = String((err as { message?: unknown })?.message ?? err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
}
