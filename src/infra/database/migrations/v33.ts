import type * as SQLite from 'expo-sqlite';

// v33: v1.5 Stage 1 Phase 1.5 — routine_generations_local +
// sync_queue exception (the lone surface where draft state is
// local-authoritative; §5.2 I2).
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_1_ai_chat_epic.md §5.1 (Supabase
//     `routine_generations` schema with TEXT soft FK to local
//     workout_routines)
//   - §5.2 — sync_queue exception (chat / advice are server-
//     authoritative, but pre-apply routine_generation drafts MUST
//     survive a force-kill between Generate and Apply, so the
//     local row is the authority until apply commits)
//
// status enum: 'draft' | 'applied' | 'discarded'.
// applied_routine_id is the local workout_routines.id (TEXT) — set
// when the draft is materialized into the user's routine list.
//
// CHECK constraints intentionally OMITTED on the SQLite side
// (matches the v26 / v30 / v31 / v32 convention).

export async function migrateV33(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS routine_generations_local (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      prompt_context_json TEXT NOT NULL,
      generated_routine_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      applied_routine_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_routine_generations_local_user_status
      ON routine_generations_local(user_id, status, created_at DESC);
  `);
}
