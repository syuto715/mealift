// v1.5 Stage 1 Phase 1.4 — pure helper extracted from AdviceCard
// so the state-derivation can be unit-tested without RNTL
// (`feedback_test_infrastructure_gap` memory).

import type { AIError } from '../../infra/services/aiNutritionService';
import type { LocalCoachAdvice } from '../../types/coachAdvice';

export type AdviceCardState =
  | 'locked' /* free tier, no access */
  | 'loading'
  | 'error'
  | 'content';

export interface PickAdviceCardStateInput {
  hasAccess: boolean;
  isLoading: boolean;
  error: AIError | null;
  advice: LocalCoachAdvice | null;
}

// v1.5.1 Fix 4 — サーバ側 tier 拒否 (403) の error code 一覧。
// coach-advice / coach-routine EF は 'plan_required'、
// generate-weekly-report は 'plus_required'、栄養系 pipeline は
// 'pro_required' を返す。これらは「通信エラー」ではなく「未課金」
// なので、赤+再試行ではなく locked カード (通常トーン + プラン導線)
// に振り分ける。
const TIER_DENIAL_CODES: ReadonlySet<string> = new Set([
  'plan_required',
  'plus_required',
  'pro_required',
]);

export function isTierDenialError(error: AIError | null): boolean {
  return error !== null && TIER_DENIAL_CODES.has(error.code);
}

/** Resolve the next render state given the four input signals.
 *  Precedence (in order — content beats error so a stale-but-good
 *  row stays visible while the failed refresh surfaces via
 *  state.error elsewhere — Drafting 103 graceful degradation):
 *   1. !hasAccess → locked  (free user, no quota, no fetch)
 *   2. tier-denial error → locked
 *        (v1.5.1 Fix 4: クライアント判定が access ありでも tier の
 *         authoritative source はサーバ。EF が 403 plan_required 等を
 *         返したら locked に落とす。cached advice より優先 — 権限の
 *         ない状態で過去コンテンツを見せ続けない: I1 no-free-reads。)
 *   3. advice → content      (even if loading or error; the
 *                              cached row stays visible while the
 *                              background refresh re-fires)
 *   4. error → error         (no cached row + most-recent fetch
 *                              failed — 通信エラー等のみ。再試行 CTA)
 *   5. fallback → loading    (initial mount + ongoing fetch) */
export function pickAdviceCardState(
  input: PickAdviceCardStateInput,
): AdviceCardState {
  if (!input.hasAccess) return 'locked';
  if (isTierDenialError(input.error)) return 'locked';
  if (input.advice) return 'content';
  if (input.error) return 'error';
  return 'loading';
}
