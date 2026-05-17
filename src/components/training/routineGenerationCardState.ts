// v1.5 Stage 1 Phase 1.5 — pure state-derivation helper extracted
// from RoutineGenerationCard so the precedence is unit-testable
// without RNTL (`feedback_test_infrastructure_gap` memory).

import type { AIError } from '../../infra/services/aiNutritionService';
import type { LocalRoutineGeneration } from '../../types/routineGeneration';

export type RoutineGenCardState =
  | 'locked' /* free tier */
  | 'idle' /* Plus/Pro, no current draft */
  | 'generating'
  | 'applying'
  | 'preview' /* draft generated, awaiting Apply/Discard */
  | 'error';

export interface PickRoutineGenCardStateInput {
  hasAccess: boolean;
  isGenerating: boolean;
  isApplying: boolean;
  error: AIError | null;
  currentDraft: LocalRoutineGeneration | null;
}

/** Precedence (in order):
 *   1. !hasAccess         → locked
 *   2. isApplying         → applying  (apply transition in flight)
 *   3. isGenerating       → generating
 *   4. currentDraft       → preview   (draft in hand; error or not)
 *   5. error              → error     (no draft + last attempt failed)
 *   6. fallback           → idle */
export function pickRoutineGenCardState(
  input: PickRoutineGenCardStateInput,
): RoutineGenCardState {
  if (!input.hasAccess) return 'locked';
  if (input.isApplying) return 'applying';
  if (input.isGenerating) return 'generating';
  if (input.currentDraft && input.currentDraft.status === 'draft') {
    return 'preview';
  }
  if (input.error) return 'error';
  return 'idle';
}
