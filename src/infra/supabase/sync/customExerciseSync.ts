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

const SERVER_TABLE = 'user_custom_exercises';
const LOCAL_TABLE = 'exercises';
const PULL_BATCH_LIMIT = 500;

// custom_exercises is special: the local `exercises` table is mixed
// (canonical seed + user-custom). Phase 6 repo hooks will only enqueue
// rows where is_custom = 1, so this module assumes the queue is
// already filtered to user-custom rows. Pull writes to local with
// is_custom = 1 so the rows show up under "My Custom Exercises" UI.

interface LocalPayload {
  id: string;
  name_ja: string;
  name_en?: string | null;
  muscle_group: string;
  secondary_muscles?: string | null;
  equipment?: string | null;
  default_rest_seconds?: number;
  exercise_type?: string;
  met_value?: number | null;
  sort_order?: number;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  name_ja: string;
  name_en: string | null;
  muscle_group: string;
  secondary_muscles: string | null;
  equipment: string | null;
  default_rest_seconds: number;
  exercise_type: string;
  met_value: number | null;
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
    name_ja: local.name_ja,
    name_en: local.name_en ?? null,
    muscle_group: local.muscle_group,
    secondary_muscles: local.secondary_muscles ?? null,
    equipment: local.equipment ?? null,
    default_rest_seconds: local.default_rest_seconds ?? 90,
    exercise_type: local.exercise_type ?? 'strength',
    met_value: local.met_value ?? null,
    sort_order: local.sort_order ?? 999,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO exercises (
       id, name_ja, name_en, muscle_group, secondary_muscles, equipment,
       is_custom, sort_order, exercise_type, met_value, default_rest_seconds,
       updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       name_ja = excluded.name_ja,
       name_en = excluded.name_en,
       muscle_group = excluded.muscle_group,
       secondary_muscles = excluded.secondary_muscles,
       equipment = excluded.equipment,
       is_custom = excluded.is_custom,
       sort_order = excluded.sort_order,
       exercise_type = excluded.exercise_type,
       met_value = excluded.met_value,
       default_rest_seconds = excluded.default_rest_seconds,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.name_ja,
      row.name_en,
      row.muscle_group,
      row.secondary_muscles,
      row.equipment,
      row.sort_order,
      row.exercise_type,
      row.met_value,
      row.default_rest_seconds,
      row.updated_at,
    ],
  );
}

export const customExerciseSync: ResourceSyncModule = {
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
