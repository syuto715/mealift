import type * as SQLite from 'expo-sqlite';

// v29: deload_recommendations table (Build 16 / Phase 4 / Feature F).
//
// Stores Pro-tier auto-detected deload suggestions plus their lifecycle
// state. Phase 4.0 lays the schema; Phase 4.1 fills it via the
// detection algorithm; Phase 4.2 wires the UI banner + push reminder.
//
// Schema notes:
//   - `id` is generated locally with the same generateId() helper every
//     other user-private table uses (UUID-shaped opaque string). Sync
//     keys on `id` directly — no composite-key reconciliation needed
//     because rows are only ever created via the runtime detector
//     (no migration backfill that could diverge between local and
//     server, unlike user_equipment in v28).
//   - `source_week_starts` stores a JSON array of 4 ISO date strings
//     (Monday anchors per Phase 2 sign-off F5). Validated client-side
//     by the detector; the schema treats it as TEXT to keep the
//     sync layer transport-agnostic.
//   - `affected_muscles` similarly stores a JSON array of VolumeGroup
//     keys (e.g. ["chest", "biceps"]).
//   - State columns (applied_at / applied_routine_id / completed_at /
//     dismissed_at) form an open state machine: detected → applied
//     OR dismissed; applied may further → completed. Only one of
//     {applied, dismissed} can be non-null per row; the repository's
//     state-transition helpers enforce that invariant.
//   - `applied_routine_id` is a soft FK into workout_routines; no
//     SQLite FOREIGN KEY clause because cross-table sync ordering can
//     leave the routine row absent locally for a brief window. The
//     repository handles dangling references gracefully.
//   - Soft-delete columns (deleted_at / synced_at / updated_at) match
//     the v23 user-private convention. New tables created post-v23
//     bake them into CREATE TABLE rather than relying on the v23
//     ALTER pass.
//
// UNIQUE index on (profile_id, detected_at) prevents the detector
// from logging the same rolling-4-week trigger twice for the same
// user when the screen mounts repeatedly within a single calendar
// minute. The repository's ON CONFLICT clause turns concurrent
// inserts into idempotent UPDATEs (Phase 1.1 race-fix pattern).
//
// Idempotency: CREATE TABLE / INDEX guarded with IF NOT EXISTS, so
// re-running the migration after partial state is safe.

export async function migrateV29(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS deload_recommendations (
       id TEXT PRIMARY KEY NOT NULL,
       profile_id TEXT NOT NULL,
       detected_at TEXT NOT NULL,
       source_week_starts TEXT NOT NULL,
       affected_muscles TEXT NOT NULL,
       applied_at TEXT,
       applied_routine_id TEXT,
       completed_at TEXT,
       dismissed_at TEXT,
       created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       deleted_at TEXT,
       synced_at TEXT
     );`,
  );
  await db.execAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_deload_recommendations_profile_detected
       ON deload_recommendations(profile_id, detected_at);`,
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_deload_recommendations_profile_active
       ON deload_recommendations(profile_id, applied_at, dismissed_at, deleted_at);`,
  );
}
