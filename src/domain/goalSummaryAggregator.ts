import {
  calculateDailyTarget,
  forecastBodyComposition,
} from './onboardingCalc';
import {
  calculateMaintenanceCalories,
  isAllInputsValidForC4,
} from './activityValidation';
import {
  calculateGoalSummary,
  isAllInputsValidForC5,
} from './goalWeightValidation';
import { isAllInputsValid as isBodyInfoValid } from './bodyInfoValidation';
import type { ActivityLevel, Gender, GoalType } from '../types/common';

// v1.3.0 / Onboarding v2 / Phase D-1 — pure aggregation helper for
// the [5.5] goal-summary read-only screen.
//
// Inputs are funneled through the per-phase validators (C-3 body
// info / C-4 activity / C-5 goal-weight) so a single bad value
// short-circuits to null. The screen renders nothing when null
// and falls back to a redirect (Pattern 5 mount-time sanity).
//
// Pattern 18 SSoT — every numeric is derived from the existing
// helper chain:
//   - maintenance kcal:  calculateMaintenanceCalories (C-4)
//   - target kcal:       calculateDailyTarget (A-4)
//   - schedule:          calculateGoalSummary → estimateTargetDate (A-4)
//   - body composition:  forecastBodyComposition (B-5, absolute
//                        snapshots — same helper B-5 chart uses
//                        internally so the chart and any text
//                        rendering read from a single source)
//
// proteinFactor is optional: C-3〜C-5 don't collect it ([8] does),
// so the body-composition preview uses a default 1.6 ("適度な
// 筋トレ" tier from suggestProteinFactor) when the user hasn't
// reached [8] yet. The screen labels the preview as "目安" so the
// user knows the number can shift once they pick a factor.

export const DEFAULT_PROTEIN_FACTOR_FALLBACK = 1.6;

export interface OnboardingSummary {
  weight: {
    current: number;
    target: number;
    deltaKg: number;
    // Codex pass 1 / Important #2 — 'recomp' is distinct from
    // 'maintain' for display purposes: the calorie section can
    // show a non-zero delta even when the weight target is
    // stable, and the summary copy needs to differentiate.
    direction: 'cut' | 'maintain' | 'bulk' | 'recomp';
  };
  schedule: {
    targetDate: Date;
    weeksToGoal: number;
    weeklyRatePct: number;
  } | null; // null for maintain — no convergence date
  calories: {
    maintenance: number;
    target: number;
    deltaPerDay: number;
  };
  bodyComposition: {
    current: { muscleKg: number; fatKg: number };
    target: { muscleKg: number; fatKg: number };
    proteinFactorUsed: number;
    proteinFactorIsDefault: boolean;
  };
}

export interface AggregatorInputs {
  gender: Gender;
  birthYear: number;
  heightCm: number;
  currentWeightKg: number;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  targetWeightKg: number;
  goalType: GoalType;
  weeklyRatePct: number;
  // null when [8] hasn't been reached yet — aggregator uses
  // DEFAULT_PROTEIN_FACTOR_FALLBACK in that case.
  proteinFactor: number | null;
  now?: Date;
}

