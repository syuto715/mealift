// 1RM estimation helpers (Build 15 Session 6 / Feature 5-B).
//
// Three formulas live here, picked automatically by rep range:
//   - Brzycki: 1RM = w × 36 / (37 - r). Best for 1-6 reps. Conservative.
//     The integer-form rearrangement of the canonical
//     1RM = w / (1.0278 - 0.0278r) — algebraically identical, but
//     avoids float drift at integer rep counts (e.g. r=1 gives w
//     exactly instead of ~0.999999999999998·w).
//   - Epley: 1RM = w × (1 + r/30). Best for 1-10 reps but biases high
//     above ~6 reps. Used here only as the high-rep path (>10) where
//     Brzycki's denominator approaches 0.
//   - avg: arithmetic mean of Brzycki and Epley. Compromise for the
//     7-10 rep band where both formulas have known weaknesses.
//
// Formula selection (per docs/build-15-design.md §6.5.3):
//   reps 1-6   → 'brzycki'
//   reps 7-10  → 'avg'
//   reps 11-30 → 'epley' (capped at EPLEY_REPS_CAP)
//   reps >30   → 'epley' but clamped to r=30 to avoid runaway
//                extrapolation (a stale reps=500 typo once produced
//                a 1766.7kg estimate from a 100kg lift).

export const EPLEY_REPS_CAP = 30;

// 'adjusted' joins the formula union as the marker for §7.3
// RPE-feedback adjusted observations (Build 15 / Session 7 Phase 3).
// Server CHECK on user_estimated_1rm.formula already includes
// 'adjusted' (migration 20260507000008).
export type OneRepMaxFormula = 'brzycki' | 'epley' | 'avg' | 'adjusted';

export interface OneRepMaxResult {
  value: number;
  formula: OneRepMaxFormula;
}

function epleyRaw(weight: number, reps: number): number {
  const cappedReps = Math.min(reps, EPLEY_REPS_CAP);
  return weight * (1 + cappedReps / 30);
}

function brzyckiRaw(weight: number, reps: number): number {
  // Integer form. (37 - r) > 0 for r ≤ 36, well outside our 1-6 band.
  return (weight * 36) / (37 - reps);
}

// Hybrid 1RM estimate. Returns raw (unrounded) value plus the formula
// label so callers persisting to estimated_1rm history can record
// which method produced the number.
//
// Non-positive inputs short-circuit to {value: 0, formula: 'epley'}
// (formula label is meaningless in that case; the choice keeps
// downstream dashboards from filtering on 'brzycki' and silently
// dropping zero-rows).
export function estimate1RM(weight: number, reps: number): OneRepMaxResult {
  if (weight <= 0 || reps <= 0) return { value: 0, formula: 'epley' };
  if (reps <= 6) {
    return { value: brzyckiRaw(weight, reps), formula: 'brzycki' };
  }
  if (reps <= 10) {
    const avg = (epleyRaw(weight, reps) + brzyckiRaw(weight, reps)) / 2;
    return { value: avg, formula: 'avg' };
  }
  return { value: epleyRaw(weight, reps), formula: 'epley' };
}

// UI-rounded variant. Same formula selection; value rounded to 1
// decimal place.
export function estimateOneRepMax(weight: number, reps: number): OneRepMaxResult {
  const { value, formula } = estimate1RM(weight, reps);
  return { value: Math.round(value * 10) / 10, formula };
}

// Inverse: given a 1RM and a target rep count, what working weight
// should the lifter aim for? Always uses the Epley inverse since this
// is a back-of-envelope projection and no formula choice is
// meaningful in this direction. Capped at EPLEY_REPS_CAP for symmetry
// with estimate1RM's high-rep guard.
export function estimateWeightForReps(oneRepMax: number, targetReps: number): number {
  if (targetReps <= 0 || oneRepMax <= 0) return 0;
  if (targetReps === 1) return oneRepMax;
  const cappedReps = Math.min(targetReps, EPLEY_REPS_CAP);
  return Math.round((oneRepMax / (1 + cappedReps / 30)) * 10) / 10;
}
