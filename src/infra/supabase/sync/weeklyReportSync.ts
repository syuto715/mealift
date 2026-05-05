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

const SERVER_TABLE = 'user_weekly_reports';
const LOCAL_TABLE = 'weekly_reports';
const PULL_BATCH_LIMIT = 500;

interface LocalPayload {
  id: string;
  week_start: string;
  week_end: string;
  data_json?: string;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  data_json: unknown;
  updated_at: string;
  deleted_at: string | null;
}

function toServerPayload(
  local: LocalPayload,
  userId: string,
): Record<string, unknown> {
  let parsed: unknown = {};
  if (local.data_json) {
    try {
      parsed = JSON.parse(local.data_json);
    } catch {
      parsed = {};
    }
  }
  return {
    id: local.id,
    user_id: userId,
    week_start: local.week_start,
    week_end: local.week_end,
    data_json: parsed,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO weekly_reports (
       id, profile_id, week_start, week_end, data_json,
       updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       profile_id = excluded.profile_id,
       week_start = excluded.week_start,
       week_end = excluded.week_end,
       data_json = excluded.data_json,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      row.week_start,
      row.week_end,
      JSON.stringify(row.data_json ?? {}),
      row.updated_at,
    ],
  );
}

export const weeklyReportSync: ResourceSyncModule = {
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
