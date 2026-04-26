import type { SQLiteDatabase } from 'expo-sqlite';

// syncWatermarkRepository — KV access on sync_watermarks (v20).
//
// Watermarks are server-issued ISO timestamps the client uses to ask
// "give me everything you've changed since X". Keeping them in
// SQLite (rather than AsyncStorage / MMKV) ties them to the same
// transactional boundary as the data they describe — a sync run
// that updates the foods table and advances the watermark commits
// or fails atomically when wrapped in a transaction.
//
// Resource keys are short, lowercase, snake_case strings. They are
// not enums on purpose: as new pull paths get added, the caller
// picks a key without modifying this module.

export const SYNC_WATERMARK_KEYS = {
  publicFoodsApproved: 'public_foods_approved',
} as const;

export type SyncWatermarkKey =
  (typeof SYNC_WATERMARK_KEYS)[keyof typeof SYNC_WATERMARK_KEYS];

export async function getWatermark(
  db: SQLiteDatabase,
  resource: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ last_pulled_at: string }>(
    'SELECT last_pulled_at FROM sync_watermarks WHERE resource = ?',
    [resource],
  );
  return row?.last_pulled_at ?? null;
}

// setWatermark — upserts the watermark for `resource`. The caller is
// responsible for ensuring `lastPulledAt` is monotonically forward
// (i.e. never overwrites a newer watermark with an older one). For
// the canonical pull-and-advance flow that's automatic — we always
// set to the max(updated_at) of the last batch.
export async function setWatermark(
  db: SQLiteDatabase,
  resource: string,
  lastPulledAt: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_watermarks (resource, last_pulled_at, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(resource) DO UPDATE SET
       last_pulled_at = excluded.last_pulled_at,
       updated_at     = excluded.updated_at`,
    [resource, lastPulledAt],
  );
}