export function aggregateOnboardingSummary(
  inputs: AggregatorInputs,
): OnboardingSummary | null {
  // Composite gate — every prior phase's validator must pass.
  // Single point of fail-fast so the screen doesn't need to
  // re-implement per-field checks.
  if (
    !isBodyInfoValid(
      inputs.gender,
      inputs.birthYear,
      inputs.heightCm,
      inputs.currentWeightKg,
      inputs.now,
    ) ||
    !isAllInputsValidForC4(inputs.activityLevel, inputs.trainingDaysPerWeek) ||
    !isAllInputsValidForC5(
      inputs.goalType,
      inputs.targetWeightKg,
      inputs.weeklyRatePct,
      inputs.currentWeightKg,
    )
  ) {
    return null;
  }

  const maintenance = calculateMaintenanceCalories({
    weightKg: inputs.currentWeightKg,
    heightCm: inputs.heightCm,
    birthYear: inputs.birthYear,
    gender: inputs.gender,
    activityLevel: inputs.activityLevel,
    now: inputs.now,
  });
  if (maintenance == null) return null;

  const targetKcal = calculateDailyTarget({
    currentWeight: inputs.currentWeightKg,
    weeklyRatePct: inputs.weeklyRatePct,
    tdee: maintenance,
  });

  const schedule = calculateGoalSummary(
    inputs.currentWeightKg,
    inputs.targetWeightKg,
    inputs.weeklyRatePct,
    inputs.now,
  );

  const deltaKg = inputs.targetWeightKg - inputs.currentWeightKg;
  const direction: 'cut' | 'maintain' | 'bulk' | 'recomp' =
    inputs.goalType === 'cut'
      ? 'cut'
      : inputs.goalType === 'bulk'
        ? 'bulk'
        : inputs.goalType === 'recomp'
          ? 'recomp'
          : 'maintain';

  const proteinFactorUsed =
    inputs.proteinFactor ?? DEFAULT_PROTEIN_FACTOR_FALLBACK;
  const proteinFactorIsDefault = inputs.proteinFactor == null;

  const forecast = forecastBodyComposition({
    currentWeight: inputs.currentWeightKg,
    targetWeight: inputs.targetWeightKg,
    proteinFactor: proteinFactorUsed,
  });

  return {
    weight: {
      current: inputs.currentWeightKg,
      target: inputs.targetWeightKg,
      deltaKg,
      direction,
    },
    schedule: schedule
      ? {
          targetDate: schedule.targetDate,
          weeksToGoal: schedule.weeksToGoal,
          weeklyRatePct: inputs.weeklyRatePct,
        }
      : null,
    calories: {
      maintenance,
      target: targetKcal,
      deltaPerDay: targetKcal - maintenance,
    },
    bodyComposition: {
      current: {
        muscleKg: forecast.current.muscleKg,
        fatKg: forecast.current.fatKg,
      },
      target: {
        muscleKg: forecast.target.muscleKg,
        fatKg: forecast.target.fatKg,
      },
      proteinFactorUsed,
      proteinFactorIsDefault,
    },
  };
}

// === Formatters ===

export function formatCaloriesLabel(kcal: number): string {
  if (!Number.isFinite(kcal)) return '-- kcal/日';
  return `${kcal.toLocaleString('ja-JP')} kcal/日`;
}

export function formatDeltaLabel(deltaPerDay: number): string {
  if (!Number.isFinite(deltaPerDay)) return '維持';
  if (deltaPerDay === 0) return '維持';
  const abs = Math.abs(deltaPerDay).toLocaleString('ja-JP');
  if (deltaPerDay < 0) return `-${abs} kcal/日 で減量`;
  return `+${abs} kcal/日 で増量`;
}

// Phase D-1 ships with a guarantee: target - maintenance == deltaPerDay.
// The cross-check test in __tests__/goalSummaryAggregator.test.ts
// pins this so a future calculateDailyTarget rebalancing surfaces
// the inconsistency immediately.

// === findEarliestInvalidRoute ===
//
// Codex pass 1 / Important #1 — when aggregateOnboardingSummary
// returns null, the screen's sanity redirect should land the
// user on the screen owning the offending input, not /welcome
// (which forces a full replay). Walk the validators in flow
// order and return the first that fails; null when all pass
// (then the caller stays on the summary screen).
export function findEarliestInvalidRoute(
  inputs: AggregatorInputs,
): '/(onboarding)/body-info' | '/(onboarding)/activity' | '/(onboarding)/goal-weight' | null {
  if (
    !isBodyInfoValid(
      inputs.gender,
      inputs.birthYear,
      inputs.heightCm,
      inputs.currentWeightKg,
      inputs.now,
    )
  ) {
    return '/(onboarding)/body-info';
  }
  if (!isAllInputsValidForC4(inputs.activityLevel, inputs.trainingDaysPerWeek)) {
    return '/(onboarding)/activity';
  }
  if (
    !isAllInputsValidForC5(
      inputs.goalType,
      inputs.targetWeightKg,
      inputs.weeklyRatePct,
      inputs.currentWeightKg,
    )
  ) {
    return '/(onboarding)/goal-weight';
  }
  return null;
}
