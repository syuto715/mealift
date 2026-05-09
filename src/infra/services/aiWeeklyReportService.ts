import {
  AIError,
  type AIErrorCode,
  callEdgeFunction,
} from './aiNutritionService';
import { hasFeature, type PlanStatus } from './subscriptionService';
import {
  buildCacheKey,
  getCached,
  setCached,
  recordCacheHit,
  recordCacheMiss,
} from './aiWeeklyReportCache';
import {
  NARRATIVE_CACHE_VERSION,
  type WeeklyNarrative,
  type WeeklyReportData,
} from '../../types/weeklyReport';
import { getPendingForTable } from '../repositories/syncRepository';

// Build 16 / Phase 1 (Feature H) / Phase 1.3 — client wrapper around
// the generate-weekly-report Edge Function.
//
// Mirrors aiWorkoutService's shape (callEdgeFunction reuse, AIError
// re-throw class, ERROR_MESSAGE_BY_CODE map) so the auth + structured-
// error parsing stays uniform across every AI EF in the app.
//
// Three Feature-H additions on top of that pattern:
//   1. Plus-tier preflight via hasFeature(feat, planStatus) — Phase
//      9.1 lesson: must use hasFeature so trial users get Plus access
//      (canUse() reads currentTier which has no trial state). Caller
//      passes profile-derived PlanStatus from useSubscription().status.
//   2. AsyncStorage cache integration (Phase 7 pattern, scoped to
//      Feature H namespace via aiWeeklyReportCache).
//   3. Output stamping: the EF returns the narrative without
//      generatedAt / cacheVersion; the service stamps them so the
//      cache + the saveNarrativeToReport persist contract see the
//      same fully-formed WeeklyNarrative.

// === EF response shape (validated server-side by validateGeneratedNarrative) ===
// What the EF returns: WeeklyNarrative minus the client-side stamps.
type GeneratedNarrative = Omit<
  WeeklyNarrative,
  'generatedAt' | 'cacheVersion'
>;

export interface GenerateWeeklyReportRequest {
  weekStart: string;
  reportData: WeeklyReportData;
}

// === Error class ===

export class AIWeeklyReportError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AIWeeklyReportError';
  }
}

// User-facing Japanese strings indexed by AIErrorCode. Keep in sync
// with the EF's error messages so the client's fallback copy matches
// what the server already wrote when the response carried a message.
export const ERROR_MESSAGE_BY_CODE: Record<string, string> = {
  unauthorized: 'ログインが必要です',
  invalid_token: 'セッションが切れました。再ログインしてください',
  invalid_request: 'リクエスト内容に不備があります',
  plus_required: 'AI週次レポートはPlusプラン以上でご利用いただけます',
  quota_exceeded: '今月のAI週次レポート生成回数が上限に達しました',
  gemini_error: 'AI 生成に失敗しました。再試行してください',
  validation_failed: 'AI が想定外の形式の応答を返しました。再試行してください',
  internal_error: 'サーバーエラーが発生しました',
  network_error: 'ネットワーク接続を確認してください',
  not_configured: 'サーバー接続が設定されていません',
  aborted: 'リクエストを中止しました',
};

function rethrowAsWeeklyReportError(err: unknown): never {
  if (err instanceof AIError) {
    const userMessage = ERROR_MESSAGE_BY_CODE[err.code] ?? err.message;
    throw new AIWeeklyReportError(
      err.code,
      userMessage,
      err.status,
      err.details,
    );
  }
  throw new AIWeeklyReportError(
    'internal_error',
    err instanceof Error ? err.message : 'unknown error',
    500,
  );
}

// Codex review pass 1 / Important #1 — sync-lag drift guard.
//
// The cache key is computed from local state (profile.goalType,
// reportData) but the EF reads server profile.goal_type. A user who
// changes their goal locally and triggers generation before sync
// drains would cache an EF response built from the OLD goal under a
// key reflecting the NEW goal — permanent poisoning until TTL.
//
// Mitigation (mirrors aiWorkoutService.shouldBypassCache from
// Phase 7 Codex pass 1): skip cache read AND write when the sync
// queue has any pending write on `profiles`. Once sync drains,
// future generations get a clean cache. A residual ~ms-scale race
// remains between "queue drains" and "EF reads" — acceptable for
// an opportunistic cache, would only fully close with an EF echo
// of inputs (Build 16+).
async function shouldBypassCache(): Promise<boolean> {
  try {
    const pending = await getPendingForTable('profiles', 1);
    return pending.length > 0;
  } catch {
    // If sync_queue read itself fails, fail open (use cache) —
    // we don't want a transient SQLite hiccup to silently disable
    // caching for everyone.
    return false;
  }
}

