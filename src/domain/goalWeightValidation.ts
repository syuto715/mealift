import {
  ACHIEVEMENT_THRESHOLD_KG,
  estimateTargetDate,
} from './onboardingCalc';
import { DEFAULT_PACE_OPTIONS } from './paceSelectorUtils';
import {
  CURRENT_WEIGHT_KG_MAX,
  CURRENT_WEIGHT_KG_MIN,
  validateCurrentWeightKg,
} from './bodyInfoValidation';
import type { GoalType } from '../types/common';

// v1.3.0 / Onboarding v2 / Phase C-5 — pure helpers for the [5]
// goal-weight + pace screen.
//
// Three intertwined fields collected on this screen:
//   - goalType    (cut / maintain / bulk / recomp)
//   - targetWeightKg (uses the same 30-200 kg range as C-3
//                     currentWeight via Pattern 18 SSoT)
//   - weeklyRatePct (filtered against goalType for legal combos)
//
// Plus a derived achieved-date feedback that the screen renders
// once all three are valid. estimateTargetDate (A-4) is the
// canonical source for this calculation — we wrap it here and
// add JP-format display.

// === GOAL_TYPE_OPTIONS ===
//
// Sign-off § Phase C-5 §1 — display order is `cut / maintain /
// bulk / recomp`, putting the maintenance midpoint between the
// two weight-change directions and recomp at the end as the
// "advanced" choice. The Profile type's GoalType union is
// declared as `cut | bulk | maintain | recomp` (common.ts:5)
// but the union is order-agnostic; this array pins the screen's
// segmented-control sequence.
export const GOAL_TYPE_OPTIONS = [
  'cut',
  'maintain',
  'bulk',
  'recomp',
] as const satisfies readonly GoalType[];

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  cut: '減量',
  maintain: '維持',
  bulk: '増量',
  recomp: '体組成改善',
};

const GOAL_TYPE_DESCRIPTIONS: Record<GoalType, string> = {
  cut: '体脂肪を落とす',
  maintain: '今の体型をキープ',
  bulk: '筋肉量を増やす',
  recomp: '体重キープ + 体組成変化',
};

export function getGoalTypeLabel(goalType: GoalType): string {
  return GOAL_TYPE_LABELS[goalType];
}

export function getGoalTypeDescription(goalType: GoalType): string {
  return GOAL_TYPE_DESCRIPTIONS[goalType];
}

export function isValidGoalType(value: unknown): value is GoalType {
  return (
    typeof value === 'string' &&
    (GOAL_TYPE_OPTIONS as readonly string[]).includes(value)
  );
}

// === validateTargetWeightKg ===
//
// Mirror C-3's currentWeight range (30-200kg, Pattern 18 SSoT —
// import the constants rather than redeclare). A legitimate target
// weight should fit in the same physical envelope as the user's
// current weight; bounds re-check at the screen layer catches
// programmatic / cast-escape inputs that bypass the slider's
// clamp.
export type TargetWeightFailure = 'too_light' | 'too_heavy' | 'not_finite';

export type TargetWeightValidation =
  | { valid: true; sanitized: number }
  | { valid: false; reason: TargetWeightFailure };

export function validateTargetWeightKg(value: number): TargetWeightValidation {
  const inner = validateCurrentWeightKg(value);
  if (inner.valid) return { valid: true, sanitized: inner.sanitized };
  return { valid: false, reason: inner.reason };
}

// === getDirection ===
//
// Pattern 18 SSoT boundary — same ACHIEVEMENT_THRESHOLD_KG (0.5kg
// inclusive) that paceSelectorUtils.getDirection and
// estimateTargetDate's arrived-check use. The screen reuses this
// to coordinate goalType ↔ targetWeight: a cut goalType with
// target weight WITHIN the threshold of current should warn,
// since the user picked cut but their numbers say maintain.
export function getDirection(
  currentWeight: number,
  targetWeight: number,
): 'cut' | 'maintain' | 'bulk' {
  if (
    !Number.isFinite(currentWeight) ||
    !Number.isFinite(targetWeight)
  ) {
    return 'maintain';
  }
  const gap = targetWeight - currentWeight;
  if (Math.abs(gap) <= ACHIEVEMENT_THRESHOLD_KG) return 'maintain';
  return gap < 0 ? 'cut' : 'bulk';
}

// === isGoalTypeConsistent ===
//
// Cross-field consistency check: the user picked goalType X with
// targetWeight Y at rate Z — do these line up? The screen calls
// this in addition to the per-field validators because each input
// can be individually valid while the combination is contradictory
// (e.g., goalType='cut' but targetWeight > currentWeight).
//
// Rules:
//   cut:      direction='cut'  AND rate < 0
//   bulk:     direction='bulk' AND rate > 0
//   maintain: direction='maintain' AND rate === 0
//   recomp:   direction='maintain' AND |rate| ≤ 0.25
//             (the user holds weight steady but allows slight
//             cut/bulk for composition shift, per sign-off §C-5 §5)
export function isGoalTypeConsistent(
  goalType: GoalType,
  currentWeight: number,
  targetWeight: number,
  weeklyRatePct: number,
): boolean {
  if (!Number.isFinite(weeklyRatePct)) return false;
  const direction = getDirection(currentWeight, targetWeight);
  switch (goalType) {
    case 'cut':
      return direction === 'cut' && weeklyRatePct < 0;
    case 'bulk':
      return direction === 'bulk' && weeklyRatePct > 0;
    case 'maintain':
      return direction === 'maintain' && weeklyRatePct === 0;
    case 'recomp':
      return direction === 'maintain' && Math.abs(weeklyRatePct) <= 0.25;
  }
}

