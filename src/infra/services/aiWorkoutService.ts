import {
  AIError,
  type AIErrorCode,
  callEdgeFunction,
} from './aiNutritionService';
import {
  buildCacheKey,
  getCached,
  setCached,
  recordCacheHit,
  recordCacheMiss,
} from './aiMenuCache';
import { getPendingForTable } from '../repositories/syncRepository';

// Build 15 / Session 8 / Feature 5-元 — client wrapper around the
// generate-workout-menu Edge Function (Phase 4).
//
// Reuses callEdgeFunction + AIError from aiNutritionService so the
// auth + structured-error parsing stays uniform across every AI EF.
// AIWorkoutError is a thin re-throw class so Phase 6 UI catches can
// `instanceof AIWorkoutError` to discriminate menu errors from
// nutrition errors.

// === §7.1 response schema (literal type) ===
// Matches the validateGeneratedProgram shape on the EF side. Stays
// in lockstep with supabase/functions/generate-workout-menu/index.ts.

export type SplitType =
  | 'full_body'
  | 'upper_lower'
  | 'ppl'
  | 'bro_split'
  | 'custom';

export interface WorkoutBlock {
  exerciseSlug: string;
  sets: number;
  repRangeMin: number;
  repRangeMax: number;
  targetRPE: number;
  restSeconds: number;
  notes: string | null;
}

export interface WorkoutDay {
  dayLabel: string;
  blocks: WorkoutBlock[];
}

export interface WorkoutWeek {
  weekIndex: number;
  deload: boolean;
  days: WorkoutDay[];
}

export interface GeneratedProgram {
  programName: string;
  durationWeeks: number;
  splitType: SplitType;
  weeks: WorkoutWeek[];
}

export interface GenerateMenuRequest {
  targetMuscles: string[];
  durationMinutes: number;
  exerciseSlugs: string[];
}

// === Error class ===

export class AIWorkoutError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AIWorkoutError';
  }
}

// Map raw AIError codes (sibling nutrition pipeline + 5-元 additions)
// to user-facing Japanese strings + a stable code surface for the
// UI's error-rendering switch.
export const ERROR_MESSAGE_BY_CODE: Record<string, string> = {
  unauthorized: 'ログインが必要です',
  invalid_token: 'セッションが切れました。再ログインしてください',
  invalid_request: 'リクエスト内容に不備があります',
  no_equipment: 'ジム器具設定で少なくとも1つの器具を有効にしてください',
  quota_exceeded: '今月の AI メニュー生成回数が上限に達しました',
  gemini_error: 'AI 生成に失敗しました。再試行してください',
  validation_failed: 'AI が想定外の形式の応答を返しました。再試行してください',
  internal_error: 'サーバーエラーが発生しました',
  network_error: 'ネットワーク接続を確認してください',
  not_configured: 'サーバー接続が設定されていません',
  aborted: 'リクエストを中止しました',
};

function rethrowAsWorkoutError(err: unknown): never {
  if (err instanceof AIError) {
    const userMessage = ERROR_MESSAGE_BY_CODE[err.code] ?? err.message;
    throw new AIWorkoutError(err.code, userMessage, err.status, err.details);
  }
  throw new AIWorkoutError(
    'internal_error',
    err instanceof Error ? err.message : 'unknown error',
    500,
  );
}

// === Top-level entry ===

// Calls the generate-workout-menu EF and returns the parsed program.
// EF-side validation already enforces §7.1 shape — we trust the
// payload here and surface any mismatch via the existing
// 502 'validation_failed' path (rethrown as AIWorkoutError).
//
// `signal` is an optional AbortSignal forwarded to fetch — Phase 6 UI
// passes one wired to a cancel button so the user can abort cold-start
// Gemini calls. Aborted requests surface as AIWorkoutError(code='aborted').
//
// Cache (Phase 7 / Commit 26): when `cache.profileId` is supplied,
// the wrapper computes a per-user FNV-1a key over (targetMuscles,
// durationMinutes, equipmentSet, goalType, exerciseSlugs) and tries
// AsyncStorage first. A hit returns immediately and skips both the EF
// call and the server quota counter (cache hits are free). A miss
// proceeds to the EF call and writes the result back on success. If
// the caller doesn't supply cache.profileId the cache is bypassed
// entirely (e.g. unit tests, ad-hoc invocations).
export interface CacheArgs {
  profileId: string;
  goalType: string | null;
  equipmentKeys: string[];
  // Phase 7 / Codex review #1 — included in the cache key because the
  // EF prompt embeds it (see generate-workout-menu/index.ts §6 build
  // prompt). null means "EF falls back to its 3-day default", which
  // is partitioned distinctly from an explicit 3.
  trainingDaysPerWeek: number | null;
}

