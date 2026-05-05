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

const SERVER_TABLE = 'user_meal_templates';
const LOCAL_TABLE = 'meal_templates';
const PULL_BATCH_LIMIT = 500;

// `items` is JSON-serialized text in SQLite, jsonb on the server.
// Push: parse the local TEXT once before sending so the wire format
// is JSON object, not a JSON string-of-JSON.
// Pull: server returns the parsed JSON; we stringify it before storing
// in the local TEXT column.

interface LocalPayload {
  id: string;
  name: string;
  meal_type?: string | null;
  items?: string; // serialized JSON
  use_count?: number;
  description?: string | null;
  last_used_at?: string | null;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  name: string;
  meal_type: string | null;
  items: unknown; // jsonb
  use_count: number;
  description: string | null;
  last_used_at: string | null;
  updated_at: string;
  deleted_at: string | null;
}

function toServerPayload(
  local: LocalPayload,
  userId: string,
): Record<string, unknown> {
  let parsedItems: unknown = [];
  if (local.items) {
    try {
      parsedItems = JSON.parse(local.items);
    } catch {
      parsedItems = [];
    }
  }
  return {
    id: local.id,
    user_id: userId,
    name: local.name,
    meal_type: local.meal_type ?? null,
    items: parsedItems,
    use_count: local.use_count ?? 0,
    description: local.description ?? null,
    last_used_at: local.last_used_at ?? null,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO meal_templates (
       id, profile_id, name, meal_type, items, use_count,
       description, last_used_at, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       profile_id = excluded.profile_id,
       name = excluded.name,
       meal_type = excluded.meal_type,
       items = excluded.items,
       use_count = excluded.use_count,
       description = excluded.description,
       last_used_at = excluded.last_used_at,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      row.name,
      row.meal_type,
      JSON.stringify(row.items ?? []),
      row.use_count,
      row.description,
      row.last_used_at,
      row.updated_at,
    ],
  );
}

export const mealTemplateSync: ResourceSyncModule = {
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
