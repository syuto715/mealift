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

const SERVER_TABLE = 'user_adaptive_goal_suggestions';
const LOCAL_TABLE = 'adaptive_goal_suggestions';
const PULL_BATCH_LIMIT = 500;

// suggestion_json: TEXT in SQLite, jsonb on the server. Same shape
// transform as meal_templates.items.

interface LocalPayload {
  id: string;
  suggestion_json?: string;
  status?: string;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  suggestion_json: unknown;
  status: string;
  updated_at: string;
  deleted_at: string | null;
}

function toServerPayload(
  local: LocalPayload,
  userId: string,
): Record<string, unknown> {
  let parsed: unknown = null;
  if (local.suggestion_json) {
    try {
      parsed = JSON.parse(local.suggestion_json);
    } catch {
      parsed = null;
    }
  }
  return {
    id: local.id,
    user_id: userId,
    suggestion_json: parsed,
    status: local.status ?? 'pending',
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO adaptive_goal_suggestions (
       id, user_id, suggestion_json, status, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       suggestion_json = excluded.suggestion_json,
       status = excluded.status,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      JSON.stringify(row.suggestion_json ?? null),
      row.status,
      row.updated_at,
    ],
  );
}

export const adaptiveGoalSync: ResourceSyncModule = {
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
