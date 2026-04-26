import { PRInfo, PRRecordType } from '../types/personalRecord';
import {
  getBestPR,
  insertPR,
} from '../infra/repositories/personalRecordRepository';
import { getExerciseById } from '../infra/repositories/workoutRepository';
import { getDatabase } from '../infra/database/connection';
import { EPLEY_REPS_CAP, estimate1RM } from './oneRepMax';

// Re-exported so existing call sites (and tests) can keep importing the
// formula helpers from this module. The implementation lives in
// ./oneRepMax.ts to keep it free of expo-sqlite imports for unit testing.
export { EPLEY_REPS_CAP, estimate1RM };

// Given a newly recorded set, check and record any PRs that were broken.
export async function checkAndRecordPRs(
  userId: string,
  exerciseId: string,
  weightKg: number,
  reps: number,
  sessionId: string
): Promise<PRInfo[]> {
  if (weightKg <= 0 || reps <= 0) return [];

  const exercise = await getExerciseById(exerciseId);
  const exerciseName = exercise?.nameJa ?? '種目';
  const updates: PRInfo[] = [];

  // 1. Estimated 1RM
  const newEst1RM = Number(estimate1RM(weightKg, reps).toFixed(2));
  const best1RM = await getBestPR(exerciseId, 'estimated_1rm');
  if (!best1RM || newEst1RM > best1RM.value + 0.01) {
    await insertPR({
      userId,
      exerciseId,
      recordType: 'estimated_1rm',
      value: newEst1RM,
      weightKg,
      reps,
      sessionId,
    });
    updates.push({
      exerciseId,
      exerciseName,
      recordType: 'estimated_1rm',
      newValue: newEst1RM,
      previousValue: best1RM?.value ?? null,
      improvement: best1RM ? Number((newEst1RM - best1RM.value).toFixed(2)) : newEst1RM,
      weight: weightKg,
      reps,
    });
  }

  // 2. Max weight (any reps)
  const bestWeight = await getBestPR(exerciseId, 'max_weight');
  if (!bestWeight || weightKg > bestWeight.value + 0.01) {
    await insertPR({
      userId,
      exerciseId,
      recordType: 'max_weight',
      value: weightKg,
      weightKg,
      reps,
      sessionId,
    });
    updates.push({
      exerciseId,
      exerciseName,
      recordType: 'max_weight',
      newValue: weightKg,
      previousValue: bestWeight?.value ?? null,
      improvement: bestWeight ? Number((weightKg - bestWeight.value).toFixed(2)) : weightKg,
      weight: weightKg,
      reps,
    });
  }

  // 3. Max reps at weight (same weight, more reps)
  const db = await getDatabase();
  const sameWeightRow = await db.getFirstAsync<{ max_reps: number | null }>(
    `SELECT MAX(reps) AS max_reps FROM personal_records
     WHERE exercise_id = ? AND record_type = 'max_reps_at_weight' AND weight_kg = ?`,
    [exerciseId, weightKg]
  );
  const prevRepsAtWeight = sameWeightRow?.max_reps ?? 0;
  if (reps > prevRepsAtWeight) {
    await insertPR({
      userId,
      exerciseId,
      recordType: 'max_reps_at_weight',
      value: reps,
      weightKg,
      reps,
      sessionId,
    });
    if (prevRepsAtWeight > 0) {
      updates.push({
        exerciseId,
        exerciseName,
        recordType: 'max_reps_at_weight',
        newValue: reps,
        previousValue: prevRepsAtWeight,
        improvement: reps - prevRepsAtWeight,
        weight: weightKg,
        reps,
      });
    }
  }

  return updates;
}

// For cardio / sports / other: check longest time, longest distance, max kcal.
// Called after each completed set, symmetric with checkAndRecordPRs for strength.
export async function checkAndRecordCardioPRs(
  userId: string,
  exerciseId: string,
  durationMinutes: number | null,
  distanceKm: number | null,
  caloriesBurned: number | null,
  sessionId: string,
): Promise<PRInfo[]> {
  const exercise = await getExerciseById(exerciseId);
  const exerciseName = exercise?.nameJa ?? '種目';
  const updates: PRInfo[] = [];

  const check = async (
    type: 'max_duration' | 'max_distance' | 'max_calories',
    value: number | null,
  ) => {
    if (value == null || value <= 0) return;
    const best = await getBestPR(exerciseId, type);
    if (!best || value > best.value + 0.01) {
      await insertPR({
        userId,
        exerciseId,
        recordType: type,
        value,
        weightKg: 0,
        reps: 0,
        sessionId,
      });
      if (best) {
        updates.push({
          exerciseId,
          exerciseName,
          recordType: type,
          newValue: value,
          previousValue: best.value,
          improvement: Number((value - best.value).toFixed(2)),
          weight: 0,
          reps: 0,
        });
      }
    }
  };

  await check('max_duration', durationMinutes);
  await check('max_distance', distanceKm);
  await check('max_calories', caloriesBurned);

  return updates;
}

// Called on session finish: compute total session volume and record if new PR.
export async function checkSessionVolumePR(
  userId: string,
  sessionId: string
): Promise<PRInfo[]> {
  const db = await getDatabase();
  // Group by exercise, compute session volume per exercise.
  const rows = await db.getAllAsync<{
    exercise_id: string;
    total_volume: number;
  }>(
    `SELECT exercise_id, COALESCE(SUM(weight_kg * reps), 0) AS total_volume
     FROM workout_sets
     WHERE session_id = ? AND is_warmup = 0
     GROUP BY exercise_id`,
    [sessionId]
  );

  const updates: PRInfo[] = [];
  for (const row of rows) {
    if (!row.total_volume) continue;
    const best = await getBestPR(row.exercise_id, 'max_volume_session');
    if (!best || row.total_volume > best.value + 0.01) {
      const exercise = await getExerciseById(row.exercise_id);
      await insertPR({
        userId,
        exerciseId: row.exercise_id,
        recordType: 'max_volume_session',
        value: row.total_volume,
        weightKg: 0,
        reps: 0,
        sessionId,
      });
      updates.push({
        exerciseId: row.exercise_id,
        exerciseName: exercise?.nameJa ?? '種目',
        recordType: 'max_volume_session',
        newValue: row.total_volume,
        previousValue: best?.value ?? null,
        improvement: best ? Number((row.total_volume - best.value).toFixed(2)) : row.total_volume,
        weight: 0,
        reps: 0,
      });
    }
  }
  return updates;
}
