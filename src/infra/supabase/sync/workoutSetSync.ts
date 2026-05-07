import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../../repositories/syncRepository';
import type { ResourceSyncModule } from './syncOrchestrator';
import {
  applyServerDeletion,
  boolToInt,
  fetchWatermarkBatch,
  getCurrentUserId,
  intToBool,
  upsertWithBackoff,
} from './syncHelpers';

const SERVER_TABLE = 'user_workout_sets';
const LOCAL_TABLE = 'workout_sets';
const PULL_BATCH_LIMIT = 500;

// Level 3: depends on user_workout_sessions via session_id (FK).
// The orchestrator places this last in RESOURCE_MODULES so push always
// has the parent session in place by the time a set lands server-side.
//
// is_warmup is INTEGER 0/1 locally, boolean on the server — converted
// at the boundary via intToBool / boolToInt.
//
// Cardio columns (duration_minutes, distance_km, calories_burned,
// perceived_intensity) added in v12 are nullable for strength sets.

interface LocalPayload {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  rir?: number | null;
  is_warmup?: number | boolean;
  note?: string | null;
  duration_minutes?: number | null;
  distance_km?: number | null;
  calories_burned?: number | null;
  perceived_intensity?: number | null;
  // Build 15 / Feature 5-O. Optional on the local payload — pre-v26
  // rows lack this column; toServerPayload coerces missing values to
  // 'working' so the server CHECK constraint never sees a stale row.
  set_type?: string;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  is_warmup: boolean;
  duration_minutes: number | null;
  distance_km: number | null;
  calories_burned: number | null;
  perceived_intensity: number | null;
  note: string | null;
  set_type: string;
  updated_at: string;
  deleted_at: string | null;
}

function toServerPayload(
  local: LocalPayload,
  userId: string,
): Record<string, unknown> {
  return {
    id: local.id,
    user_id: userId,
    session_id: local.session_id,
    exercise_id: local.exercise_id,
    set_number: local.set_number,
    weight_kg: local.weight_kg ?? null,
    reps: local.reps ?? null,
    rpe: local.rpe ?? null,
    rir: local.rir ?? null,
    is_warmup: intToBool(local.is_warmup),
    duration_minutes: local.duration_minutes ?? null,
    distance_km: local.distance_km ?? null,
    calories_burned: local.calories_burned ?? null,
    perceived_intensity: local.perceived_intensity ?? null,
    note: local.note ?? null,
    set_type: local.set_type ?? 'working',
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO workout_sets (
       id, session_id, exercise_id, set_number, weight_kg, reps,
       rpe, rir, is_warmup, note,
       duration_minutes, distance_km, calories_burned, perceived_intensity,
       set_type, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       exercise_id = excluded.exercise_id,
       set_number = excluded.set_number,
       weight_kg = excluded.weight_kg,
       reps = excluded.reps,
       rpe = excluded.rpe,
       rir = excluded.rir,
       is_warmup = excluded.is_warmup,
       note = excluded.note,
       duration_minutes = excluded.duration_minutes,
       distance_km = excluded.distance_km,
       calories_burned = excluded.calories_burned,
       perceived_intensity = excluded.perceived_intensity,
       set_type = excluded.set_type,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.session_id,
      row.exercise_id,
      row.set_number,
      row.weight_kg,
      row.reps,
      row.rpe,
      row.rir,
      boolToInt(row.is_warmup),
      row.note,
      row.duration_minutes,
      row.distance_km,
      row.calories_burned,
      row.perceived_intensity,
      row.set_type ?? 'working',
      row.updated_at,
    ],
  );
}

export const workoutSetSync: ResourceSyncModule = {
  localTableName: LOCAL_TABLE,
  serverTableName: SERVER_TABLE,

  async pushOne(client, _db, queueRow: SyncQueueRow) {
    const userId = await getCurrentUserId(client);
    const local = JSON.parse(queueRow.payload) as LocalPayload;
    const payload = toServerPayload(local, userId);
    if (queueRow.operation === 'DELETE') {
      payload.deleted_at = new Date().toISOString();
    }
    await upsertWithBackoff(client, SERVER_TABLE, payload);
  },

  async pullBatch(client, db, watermark) {
    const userId = await getCurrentUserId(client);
    const rows = await fetchWatermarkBatch<ServerRow>(
      client,
      SERVER_TABLE,
      userId,
      watermark,
      PULL_BATCH_LIMIT,
    );
    if (rows.length === 0) return { pulled: 0, newWatermark: null };
    for (const row of rows) {
      if (row.deleted_at !== null) {
        await applyServerDeletion(db, LOCAL_TABLE, row.id);
      } else {
        await applyServerRow(db, row);
      }
    }
    return {
      pulled: rows.length,
      newWatermark: rows[rows.length - 1].updated_at,
    };
  },
};
