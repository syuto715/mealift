import type * as SQLite from 'expo-sqlite';

// v20: sync_watermarks — single-row-per-resource KV that records the
// last successfully-pulled `updated_at` for an externally-managed
// resource (currently public_foods.status='approved'; future
// resources can land alongside).
//
// Why a dedicated table rather than reusing the v1 sync_queue?
// sync_queue is a write-out backlog: pending local changes that
// need to push to the server. Watermarks are the *opposite* axis —
// "the most recent moment we observed remote state through." Keeping
// them in their own table avoids confusing the two axes and lets
// each evolve independently.
//
// Schema notes:
//   - resource is the primary key (one row per pulled resource).
//   - last_pulled_at is the server-side updated_at of the latest row
//     incorporated locally, stored as the verbatim ISO string the
//     server returned. We do NOT convert to local time — the next
//     pull's `WHERE updated_at > ?` must compare against the
//     server's clock, not ours.
export async function migrateV20(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_watermarks (
      resource TEXT PRIMARY KEY,
      last_pulled_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
