// Build 15 / Feature 5-C / Phase 3 — §7.3 RPE-feedback adjustment.
//
// Pure logic. Given a freshly-logged set's RPE / actual reps and the
// routine_item's target reps, decide whether to nudge the user's
// estimated 1RM up or down by a small fraction. The driver doc
// (docs/long-term-strategy.md §7.3) defines three rules:
//
//   Rule 1 (over_easy):   RPE ≤ 7  AND reps ≥ target  → e1RM × 1.010
//   Rule 2 (on_target):   RPE ∈ [8, 9]   AND reps == target  → e1RM × 1.005
//   Rule 3 (under_target): RPE ∈ [9.5, 10] AND reps < target  → e1RM × 0.990
//
// Anything outside these three windows produces no adjustment.
// Boundary semantics (Phase 3 sign-off):
//   - RPE 7    + reps == target → Rule 1 fires (rule 2 needs ≥ 8)
//   - RPE 9.0  + reps == target → Rule 2 fires
//   - RPE 9.2                   → no rule (between rule 2 cap and rule 3 floor)
//   - RPE 9.5  + reps <  target → Rule 3 fires
//   - reps >  target with RPE 8-9 → no rule (rule 2 needs reps == target)
//
// Missing inputs (any of rpe / reps / targetReps null) → null return,
// signaling "no adjustment row should be written."

export type RpeAdjustmentRule = 'over_easy' | 'on_target' | 'under_target';

export interface RpeAdjustmentResult {
  factor: number; // 1.010 / 1.005 / 0.990 — multiplier on the raw e1rm
  rule: RpeAdjustmentRule;
}

export function computeRpeAdjustmentFactor(args: {
  rpe: number | null | undefined;
  reps: number | null | undefined;
  targetReps: number | null | undefined;
}): RpeAdjustmentResult | null {
  const { rpe, reps, targetReps } = args;
  if (rpe == null || reps == null || targetReps == null) return null;

  if (rpe <= 7 && reps >= targetReps) {
    return { factor: 1.01, rule: 'over_easy' };
  }
  if (rpe >= 8 && rpe <= 9 && reps === targetReps) {
    return { factor: 1.005, rule: 'on_target' };
  }
  if (rpe >= 9.5 && rpe <= 10 && reps < targetReps) {
    return { factor: 0.99, rule: 'under_target' };
  }
  return null;
}
