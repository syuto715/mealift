import type { SQLiteDatabase } from 'expo-sqlite';
import { listAllSubmissions } from '../repositories/userSubmittedFoodRepository';
import {
  awardBadge,
  listEarnedBadgeIds,
} from '../repositories/userBadgeRepository';
import {
  evaluateBadges,
  type EarnedBadge,
} from '../../domain/badges/badgeEvaluator';
import { supabase } from '../supabase/client';

// Glue between submission data + Supabase use_count + the pure
// evaluator + the user_badges ledger. Returns badges that were
// NEWLY granted on this call so the caller can render a toast.
//
// Failure modes are absorbed: if the use_count fetch fails, social
// badges are simply not evaluated this round. Volume / category /
// streak badges depend on local data only and run regardless.

async function fetchTotalUseCount(
  remoteIds: string[],
): Promise<number | null> {
  if (remoteIds.length === 0 || !supabase) return 0;
  try {
    const { data, error } = await supabase
      .from('public_foods')
      .select('use_count')
      .in('id', remoteIds);
    if (error) return null;
    let total = 0;
    for (const row of (data ?? []) as Array<{ use_count: number }>) {
      total += row.use_count ?? 0;
    }
    return total;
  } catch {
    return null;
  }
}

// evaluateAndAwardBadges — runs the full pipeline. Call this after
// any event that could change badge state (submit success, sync
// success). Idempotent: badges already awarded are no-ops.
//
// Returns the badges that were NEWLY awarded in this call.
export async function evaluateAndAwardBadges(
  db: SQLiteDatabase,
): Promise<EarnedBadge[]> {
  const submissions = await listAllSubmissions(db);
  const remoteIds = submissions
    .filter((s) => s.submissionStatus === 'approved' && s.remoteId)
    .map((s) => s.remoteId as string);
  const totalUseCount = await fetchTotalUseCount(remoteIds);

  const earned = evaluateBadges({ submissions, totalUseCount });
  const alreadyEarned = await listEarnedBadgeIds(db);

  const newlyEarned: EarnedBadge[] = [];
  for (const badge of earned) {
    if (alreadyEarned.has(badge.definition.id)) continue;
    const granted = await awardBadge(
      db,
      badge.definition.id,
      badge.relatedCount,
    );
    if (granted) newlyEarned.push(badge);
  }
  return newlyEarned;
}
