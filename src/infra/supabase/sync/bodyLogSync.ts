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

const SERVER_TABLE = 'user_body_logs';
const LOCAL_TABLE = 'body_logs';
const PULL_BATCH_LIMIT = 500;

interface LocalPayload {
  id: string;
  date: string;
  weight_kg?: number | null;
  body_fat_pct?: number | null;
  muscle_mass_kg?: number | null;
  note?: string | null;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
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
    date: local.date,
    weight_kg: local.weight_kg ?? null,
    body_fat_pct: local.body_fat_pct ?? null,
    muscle_mass_kg: local.muscle_mass_kg ?? null,
    note: local.note ?? null,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO body_logs (
       id, profile_id, date, weight_kg, body_fat_pct, muscle_mass_kg,
       note, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       profile_id = excluded.profile_id,
       date = excluded.date,
       weight_kg = excluded.weight_kg,
       body_fat_pct = excluded.body_fat_pct,
       muscle_mass_kg = excluded.muscle_mass_kg,
       note = excluded.note,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      row.date,
      row.weight_kg,
      row.body_fat_pct,
      row.muscle_mass_kg,
      row.note,
      row.updated_at,
    ],
  );
}

export const bodyLogSync: ResourceSyncModule = {
  localTableName: LOCAL_TABLE,
  serverTableName: SERVER_TABLE,

  async pushOne(
    client: SupabaseClient,
    _db: SQLiteDatabase,
    queueRow: SyncQueueRow,
  ): Promise<void> {
    const userId = await getCurrentUserId(client);
    const local = JSON.parse(queueRow.payload) as LocalPayload;
    const payload = toServerPayload(local, userId);
    if (queueRow.operation === 'DELETE') {
      payload.deleted_at = new Date().toISOString();
    }
    await upsertWithBackoff(client, SERVER_TABLE, payload);
  },

  async pullBatch(
    client: SupabaseClient,
    db: SQLiteDatabase,
    watermark: string,
  ): Promise<{ pulled: number; newWatermark: string | null }> {
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