// Phase 7 / Codex review #2 — sync-lag drift guard.
//
// The cache key is computed from local state (profile, user_equipment)
// while the EF reads remote state. Local writes enqueue for sync but
// don't push inline, so a user can:
//   1. toggle equipment locally → enqueue
//   2. hit "generate" before sync drains
//   3. local cache key reflects NEW equipment but EF generates from
//      OLD remote equipment → response gets cached under the NEW key
//      but actually represents OLD inputs → permanent poisoning.
//
// Mitigation: skip the cache (both read and write) entirely whenever
// the sync queue contains a pending write on `user_equipment` or
// `profiles`. Once sync drains, future generations get a clean cache
// with consistent local/remote state. A residual ~ms-scale race still
// exists between "queue drains" and "EF reads"; that window is
// acceptable for an opportunistic local cache and would need an EF
// echo of inputs to fully eliminate (Phase 4 sealed; Build 16+ TODO).
async function shouldBypassCache(): Promise<boolean> {
  const [eq, pf] = await Promise.all([
    getPendingForTable('user_equipment', 1),
    getPendingForTable('profiles', 1),
  ]);
  return eq.length > 0 || pf.length > 0;
}

export async function generateAIWorkoutMenu(
  request: GenerateMenuRequest,
  options?: { signal?: AbortSignal; cache?: CacheArgs },
): Promise<GeneratedProgram> {
  // --- Cache lookup ---
  // Compute the key once even on miss so we can reuse it for the
  // subsequent setCached without re-stringifying. The EF call still
  // happens; only the response transit is short-circuited.
  //
  // Bypass entirely when the sync queue holds a pending write on the
  // tables we read for cache-key inputs — see shouldBypassCache for
  // why this prevents a poisoning race against EF remote-state reads.
  let cacheHash: string | null = null;
  const cacheArgs = options?.cache;
  let cacheActive = false;
  if (cacheArgs) {
    cacheActive = !(await shouldBypassCache());
  }
  if (cacheArgs && cacheActive) {
    cacheHash = buildCacheKey({
      targetMuscles: request.targetMuscles,
      durationMinutes: request.durationMinutes,
      equipmentSet: cacheArgs.equipmentKeys,
      goalType: cacheArgs.goalType,
      trainingDaysPerWeek: cacheArgs.trainingDaysPerWeek,
      exerciseSlugs: request.exerciseSlugs,
    });
    const cached = await getCached(cacheArgs.profileId, cacheHash);
    if (cached) {
      // Telemetry is fire-and-forget so a storage hiccup never blocks
      // the user-facing return path.
      void recordCacheHit();
      return cached;
    }
    void recordCacheMiss();
  }

  try {
    const response = await callEdgeFunction<
      GenerateMenuRequest,
      GeneratedProgram
    >('generate-workout-menu', request, { signal: options?.signal });

    if (!response || typeof response.programName !== 'string') {
      throw new AIWorkoutError(
        'validation_failed',
        'AI が想定外の形式の応答を返しました',
        502,
      );
    }

    // Cache write only happens on a successful, validated EF response —
    // never cache an error or a malformed payload. Skipped when sync
    // bypass is active so we don't write poisoned entries.
    if (cacheArgs && cacheActive && cacheHash) {
      void setCached(cacheArgs.profileId, cacheHash, response);
    }

    return response;
  } catch (err) {
    if (err instanceof AIWorkoutError) throw err;
    rethrowAsWorkoutError(err);
  }
}

// Re-export the raw error code union so consumers (Phase 6 UI catch
// blocks, future error-render switches) can pattern-match without
// dragging in aiNutritionService directly.
export type { AIErrorCode };
