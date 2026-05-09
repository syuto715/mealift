import AsyncStorage from '@react-native-async-storage/async-storage';
import { fnv1a, type CacheStorage } from './aiMenuCache';
import type { WeeklyNarrative } from '../../types/weeklyReport';

// Build 16 / Phase 1 (Feature H) / Phase 1.3 — local cache for AI
// weekly report narratives.
//
// Reuses the Phase 7 aiMenuCache architectural pattern (FNV-1a +
// AsyncStorage + per-user namespace + entry-side cacheVersion + lazy
// TTL + telemetry counters). The hash function and storage interface
// are imported from aiMenuCache to avoid copy-paste; the rest is
// scoped to weekly-report semantics:
//
//   - Different KEY_PREFIX / telemetry keys so cache state stays
//     partitioned from AI menu generation
//   - CacheableWeeklyInput: the union of inputs that meaningfully
//     change EF output (weekStart, goalType, the 14 numeric stats
//     in the prompt). Weights are rounded to 1 decimal so a
//     weight-tracker noise-floor (~50g drift) doesn't produce
//     spurious cache misses
//   - Stores a fully-stamped WeeklyNarrative so cache hits return
//     the same shape callers expect from the EF path
//
// TTL is 24 hours per Phase 1 sign-off F6 (vs 7 days for the menu
// cache) — weekly stats change continuously enough that a day-old
// narrative for the same week can be re-generated cheaply. The
// monthly EF quota (Plus 4 / Pro 12) is the hard upper bound.

export const CACHE_VERSION = 1;
export const TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'ai_weekly_report:cache:';
const HITS_KEY = 'ai_weekly_report:telemetry:cache_hits';
const MISSES_KEY = 'ai_weekly_report:telemetry:cache_misses';

export interface CacheableWeeklyInput {
  // Canonical Monday-anchored week key. Must be 'YYYY-MM-DD'.
  weekStart: string;
  // Profile.goalType (cut/bulk/maintain/recomp) — drives the EF
  // prompt's tone. Null when the user hasn't set a goal yet.
  goalType: string | null;
  // Pre-rounded by generateWeeklyReport (already integer-ish), but
  // included verbatim so a future rounding change in the generator
  // shows up in the cache key.
  avgCalories: number;
  avgProtein: number;
  avgFat: number;
  avgCarb: number;
  mealLogDays: number;
  workoutCount: number;
  totalVolume: number;
  totalCaloriesBurned: number;
  consistencyScore: number;
  nutritionScore: number;
  trainingScore: number;
  overallScore: number;
  // Raw kg from body_logs — these come unrounded so we normalize
  // here. Null is preserved as null (no entries that week).
  weightStart: number | null;
  weightEnd: number | null;
  weightChange: number | null;
}

interface CacheEntry {
  version: number;
  createdAt: number;
  data: WeeklyNarrative;
}

// Round weight to 1 decimal so 70.51 vs 70.52 don't collide-bust the
// cache. Preserves null. Idempotent on already-rounded inputs.
function roundWeight(n: number | null): number | null {
  if (n === null) return null;
  // Round half-away-from-zero via toFixed (JS Math.round on 0.05 is
  // famously inconsistent). +1 decimal keeps 100g resolution.
  return Number.parseFloat(n.toFixed(1));
}

export function buildCacheKey(input: CacheableWeeklyInput): string {
  const canonical = JSON.stringify({
    weekStart: input.weekStart,
    goalType: input.goalType ?? null,
    weightStart: roundWeight(input.weightStart),
    weightEnd: roundWeight(input.weightEnd),
    weightChange: roundWeight(input.weightChange),
    avgCalories: input.avgCalories,
    avgProtein: input.avgProtein,
    avgFat: input.avgFat,
    avgCarb: input.avgCarb,
    mealLogDays: input.mealLogDays,
    workoutCount: input.workoutCount,
    totalVolume: input.totalVolume,
    totalCaloriesBurned: input.totalCaloriesBurned,
    consistencyScore: input.consistencyScore,
    nutritionScore: input.nutritionScore,
    trainingScore: input.trainingScore,
    overallScore: input.overallScore,
  });
  return fnv1a(canonical);
}

