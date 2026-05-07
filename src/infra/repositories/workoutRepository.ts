import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { MuscleGroup } from '../../types/common';
import { enqueueRowFromTable } from './syncRepository';
import {
  Exercise,
  ExerciseType,
  SetPattern,
  SetType,
  WorkoutRoutine,
  WorkoutRoutineItem,
  WorkoutRoutineWithItems,
  WorkoutSession,
  WorkoutSessionWithSets,
  WorkoutSet,
  WorkoutSetInput,
} from '../../types/workout';

// ---------------------------------------------------------------------------
// Row mapping helpers
// ---------------------------------------------------------------------------

function rowToExercise(row: Record<string, unknown>): Exercise {
  return {
    id: row.id as string,
    nameJa: row.name_ja as string,
    nameEn: (row.name_en as string) ?? null,
    muscleGroup: row.muscle_group as MuscleGroup,
    secondaryMuscles: row.secondary_muscles
      ? JSON.parse(row.secondary_muscles as string)
      : null,
    equipment: (row.equipment as string) ?? null,
    isCustom: (row.is_custom as number) === 1,
    sortOrder: (row.sort_order as number) ?? 0,
    exerciseType: ((row.exercise_type as string) ?? 'strength') as ExerciseType,
    metValue: (row.met_value as number) ?? null,
    createdAt: row.created_at as string,
    // Build 15 / Feature 5-A v25 fields. NULL on pre-migration rows or
    // user customs (is_custom=1) — caller treats null as "no metadata".
    slug: (row.slug as string) ?? null,
    primaryMuscle: (row.primary_muscle as string) ?? null,
    movementPattern: (row.movement_pattern as Exercise['movementPattern']) ?? null,
    isCompound: (row.is_compound as number) === 1,
    repRangeLow: (row.rep_range_low as number | null) ?? null,
    repRangeHigh: (row.rep_range_high as number | null) ?? null,
    formCueJa: (row.form_cue_ja as string) ?? null,
    videoUrl: (row.video_url as string) ?? null,
  };
}

function rowToRoutine(row: Record<string, unknown>): WorkoutRoutine {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToSession(row: Record<string, unknown>): WorkoutSession {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    routineId: (row.routine_id as string) ?? null,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string) ?? null,
    durationSeconds: (row.duration_seconds as number) ?? null,
    estimatedCalories: (row.estimated_calories as number) ?? null,
    note: (row.note as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToSet(row: Record<string, unknown>): WorkoutSet {
  const isWarmup = (row.is_warmup as number) === 1;
  // Build 15 / Feature 5-O — set_type column lands in v26. Fall back to
  // is_warmup-derived value for any pre-v26 row that survived migration
  // (the v26 backfill UPDATE catches is_warmup=1, but a defensive
  // fallback keeps rowToSet correct even if a brand-new row gets read
  // before the migration hook lands on this device).
  const rawSetType = row.set_type as string | undefined;
  const setType: SetType = rawSetType
    ? (rawSetType as SetType)
    : isWarmup
      ? 'warmup'
      : 'working';
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    exerciseId: row.exercise_id as string,
    setNumber: row.set_number as number,
    weightKg: (row.weight_kg as number) ?? null,
    reps: (row.reps as number) ?? null,
    rpe: (row.rpe as number) ?? null,
    rir: (row.rir as number) ?? null,
    isWarmup,
    note: (row.note as string) ?? null,
    durationMinutes: (row.duration_minutes as number) ?? null,
    distanceKm: (row.distance_km as number) ?? null,
    caloriesBurned: (row.calories_burned as number) ?? null,
    perceivedIntensity: (row.perceived_intensity as number) ?? null,
    createdAt: row.created_at as string,
    setType,
  };
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export async function getExercises(muscleGroup?: MuscleGroup): Promise<Exercise[]> {
  const db = await getDatabase();
  if (muscleGroup) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM exercises WHERE muscle_group = ? AND deleted_at IS NULL ORDER BY sort_order, name_ja',
      [muscleGroup],
    );
    return rows.map(rowToExercise);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM exercises WHERE deleted_at IS NULL ORDER BY sort_order, name_ja',
  );
  return rows.map(rowToExercise);
}

export async function searchExercises(query: string): Promise<Exercise[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM exercises WHERE name_ja LIKE ? AND deleted_at IS NULL ORDER BY sort_order, name_ja',
    [`%${query}%`],
  );
  return rows.map(rowToExercise);
}

