import { getDatabase } from '../database/connection';
import { PersonalRecord, PRRecordType } from '../../types/personalRecord';
import { generateId } from '../../utils/id';

function rowToPR(row: Record<string, unknown>): PersonalRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    exerciseId: row.exercise_id as string,
    recordType: row.record_type as PRRecordType,
    value: row.value as number,
    weightKg: row.weight_kg as number,
    reps: row.reps as number,
    achievedAt: row.achieved_at as string,
    sessionId: (row.session_id as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function insertPR(input: {
  userId: string;
  exerciseId: string;
  recordType: PRRecordType;
  value: number;
  weightKg: number;
  reps: number;
  sessionId?: string | null;
  achievedAt?: string;
}): Promise<PersonalRecord> {
  const db = await getDatabase();
  const id = generateId();
  const achievedAt = input.achievedAt ?? new Date().toISOString();
  await db.runAsync(
    `INSERT INTO personal_records
       (id, user_id, exercise_id, record_type, value, weight_kg, reps, achieved_at, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.exerciseId,
      input.recordType,
      input.value,
      input.weightKg,
      input.reps,
      achievedAt,
      input.sessionId ?? null,
    ]
  );
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM personal_records WHERE id = ?',
    [id]
  );
  return rowToPR(row!);
}

export async function getBestPR(
  exerciseId: string,
  recordType: PRRecordType
): Promise<PersonalRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM personal_records
     WHERE exercise_id = ? AND record_type = ?
     ORDER BY value DESC
     LIMIT 1`,
    [exerciseId, recordType]
  );
  return row ? rowToPR(row) : null;
}

export async function getExercisePRs(
  exerciseId: string
): Promise<Record<PRRecordType, PersonalRecord | null>> {
  const types: PRRecordType[] = [
    'estimated_1rm',
    'max_weight',
    'max_volume_session',
    'max_reps_at_weight',
    'max_duration',
    'max_distance',
    'max_calories',
  ];
  const out: Record<PRRecordType, PersonalRecord | null> = {
    estimated_1rm: null,
    max_weight: null,
    max_volume_session: null,
    max_reps_at_weight: null,
    max_duration: null,
    max_distance: null,
    max_calories: null,
  };
  for (const t of types) {
    out[t] = await getBestPR(exerciseId, t);
  }
  return out;
}

export async function getRecentPRs(userId: string, limit: number = 10): Promise<PersonalRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM personal_records WHERE user_id = ? ORDER BY achieved_at DESC LIMIT ?`,
    [userId, limit]
  );
  return rows.map(rowToPR);
}

export async function getPRHistoryForExercise(
  exerciseId: string,
  recordType: PRRecordType
): Promise<PersonalRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM personal_records
     WHERE exercise_id = ? AND record_type = ?
     ORDER BY achieved_at ASC`,
    [exerciseId, recordType]
  );
  return rows.map(rowToPR);
}

export async function listUserExercisePRSummary(
  userId: string
): Promise<{ exerciseId: string; best1rm: number | null; bestWeight: number | null; bestVolume: number | null }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    exercise_id: string;
    best_1rm: number | null;
    best_weight: number | null;
    best_volume: number | null;
  }>(
    `SELECT
      exercise_id,
      MAX(CASE WHEN record_type = 'estimated_1rm' THEN value END) AS best_1rm,
      MAX(CASE WHEN record_type = 'max_weight' THEN value END) AS best_weight,
      MAX(CASE WHEN record_type = 'max_volume_session' THEN value END) AS best_volume
     FROM personal_records
     WHERE user_id = ?
     GROUP BY exercise_id
     ORDER BY best_1rm DESC NULLS LAST`,
    [userId]
  );
  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    best1rm: r.best_1rm,
    bestWeight: r.best_weight,
    bestVolume: r.best_volume,
  }));
}
