import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listSubmissionsByStatus } from '../repositories/userSubmittedFoodRepository';
import { supabase } from '../supabase/client';

// Sprint 5 phase 5-5: contribution feedback notifications.
//
// "Your submission was used by N people" surfaced once per 24h.
// State lives in AsyncStorage:
//   - lastUseCountTotal — last use_count sum we observed
//   - lastCheckedAt     — ms timestamp of the last check
//
// On check: if >24h elapsed AND new total > old total, return a
// notification payload with the delta. The caller (home screen)
// renders an Alert. Nothing is fired if Supabase is unreachable
// or the user has no approved submissions yet.

const STORAGE_KEY_TOTAL = 'contribution_last_use_count_total';
const STORAGE_KEY_CHECKED_AT = 'contribution_last_checked_at';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface ContributionStats {
  totalUseCount: number;
  approvedSubmissionCount: number;
}

export interface ContributionDelta {
  newTotal: number;
  delta: number;
  approvedSubmissionCount: number;
}

async function readStoredTotal(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_TOTAL);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function readLastCheckedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CHECKED_AT);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function writeStoredTotal(total: number): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_TOTAL, String(total));
    await AsyncStorage.setItem(
      STORAGE_KEY_CHECKED_AT,
      String(Date.now()),
    );
  } catch {
    // Non-fatal — next attempt re-checks.
  }
}

// Fetches use_count totals from public_foods for all approved local
// submissions. Returns null when Supabase is unreachable or there
// are no approved submissions yet (so the caller can no-op).
export async function fetchContributionStats(
  db: SQLiteDatabase,
): Promise<ContributionStats | null> {
  if (!supabase) return null;
  const approved = await listSubmissionsByStatus(db, 'approved');
  const remoteIds = approved
    .filter((s) => s.remoteId)
    .map((s) => s.remoteId as string);
  if (remoteIds.length === 0) {
    return { totalUseCount: 0, approvedSubmissionCount: 0 };
  }
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
    return {
      totalUseCount: total,
      approvedSubmissionCount: approved.length,
    };
  } catch {
    return null;
  }
}

// Once-per-day check. Returns a delta payload only when:
//   - >24h has elapsed since the last check (or no prior check)
//   - The fetched total is strictly greater than the stored total
//
// On any return path, the stored total + checked-at are updated so
// subsequent calls within the window are cheap no-ops.
export async function checkContributionDelta(
  db: SQLiteDatabase,
): Promise<ContributionDelta | null> {
  const lastCheck = await readLastCheckedAt();
  const now = Date.now();
  if (lastCheck != null && now - lastCheck < CHECK_INTERVAL_MS) {
    return null;
  }
  const stats = await fetchContributionStats(db);
  if (!stats) return null;

  const previousTotal = (await readStoredTotal()) ?? 0;
  await writeStoredTotal(stats.totalUseCount);

  const delta = stats.totalUseCount - previousTotal;
  if (delta <= 0) return null;
  return {
    newTotal: stats.totalUseCount,
    delta,
    approvedSubmissionCount: stats.approvedSubmissionCount,
  };
}