export async function getExerciseById(exerciseId: string): Promise<Exercise | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL',
    [exerciseId]
  );
  return row ? rowToExercise(row) : null;
}

export async function getExerciseDefaultRestSeconds(exerciseId: string): Promise<number | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ default_rest_seconds: number | null }>(
    'SELECT default_rest_seconds FROM exercises WHERE id = ? AND deleted_at IS NULL',
    [exerciseId]
  );
  return row?.default_rest_seconds ?? null;
}

export async function createCustomExercise(
  nameJa: string,
  muscleGroup: MuscleGroup,
  equipment: string | null,
  exerciseType: ExerciseType = 'strength',
  metValue: number | null = null,
): Promise<Exercise> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO exercises
       (id, name_ja, name_en, muscle_group, secondary_muscles, equipment,
        is_custom, sort_order, exercise_type, met_value, created_at)
     VALUES (?, ?, NULL, ?, NULL, ?, 1, 999, ?, ?, ?)`,
    [id, nameJa, muscleGroup, equipment, exerciseType, metValue, now],
  );
  await enqueueRowFromTable('exercises', id, 'INSERT');

  return {
    id,
    nameJa,
    nameEn: null,
    muscleGroup,
    secondaryMuscles: null,
    equipment,
    isCustom: true,
    sortOrder: 999,
    exerciseType,
    metValue,
    createdAt: now,
    // Build 15 v25 fields. User customs leave them null/false until
    // a future Settings UI lets users author their own slug + metadata.
    slug: null,
    primaryMuscle: null,
    movementPattern: null,
    isCompound: false,
    repRangeLow: null,
    repRangeHigh: null,
    formCueJa: null,
    videoUrl: null,
  };
}

export async function getCustomExercises(): Promise<Exercise[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM exercises WHERE is_custom = 1 AND deleted_at IS NULL ORDER BY created_at DESC',
  );
  return rows.map(rowToExercise);
}

export async function updateCustomExercise(
  id: string,
  nameJa: string,
  muscleGroup: MuscleGroup,
  equipment: string | null,
  exerciseType?: ExerciseType,
  metValue?: number | null,
): Promise<void> {
  const db = await getDatabase();
  if (exerciseType !== undefined) {
    await db.runAsync(
      "UPDATE exercises SET name_ja = ?, muscle_group = ?, equipment = ?, exercise_type = ?, met_value = ?, updated_at = datetime('now') WHERE id = ? AND is_custom = 1",
      [nameJa, muscleGroup, equipment, exerciseType, metValue ?? null, id],
    );
  } else {
    await db.runAsync(
      "UPDATE exercises SET name_ja = ?, muscle_group = ?, equipment = ?, updated_at = datetime('now') WHERE id = ? AND is_custom = 1",
      [nameJa, muscleGroup, equipment, id],
    );
  }
  await enqueueRowFromTable('exercises', id, 'UPDATE');
}

export async function deleteCustomExercise(id: string): Promise<void> {
  const db = await getDatabase();
  // Soft delete: preserves the custom exercise row + tombstone. Canonical
  // (is_custom=0) seed rows can never reach this path because of the WHERE.
  await db.runAsync(
    "UPDATE exercises SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND is_custom = 1",
    [id],
  );
  await enqueueRowFromTable('exercises', id, 'UPDATE');
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

export async function getRoutines(profileId: string): Promise<WorkoutRoutineWithItems[]> {
  const db = await getDatabase();

  const routineRows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM workout_routines WHERE profile_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at DESC',
    [profileId],
  );

  const routines: WorkoutRoutineWithItems[] = [];

  for (const rr of routineRows) {
    const routine = rowToRoutine(rr);

    const itemRows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT ri.id, ri.routine_id, ri.exercise_id, ri.target_sets, ri.target_reps, ri.sort_order,
              ri.set_pattern, ri.pattern_config,
              e.id AS e_id, e.name_ja AS e_name_ja, e.name_en AS e_name_en,
              e.muscle_group AS e_muscle_group, e.secondary_muscles AS e_secondary_muscles,
              e.equipment AS e_equipment, e.is_custom AS e_is_custom,
              e.sort_order AS e_sort_order, e.exercise_type AS e_exercise_type,
              e.met_value AS e_met_value, e.created_at AS e_created_at
       FROM workout_routine_items ri
       JOIN exercises e ON ri.exercise_id = e.id
       WHERE ri.routine_id = ? AND ri.deleted_at IS NULL AND e.deleted_at IS NULL
       ORDER BY ri.sort_order`,
      [routine.id],
    );

    const items = itemRows.map((ir) => ({
      id: ir.id as string,
      routineId: ir.routine_id as string,
      exerciseId: ir.exercise_id as string,
      targetSets: (ir.target_sets as number) ?? 3,
      targetReps: (ir.target_reps as string) ?? null,
      sortOrder: (ir.sort_order as number) ?? 0,
      setPattern: ((ir.set_pattern as string) ?? null) as SetPattern | null,
      patternConfig: (ir.pattern_config as string) ?? null,
      exercise: {
        id: ir.e_id as string,
        nameJa: ir.e_name_ja as string,
        nameEn: (ir.e_name_en as string) ?? null,
        muscleGroup: ir.e_muscle_group as MuscleGroup,
        secondaryMuscles: ir.e_secondary_muscles
          ? JSON.parse(ir.e_secondary_muscles as string)
          : null,
        equipment: (ir.e_equipment as string) ?? null,
        isCustom: (ir.e_is_custom as number) === 1,
        sortOrder: (ir.e_sort_order as number) ?? 0,
        exerciseType: ((ir.e_exercise_type as string) ?? 'strength') as ExerciseType,
        metValue: (ir.e_met_value as number) ?? null,
        createdAt: ir.e_created_at as string,
      } as Exercise,
    }));

    routines.push({ ...routine, items });
  }

  return routines;
}

