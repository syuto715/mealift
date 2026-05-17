// v1.5 Stage 1 Phase 1.5 — routineGenerationRepository.
//
// SQLite v33 helpers + Supabase direct writes for status
// transitions.
//
// Phase 1.5 Codex round 1 Critical fix — the original design (§5.2
// I2 exception) routed `apply` / `discard` through `sync_queue` on
// the assumption that the orchestrator would push them. The
// orchestrator has no resource module for `routine_generations`,
// so queued items would have stayed pending forever. To close the
// loop without scope-creeping a new sync resource into Phase 1.5,
// we move to a server-authoritative model (matching chat / advice):
//   - The coach-routine EF is the SSoT writer of the initial row
//     (STEP 7 placeholder + STEP 11 UPDATE generated_routine_json).
//   - Apply / discard write to Supabase via supabase-js directly,
//     then refresh the local mirror.
//   - Offline apply is therefore unsupported in Phase 1.5; the
//     local-authoritative pretense + sync_queue resource module
//     are deferred to a v1.5+ candidate.
//
// Mirror schema (v33 migration):
//   routine_generations_local
//     id TEXT PK
//     user_id TEXT
//     prompt_context_json TEXT  (JSON-stringified)
//     generated_routine_json TEXT  (JSON-stringified)
//     status TEXT  (draft | applied | discarded)
//     applied_routine_id TEXT NULL  (workout_routines.id once applied)
//     created_at TEXT
//     applied_at TEXT NULL
//     cached_at TEXT

import { getDatabase } from '../database/connection';
import { supabase } from '../supabase/client';
import type {
  GeneratedRoutine,
  LocalRoutineGeneration,
  RoutineGenerationStatus,
} from '../../types/routineGeneration';

interface DbRow {
  id: string;
  user_id: string;
  prompt_context_json: string;
  generated_routine_json: string;
  status: string;
  applied_routine_id: string | null;
  created_at: string;
  applied_at: string | null;
}

interface SupabaseRow {
  id: string;
  user_id: string;
  prompt_context_json: Record<string, unknown>;
  generated_routine_json: Record<string, unknown>;
  status: string;
  applied_routine_id: string | null;
  created_at: string;
  applied_at: string | null;
}

function rowToGeneration(r: DbRow): LocalRoutineGeneration {
  return {
    id: r.id,
    userId: r.user_id,
    promptContext:
      (safeJsonParse(r.prompt_context_json) as Record<string, unknown> | null) ??
      {},
    generatedRoutine: (safeJsonParse(r.generated_routine_json) ??
      {}) as GeneratedRoutine,
    status: r.status as RoutineGenerationStatus,
    appliedRoutineId: r.applied_routine_id,
    createdAt: r.created_at,
    appliedAt: r.applied_at,
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getGenerationById(
  id: string,
): Promise<LocalRoutineGeneration | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DbRow>(
    `SELECT * FROM routine_generations_local WHERE id = ?`,
    [id],
  );
  return row ? rowToGeneration(row) : null;
}

export async function listDraftsByUser(
  userId: string,
): Promise<LocalRoutineGeneration[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DbRow>(
    `SELECT * FROM routine_generations_local
       WHERE user_id = ? AND status = 'draft'
       ORDER BY created_at DESC
       LIMIT 12`,
    [userId],
  );
  return rows.map(rowToGeneration);
}

export async function upsertGeneration(
  gen: LocalRoutineGeneration,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO routine_generations_local
       (id, user_id, prompt_context_json, generated_routine_json,
        status, applied_routine_id, created_at, applied_at, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       prompt_context_json = excluded.prompt_context_json,
       generated_routine_json = excluded.generated_routine_json,
       status = excluded.status,
       applied_routine_id = excluded.applied_routine_id,
       applied_at = excluded.applied_at,
       cached_at = datetime('now')`,
    [
      gen.id,
      gen.userId,
      JSON.stringify(gen.promptContext),
      JSON.stringify(gen.generatedRoutine),
      gen.status,
      gen.appliedRoutineId,
      gen.createdAt,
      gen.appliedAt,
    ],
  );
}

/** Apply transition writer. Updates Supabase directly + mirrors
 *  to local SQLite. Returns false (no throw) when offline or when
 *  the Supabase UPDATE errors so the store can surface the error
 *  via AIError. Phase 1.5 Codex round 1 Critical #2 fix —
 *  replaces the sync_queue enqueue path which the orchestrator
 *  doesn't process. */
export async function updateGenerationStatus(
  userId: string,
  generationId: string,
  next: {
    status: RoutineGenerationStatus;
    appliedRoutineId?: string | null;
    appliedAt?: string | null;
  },
): Promise<{ ok: boolean; errorMessage?: string }> {
  if (!supabase) {
    return { ok: false, errorMessage: 'オフラインのため適用できません' };
  }
  const { error: supabaseError } = await supabase
    .from('routine_generations')
    .update({
      status: next.status,
      applied_routine_id: next.appliedRoutineId ?? null,
      applied_at: next.appliedAt ?? null,
    })
    .eq('id', generationId)
    .eq('user_id', userId);
  if (supabaseError) {
    return { ok: false, errorMessage: supabaseError.message };
  }
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE routine_generations_local
       SET status = ?,
           applied_routine_id = COALESCE(?, applied_routine_id),
           applied_at = COALESCE(?, applied_at),
           cached_at = datetime('now')
     WHERE id = ?`,
    [
      next.status,
      next.appliedRoutineId ?? null,
      next.appliedAt ?? null,
      generationId,
    ],
  );
  return { ok: true };
}

/** Pull recent generations from Supabase + reconcile the mirror
 *  (upsert + prune). Silently no-ops when offline. Mirrors Phase
 *  1.2 / 1.4 reconciliation pattern. */
export async function syncGenerationsFromSupabase(
  userId: string,
): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('routine_generations')
    .select(
      'id, user_id, prompt_context_json, generated_routine_json, status, applied_routine_id, created_at, applied_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !data) return;
  const serverRows = data as SupabaseRow[];
  const serverIds = new Set(serverRows.map((r) => r.id));
  for (const r of serverRows) {
    await upsertGeneration({
      id: r.id,
      userId: r.user_id,
      promptContext: r.prompt_context_json,
      generatedRoutine: r.generated_routine_json as unknown as GeneratedRoutine,
      status: r.status as RoutineGenerationStatus,
      appliedRoutineId: r.applied_routine_id,
      createdAt: r.created_at,
      appliedAt: r.applied_at,
    });
  }
  const db = await getDatabase();
  const localRows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM routine_generations_local WHERE user_id = ?`,
    [userId],
  );
  for (const row of localRows) {
    if (!serverIds.has(row.id)) {
      await db.runAsync(
        `DELETE FROM routine_generations_local WHERE id = ?`,
        [row.id],
      );
    }
  }
}
