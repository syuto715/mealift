import type * as SQLite from 'expo-sqlite';

// v12: cardio / sports / other exercise support.
//
// Adds:
//   exercises.exercise_type  TEXT NOT NULL DEFAULT 'strength'
//     'strength' | 'cardio' | 'sports' | 'other'
//   exercises.met_value      REAL  — Metabolic Equivalent of Task. Used to
//     derive calories: kcal = MET × weight_kg × hours.
//   workout_sets.duration_minutes   REAL
//   workout_sets.distance_km        REAL
//   workout_sets.calories_burned    REAL
//   workout_sets.perceived_intensity INTEGER  — 1–10 RPE-style self-report
//
// Idempotency: ALTER TABLE ADD COLUMN on SQLite is not idempotent, so we
// inspect PRAGMA table_info first and skip columns that already exist. This
// keeps the migration safe to re-run locally after partial testing.

interface ColumnInfo {
  name: string;
}

interface ColumnSpec {
  table: 'exercises' | 'workout_sets';
  name: string;
  type: string;
}

const NEW_COLUMNS: ReadonlyArray<ColumnSpec> = [
  { table: 'exercises', name: 'exercise_type', type: "TEXT NOT NULL DEFAULT 'strength'" },
  { table: 'exercises', name: 'met_value', type: 'REAL' },
  { table: 'workout_sets', name: 'duration_minutes', type: 'REAL' },
  { table: 'workout_sets', name: 'distance_km', type: 'REAL' },
  { table: 'workout_sets', name: 'calories_burned', type: 'REAL' },
  { table: 'workout_sets', name: 'perceived_intensity', type: 'INTEGER' },
];

export async function migrateV12(db: SQLite.SQLiteDatabase): Promise<void> {
  const tableColumns = new Map<string, Set<string>>();

  for (const table of ['exercises', 'workout_sets'] as const) {
    const rows = await db.getAllAsync<ColumnInfo>(
      `PRAGMA table_info(${table});`,
    );
    tableColumns.set(table, new Set(rows.map((c) => c.name)));
  }

  for (const { table, name, type } of NEW_COLUMNS) {
    const existing = tableColumns.get(table);
    if (existing?.has(name)) continue;
    try {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${name} ${type};`);
    } catch {
      // Column may have been added by a concurrent run — safe to ignore.
    }
  }
}
