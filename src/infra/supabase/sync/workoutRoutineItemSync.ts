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

const SERVER_TABLE = 'user_workout_routine_items';
const LOCAL_TABLE = 'workout_routine_items';
const PULL_BATCH_LIMIT = 500;

// Level 2: depends on user_workout_routines via routine_id (FK).
// Cascade-explicit soft delete (deleteRoutine in workoutRepository
// soft-deletes both routine + items in one transaction). The
// orchestrator pushes routines BEFORE items so by the time an item
// lands server-side, its parent routine row exists.

interface LocalPayload {
  id: string;
  routine_id: string;
  exercise_id: string;
  target_sets?: number;
  target_reps?: string | null;
  sort_order?: number;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  routine_id: string;
  exercise_id: string;
  target_sets: number;
  target_reps: string | null;
  sort_order: number;
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
    routine_id: local.routine_id,
    exercise_id: local.exercise_id,
    target_sets: local.target_sets ?? 3,
    target_reps: local.target_reps ?? null,
    sort_order: local.sort_order ?? 0,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO workout_routine_items (
       id, routine_id, exercise_id, target_sets, target_reps,
       sort_order, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       routine_id = excluded.routine_id,
       exercise_id = excluded.exercise_id,
       target_sets = excluded.target_sets,
       target_reps = excluded.target_reps,
       sort_order = excluded.sort_order,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.routine_id,
      row.exercise_id,
      row.target_sets,
      row.target_reps,
      row.sort_order,
      row.updated_at,
    ],
  );
}

export const workoutRoutineItemSync: ResourceSyncModule = {
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
