import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { SyncOperation } from '../../types/common';

// sync_queue management. Every Repository write to a user-private table
// enqueues a row here so the cloud-sync orchestrator (syncOrchestrator.ts)
// can push the change later. Each enqueue is best-effort: if the network
// is down or the user isn't authenticated, the row stays in the queue
// until the orchestrator runs again.
//
// Failure handling:
//   - markSynced: success path; sets synced_at timestamp.
//   - markFailed: per-row failure; increments retry_count without removing.
//   - moveToDeadLetter: row exceeded MAX_RETRIES; copies to sync_dead_letter
//     and removes from sync_queue. Manual recovery is required to retry.
//
// Pattern matches submissionSync.ts: per-row failure tolerance, no batch
// transactions, individual UPDATE/DELETE per row so partial progress is
// preserved across crashes.

export interface SyncQueueRow {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string; // JSON
  created_at: string;
  synced_at: string | null;
  retry_count: number;
}

export const MAX_RETRIES = 5;

export async function enqueueSync(
  tableName: string,
  recordId: string,
  operation: SyncOperation,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sync_queue (id, table_name, record_id, operation, payload) VALUES (?, ?, ?, ?, ?)`,
    [
      generateId(),
      tableName,
      recordId,
      operation,
      JSON.stringify(payload),
    ],
  );
}

// Backwards-compat alias retained for any caller that imported the
// pre-Phase-3 name. New code should use enqueueSync.
export const addToSyncQueue = enqueueSync;

// Convenience hook for repository write sites: read the row back from
// the table (no deleted_at filter — soft-deletes need to enqueue the
// tombstone too) and enqueue it. Per Phase 6 sign-off Option A,
// payload = full row including computed columns (created_at trigger
// values, updated_at after the UPDATE, etc) so the sync layer sees
// the canonical state.
//
// Always enqueues, regardless of localOnly mode (Phase 6 sign-off
// Option α). The orchestrator's pushAllPending no-ops when not
// authenticated, so the queue accumulates harmlessly until the user
// signs in; at that point claimLocalDataForUser remaps profile_id /
// user_id and the queued rows flush with the new auth uid.
//
// Returns silently if the row is missing — defensive only; should
// never happen in practice since the caller just wrote it.
export async function enqueueRowFromTable(
  tableName: string,
  recordId: string,
  operation: SyncOperation,
): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM ${tableName} WHERE id = ?`,
    [recordId],
  );
  if (!row) return;
  await enqueueSync(tableName, recordId, operation, row);
}

export async function getPendingSyncItems(
  limit: number = 50,
): Promise<SyncQueueRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<SyncQueueRow>(
    'SELECT * FROM sync_queue WHERE synced_at IS NULL AND retry_count < ? ORDER BY created_at ASC LIMIT ?',
    [MAX_RETRIES, limit],
  );
}

// Filter pending items down to a single table for per-resource drain.
export async function getPendingForTable(
  tableName: string,
  limit: number = 50,
): Promise<SyncQueueRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<SyncQueueRow>(
    `SELECT * FROM sync_queue
     WHERE synced_at IS NULL AND retry_count < ? AND table_name = ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [MAX_RETRIES, tableName, limit],
  );
}

export async function getPendingCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_queue WHERE synced_at IS NULL AND retry_count < ?',
    [MAX_RETRIES],
  );
  return row?.count ?? 0;
}

// Number of rows that have exhausted MAX_RETRIES and been moved to
// sync_dead_letter. Read by syncOrchestrator.syncAll at end-of-run so
// syncStatusStore.deadLetterCount reflects reality even when the UI
// (Phase 8 v1) doesn't display it. Future Phase 9 can wire the count
// into a debug/admin screen without further plumbing.
export async function getDeadLetterCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_dead_letter',
  );
  return row?.count ?? 0;
}

export async function markSynced(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sync_queue SET synced_at = datetime('now') WHERE id = ?`,
    [id],
  );
}

export async function markFailed(
  id: string,
  reason: string,
): Promise<{ retryCount: number; movedToDeadLetter: boolean }> {
  const db = await getDatabase();
  // Read current retry_count + payload to decide whether to dead-letter.
  const row = await db.getFirstAsync<SyncQueueRow>(
    'SELECT * FROM sync_queue WHERE id = ?',
    [id],
  );
  if (!row) return { retryCount: 0, movedToDeadLetter: false };

  const nextRetryCount = row.retry_count + 1;
  if (nextRetryCount >= MAX_RETRIES) {
    await moveToDeadLetterInternal(db, row, reason);
    return { retryCount: nextRetryCount, movedToDeadLetter: true };
  }

  await db.runAsync(
    'UPDATE sync_queue SET retry_count = ? WHERE id = ?',
    [nextRetryCount, id],
  );
  return { retryCount: nextRetryCount, movedToDeadLetter: false };
}

// Public helper for callers that want to forcibly retire a queue row
// regardless of its current retry count (e.g. terminal Postgres error).
export async function moveToDeadLetter(
  id: string,
  reason: string,
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SyncQueueRow>(
    'SELECT * FROM sync_queue WHERE id = ?',
    [id],
  );
  if (!row) return false;
  await moveToDeadLetterInternal(db, row, reason);
  return true;
}

async function moveToDeadLetterInternal(
  db: Awaited<ReturnType<typeof getDatabase>>,
  row: SyncQueueRow,
  reason: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_dead_letter
       (id, table_name, record_id, operation, payload, retry_count, reason, original_created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.table_name,
      row.record_id,
      row.operation,
      row.payload,
      row.retry_count + 1,
      reason,
      row.created_at,
    ],
  );
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [row.id]);
}