export async function createRoutine(
  profileId: string,
  name: string,
  items: { exerciseId: string; targetSets: number; targetReps: string }[],
): Promise<WorkoutRoutine> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    'INSERT INTO workout_routines (id, profile_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
    [id, profileId, name, now, now],
  );
  await enqueueRowFromTable('workout_routines', id, 'INSERT');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemId = generateId();
    await db.runAsync(
      'INSERT INTO workout_routine_items (id, routine_id, exercise_id, target_sets, target_reps, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [itemId, id, item.exerciseId, item.targetSets, item.targetReps, i],
    );
    await enqueueRowFromTable('workout_routine_items', itemId, 'INSERT');
  }

  return {
    id,
    profileId,
    name,
    description: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const db = await getDatabase();
  // Read the items list BEFORE the soft delete (so we can enqueue
  // each item's tombstone individually after). Filter `deleted_at IS NULL`
  // so already-tombstoned items aren't re-enqueued — they already had
  // their tombstone pushed when the user removed them individually.
  const items = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM workout_routine_items WHERE routine_id = ? AND deleted_at IS NULL',
    [routineId],
  );

  // Soft-delete cascade: items first, then routine. Same shape as the
  // hard-delete sequence this replaced — both rows must end up tombstoned
  // together so the sync layer pushes them as a coherent pair.
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE workout_routine_items SET deleted_at = ?, updated_at = ? WHERE routine_id = ?',
    [now, now, routineId],
  );
  await db.runAsync(
    'UPDATE workout_routines SET deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, routineId],
  );

  // Enqueue cascading tombstones. Items pushed before routine so the
  // server-side foreign-key checks pass (items reference the parent).
  for (const item of items) {
    await enqueueRowFromTable('workout_routine_items', item.id, 'UPDATE');
  }
  await enqueueRowFromTable('workout_routines', routineId, 'UPDATE');
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(
  profileId: string,
  routineId: string | null,
): Promise<WorkoutSession> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    'INSERT INTO workout_sessions (id, profile_id, routine_id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, profileId, routineId, now, now, now],
  );
  await enqueueRowFromTable('workout_sessions', id, 'INSERT');

  return {
    id,
    profileId,
    routineId,
    startedAt: now,
    finishedAt: null,
    durationSeconds: null,
    estimatedCalories: null,
    note: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function finishSession(
  sessionId: string,
  note?: string,
  estimatedCalories?: number,
): Promise<{ durationSeconds: number | null }> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const session = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT started_at FROM workout_sessions WHERE id = ? AND deleted_at IS NULL',
    [sessionId],
  );

  let durationSeconds: number | null = null;
  if (session) {
    const startedAt = new Date(session.started_at as string);
    durationSeconds = Math.round((new Date(now).getTime() - startedAt.getTime()) / 1000);
  }

  await db.runAsync(
    'UPDATE workout_sessions SET finished_at = ?, duration_seconds = ?, estimated_calories = ?, note = ?, updated_at = ? WHERE id = ?',
    [now, durationSeconds, estimatedCalories ?? null, note ?? null, now, sessionId],
  );
  await enqueueRowFromTable('workout_sessions', sessionId, 'UPDATE');

  return { durationSeconds };
}

