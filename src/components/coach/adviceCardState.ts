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

/** Resolve the next render state given the four input signals.
 *  Precedence (in order — content beats error so a stale-but-good
 *  row stays visible while the failed refresh surfaces via
 *  state.error elsewhere — Drafting 103 graceful degradation):
 *   1. !hasAccess → locked  (free user, no quota, no fetch)
 *   2. advice → content      (even if loading or error; the
 *                              cached row stays visible while the
 *                              background refresh re-fires)
 *   3. error → error         (no cached row + most-recent fetch
 *                              failed — surface a retry CTA)
 *   4. fallback → loading    (initial mount + ongoing fetch) */
export function pickAdviceCardState(
  input: PickAdviceCardStateInput,
): AdviceCardState {
  if (!input.hasAccess) return 'locked';
  if (input.advice) return 'content';
  if (input.error) return 'error';
  return 'loading';
}
