// v1.5 Stage 1 Phase 1.4 — coachAdviceRepository.
//
// Read / write helpers over the SQLite v32 `coach_advice_local`
// mirror. Per §5.2 this is a read-cache only — the Supabase
// `coach_advice` table is the SSoT and the EF is server-
// authoritative. The repository writes to the local mirror so the
// UI can render the latest advice offline.
//
// NO `sync_queue` integration (§5.2). The server is the only
// writer; the client just mirrors.

import { getDatabase } from '../database/connection';
import { supabase } from '../supabase/client';
import type {
  CoachAdviceScope,
  LocalCoachAdvice,
} from '../../types/coachAdvice';

interface AdviceRow {
  id: string;
  user_id: string;
  scope: string;
  period_start: string;
  content: string;
  generated_at: string;
}

function rowToAdvice(r: AdviceRow): LocalCoachAdvice {
  return {
    id: r.id,
    userId: r.user_id,
    scope: r.scope as CoachAdviceScope,
    periodStart: r.period_start,
    content: r.content,
    generatedAt: r.generated_at,
  };
}

export async function listAdviceByScope(
  userId: string,
  scope: CoachAdviceScope,
): Promise<LocalCoachAdvice[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AdviceRow>(
    `SELECT * FROM coach_advice_local
       WHERE user_id = ? AND scope = ?
       ORDER BY period_start DESC
       LIMIT 12`,
    [userId, scope],
  );
  return rows.map(rowToAdvice);
}

export async function getAdviceByBucket(
  userId: string,
  scope: CoachAdviceScope,
  periodStart: string,
): Promise<LocalCoachAdvice | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdviceRow>(
    `SELECT * FROM coach_advice_local
       WHERE user_id = ? AND scope = ? AND period_start = ?`,
    [userId, scope, periodStart],
  );
  return row ? rowToAdvice(row) : null;
}

export async function upsertAdvice(advice: LocalCoachAdvice): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO coach_advice_local
       (id, user_id, scope, period_start, content, generated_at, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, scope, period_start) DO UPDATE SET
       id = excluded.id,
       content = excluded.content,
       generated_at = excluded.generated_at,
       cached_at = datetime('now')`,
    [
      advice.id,
      advice.userId,
      advice.scope,
      advice.periodStart,
      advice.content,
      advice.generatedAt,
    ],
  );
}

/** Pull the user's advice rows for a given scope from Supabase and
 *  reconcile the local mirror (upsert + prune missing). Mirrors
 *  Phase 1.2 chatRepository's authoritative-pull pattern. Silently
 *  no-ops when supabase=null (offline-safe). */
export async function syncAdviceFromSupabase(
  userId: string,
  scope: CoachAdviceScope,
): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('coach_advice')
    .select('id, user_id, scope, period_start, content, generated_at')
    .eq('user_id', userId)
    .eq('scope', scope)
    .order('period_start', { ascending: false })
    .limit(12);
  if (error || !data) return;
  const serverRows = data as AdviceRow[];
  const serverIds = new Set(serverRows.map((r) => r.id));
  for (const r of serverRows) {
    await upsertAdvice(rowToAdvice(r));
  }
  const db = await getDatabase();
  const localRows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM coach_advice_local WHERE user_id = ? AND scope = ?`,
    [userId, scope],
  );
  for (const row of localRows) {
    if (!serverIds.has(row.id)) {
      await db.runAsync(
        `DELETE FROM coach_advice_local WHERE id = ?`,
        [row.id],
      );
    }
  }
}
