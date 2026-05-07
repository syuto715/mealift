import { computeRpeAdjustmentFactor } from '../rpeAdjustment';

// §7.3 RPE-feedback adjustment rules (Build 15 / Session 7 / Phase 3).
//   Rule 1 (over_easy):    RPE ≤ 7   AND reps ≥ target → 1.010
//   Rule 2 (on_target):    RPE ∈ [8,9]  AND reps == target → 1.005
//   Rule 3 (under_target): RPE ∈ [9.5,10] AND reps < target → 0.990
// Anything else returns null (no adjustment row).

describe('computeRpeAdjustmentFactor', () => {
  it('Rule 1 (over_easy): RPE ≤ 7 + reps ≥ target → 1.010', () => {
    expect(computeRpeAdjustmentFactor({ rpe: 7, reps: 5, targetReps: 5 })).toEqual({
      factor: 1.01,
      rule: 'over_easy',
    });
    expect(computeRpeAdjustmentFactor({ rpe: 6, reps: 8, targetReps: 5 })).toEqual({
      factor: 1.01,
      rule: 'over_easy',
    });
    // Edge: RPE = 7 with reps strictly greater than target
    expect(computeRpeAdjustmentFactor({ rpe: 7, reps: 10, targetReps: 8 })).toEqual({
      factor: 1.01,
      rule: 'over_easy',
    });
  });

  it('Rule 1 takes precedence over Rule 2 at the RPE 7 / reps == target boundary', () => {
    // RPE = 7 satisfies "≤ 7" (rule 1) but not "≥ 8" (rule 2). reps ≥ target
    // is true at equality, so rule 1 wins.
    expect(computeRpeAdjustmentFactor({ rpe: 7, reps: 5, targetReps: 5 })?.rule).toBe(
      'over_easy',
    );
  });

  it('Rule 2 (on_target): RPE ∈ [8, 9] + reps == target → 1.005', () => {
    expect(computeRpeAdjustmentFactor({ rpe: 8, reps: 5, targetReps: 5 })).toEqual({
      factor: 1.005,
      rule: 'on_target',
    });
    expect(computeRpeAdjustmentFactor({ rpe: 8.5, reps: 8, targetReps: 8 })).toEqual({
      factor: 1.005,
      rule: 'on_target',
    });
    // Edge: RPE = 9.0 (rule 2's upper bound, inclusive)
    expect(computeRpeAdjustmentFactor({ rpe: 9, reps: 5, targetReps: 5 })).toEqual({
      factor: 1.005,
      rule: 'on_target',
    });
  });

  it('Rule 3 (under_target): RPE ∈ [9.5, 10] + reps < target → 0.990', () => {
    expect(computeRpeAdjustmentFactor({ rpe: 9.5, reps: 4, targetReps: 5 })).toEqual({
      factor: 0.99,
      rule: 'under_target',
    });
    expect(computeRpeAdjustmentFactor({ rpe: 10, reps: 7, targetReps: 8 })).toEqual({
      factor: 0.99,
      rule: 'under_target',
    });
  });

  it('returns null in the gap between Rule 1 and Rule 2 (RPE 7.5)', () => {
    expect(computeRpeAdjustmentFactor({ rpe: 7.5, reps: 5, targetReps: 5 })).toBeNull();
    expect(computeRpeAdjustmentFactor({ rpe: 7.5, reps: 8, targetReps: 5 })).toBeNull();
  });

  it('returns null in the gap between Rule 2 and Rule 3 (RPE 9.2)', () => {
    expect(computeRpeAdjustmentFactor({ rpe: 9.2, reps: 5, targetReps: 5 })).toBeNull();
    expect(computeRpeAdjustmentFactor({ rpe: 9.4, reps: 4, targetReps: 5 })).toBeNull();
  });

  it('returns null when reps > target with mid-range RPE (Rule 2 needs strict ==)', () => {
    expect(computeRpeAdjustmentFactor({ rpe: 9, reps: 6, targetReps: 5 })).toBeNull();
    expect(computeRpeAdjustmentFactor({ rpe: 8, reps: 10, targetReps: 8 })).toBeNull();
  });

  it('returns null when reps == target with high-range RPE (Rule 3 needs strict <)', () => {
    expect(computeRpeAdjustmentFactor({ rpe: 9.5, reps: 5, targetReps: 5 })).toBeNull();
    expect(computeRpeAdjustmentFactor({ rpe: 10, reps: 8, targetReps: 8 })).toBeNull();
  });

  it('returns null when any input is null / undefined', () => {
    expect(computeRpeAdjustmentFactor({ rpe: null, reps: 5, targetReps: 5 })).toBeNull();
    expect(computeRpeAdjustmentFactor({ rpe: 8, reps: null, targetReps: 5 })).toBeNull();
    expect(computeRpeAdjustmentFactor({ rpe: 8, reps: 5, targetReps: null })).toBeNull();
    expect(
      computeRpeAdjustmentFactor({ rpe: undefined, reps: 5, targetReps: 5 }),
    ).toBeNull();
    expect(
      computeRpeAdjustmentFactor({ rpe: 8, reps: undefined, targetReps: 5 }),
    ).toBeNull();
    expect(
      computeRpeAdjustmentFactor({ rpe: 8, reps: 5, targetReps: undefined }),
    ).toBeNull();
  });
});
