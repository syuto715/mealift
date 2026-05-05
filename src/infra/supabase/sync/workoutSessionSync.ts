import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../../repositories/syncRepository';
import type { ResourceSyncModule } from './syncOrchestrator';
import {
  applyServerDeletion,
  fetchWatermarkBatch,
  getCurrentUserId,
  upsertWithBackoff,
} from './syncHelpers';

const SERVER_TABLE = 'user_workout_sessions';
const LOCAL_TABLE = 'workout_sessions';
const PULL_BATCH_LIMIT = 500;

// Level 2: depends on user_workout_routines via routine_id (nullable FK).
// Push order in the orchestrator places this AFTER workoutRoutineSync,
// so when a child workout_session lands on the server, its parent
// routine already exists.

interface LocalPayload {
  id: string;
  routine_id?: string | null;
  started_at: string;
  finished_at?: string | null;
  duration_seconds?: number | null;
  estimated_calories?: number | null;
  note?: string | null;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  routine_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  estimated_calories: number | null;
  note: string | null;
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
    routine_id: local.routine_id ?? null,
    started_at: local.started_at,
    finished_at: local.finished_at ?? null,
    duration_seconds: local.duration_seconds ?? null,
    estimated_calories: local.estimated_calories ?? null,
    note: local.note ?? null,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO workout_sessions (
       id, profile_id, routine_id, started_at, finished_at,
       duration_seconds, estimated_calories, note, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       profile_id = excluded.profile_id,
       routine_id = excluded.routine_id,
       started_at = excluded.started_at,
       finished_at = excluded.finished_at,
       duration_seconds = excluded.duration_seconds,
       estimated_calories = excluded.estimated_calories,
       note = excluded.note,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      row.routine_id,
      row.started_at,
      row.finished_at,
      row.duration_seconds,
      row.estimated_calories,
      row.note,
      row.updated_at,
    ],
  );
}

export const workoutSessionSync: ResourceSyncModule = {
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