// === filterPaceOptionsForGoalType ===
//
// Returns the legal pace subset for a given goalType. The screen
// passes this as `options` to PaceSelector; PaceSelector's
// internal direction-based auto-disable then applies on top.
//
// Known API gap (Phase D TODO): PaceSelector currently has no
// `disabledOptions` prop and relies solely on
// getDirection(currentWeight, targetWeight) for option disabling.
// For goalType='recomp', target ≈ current (within 0.5kg) means
// PaceSelector reads direction='maintain' and disables non-zero
// rates, so the [-0.25, 0.25] options here render as dimmed.
// Workable degraded UX for the C-5 ship; the cleanest Phase D
// fix is to extend PaceSelector with a `disabledOptions` prop
// the screen drives directly.
export function filterPaceOptionsForGoalType(
  goalType: GoalType,
): readonly number[] {
  switch (goalType) {
    case 'cut':
      return DEFAULT_PACE_OPTIONS.filter((r) => r < 0);
    case 'bulk':
      return DEFAULT_PACE_OPTIONS.filter((r) => r > 0);
    case 'maintain':
      return [0];
    case 'recomp':
      return DEFAULT_PACE_OPTIONS.filter((r) => Math.abs(r) <= 0.25);
  }
}

// === calculateGoalSummary ===
//
// Wraps estimateTargetDate (A-4) into the shape the screen
// renders. Returns null when any input is invalid, so the screen
// hides the feedback box during partial input rather than showing
// a stale or NaN summary. Also returns null for maintain (the
// screen renders distinct copy for the no-change case).
export interface GoalSummary {
  targetDate: Date;
  weeksToGoal: number;
}

export function calculateGoalSummary(
  currentWeight: number,
  targetWeight: number,
  weeklyRatePct: number,
  now?: Date,
): GoalSummary | null {
  if (
    !validateCurrentWeightKg(currentWeight).valid ||
    !validateTargetWeightKg(targetWeight).valid ||
    !Number.isFinite(weeklyRatePct)
  ) {
    return null;
  }
  const direction = getDirection(currentWeight, targetWeight);
  if (direction === 'maintain' || weeklyRatePct === 0) {
    return null;
  }
  const result = estimateTargetDate({
    currentWeight,
    targetWeight,
    weeklyRatePct,
    now,
  });
  return {
    targetDate: result.date,
    weeksToGoal: result.weeks,
  };
}

// === formatGoalSummary ===
//
// JP-format date + week count. Returns "" for null so the screen
// renderer can skip without a separate null check. The Date is
// formatted with toLocaleDateString('ja-JP') so the user's
// timezone is respected — estimateTargetDate already computes
// the local-time projection via setDate (no UTC conversion
// downstream), so the JP locale formatter reads the same instant.
export function formatGoalSummary(summary: GoalSummary | null): string {
  if (!summary) return '';
  const dateLabel = summary.targetDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `${dateLabel}（約 ${summary.weeksToGoal} 週）`;
}

// === isAllInputsValidForC5 ===
//
// Composite gate the screen's CTA disabled-state subscribes to.
// All three C-5 fields must be:
//   - non-null
//   - individually valid (per-field validators)
//   - mutually consistent (isGoalTypeConsistent)
//
// currentWeight is included as a closed-over reference (collected
// on C-3, not editable here), so the consistency check has the
// full direction context.
export function isAllInputsValidForC5(
  goalType: GoalType | null,
  targetWeight: number | null,
  weeklyRatePct: number | null,
  currentWeight: number,
): boolean {
  if (goalType == null || targetWeight == null || weeklyRatePct == null) {
    return false;
  }
  if (!isValidGoalType(goalType)) return false;
  if (!validateTargetWeightKg(targetWeight).valid) return false;
  // weeklyRatePct must be one of the schema-allowed values; we
  // accept anything in DEFAULT_PACE_OPTIONS plus the implicit
  // baseline checks via isGoalTypeConsistent below.
  if (!Number.isFinite(weeklyRatePct)) return false;
  if (!validateCurrentWeightKg(currentWeight).valid) return false;
  return isGoalTypeConsistent(
    goalType,
    currentWeight,
    targetWeight,
    weeklyRatePct,
  );
}

// === Re-exports for tests / screen ===

export const TARGET_WEIGHT_KG_MIN = CURRENT_WEIGHT_KG_MIN;
export const TARGET_WEIGHT_KG_MAX = CURRENT_WEIGHT_KG_MAX;
