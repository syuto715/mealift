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

const SERVER_TABLE = 'user_personal_records';
const LOCAL_TABLE = 'personal_records';
const PULL_BATCH_LIMIT = 500;

interface LocalPayload {
  id: string;
  exercise_id: string;
  record_type: string;
  value: number;
  weight_kg: number;
  reps: number;
  achieved_at: string;
  session_id?: string | null;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  exercise_id: string;
  record_type: string;
  value: number;
  weight_kg: number;
  reps: number;
  achieved_at: string;
  session_id: string | null;
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
    exercise_id: local.exercise_id,
    record_type: local.record_type,
    value: local.value,
    weight_kg: local.weight_kg,
    reps: local.reps,
    achieved_at: local.achieved_at,
    session_id: local.session_id ?? null,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO personal_records (
       id, user_id, exercise_id, record_type, value, weight_kg,
       reps, achieved_at, session_id, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       exercise_id = excluded.exercise_id,
       record_type = excluded.record_type,
       value = excluded.value,
       weight_kg = excluded.weight_kg,
       reps = excluded.reps,
       achieved_at = excluded.achieved_at,
       session_id = excluded.session_id,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      row.exercise_id,
      row.record_type,
      row.value,
      row.weight_kg,
      row.reps,
      row.achieved_at,
      row.session_id,
      row.updated_at,
    ],
  );
}

export const personalRecordSync: ResourceSyncModule = {
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
