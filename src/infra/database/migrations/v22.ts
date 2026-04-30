import type * as SQLite from 'expo-sqlite';

// v22: user_badges — local store of earned achievement badges for
// the submission-promotion UX (Sprint 5 phase 5-4).
//
// One row per badge_id; badges are immutable once earned. The
// caller (badgeService) gates inserts on existence, so this is a
// strict "ledger of achievements" with no update path.
//
// Why local-only (not synced to Supabase):
//   - Badges are derived state. The criteria are deterministic
//     functions of submission history + use_count. If the user
//     reinstalls, evaluating the criteria against the rehydrated
//     submission table re-grants any badges that should be there.
//   - Avoids a Supabase round-trip on every submit-success path.
//   - Keeps the badges scope tight to "delight UX" without taking
//     on a sync layer that has its own failure modes.
//
// related_count holds whatever number drove the award (e.g. 50 for
// the "50件投稿" badge, the use_count snapshot at award time for the
// "100人に使われた" badge). Useful for the gallery UI to render the
// achievement context.
export async function migrateV22(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      badge_id TEXT NOT NULL UNIQUE,
      earned_at INTEGER NOT NULL,
      related_count INTEGER
    );
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_user_badges_earned_at
      ON user_badges(earned_at DESC);
  `);
}
