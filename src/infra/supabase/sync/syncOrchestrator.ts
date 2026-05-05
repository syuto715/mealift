import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase as defaultSupabase } from '../client';
import {
  getPendingForTable,
  markFailed,
  markSynced,
  getPendingCount,
  getDeadLetterCount,
  type SyncQueueRow,
} from '../../repositories/syncRepository';
import {
  getWatermark,
  setWatermark,
} from '../../repositories/syncWatermarkRepository';
import { syncSubmissions } from '../submissionSync';
import { useSyncStatusStore } from '../../../stores/syncStatusStore';
import { profileSync } from './profileSync';
import { bodyLogSync } from './bodyLogSync';
import { workoutRoutineSync } from './workoutRoutineSync';
import { mealLogSync } from './mealLogSync';
import { noteSync } from './noteSync';
import { mealTemplateSync } from './mealTemplateSync';
import { waterLogSync } from './waterLogSync';
import { adaptiveGoalSync } from './adaptiveGoalSync';
import { weeklyReportSync } from './weeklyReportSync';
import { personalRecordSync } from './personalRecordSync';
import { progressPhotoSync } from './progressPhotoSync';
import { customExerciseSync } from './customExerciseSync';
import { dishSync } from './dishSync';
import { workoutSessionSync } from './workoutSessionSync';
import { workoutRoutineItemSync } from './workoutRoutineItemSync';
import { mealLogItemSync } from './mealLogItemSync';
import { dishIngredientSync } from './dishIngredientSync';
import { workoutSetSync } from './workoutSetSync';

// Cloud Sync Orchestrator (Phase 3-B skeleton).
//
// Coordinates push (local → Supabase) and pull (Supabase → local) for
// every user-private resource declared in RESOURCE_MODULES. Per-resource
// implementations live in src/infra/supabase/sync/{resource}Sync.ts and
// register themselves into the array below as Phase 5 lands them.
//
// Until per-resource modules exist, the orchestrator runs against an
// empty registry: syncAll() correctly drains the (empty) list, runs
// the existing submissionSync (which has its own implementation), and
// updates the syncStatusStore. This means the wiring works end-to-end
// from Phase 3-B; Phase 5 just adds resources without rewiring.
//
// Design references:
//   - docs/cloud-sync-design.md (cd1a6d8) Part 2-3 (algorithms)
//   - docs/cloud-sync-design.md (cd1a6d8) Part 2-5 (dependency order)
//   - submissionSync.ts (canonical pattern for per-row failure tolerance,
//     watermark pull, rate-limit backoff)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceSyncModule {
  // Local table name (used as the sync_queue.table_name value).
  localTableName: string;
  // Server table name (public.user_<resource>) — stored as the
  // sync_watermarks.resource key for pull state.
  serverTableName: string;
  // Push a single sync_queue row to Supabase. Throws on failure;
  // the orchestrator catches and marks the queue row as failed.
  pushOne: (
    client: SupabaseClient,
    db: SQLiteDatabase,
    queueRow: SyncQueueRow,
  ) => Promise<void>;
  // Pull updates from Supabase since the given watermark. Returns
  // the count pulled and the new watermark to persist (the latest
  // updated_at observed in the batch, or null if nothing pulled).
  pullBatch: (
    client: SupabaseClient,
    db: SQLiteDatabase,
    watermark: string,
  ) => Promise<{ pulled: number; newWatermark: string | null }>;
}

export type SyncSkipReason =
  | 'supabase_not_configured'
  | 'not_authenticated'
  | 'nothing_pending';

export interface PushResult {
  uploaded: number;
  failed: number;
  deadLettered: number;
  skipped: SyncSkipReason | null;
}

export interface PullResult {
  pulled: number;
  skipped: SyncSkipReason | 'remote_error' | null;
}

export interface SyncResult {
  push: PushResult;
  pull: PullResult;
  submission: Awaited<ReturnType<typeof syncSubmissions>>;
}

// ---------------------------------------------------------------------------
// Resource registry
// ---------------------------------------------------------------------------

// Listed in dependency order — parents before children. Push and pull
// both walk this array forwards so child rows never reach the server
// before their parent and never get applied locally before the parent
// row exists. See docs/cloud-sync-design.md Part 2-5.
//
// Each per-resource module exports a ResourceSyncModule object literal.
// Order matters — see Part 2-5 of the design doc. Push and pull both
// walk this array forwards.
export const RESOURCE_MODULES: readonly ResourceSyncModule[] = [
  // LEVEL 0
  profileSync,
  // LEVEL 1 (Phase 5-B): no parent FK, can sync in any order among themselves
  bodyLogSync,
  workoutRoutineSync,
  mealLogSync,
  noteSync,
  mealTemplateSync,
  waterLogSync,
  adaptiveGoalSync,
  weeklyReportSync,
  personalRecordSync,
  progressPhotoSync,
  customExerciseSync,
  dishSync,
  // LEVEL 2 (Phase 5-C): depend on level-1 parents via FK
  workoutSessionSync,    // → user_workout_routines (routine_id, nullable)
  workoutRoutineItemSync, // → user_workout_routines (routine_id)
  mealLogItemSync,        // → user_meal_logs (meal_log_id)
  dishIngredientSync,     // → user_dishes (dish_id)
  // LEVEL 3 (Phase 5-D): grandchild
  workoutSetSync,         // → user_workout_sessions (session_id)
];

