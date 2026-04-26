import type * as SQLite from 'expo-sqlite';

// v15: PR table hardening.
//
// Two problems v15 fixes on existing installs:
//
// 1. The v7 personal_records CHECK constraint only permits the strength PR
//    types ('estimated_1rm', 'max_weight', 'max_volume_session',
//    'max_reps_at_weight'). checkAndRecordCardioPRs writes 'max_duration',
//    'max_distance', 'max_calories' — those inserts were silently failing
//    because the call site swallows errors.
//
// 2. Some installs have legacy estimated_1rm rows whose value was computed
//    before the EPLEY_REPS_CAP guard landed (e.g. a 100kg × 500-rep typo
//    persisted as a 1766.7kg "PR"). We recompute those rows from
//    weight_kg / reps using the clamped Epley formula, and drop rows that
//    have non-positive weight or reps (which can never have been valid).
//
// SQLite cannot drop or widen a CHECK in place, so we recreate the table.
export async function migrateV15(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.execAsync(`
      ALTER TABLE personal_records RENAME TO personal_records_old_v15;

      CREATE TABLE personal_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        record_type TEXT NOT NULL CHECK (record_type IN (
          'estimated_1rm',
          'max_weight',
          'max_volume_session',
          'max_reps_at_weight',
          'max_duration',
          'max_distance',
          'max_calories'
        )),
        value REAL NOT NULL,
        weight_kg REAL NOT NULL,
        reps INTEGER NOT NULL,
        achieved_at TEXT NOT NULL,
        session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO personal_records (
        id, user_id, exercise_id, record_type, value,
        weight_kg, reps, achieved_at, session_id, created_at
      )
      SELECT
        id, user_id, exercise_id, record_type, value,
        weight_kg, reps, achieved_at, session_id, created_at
      FROM personal_records_old_v15;

      DROP TABLE personal_records_old_v15;

      CREATE INDEX IF NOT EXISTS idx_prs_exercise_type_value
        ON personal_records(exercise_id, record_type, value DESC);
      CREATE INDEX IF NOT EXISTS idx_prs_user_achieved
        ON personal_records(user_id, achieved_at DESC);
    `);

    // Recompute estimated_1rm using the clamped Epley formula. MIN(reps, 30)
    // mirrors EPLEY_REPS_CAP in src/domain/personalRecord.ts. Round to 2 dp
    // to match insertPR's Number(...toFixed(2)) call.
    await db.runAsync(
      `UPDATE personal_records
         SET value = ROUND(weight_kg * (1 + (MIN(reps, 30) * 1.0) / 30.0), 2)
       WHERE record_type = 'estimated_1rm'
         AND weight_kg > 0
         AND reps > 0`,
    );

    // Anything with non-positive weight or reps in a strength row is
    // unrecoverable — drop it so it cannot resurface as a "PR".
    await db.runAsync(
      `DELETE FROM personal_records
        WHERE record_type IN (
          'estimated_1rm', 'max_weight', 'max_volume_session', 'max_reps_at_weight'
        )
          AND (weight_kg <= 0 OR reps <= 0)`,
    );
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