export async function getTodayWorkoutCalories(profileId: string, date?: string): Promise<number> {
  const db = await getDatabase();
  const targetDate = date ?? new Date().toISOString().substring(0, 10);
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(estimated_calories), 0) as total
     FROM workout_sessions
     WHERE profile_id = ? AND date(started_at) = ? AND finished_at IS NOT NULL AND deleted_at IS NULL`,
    [profileId, targetDate],
  );
  return result?.total ?? 0;
}

export async function getSession(sessionId: string): Promise<WorkoutSessionWithSets | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM workout_sessions WHERE id = ? AND deleted_at IS NULL',
    [sessionId],
  );

  if (!row) return null;

  const session = rowToSession(row);
  const setRows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM workout_sets WHERE session_id = ? AND deleted_at IS NULL ORDER BY exercise_id, set_number',
    [sessionId],
  );

  return { ...session, sets: setRows.map(rowToSet) };
}

export async function getRecordedSessionDates(
  profileId: string,
  monthPrefix: string,
  historyWindowDays?: number | null,
): Promise<string[]> {
  const db = await getDatabase();
  const clamp =
    historyWindowDays != null
      ? ` AND date(started_at) >= date('now', '-${historyWindowDays} days')`
      : '';
  const rows = await db.getAllAsync<{ d: string }>(
    `SELECT DISTINCT date(started_at) as d FROM workout_sessions
     WHERE profile_id = ? AND date(started_at) LIKE ? || '%' AND finished_at IS NOT NULL AND deleted_at IS NULL${clamp}
     ORDER BY d`,
    [profileId, monthPrefix],
  );
  return rows.map((r) => r.d);
}

export async function getSessions(
  profileId: string,
  limit: number = 30,
  historyWindowDays?: number | null,
): Promise<WorkoutSession[]> {
  const db = await getDatabase();
  const clamp =
    historyWindowDays != null
      ? ` AND started_at >= datetime('now', '-${historyWindowDays} days')`
      : '';
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM workout_sessions WHERE profile_id = ? AND deleted_at IS NULL${clamp} ORDER BY started_at DESC LIMIT ?`,
    [profileId, limit],
  );
  return rows.map(rowToSession);
}

export async function getRecentSessionCount(
  profileId: string,
  days: number = 7,
): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM workout_sessions WHERE profile_id = ? AND started_at >= datetime('now', ?) AND deleted_at IS NULL`,
    [profileId, `-${days} days`],
  );
  return result?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

export async function addSet(
  sessionId: string,
  input: WorkoutSetInput,
): Promise<WorkoutSet> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  // Build 15 / Feature 5-O — Phase 1 minimal write-path bridge. Until
  // Phase 4 plumbs WorkoutSetInput.setType from the picker UI, derive
  // set_type from the legacy isWarmup boolean so new rows persist with
  // the correct value rather than the column DEFAULT 'working'.
  const setType: SetType =
    input.setType ?? (input.isWarmup ? 'warmup' : 'working');

  await db.runAsync(
    `INSERT INTO workout_sets
       (id, session_id, exercise_id, set_number, weight_kg, reps, rpe, rir,
        is_warmup, note, duration_minutes, distance_km, calories_burned,
        perceived_intensity, set_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sessionId,
      input.exerciseId,
      input.setNumber,
      input.weightKg ?? null,
      input.reps ?? null,
      input.rpe ?? null,
      input.rir ?? null,
      input.isWarmup ? 1 : 0,
      input.note ?? null,
      input.durationMinutes ?? null,
      input.distanceKm ?? null,
      input.caloriesBurned ?? null,
      input.perceivedIntensity ?? null,
      setType,
      now,
    ],
  );
  await enqueueRowFromTable('workout_sets', id, 'INSERT');

  return {
    id,
    sessionId,
    exerciseId: input.exerciseId,
    setNumber: input.setNumber,
    weightKg: input.weightKg ?? null,
    reps: input.reps ?? null,
    rpe: input.rpe ?? null,
    rir: input.rir ?? null,
    isWarmup: input.isWarmup ?? false,
    note: input.note ?? null,
    durationMinutes: input.durationMinutes ?? null,
    distanceKm: input.distanceKm ?? null,
    caloriesBurned: input.caloriesBurned ?? null,
    perceivedIntensity: input.perceivedIntensity ?? null,
    createdAt: now,
    setType,
  };
}