// Constant used in pull batches. Mirrors submissionSync.ts.
const PULL_BATCH_LIMIT = 500;
const PUSH_BATCH_LIMIT = 50;
const EPOCH_WATERMARK = '1970-01-01T00:00:00Z';

// ---------------------------------------------------------------------------
// Push — local → Supabase
// ---------------------------------------------------------------------------

export async function pushAllPending(
  db: SQLiteDatabase,
  client: SupabaseClient | null = defaultSupabase,
): Promise<PushResult> {
  if (!client) {
    return {
      uploaded: 0,
      failed: 0,
      deadLettered: 0,
      skipped: 'supabase_not_configured',
    };
  }
  const session = (await client.auth.getSession()).data.session;
  if (!session) {
    return {
      uploaded: 0,
      failed: 0,
      deadLettered: 0,
      skipped: 'not_authenticated',
    };
  }

  const pendingCount = await getPendingCount();
  if (pendingCount === 0) {
    return {
      uploaded: 0,
      failed: 0,
      deadLettered: 0,
      skipped: 'nothing_pending',
    };
  }

  let uploaded = 0;
  let failed = 0;
  let deadLettered = 0;

  // Iterate resources in dependency order so a child row never tries to
  // push before its parent has landed on the server.
  for (const mod of RESOURCE_MODULES) {
    let batch = await getPendingForTable(mod.localTableName, PUSH_BATCH_LIMIT);
    while (batch.length > 0) {
      for (const row of batch) {
        try {
          await mod.pushOne(client, db, row);
          await markSynced(row.id);
          uploaded += 1;
        } catch (e) {
          const reason = e instanceof Error ? e.message : 'unknown error';
          const result = await markFailed(row.id, reason);
          if (result.movedToDeadLetter) {
            deadLettered += 1;
          } else {
            failed += 1;
          }
        }
      }
      // If we got a full batch back, more may be pending — loop. If not,
      // we've drained this table.
      if (batch.length < PUSH_BATCH_LIMIT) break;
      batch = await getPendingForTable(
        mod.localTableName,
        PUSH_BATCH_LIMIT,
      );
    }
  }

  return { uploaded, failed, deadLettered, skipped: null };
}

// ---------------------------------------------------------------------------
// Pull — Supabase → local
// ---------------------------------------------------------------------------

export async function pullAll(
  db: SQLiteDatabase,
  client: SupabaseClient | null = defaultSupabase,
): Promise<PullResult> {
  if (!client) {
    return { pulled: 0, skipped: 'supabase_not_configured' };
  }
  const session = (await client.auth.getSession()).data.session;
  if (!session) {
    return { pulled: 0, skipped: 'not_authenticated' };
  }

  let totalPulled = 0;
  for (const mod of RESOURCE_MODULES) {
    let watermark =
      (await getWatermark(db, mod.serverTableName)) ?? EPOCH_WATERMARK;
    // Drain in PULL_BATCH_LIMIT-sized chunks; advance watermark per batch
    // so a crash mid-resource doesn't replay already-applied rows.
    let lastPulled = PULL_BATCH_LIMIT;
    while (lastPulled === PULL_BATCH_LIMIT) {
      try {
        const result = await mod.pullBatch(client, db, watermark);
        totalPulled += result.pulled;
        lastPulled = result.pulled;
        if (result.newWatermark !== null) {
          await setWatermark(db, mod.serverTableName, result.newWatermark);
          watermark = result.newWatermark;
        }
        if (result.pulled === 0) break;
      } catch {
        // Per-resource pull failure: skip this resource for this run.
        // Watermark already advanced for completed batches; next call
        // resumes from there.
        break;
      }
    }
  }

  return { pulled: totalPulled, skipped: null };
}

// ---------------------------------------------------------------------------
// syncAll — combined push + pull + submission sync
// ---------------------------------------------------------------------------

export async function syncAll(
  db: SQLiteDatabase,
  client: SupabaseClient | null = defaultSupabase,
): Promise<SyncResult> {
  const status = useSyncStatusStore.getState();
  status.beginRun();

  try {
    // Pull first so server-acknowledged deletions / updates land before
    // we push potentially-conflicting local changes. Mirrors the
    // submissionSync.syncSubmissions order.
    status.setResource('pull');
    const pull = await pullAll(db, client);

    status.setResource('push');
    const push = await pushAllPending(db, client);

    status.setResource('submissions');
    const submission = await syncSubmissions(db, client);

    status.setPendingCount(await getPendingCount());
    status.setDeadLetterCount(await getDeadLetterCount());
    status.finishRun();

    return { push, pull, submission };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sync failed';
    status.finishRun(message);
    throw e;
  }
}
