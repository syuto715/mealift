import type * as SQLite from 'expo-sqlite';
import { EXERCISES_V2 } from './data';

// seedExercisesV2 — Build 15 / Feature 5-A run-on-every-boot UPSERT.
//
// Pre-condition: migration v25 has run, which:
//   - Added the 8 v2 columns (slug, primary_muscle, etc.)
//   - Backfilled slug for existing 43 strength rows (ex_001..ex_063)
//   - Normalized equipment to 8-cat enum for all 85 rows
//   - Created UNIQUE INDEX on slug WHERE NOT NULL
//
// What this seed does:
//   - For each row in EXERCISES_V2, runs INSERT ... ON CONFLICT(slug)
//     DO UPDATE. The conflict key is slug (matched via the partial
//     UNIQUE INDEX from v25).
//   - Existing 43 strength rows (matched by slug) get their v2 fields
//     refreshed: primary_muscle, movement_pattern, is_compound,
//     name_ja/name_en (if changed), muscle_group, equipment, sort_order.
//   - New rows (ex_064..ex_193 ranges) get inserted with full v2
//     skeleton fields. form_cue_ja, rep_range_low/high, video_url
//     stay NULL — Phase 2B fills form_cue_ja in batched commits.
//
// User customs (is_custom=1) are NEVER touched — they have slug=NULL
// so they don't conflict with the slug-keyed UPSERT, and the WHERE
// clause on UPDATE explicitly filters them out as defense-in-depth.
//
// Boot cost: 133 row UPSERTs per app launch. SQLite can churn this in
// ~50ms on a typical phone. Comparable to the existing seedFoods
// run (1500+ MEXT food rows). Acceptable.
//
// Idempotent: stable IDs (matched by slug), repeat runs produce the
// same final state. Safe to re-run after partial failure.

export async function seedExercisesV2(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  for (const exercise of EXERCISES_V2) {
    await db.runAsync(
      `INSERT INTO exercises (
         id, slug, name_ja, name_en, muscle_group, secondary_muscles,
         equipment, is_custom, sort_order, exercise_type, met_value,
         primary_muscle, movement_pattern, is_compound,
         form_cue_ja, rep_range_low, rep_range_high
       ) VALUES (?, ?, ?, ?, ?, NULL, ?, 0, ?, 'strength', NULL, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name_ja = excluded.name_ja,
         name_en = excluded.name_en,
         muscle_group = excluded.muscle_group,
         equipment = excluded.equipment,
         sort_order = excluded.sort_order,
         primary_muscle = excluded.primary_muscle,
         movement_pattern = excluded.movement_pattern,
         is_compound = excluded.is_compound,
         form_cue_ja = excluded.form_cue_ja,
         rep_range_low = excluded.rep_range_low,
         rep_range_high = excluded.rep_range_high
       WHERE exercises.is_custom = 0;`,
      [
        exercise.id,
        exercise.slug,
        exercise.name_ja,
        exercise.name_en,
        exercise.muscle_group,
        exercise.equipment,
        exercise.sort_order,
        exercise.primary_muscle,
        exercise.movement_pattern,
        exercise.is_compound ? 1 : 0,
        // Phase 2B fields. Optional on the row type; NULL fallback
        // for entries not yet authored (shoulders/arms/legs/core/full
        // body until their batches land).
        exercise.form_cue_ja ?? null,
        exercise.rep_range_low ?? null,
        exercise.rep_range_high ?? null,
      ],
    );
  }
}
