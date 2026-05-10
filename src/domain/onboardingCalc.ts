import { getRecentSessionCount } from '../infra/repositories/workoutRepository';
import type { MacroKey, MealPlan } from '../types/profile';

// v1.3.0 / Onboarding v2 / Phase A-4 — pure calculation helpers for
// the new 13-screen flow.
//
// Five public functions:
//   1. calculateDailyTarget    — kcal target from TDEE + weekly weight rate
//   2. estimateTargetDate      — recursive weight-projection simulator
//   3. calculatePFCTargetsByMealPlan — PFC grams from kcal + meal plan
//   4. predictBodyComposition  — Mealift-original fat/muscle delta forecast
//   5. suggestProteinFactor    — workout-frequency-driven protein recommendation
//
// Functions 1-4 are 100% pure (no DB / no IO). Function 5 reads
// workout_sessions count via the existing getRecentSessionCount
// helper — DB error degrades to conservative 1.0 g/kg fallback.
//
// Build 16 patterns applied:
//   #2 Pure transform (1-4 strictly pure; 5 isolates IO at boundary)
//   #5 profile_id SQL scope (inherited via getRecentSessionCount)
//   #8 Defensive Record full-shape (PFC output uses Record<MacroKey, number>)
//   #16 Date defensiveness (estimateTargetDate clones `now` to avoid
//       mutating a caller-shared instance)

// ---------------------------------------------------------------------------
// Constants — pinned by sign-off § 8.2-8.7
// ---------------------------------------------------------------------------

// Energy density of body tissue (Wishnofsky 1958). The 7700 kcal/kg
// approximation is industry-standard for weekly weight-rate → kcal-
// delta conversion despite known criticism (real cost varies with
// composition). Pinned here with sign-off; v2 may swap to a
// composition-aware model.
const KCAL_PER_KG = 7700;

// estimateTargetDate cap. 520 weeks = 10 years. Beyond this the
// projection is effectively meaningless — the helper returns the
// cap so the UI can render "10年以上" rather than a stack overflow
// or NaN.
const MAX_WEEKS = 520;

// Achievement tolerance: weight within ±0.5 kg of target counts as
// arrived. Realistic given daily weight noise + Mifflin BMR rounding.
const ACHIEVEMENT_THRESHOLD_KG = 0.5;

// v1.3.0 / Onboarding v2 / Phase A-5 — onboardingStep value at
// which the user has advanced past [8] protein-target. By this
// point, every required calc input is user-set (gender / birthYear
// / heightCm / currentWeightKg from [3], activityLevel from [4],
// targetWeightKg / weeklyRatePct from [5], mealPlan from [6],
// mealTimings from [7], proteinFactor from [8]). Used by:
//   - calculateAll's trust-boundary guard (Phase A-4 Codex Important #1)
//   - onboardingService's per-field gating threshold (Phase A-5)
export const ONBOARDING_STEP_FULL_INPUT = 8;

const PROTEIN_KCAL_PER_G = 4;
const FAT_KCAL_PER_G = 9;
const CARB_KCAL_PER_G = 4;

// Fat/carb ratio per meal plan. Numbers split the post-protein kcal
// budget. balanced is the default fall-through for unknown plans
// (defensive narrow at the helper boundary; the typed MealPlan
// union prevents this at compile time but `mealPlan as MealPlan`
// casts in calling code can still slip an unknown literal through).
const FC_RATIOS: Record<MealPlan, { fat: number; carbs: number }> = {
  balanced: { fat: 0.3, carbs: 0.7 },
  washoku: { fat: 0.2, carbs: 0.8 },
  high_protein: { fat: 0.4, carbs: 0.6 },
  low_carb: { fat: 0.65, carbs: 0.35 },
  fasting: { fat: 0.35, carbs: 0.65 },
};

// predictBodyComposition composition per protein factor (Mealift
// original mapping, sign-off § 8.6). Higher protein → more
// muscle-preservation during cut / muscle-prioritized gain during
// bulk. Numbers pinned by sign-off; do not edit without re-running
// the user testing.
//
// Codex review pass 1 (Phase A-4) — store exact muscle ratios
// rather than computing `1 - fatRatio` at runtime. The subtraction
// hits IEEE 754 FP noise: `1 - 0.85 = 0.15000000000000002`, so
// `currentWeight × (1 - 0.85) × 10` becomes -7.5...01 and
// JS Math.round rounds it to -8 (one off from the algebraic -7.5
// answer). Pre-computing the muscle ratio ensures the displayed
// number matches the obvious algebraic result.
const COMPOSITION_BY_PROTEIN_FACTOR: Record<
  number,
  { fat: number; muscle: number }
