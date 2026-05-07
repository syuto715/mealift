import type * as SQLite from 'expo-sqlite';

// v25: exercise DB schema expansion + 8-cat equipment normalization
// + slug backfill on existing canonical strength rows.
//
// Build 15 / Feature 5-A schema groundwork. After this migration:
//   - exercises has 7 new columns (slug / primary_muscle /
//     movement_pattern / is_compound / rep_range_low / rep_range_high /
//     form_cue_ja / video_url) — 8 actually counting video_url.
//   - All 85 existing seed rows have equipment values normalized to the
//     8-category enum (Gymwork taxonomy from long-term-strategy.md §2.2).
//   - All 43 existing strength rows have slug populated by mapping table
//     (see SLUG_BACKFILL constant). Cardio/sports/other (42 rows) keep
//     slug = NULL — no slug-driven feature consumes them.
//   - exercises has UNIQUE index on slug (partial, WHERE slug IS NOT NULL)
//     so the seedExercisesV2 UPSERT(slug) can match and refresh existing
//     strength rows on every boot.
//
// Asymmetry note: Postgres user_custom_exercises has a CHECK constraint
// on equipment (Build 15 / migration 20260507000006). SQLite ALTER TABLE
// can't add CHECK constraints to existing tables, so the local side
// relies on app-level validation (the 5-P 8-cat picker UI is the gate).
//
// Idempotency: PRAGMA table_info inspected per column; columns added
// only when missing. UPDATE statements use ID lookups so re-running
// after partial state is safe (matched rows get updated, others are
// no-ops). UNIQUE index uses IF NOT EXISTS.
//
// SQLite ALTER TABLE constraint reminder: defaults must be constants.
// is_compound uses INTEGER NOT NULL DEFAULT 0; the rest are nullable.

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

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  existing: Set<string>,
  column: string,
  definition: string,
): Promise<void> {
  if (existing.has(column)) return;
  try {
    await db.execAsync(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`,
    );
  } catch {
    // Race / column already exists in some other path — safe to ignore.
  }
}

// SLUG_BACKFILL — mapping table from existing exercise.id to slug.
// Each entry was reviewed in Session 5 sign-off. Slugs are snake_case
// English following <movement>_<equipment_qualifier> for compound
// exercises (e.g., bench_press_barbell) and bare <movement> for
// equipment-agnostic / bodyweight (push_up, plank, dips).
const SLUG_BACKFILL: ReadonlyArray<readonly [string, string]> = [
  // === Chest (6) ===
  ['ex_001', 'bench_press_barbell'],
  ['ex_002', 'incline_bench_press_barbell'],
  ['ex_003', 'dumbbell_fly'],
  ['ex_004', 'chest_press_machine'],
  ['ex_005', 'push_up'],
  ['ex_006', 'bench_press_dumbbell'],
  // === Back (6) ===
  ['ex_010', 'deadlift_barbell'],
  ['ex_011', 'pull_up'],
  ['ex_012', 'lat_pulldown_machine'],
  ['ex_013', 'barbell_row'],
  ['ex_014', 'dumbbell_row'],
  ['ex_015', 'seated_row_machine'],
  // === Shoulders (6) ===
  ['ex_020', 'overhead_press_barbell'],
  ['ex_021', 'side_raise_dumbbell'],
  ['ex_022', 'front_raise_dumbbell'],
  ['ex_023', 'rear_delt_fly_dumbbell'],
  ['ex_024', 'upright_row_barbell'],
  ['ex_025', 'shoulder_press_dumbbell'],
  // === Legs (8) ===
  ['ex_030', 'squat_barbell'],
  ['ex_031', 'leg_press_machine'],
  ['ex_032', 'romanian_deadlift_barbell'],
  ['ex_033', 'leg_curl_machine'],
  ['ex_034', 'leg_extension_machine'],
  ['ex_035', 'calf_raise_machine'],
  ['ex_036', 'bulgarian_split_squat_dumbbell'],
  ['ex_037', 'goblet_squat_dumbbell'],
  // === Arms (7) ===
  ['ex_040', 'barbell_curl'],
  ['ex_041', 'dumbbell_curl'],
  ['ex_042', 'hammer_curl_dumbbell'],
  ['ex_043', 'triceps_pushdown_cable'],
  ['ex_044', 'skull_crusher_barbell'],
  ['ex_045', 'dips'],
  ['ex_046', 'concentration_curl_dumbbell'],
  // === Core (6) ===
  ['ex_050', 'crunch'],
  ['ex_051', 'leg_raise'],
  ['ex_052', 'plank'],
  ['ex_053', 'ab_roller'],
  ['ex_054', 'hanging_leg_raise'],
  ['ex_055', 'cable_crunch'],
  // === Full Body (4) ===
  ['ex_060', 'clean_barbell'],
  ['ex_061', 'snatch_barbell'],
  ['ex_062', 'burpee'],
  ['ex_063', 'kettlebell_swing'],
];

// EQUIPMENT_TO_CARDIO — cardio rows that should be tagged as 'cardio'
// regardless of their existing equipment value. Most cardio entries
// have equipment=NULL; a few have equipment='machine' (treadmill,
// elliptical, rowing). The 8-cat taxonomy treats cardio activities
// as the 'cardio' category, NOT 'machine', so these need explicit
// remapping.
const CARDIO_IDS_TO_CARDIO: readonly string[] = [
  'ex_c001', 'ex_c002', 'ex_c003', 'ex_c004', 'ex_c005',
  'ex_c006', 'ex_c007', 'ex_c008', 'ex_c009', 'ex_c010',
  'ex_c011', 'ex_c015', 'ex_c016', 'ex_c017', 'ex_c018',
  // c012/c013/c014 (yoga/pilates) → 'stretching', see below
];

// Cardio entries that are conceptually stretching despite the
// 'cardio' exerciseType tag. UI users searching for stretching
// expect yoga/pilates here.
const CARDIO_IDS_TO_STRETCHING: readonly string[] = [
  'ex_c012', 'ex_c013', 'ex_c014',  // yoga (hatha/power) + pilates
];

// SPORTS rows: all → 'other' (sports don't fit any of the
// equipment-shelf categories). 19 rows.
//
// OTHER rows: ex_o001 (ストレッチ) → 'stretching'; rest → 'other'.

export async function migrateV25(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await getExistingColumns(db, 'exercises');

  // 1. ALTER TABLE — add new columns. NULL allowed except is_compound.
  await addColumnIfMissing(db, 'exercises', existing, 'slug', 'TEXT');
  await addColumnIfMissing(db, 'exercises', existing, 'primary_muscle', 'TEXT');
  await addColumnIfMissing(db, 'exercises', existing, 'movement_pattern', 'TEXT');
  await addColumnIfMissing(
    db,
    'exercises',
    existing,
    'is_compound',
    'INTEGER NOT NULL DEFAULT 0',
  );
  await addColumnIfMissing(db, 'exercises', existing, 'rep_range_low', 'INTEGER');
  await addColumnIfMissing(db, 'exercises', existing, 'rep_range_high', 'INTEGER');
  await addColumnIfMissing(db, 'exercises', existing, 'form_cue_ja', 'TEXT');
  await addColumnIfMissing(db, 'exercises', existing, 'video_url', 'TEXT');

  // 2. Slug backfill on existing 43 strength rows. ID-keyed UPDATE so
  //    re-running is idempotent (matched rows stay set, no others touched).
  for (const [id, slug] of SLUG_BACKFILL) {
    await db.runAsync(
      `UPDATE exercises SET slug = ? WHERE id = ? AND (slug IS NULL OR slug != ?);`,
      [slug, id, slug],
    );
  }

  // 3. Equipment 8-cat normalization. Order matters: specific
  //    overrides (cable→machine, ab_roller→other, yoga→stretching) before
  //    catch-alls (NULL strength→bodyweight, cardio→cardio, sports→other).

  // 3a. cable → machine (strength rows)
  await db.execAsync(
    `UPDATE exercises SET equipment = 'machine' WHERE equipment = 'cable';`,
  );

  // 3b. ab_roller → other (strength rows; not in 8-cat)
  await db.execAsync(
    `UPDATE exercises SET equipment = 'other' WHERE equipment = 'ab_roller';`,
  );

  // 3c. yoga + pilates (cardio exerciseType) → stretching
  if (CARDIO_IDS_TO_STRETCHING.length > 0) {
    const placeholders = CARDIO_IDS_TO_STRETCHING.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE exercises SET equipment = 'stretching' WHERE id IN (${placeholders});`,
      [...CARDIO_IDS_TO_STRETCHING],
    );
  }

  // 3d. ストレッチ (other exerciseType) → stretching
  await db.execAsync(
    `UPDATE exercises SET equipment = 'stretching' WHERE id = 'ex_o001';`,
  );

  // 3e. cardio rows (excluding yoga/pilates already handled in 3c) → cardio
  if (CARDIO_IDS_TO_CARDIO.length > 0) {
    const placeholders = CARDIO_IDS_TO_CARDIO.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE exercises SET equipment = 'cardio' WHERE id IN (${placeholders});`,
      [...CARDIO_IDS_TO_CARDIO],
    );
  }

  // 3f. sports rows → other
  await db.execAsync(
    `UPDATE exercises SET equipment = 'other' WHERE exercise_type = 'sports';`,
  );

  // 3g. other-type rows except ex_o001 → other
  await db.execAsync(
    `UPDATE exercises SET equipment = 'other'
       WHERE exercise_type = 'other' AND id != 'ex_o001';`,
  );

  // 3h. Strength bodyweight (equipment NULL) → bodyweight.
  //     Run AFTER 3a-3g so cardio/sports/other rows already have their
  //     non-NULL equipment populated and aren't caught by this catch-all.
  await db.execAsync(
    `UPDATE exercises SET equipment = 'bodyweight'
       WHERE equipment IS NULL AND exercise_type = 'strength';`,
  );

  // 3i. Defense-in-depth catchall: anything still outside 8-cat → other.
  //     Custom user exercises (is_custom=1) with arbitrary equipment values
  //     get caught here. (User had 0 customs at Session 5 sign-off; this
  //     guards future installs.)
  await db.execAsync(
    `UPDATE exercises SET equipment = 'other'
       WHERE equipment IS NOT NULL
         AND equipment NOT IN ('barbell','dumbbell','kettlebell','machine','bodyweight','cardio','stretching','other');`,
  );

  // 4. UNIQUE INDEX on slug (partial). Allows the seedExercisesV2
  //    UPSERT(slug) to use ON CONFLICT(slug) effectively. NULL slug
  //    rows (cardio/sports/other + future user customs) coexist
  //    without conflict.
  await db.execAsync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_slug_unique
       ON exercises(slug) WHERE slug IS NOT NULL;`,
  );
}
