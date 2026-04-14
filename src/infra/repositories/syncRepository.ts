import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { SyncOperation } from '../../types/common';
// TODO: Implement full sync queue management

export async function addToSyncQueue(
  tableName: string,
  recordId: string,
  operation: SyncOperation,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sync_queue (id, table_name, record_id, operation, payload) VALUES (?, ?, ?, ?, ?)`,
    [generateId(), tableName, recordId, operation, JSON.stringify(payload)]
  );
}

export async function getPendingSyncItems(limit: number = 50) {
  const db = await getDatabase();
  return db.getAllAsync(
    'SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT ?',
    [limit]
  );
}

export async function markSynced(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sync_queue SET synced_at = datetime('now') WHERE id = ?`,
    [id]
  );
}