> = {
  1.0: { fat: 0.6, muscle: 0.4 },
  1.6: { fat: 0.75, muscle: 0.25 },
  2.2: { fat: 0.85, muscle: 0.15 },
  3.0: { fat: 0.9, muscle: 0.1 },
};

// ---------------------------------------------------------------------------
// 1. calculateDailyTarget
// ---------------------------------------------------------------------------

export function calculateDailyTarget(input: {
  currentWeight: number;
  weeklyRatePct: number;
  tdee: number;
}): number {
  const weeklyKgChange = input.currentWeight * (input.weeklyRatePct / 100);
  const dailyKcalDelta = (weeklyKgChange * KCAL_PER_KG) / 7;
  return Math.round(input.tdee + dailyKcalDelta);
}

// ---------------------------------------------------------------------------
// 2. estimateTargetDate
// ---------------------------------------------------------------------------

export function estimateTargetDate(input: {
  currentWeight: number;
  targetWeight: number;
  weeklyRatePct: number;
  // `now` test seam — production callers omit and the helper uses
  // new Date(). Tests pin a fixed instant for deterministic week
  // arithmetic.
  now?: Date;
}): { date: Date; weeks: number } {
  const baseNow = input.now ?? new Date();

  // Already at target — return weeks=0 + the start instant. Note:
  // we clone `baseNow` so the caller's Date isn't mutated by the
  // setDate call below for the non-zero path.
  if (
    Math.abs(input.currentWeight - input.targetWeight) <=
    ACHIEVEMENT_THRESHOLD_KG
  ) {
    return { date: new Date(baseNow.getTime()), weeks: 0 };
  }

  // Capture the starting direction (above or below target) so the
  // cross-the-line short-circuit fires only when we ACTUALLY cross,
  // not when the start position is already on the "wrong" side
  // relative to the rate sign. Without this, a direction-mismatch
  // input (e.g. cut intent rate=-0.5% but targetWeight > currentWeight)
  // would break on iter 1 because the simple `simulatedWeight <=
  // targetWeight` check is true from the start.
  const startsAbove = input.currentWeight > input.targetWeight;

  let simulatedWeight = input.currentWeight;
  let weeks = 0;
  while (
    Math.abs(simulatedWeight - input.targetWeight) > ACHIEVEMENT_THRESHOLD_KG &&
    weeks < MAX_WEEKS
  ) {
    simulatedWeight += simulatedWeight * (input.weeklyRatePct / 100);
    weeks += 1;

    // Cross-the-line: stop only when we've actually crossed the
    // target relative to where we started. Direction mismatch
    // (rate sign incompatible with current→target movement) means
    // simulatedWeight will never satisfy these conditions, so the
    // loop runs to MAX_WEEKS naturally — semantics: "unreachable
    // at this pace".
    if (startsAbove && simulatedWeight <= input.targetWeight) break;
    if (!startsAbove && simulatedWeight >= input.targetWeight) break;

    // Maintenance (rate=0) with non-equal target never converges —
    // simulatedWeight stays at currentWeight forever. Bail to
    // MAX_WEEKS to surface "unreachable" rather than running an
    // expensive infinite loop that the while-condition's
    // weeks<MAX_WEEKS already prevents.
    if (input.weeklyRatePct === 0) {
      weeks = MAX_WEEKS;
      break;
    }
  }

  const date = new Date(baseNow.getTime());
  date.setDate(date.getDate() + weeks * 7);
  return { date, weeks };
}

// ---------------------------------------------------------------------------
// 3. calculatePFCTargetsByMealPlan
// ---------------------------------------------------------------------------

