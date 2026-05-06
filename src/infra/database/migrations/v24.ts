import type * as SQLite from 'expo-sqlite';

// v24: profiles.notifications_submission_enabled column
// (Build 15 / Feature 3 client side).
//
// Mirrors the server-side migration 20260507000004_profile_notifications_toggle.sql
// which added the same column with `boolean default true` semantics.
// SQLite has no native boolean — store as INTEGER 0/1, NOT NULL,
// DEFAULT 1 for "opt-in by default" matching the server.
//
// This is the only schema change Build 15 needs from the local DB
// before Feature 5 starts. Feature 5-A's larger schema additions
// (slug / form_cue_ja / movement_pattern / etc. on exercises +
// estimated_1rm + user_equipment + set_pattern) land in v25.
//
// SQLite ALTER TABLE constraint reminder: defaults must be constants.
// 0/1 integers qualify; the server's `boolean default true` collapses
// to INTEGER DEFAULT 1 here. The sync layer (profileSync) handles the
// boolean ↔ integer conversion at the boundary.
//
// Idempotency: PRAGMA table_info inspected; column added only when
// missing. Same pattern v11/v12/v13/v14/v23 use.

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

export async function migrateV24(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await getExistingColumns(db, 'profiles');
  if (!existing.has('notifications_submission_enabled')) {
    try {
      await db.execAsync(
        `ALTER TABLE profiles
           ADD COLUMN notifications_submission_enabled INTEGER NOT NULL DEFAULT 1;`,
      );
    } catch {
      // Race / column already added — safe to ignore.
    }
  }
}
