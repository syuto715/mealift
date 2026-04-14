import type * as SQLite from 'expo-sqlite';

export async function migrateV5(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS progress_photos (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      date TEXT NOT NULL,
      photo_uri TEXT NOT NULL,
      pose_type TEXT NOT NULL DEFAULT 'front',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_progress_photos_profile_date
      ON progress_photos(profile_id, date DESC);

    CREATE TABLE IF NOT EXISTS weekly_reports (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reports_profile_week
      ON weekly_reports(profile_id, week_start);
  `);
}
