import * as SQLite from 'expo-sqlite';

export async function migrateV2(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(
    `ALTER TABLE workout_sessions ADD COLUMN estimated_calories INTEGER;`,
  );
}
