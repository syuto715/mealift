import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../../repositories/syncRepository';
import type { ResourceSyncModule } from './syncOrchestrator';
import {
  boolToInt,
  fetchWatermarkBatch,
  getCurrentUserId,
  intToBool,
  upsertWithBackoff,
} from './syncHelpers';

const SERVER_TABLE = 'user_equipment';
const LOCAL_TABLE = 'user_equipment';
const PULL_BATCH_LIMIT = 500;

// Build 15 / Feature 5-元 sync module.
//
// id reconciliation (Phase 2 sign-off — Composite key matching):
// Local v28 backfill generated row ids via generateId(); the server
// migration generated ids via gen_random_uuid(). The two never match
// for backfilled rows, so this module diverges from the standard
// id-keyed sync pattern in three places:
//
//   1. pushOne uses upsertWithBackoff(..., 'user_id,equipment_key')
//      so the server merges by the natural UNIQUE key. The id field
//      survives the merge unchanged on either side — local keeps its
//      id, server keeps its uuid; future operations target each row
//      via the same composite key, so the id divergence is harmless.
//
//   2. applyServerRow uses ON CONFLICT(profile_id, equipment_key)
//      DO UPDATE in SQLite. A pull bringing down a server row whose
//      id the local DB has never seen still merges into the matching
//      local backfill row instead of inserting a duplicate.
//
//   3. Tombstones DELETE by (profile_id, equipment_key) instead of by
//      id — applyServerDeletion's id-based DELETE wouldn't match the
//      divergent local row.
//
// New rows (created via Phase 3 settings UI on a single device) get
// pushed with their local id; the server stores that same id, so for
// non-backfilled rows there is no divergence. The composite-key
// approach handles both classes uniformly.

interface LocalPayload {
  id: string;
  profile_id: string;
  equipment_key: string;
  available?: number | boolean;
  notes?: string | null;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  equipment_key: string;
  available: boolean;
  notes: string | null;
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
    equipment_key: local.equipment_key,
    available: intToBool(local.available ?? 1),
    notes: local.notes ?? null,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO user_equipment (
       id, profile_id, equipment_key, available, notes,
       updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(profile_id, equipment_key) DO UPDATE SET
       available = excluded.available,
       notes = excluded.notes,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      row.equipment_key,
      boolToInt(row.available),
      row.notes,
      row.updated_at,
    ],
  );
}

async function applyServerTombstone(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM user_equipment
       WHERE profile_id = ? AND equipment_key = ?`,
    [row.user_id, row.equipment_key],
  );
}

export const userEquipmentSync: ResourceSyncModule = {
  localTableName: LOCAL_TABLE,
  serverTableName: SERVER_TABLE,

  async pushOne(client, _db, queueRow: SyncQueueRow) {
    const userId = await getCurrentUserId(client);
    const local = JSON.parse(queueRow.payload) as LocalPayload;
    const payload = toServerPayload(local, userId);
    if (queueRow.operation === 'DELETE') {
      payload.deleted_at = new Date().toISOString();
    }
    // Composite-key onConflict so divergent local/server backfill ids
    // merge by natural identity. See module-header note.
    await upsertWithBackoff(
      client,
      SERVER_TABLE,
      payload,
      'user_id,equipment_key',
    );
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
        await applyServerTombstone(db, row);
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
