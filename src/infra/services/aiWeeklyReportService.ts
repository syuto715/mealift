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
): Promise<WeeklyNarrative> {
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
  let cacheHash: string | null = null;
  const cacheArgs = options.cache;
  if (cacheArgs) {
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
      return cached;
    }
    void recordCacheMiss();
  }

  // --- 3. EF call ---
  try {
    const response = await callEdgeFunction<
      GenerateWeeklyReportRequest,
      GeneratedNarrative
    >('generate-weekly-report', request, { signal: options.signal });

    if (
      !response ||
      typeof response.overall !== 'string' ||
      !response.sections ||
      typeof response.sections.integration !== 'string'
    ) {
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

    if (cacheArgs && cacheHash) {
      void setCached(cacheArgs.profileId, cacheHash, stamped);
    }
    return stamped;
  } catch (err) {
    if (err instanceof AIWeeklyReportError) throw err;
    rethrowAsWeeklyReportError(err);
  }
}

// Re-export the raw error code union so consumers (Phase 1.4 UI catch
// blocks) can pattern-match without dragging in aiNutritionService.
export type { AIErrorCode };