export async function updateSet(
  setId: string,
  updates: Partial<WorkoutSetInput>,
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.weightKg !== undefined) {
    fields.push('weight_kg = ?');
    values.push(updates.weightKg);
  }
  if (updates.reps !== undefined) {
    fields.push('reps = ?');
    values.push(updates.reps);
  }
  if (updates.rpe !== undefined) {
    fields.push('rpe = ?');
    values.push(updates.rpe);
  }
  if (updates.rir !== undefined) {
    fields.push('rir = ?');
    values.push(updates.rir);
  }
  if (updates.isWarmup !== undefined) {
    fields.push('is_warmup = ?');
    values.push(updates.isWarmup ? 1 : 0);
  }
  if (updates.note !== undefined) {
    fields.push('note = ?');
    values.push(updates.note);
  }
  if (updates.setNumber !== undefined) {
    fields.push('set_number = ?');
    values.push(updates.setNumber);
  }
  if (updates.durationMinutes !== undefined) {
    fields.push('duration_minutes = ?');
    values.push(updates.durationMinutes);
  }
  if (updates.distanceKm !== undefined) {
    fields.push('distance_km = ?');
    values.push(updates.distanceKm);
  }
  if (updates.caloriesBurned !== undefined) {
    fields.push('calories_burned = ?');
    values.push(updates.caloriesBurned);
  }
  if (updates.perceivedIntensity !== undefined) {
    fields.push('perceived_intensity = ?');
    values.push(updates.perceivedIntensity);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(setId);
  await db.runAsync(
    `UPDATE workout_sets SET ${fields.join(', ')} WHERE id = ?`,
    values as (string | number | null)[],
  );
  await enqueueRowFromTable('workout_sets', setId, 'UPDATE');
}

export async function removeSet(setId: string): Promise<void> {
  const db = await getDatabase();
  // Soft delete: preserves the set row + tombstone for sync.
  await db.runAsync(
    "UPDATE workout_sets SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [setId],
  );
  await enqueueRowFromTable('workout_sets', setId, 'UPDATE');
}

export async function getSetsForSession(sessionId: string): Promise<WorkoutSet[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM workout_sets WHERE session_id = ? AND deleted_at IS NULL ORDER BY exercise_id, set_number',
    [sessionId],
  );
  return rows.map(rowToSet);
}

export async function getPreviousSets(
  profileId: string,
  exerciseId: string,
): Promise<WorkoutSet[]> {
  const db = await getDatabase();

  const lastSession = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT ws.session_id
     FROM workout_sets ws
     JOIN workout_sessions s ON ws.session_id = s.id
     WHERE s.profile_id = ? AND ws.exercise_id = ? AND s.finished_at IS NOT NULL
       AND ws.deleted_at IS NULL AND s.deleted_at IS NULL
     ORDER BY s.started_at DESC
     LIMIT 1`,
    [profileId, exerciseId],
  );

  if (!lastSession) return [];

  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM workout_sets WHERE session_id = ? AND exercise_id = ? AND deleted_at IS NULL ORDER BY set_number',
    [lastSession.session_id as string, exerciseId],
  );

  return rows.map(rowToSet);
}

// ---------------------------------------------------------------------------
// Session helpers (for history display)
// ---------------------------------------------------------------------------

export async function getSessionWithRoutineName(
  profileId: string,
  limit: number = 30,
  historyWindowDays?: number | null,
): Promise<(WorkoutSession & { routineName: string | null })[]> {
  const db = await getDatabase();
  const clamp =
    historyWindowDays != null
      ? ` AND s.started_at >= datetime('now', '-${historyWindowDays} days')`
      : '';
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT s.*, r.name AS routine_name
     FROM workout_sessions s
     LEFT JOIN workout_routines r ON s.routine_id = r.id AND r.deleted_at IS NULL
     WHERE s.profile_id = ? AND s.deleted_at IS NULL${clamp}
     ORDER BY s.started_at DESC
     LIMIT ?`,
    [profileId, limit],
  );

  return rows.map((row) => ({
    ...rowToSession(row),
    routineName: (row.routine_name as string) ?? null,
  }));
}

export async function getSessionTotalVolume(sessionId: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(COALESCE(weight_kg, 0) * COALESCE(reps, 0)), 0) as total
     FROM workout_sets WHERE session_id = ? AND is_warmup = 0 AND deleted_at IS NULL`,
    [sessionId],
  );
  return result?.total ?? 0;
}