function namespaceKey(userId: string, hash: string): string {
  return `${KEY_PREFIX}${userId}:${hash}`;
}

async function safeRemove(storage: CacheStorage, key: string): Promise<void> {
  try {
    await storage.removeItem(key);
  } catch {
    // ignore
  }
}

// Same shape as aiMenuCache.getCached: storage failure → null,
// version mismatch → drop+null, TTL expiry → drop+null, structural
// invalidity → drop+null. Self-healing.
export async function getCached(
  userId: string,
  hash: string,
  options?: {
    storage?: CacheStorage;
    now?: number;
    ttlMs?: number;
  },
): Promise<WeeklyNarrative | null> {
  const storage = options?.storage ?? AsyncStorage;
  const now = options?.now ?? Date.now();
  const ttl = options?.ttlMs ?? TTL_MS;
  const key = namespaceKey(userId, hash);

  let raw: string | null;
  try {
    raw = await storage.getItem(key);
  } catch {
    return null;
  }
  if (raw == null) return null;

  let entry: CacheEntry;
  try {
    entry = JSON.parse(raw) as CacheEntry;
  } catch {
    await safeRemove(storage, key);
    return null;
  }

  if (entry.version !== CACHE_VERSION) {
    await safeRemove(storage, key);
    return null;
  }
  if (now - entry.createdAt > ttl) {
    await safeRemove(storage, key);
    return null;
  }
  // Structural sanity — empty narrative is no better than corrupt.
  // Codex review pass 1 / Important #2 — validate every required
  // section, not just integration. The Phase 1.1 type contract
  // declares all four sections required, so any cache entry missing
  // one is treated as expired and self-heals on the next read.
  if (!isStructurallyValidNarrative(entry.data)) {
    await safeRemove(storage, key);
    return null;
  }
  return entry.data;
}

function isStructurallyValidNarrative(data: unknown): data is WeeklyNarrative {
  if (!data || typeof data !== 'object') return false;
  const d = data as { overall?: unknown; sections?: unknown };
  if (typeof d.overall !== 'string' || d.overall.length === 0) return false;
  if (!d.sections || typeof d.sections !== 'object') return false;
  const s = d.sections as Record<string, unknown>;
  for (const k of ['workout', 'nutrition', 'weight', 'integration']) {
    if (typeof s[k] !== 'string' || (s[k] as string).length === 0) {
      return false;
    }
  }
  return true;
}

export async function setCached(
  userId: string,
  hash: string,
  data: WeeklyNarrative,
  options?: {
    storage?: CacheStorage;
    now?: number;
  },
): Promise<void> {
  const storage = options?.storage ?? AsyncStorage;
  const now = options?.now ?? Date.now();
  const entry: CacheEntry = {
    version: CACHE_VERSION,
    createdAt: now,
    data,
  };
  try {
    await storage.setItem(namespaceKey(userId, hash), JSON.stringify(entry));
  } catch {
    // Cache write failures are non-fatal — the EF response is already
    // in the caller's hands. Worst case: next identical request misses.
  }
}

async function increment(
  storage: CacheStorage,
  key: string,
): Promise<void> {
  try {
    const raw = await storage.getItem(key);
    const n = raw ? Number.parseInt(raw, 10) || 0 : 0;
    await storage.setItem(key, String(n + 1));
  } catch {
    // best-effort
  }
}

export async function recordCacheHit(
  options?: { storage?: CacheStorage },
): Promise<void> {
  return increment(options?.storage ?? AsyncStorage, HITS_KEY);
}

export async function recordCacheMiss(
  options?: { storage?: CacheStorage },
): Promise<void> {
  return increment(options?.storage ?? AsyncStorage, MISSES_KEY);
}

export async function readTelemetry(
  options?: { storage?: CacheStorage },
): Promise<{ hits: number; misses: number }> {
  const storage = options?.storage ?? AsyncStorage;
  const [rawHits, rawMisses] = await Promise.all([
    storage.getItem(HITS_KEY),
    storage.getItem(MISSES_KEY),
  ]);
  return {
    hits: rawHits ? Number.parseInt(rawHits, 10) || 0 : 0,
    misses: rawMisses ? Number.parseInt(rawMisses, 10) || 0 : 0,
  };
}