// Codex review pass 1 / Important #2 — full 4-section shape
// validation. Original guard checked only overall + sections.
// integration; the contract requires all four sections (Phase 1.1
// type spec). Server validateGeneratedNarrative already enforces
// this on responses, so this client-side check defends against
// future server regressions, hand-corrupted cache entries, and
// development-time mocks that forget a section.
function isValidNarrativeBody(value: unknown): value is {
  overall: string;
  sections: {
    workout: string;
    nutrition: string;
    weight: string;
    integration: string;
  };
} {
  if (!value || typeof value !== 'object') return false;
  const v = value as { overall?: unknown; sections?: unknown };
  if (typeof v.overall !== 'string' || v.overall.length === 0) return false;
  if (!v.sections || typeof v.sections !== 'object') return false;
  const s = v.sections as Record<string, unknown>;
  for (const k of ['workout', 'nutrition', 'weight', 'integration']) {
    if (typeof s[k] !== 'string' || (s[k] as string).length === 0) {
      return false;
    }
  }
  return true;
}

// === Cache args ===
// Optional caller-provided context. Without `cache.profileId` the
// client-side cache is bypassed (e.g. unit tests). Without
// `cache.goalType` the cache key uses null for goal — same partition
// behavior as a profile that has no goal set.
export interface CacheArgs {
  profileId: string;
  goalType: string | null;
}

// === Top-level entry ===

// Codex review pass 1 (Phase 1.4) / Important #2 — caller must
// know whether the result came back from the local cache so the
// quota badge isn't optimistically advanced when no EF call (and
// therefore no quota row) actually happened. Returning a tagged
// shape is more explicit than a sibling "lastWasCacheHit" module
// flag and survives concurrent calls.
export interface AIWeeklyReportResult {
  narrative: WeeklyNarrative;
  fromCache: boolean;
}

export async function generateAIWeeklyReport(
  request: GenerateWeeklyReportRequest,
  options: {
    // PlanStatus from useSubscription().status. Required because the
    // service runs the Plus-tier preflight before any network round
    // trip — Phase 9.1 lesson on hasFeature vs canUse.
    planStatus: PlanStatus;
    signal?: AbortSignal;
    cache?: CacheArgs;
  },
): Promise<AIWeeklyReportResult> {
  // --- 1. Plus tier preflight ---
  // Server enforces this too (plus_required 402) but cutting the
  // round trip for free users is a UX + cost win.
  if (!hasFeature('aiWeeklyReport', options.planStatus)) {
    throw new AIWeeklyReportError(
      'plus_required',
      ERROR_MESSAGE_BY_CODE.plus_required,
      402,
    );
  }

  // --- 2. Cache lookup ---
  // Bypass entirely when sync queue has pending profiles writes
  // (Codex review pass 1 / Important #1) so a local-vs-server goal
  // mismatch can't poison the cache with the wrong narrative.
  let cacheHash: string | null = null;
  const cacheArgs = options.cache;
  let cacheActive = false;
  if (cacheArgs) {
    cacheActive = !(await shouldBypassCache());
  }
  if (cacheArgs && cacheActive) {
    cacheHash = buildCacheKey({
      weekStart: request.weekStart,
      goalType: cacheArgs.goalType,
      avgCalories: request.reportData.avgCalories,
      avgProtein: request.reportData.avgProtein,
      avgFat: request.reportData.avgFat,
      avgCarb: request.reportData.avgCarb,
      mealLogDays: request.reportData.mealLogDays,
      workoutCount: request.reportData.workoutCount,
      totalVolume: request.reportData.totalVolume,
      totalCaloriesBurned: request.reportData.totalCaloriesBurned,
      consistencyScore: request.reportData.consistencyScore,
      nutritionScore: request.reportData.nutritionScore,
      trainingScore: request.reportData.trainingScore,
      overallScore: request.reportData.overallScore,
      weightStart: request.reportData.weightStart,
      weightEnd: request.reportData.weightEnd,
      weightChange: request.reportData.weightChange,
    });
    const cached = await getCached(cacheArgs.profileId, cacheHash);
    if (cached) {
      void recordCacheHit();
      return { narrative: cached, fromCache: true };
    }
    void recordCacheMiss();
  }

  // --- 3. EF call ---
  try {
    const response = await callEdgeFunction<
      GenerateWeeklyReportRequest,
      GeneratedNarrative
    >('generate-weekly-report', request, { signal: options.signal });

    if (!isValidNarrativeBody(response)) {
      throw new AIWeeklyReportError(
        'validation_failed',
        ERROR_MESSAGE_BY_CODE.validation_failed,
        502,
      );
    }

    // Stamp generatedAt + cacheVersion at the service boundary so
    // the cache, the persistence layer (saveNarrativeToReport), and
    // any UI consumer all see the same fully-formed WeeklyNarrative.
    const stamped: WeeklyNarrative = {
      overall: response.overall,
      sections: response.sections,
      generatedAt: Date.now(),
      cacheVersion: NARRATIVE_CACHE_VERSION,
    };

    // Cache write only when bypass is inactive (Codex review pass 1
    // / Important #1) — never write a poisoned entry under a NEW
    // local key while sync is still draining.
    if (cacheArgs && cacheActive && cacheHash) {
      void setCached(cacheArgs.profileId, cacheHash, stamped);
    }
    return { narrative: stamped, fromCache: false };
  } catch (err) {
    if (err instanceof AIWeeklyReportError) throw err;
    rethrowAsWeeklyReportError(err);
  }
}

// Re-export the raw error code union so consumers (Phase 1.4 UI catch
// blocks) can pattern-match without dragging in aiNutritionService.
export type { AIErrorCode };
