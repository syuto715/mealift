import type * as SQLite from 'expo-sqlite';
import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { enqueueRowFromTable } from './syncRepository';

// Build 16 / Phase 4 (Feature F) / Phase 4.0 — repository for
// auto-detected deload recommendations.
//
// State machine (the schema is open, the helpers enforce it):
//
//   detected (created)
//     ├──► applied   (markApplied, attaches a generated routine id)
//     │      └──► completed (markCompleted, after the deload week)
//     └──► dismissed (markDismissed)
//
// `applied` and `dismissed` are mutually exclusive. The active-list
// query filters out anything that has reached either terminal state.
//
// Patterns reused from earlier phases:
//   - Stable id on upsert via SELECT-then-ON CONFLICT (Phase 1.1
//     hardening — without this, sync push would orphan the previous
//     server row every save).
//   - DI dbOverride parameter for tests (Phase 1.1 / 2.1 / 3.2).
//   - profile_id always SQL-scoped (Phase 3.2 cross-profile leak fix).
//   - All queries filter `deleted_at IS NULL` (v23 soft-delete).
//   - sync_queue enqueue follows every persistent change (audit script
//     check-enqueue-sync.ts watches src/infra/repositories/).

export interface DeloadRecommendation {
  id: string;
  profileId: string;
  detectedAt: string;
  sourceWeekStarts: string[];
  affectedMuscles: string[];
  appliedAt: string | null;
  appliedRoutineId: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeloadRecommendationInput {
  profileId: string;
  // ISO instant; usually `new Date().toISOString()` from the detector.
  // The unique index on (profile_id, detected_at) collapses concurrent
  // mounts to the same row via ON CONFLICT.
  detectedAt: string;
  sourceWeekStarts: string[];
  affectedMuscles: string[];
}

interface RawRow {
  id: string;
  profile_id: string;
  detected_at: string;
  source_week_starts: string;
  affected_muscles: string;
  applied_at: string | null;
  applied_routine_id: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecommendation(row: RawRow): DeloadRecommendation {
  return {
    id: row.id,
    profileId: row.profile_id,
    detectedAt: row.detected_at,
    sourceWeekStarts: safeParseArray(row.source_week_starts),
    affectedMuscles: safeParseArray(row.affected_muscles),
    appliedAt: row.applied_at,
    appliedRoutineId: row.applied_routine_id,
    completedAt: row.completed_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// JSON columns can be hand-corrupted; treat any parse failure as an
// empty array rather than throwing into the caller. The detector logs
// real arrays so this only fires on poisoned rows.
function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

// Insert a new detected recommendation (or merge into an existing row
// if the unique key already matches — concurrent screen mounts within
// the same `detectedAt` instant). Returns the canonical row id, which
// is what the caller enqueues for sync push.
export async function createDeloadRecommendation(
  input: CreateDeloadRecommendationInput,
  dbOverride?: SQLite.SQLiteDatabase,
): Promise<DeloadRecommendation> {
  const db = dbOverride ?? (await getDatabase());
  const now = new Date().toISOString();

  // Stable-id pattern (Phase 1.1): if a row already exists at this
  // (profile_id, detected_at), reuse its id so cloud sync addresses
  // the same row rather than orphaning the prior insert. The unique
  // index ensures only one row can match.
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM deload_recommendations
       WHERE profile_id = ? AND detected_at = ? AND deleted_at IS NULL`,
    [input.profileId, input.detectedAt],
  );
  const id = existing?.id ?? generateId();
  const operation = existing ? 'UPDATE' : 'INSERT';

  await db.runAsync(
    `INSERT INTO deload_recommendations
       (id, profile_id, detected_at, source_week_starts, affected_muscles,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, detected_at) DO UPDATE SET
       source_week_starts = excluded.source_week_starts,
       affected_muscles = excluded.affected_muscles,
       updated_at = excluded.updated_at`,
    [
      id,
      input.profileId,
      input.detectedAt,
      JSON.stringify(input.sourceWeekStarts),
      JSON.stringify(input.affectedMuscles),
      now,
      now,
    ],
  );

  // Re-read the canonical id under the unique index — a concurrent
  // writer could have won the conflict resolution and stored a
  // different id than the one we proposed. Without this, the enqueue
  // call would push a non-existent row id (mirrors the Phase 1.1
  // saveWeeklyReport hardening).
  const stored = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM deload_recommendations
       WHERE profile_id = ? AND detected_at = ? AND deleted_at IS NULL`,
    [input.profileId, input.detectedAt],
  );
  const storedId = stored?.id ?? id;
  await enqueueRowFromTable('deload_recommendations', storedId, operation);

  // Pull the persisted row for the return value rather than fabricating
  // it from input — we want the createdAt / updatedAt the DB actually
  // stamped, especially when ON CONFLICT updated an existing row.
  const fresh = await db.getFirstAsync<RawRow>(
    `SELECT * FROM deload_recommendations
       WHERE id = ? AND deleted_at IS NULL`,
    [storedId],
  );
  if (!fresh) {
    // Shouldn't happen — we just wrote the row. Defensively reconstruct.
    return {
      id: storedId,
      profileId: input.profileId,
      detectedAt: input.detectedAt,
      sourceWeekStarts: input.sourceWeekStarts,
      affectedMuscles: input.affectedMuscles,
      appliedAt: null,
      appliedRoutineId: null,
      completedAt: null,
      dismissedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }
  return rowToRecommendation(fresh);
}

// Active recommendations = not yet applied, not dismissed, not soft-
// deleted. UI banner reads this; usually returns 0 or 1 row but the
// API stays plural so future "multiple parallel deloads" surfaces
// don't need a schema change.
export async function getActiveRecommendations(
  profileId: string,
  dbOverride?: SQLite.SQLiteDatabase,
): Promise<DeloadRecommendation[]> {
  const db = dbOverride ?? (await getDatabase());
  const rows = await db.getAllAsync<RawRow>(
    `SELECT * FROM deload_recommendations
       WHERE profile_id = ?
         AND applied_at IS NULL
         AND dismissed_at IS NULL
         AND deleted_at IS NULL
       ORDER BY detected_at DESC`,
    [profileId],
  );
  return rows.map(rowToRecommendation);
}

// Read a single row by id (profile-scoped — never trust id alone for
// cross-table operations; Phase 3.2 cross-profile leak fix lesson).
export async function getRecommendationById(
  profileId: string,
  id: string,
  dbOverride?: SQLite.SQLiteDatabase,
): Promise<DeloadRecommendation | null> {
  const db = dbOverride ?? (await getDatabase());
  const row = await db.getFirstAsync<RawRow>(
    `SELECT * FROM deload_recommendations
       WHERE id = ? AND profile_id = ? AND deleted_at IS NULL`,
    [id, profileId],
  );
  return row ? rowToRecommendation(row) : null;
}

// State transition: detected → applied. Caller passes the routine id
// it just generated via createRoutine() (Phase 4.2). Refuses if the
// row is already applied / dismissed — the banner UI shouldn't be
// able to fire this twice in practice, but the guard keeps the
// invariant from drifting.
export async function markApplied(
  profileId: string,
  id: string,
  routineId: string,
  dbOverride?: SQLite.SQLiteDatabase,
): Promise<void> {
  const db = dbOverride ?? (await getDatabase());
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `UPDATE deload_recommendations
        SET applied_at = ?,
            applied_routine_id = ?,
            updated_at = ?
      WHERE id = ?
        AND profile_id = ?
        AND applied_at IS NULL
        AND dismissed_at IS NULL
        AND deleted_at IS NULL`,
    [now, routineId, now, id, profileId],
  );
  if (result.changes > 0) {
    await enqueueRowFromTable('deload_recommendations', id, 'UPDATE');
  }
}

// State transition: detected → dismissed. Mutually exclusive with
// applied — same WHERE-clause guard prevents double transitions.
export async function markDismissed(
  profileId: string,
  id: string,
  dbOverride?: SQLite.SQLiteDatabase,
): Promise<void> {
  const db = dbOverride ?? (await getDatabase());
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `UPDATE deload_recommendations
        SET dismissed_at = ?,
            updated_at = ?
      WHERE id = ?
        AND profile_id = ?
        AND applied_at IS NULL
        AND dismissed_at IS NULL
        AND deleted_at IS NULL`,
    [now, now, id, profileId],
  );
  if (result.changes > 0) {
    await enqueueRowFromTable('deload_recommendations', id, 'UPDATE');
  }
}

// State transition: applied → completed. Only valid for already-
// applied rows; the WHERE clause enforces that.
export async function markCompleted(
  profileId: string,
  id: string,
  dbOverride?: SQLite.SQLiteDatabase,
): Promise<void> {
  const db = dbOverride ?? (await getDatabase());
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `UPDATE deload_recommendations
        SET completed_at = ?,
            updated_at = ?
      WHERE id = ?
        AND profile_id = ?
        AND applied_at IS NOT NULL
        AND completed_at IS NULL
        AND deleted_at IS NULL`,
    [now, now, id, profileId],
  );
  if (result.changes > 0) {
    await enqueueRowFromTable('deload_recommendations', id, 'UPDATE');
  }
}
