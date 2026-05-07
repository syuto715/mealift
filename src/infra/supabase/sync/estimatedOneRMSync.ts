import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../../repositories/syncRepository';
import type { ResourceSyncModule } from './syncOrchestrator';
import {
  applyServerDeletion,
  fetchWatermarkBatch,
  getCurrentUserId,
  upsertWithBackoff,
} from './syncHelpers';

const SERVER_TABLE = 'user_estimated_1rm';
const LOCAL_TABLE = 'estimated_1rm';
const PULL_BATCH_LIMIT = 500;

// Build 15 / Feature 5-B sync module. estimated_1rm is an append-only
// observation log per (user, exercise) — no UNIQUE constraint, so
// pushOne / pullBatch follow the simplest upsert-on-id pattern.
//
// Level: 1 (no FK to other user-private tables — exercise_id references
// the canonical exercises table, which is shared seed data and not part
// of the user-sync graph).

interface LocalPayload {
  id: string;
  profile_id: string;
  exercise_id: string;
  e1rm_kg: number;
  formula: string;
  source_set_id?: string | null;
  observed_at: string;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  exercise_id: string;
  e1rm_kg: number;
  formula: string;
  source_set_id: string | null;
  observed_at: string;
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
    e1rm_kg: local.e1rm_kg,
    formula: local.formula,
    source_set_id: local.source_set_id ?? null,
    observed_at: local.observed_at,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO estimated_1rm (
       id, profile_id, exercise_id, e1rm_kg, formula,
       source_set_id, observed_at, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       profile_id = excluded.profile_id,
       exercise_id = excluded.exercise_id,
       e1rm_kg = excluded.e1rm_kg,
       formula = excluded.formula,
       source_set_id = excluded.source_set_id,
       observed_at = excluded.observed_at,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      row.exercise_id,
      row.e1rm_kg,
      row.formula,
      row.source_set_id,
      row.observed_at,
      row.updated_at,
    ],
  );
}

export const estimatedOneRMSync: ResourceSyncModule = {
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