export function calculatePFCTargetsByMealPlan(input: {
  dailyCalorie: number;
  currentWeight: number;
  proteinFactor: number;
  mealPlan: MealPlan;
}): Record<MacroKey, number> {
  // Defensive: 0 or negative kcal target shouldn't happen in
  // production (calculateDailyTarget always emits >= ~1000 for
  // realistic inputs) but a degenerate test / future caller could
  // hit this. Return all-zero rather than negative grams.
  if (input.dailyCalorie <= 0) {
    return { protein: 0, fat: 0, carbs: 0 };
  }

  const proteinG = Math.round(input.currentWeight * input.proteinFactor);
  const proteinKcal = proteinG * PROTEIN_KCAL_PER_G;

  const ratio = FC_RATIOS[input.mealPlan] ?? FC_RATIOS.balanced;
  // Clamp at 0: a high protein factor + low calorie target could
  // make proteinKcal exceed dailyCalorie, leaving negative kcal for
  // fat+carbs. Surfacing 0/0 lets the UI show the over-protein
  // warning rather than negative grams.
  const remainingKcal = Math.max(0, input.dailyCalorie - proteinKcal);

  const fatG = Math.round((remainingKcal * ratio.fat) / FAT_KCAL_PER_G);
  const carbsG = Math.round((remainingKcal * ratio.carbs) / CARB_KCAL_PER_G);

  return { protein: proteinG, fat: fatG, carbs: carbsG };
}

// ---------------------------------------------------------------------------
// 4. predictBodyComposition (Mealift original)
// ---------------------------------------------------------------------------

export function predictBodyComposition(input: {
  currentWeight: number;
  targetWeight: number;
  proteinFactor: number;
}): { bodyFatChange: number; muscleMassChange: number } {
  const totalKgChange = input.targetWeight - input.currentWeight;

  // Lookup over the 4 supported protein factors; out-of-domain
  // inputs degrade to the linear formula (sign-off § 8.6 baseline).
  // Muscle ratio uses the same lookup to dodge `1 - fatRatio` FP
  // noise (see COMPOSITION_BY_PROTEIN_FACTOR comment above).
  const composition = COMPOSITION_BY_PROTEIN_FACTOR[input.proteinFactor];
  const fatRatio = composition?.fat ?? 0.6 + (input.proteinFactor - 1.0) * 0.15;
  const muscleRatio =
    composition?.muscle ?? 0.4 - (input.proteinFactor - 1.0) * 0.15;

  const fatChange = totalKgChange * fatRatio;
  const muscleChange = totalKgChange * muscleRatio;

  // Body-fat percentage delta is approximate — the 0.5 attenuation
  // keeps the displayed value conservative (real fat-pct movement
  // depends on starting bf%, training history, etc; the v1 helper
  // doesn't model those).
  const bodyFatPctChange = (fatChange / input.currentWeight) * 100 * 0.5;

  return {
    // Round to 1 decimal so the UI shows "-3.5%" not "-3.4823412%".
    bodyFatChange: Math.round(bodyFatPctChange * 10) / 10,
    muscleMassChange: Math.round(muscleChange * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// 5. suggestProteinFactor — workout-frequency-driven recommendation
// ---------------------------------------------------------------------------

// Output type narrowed to the 3 auto-suggested factors. 3.0 g/kg
// (athlete tier) is intentionally NOT auto-suggested — the user
// must explicitly opt in to that intensity tier in [8].
export type SuggestedProteinFactor = 1.0 | 1.6 | 2.2;

export interface SuggestProteinFactorResult {
  suggested: SuggestedProteinFactor;
  reason: string;
}

const FALLBACK: SuggestProteinFactorResult = {
  suggested: 1.0,
  reason: '日常生活が中心の方向け',
};

export async function suggestProteinFactor(
  profileId: string,
): Promise<SuggestProteinFactorResult> {
  let count = 0;
  try {
    count = await getRecentSessionCount(profileId, 30);
  } catch {
    // DB error / locked / connection lost — conservative default.
    // The user can always override at [8] anyway.
    return FALLBACK;
  }
  // Defensive narrow: getRecentSessionCount returns Number, but a
  // future driver glitch could yield NaN / Infinity / negative.
  if (!Number.isFinite(count) || count < 0) return FALLBACK;

  if (count >= 12) {
    return { suggested: 2.2, reason: '高頻度の筋トレを行っています' };
  }
  if (count >= 6) {
    return { suggested: 1.6, reason: '適度な筋トレを行っています' };
  }
  if (count >= 1) {
    return { suggested: 1.6, reason: '少しずつ運動を始めています' };
  }
  return FALLBACK;
}
