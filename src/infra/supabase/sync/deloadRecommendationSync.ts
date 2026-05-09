import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../../repositories/syncRepository';
import type { ResourceSyncModule } from './syncOrchestrator';
import {
  applyServerDeletion,
  fetchWatermarkBatch,
  getCurrentUserId,
  upsertWithBackoff,
} from './syncHelpers';

const SERVER_TABLE = 'user_deload_recommendations';
const LOCAL_TABLE = 'deload_recommendations';
const PULL_BATCH_LIMIT = 500;

// Build 16 / Phase 4.0 / Feature F sync module.
//
// id-keyed sync (vs the composite-key reconciliation in v28's
// userEquipmentSync). Reasoning:
//   - No migration backfill creates rows here, so local + server ids
//     never diverge. Rows only appear via the runtime detector
//     (Phase 4.1) which generates an id locally and pushes
//     immediately.
//   - The schema's natural unique key (profile_id, detected_at) is
//     also indexed but not used for sync — it's there to collapse
//     concurrent screen-mount writes, not to merge across devices.
//
// Tombstone semantics: this table participates in the standard v23
// soft-delete pattern (deleted_at column). The repository never
// actually emits DELETE operations into the sync queue today; rows
// only ever transition through state mutations (UPDATE). The DELETE
// branch below is kept for future-proofing and to mirror the rest of
// the sync pipeline.

interface LocalPayload {
  id: string;
  profile_id: string;
  detected_at: string;
  source_week_starts: string;
  affected_muscles: string;
  applied_at?: string | null;
  applied_routine_id?: string | null;
  completed_at?: string | null;
  dismissed_at?: string | null;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  detected_at: string;
  source_week_starts: unknown;
  affected_muscles: unknown;
  applied_at: string | null;
  applied_routine_id: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  updated_at: string;
  deleted_at: string | null;
}

// JSON columns ride as JSONB on the server; locally they're TEXT
// (JSON-encoded). Translate at the boundary in both directions.
//
// Codex review pass 1 / Important #3 — both directions must enforce
// "array or empty array". The pull side already does
// (stringifyJsonArrayServer); the push side previously only
// JSON.parsed and forwarded whatever shape came out, which let a
// hand-edited local TEXT (e.g. `"x"`, `null`, `{}`) reach the server's
// JSONB column as a non-array. Pull then potentially-collapsed it on
// the way back, hiding the corruption from the user but leaving the
// server state poisoned. parseJsonArrayLocal now Array.isArray-checks
// and falls back to `[]` on anything else — symmetric with the pull
// side's defense.
function parseJsonArrayLocal(raw: string | undefined | null): unknown[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed : [];
}

function stringifyJsonArrayServer(raw: unknown): string {
  if (Array.isArray(raw)) return JSON.stringify(raw);
  if (raw == null) return '[]';
  // Defensive: server hand-edit could yield a non-array; treat as empty.
  return '[]';
}

function toServerPayload(
  local: LocalPayload,
  userId: string,
): Record<string, unknown> {
  return {
    id: local.id,
    user_id: userId,
    detected_at: local.detected_at,
    source_week_starts: parseJsonArrayLocal(local.source_week_starts),
    affected_muscles: parseJsonArrayLocal(local.affected_muscles),
    applied_at: local.applied_at ?? null,
    applied_routine_id: local.applied_routine_id ?? null,
    completed_at: local.completed_at ?? null,
    dismissed_at: local.dismissed_at ?? null,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO deload_recommendations (
       id, profile_id, detected_at, source_week_starts, affected_muscles,
       applied_at, applied_routine_id, completed_at, dismissed_at,
       updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       detected_at = excluded.detected_at,
       source_week_starts = excluded.source_week_starts,
       affected_muscles = excluded.affected_muscles,
       applied_at = excluded.applied_at,
       applied_routine_id = excluded.applied_routine_id,
       completed_at = excluded.completed_at,
       dismissed_at = excluded.dismissed_at,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.user_id,
      row.detected_at,
      stringifyJsonArrayServer(row.source_week_starts),
      stringifyJsonArrayServer(row.affected_muscles),
      row.applied_at,
      row.applied_routine_id,
      row.completed_at,
      row.dismissed_at,
      row.updated_at,
    ],
  );
}

export const deloadRecommendationSync: ResourceSyncModule = {
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
