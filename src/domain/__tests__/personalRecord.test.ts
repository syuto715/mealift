import {
  EPLEY_REPS_CAP,
  estimate1RM,
  estimateOneRepMax,
  estimateWeightForReps,
} from '../oneRepMax';

// Build 15 Session 6 / Phase 2 — formula switched from pure Epley to a
// rep-range hybrid (Brzycki for 1-6, avg(Epley,Brzycki) for 7-10,
// Epley capped above 10). Tests document the new expected values per
// formula band, plus the formula label that callers persist into
// estimated_1rm history.
//
// Reference values:
//   Brzycki(w, r) = w × 36 / (37 - r)
//     r=1 → w           r=5 → w × 1.125
//   Epley(w, r) = w × (1 + r/30)
//     r=8 → w × 1.2667  r=30 → w × 2.0
//   avg(7-10) = (Brzycki + Epley) / 2

describe('estimate1RM (hybrid)', () => {
  it('returns the input weight at 1 rep (Brzycki path, r=1 reduces to w)', () => {
    expect(estimate1RM(100, 1)).toEqual({ value: 100, formula: 'brzycki' });
  });

  it('uses Brzycki for 100kg × 5 reps (~112.5kg)', () => {
    const result = estimate1RM(100, 5);
    expect(result.formula).toBe('brzycki');
    expect(result.value).toBeCloseTo(112.5, 3);
  });

  it('uses Brzycki at the boundary (r=6)', () => {
    const result = estimate1RM(100, 6);
    expect(result.formula).toBe('brzycki');
    // 100 × 36 / 31 ≈ 116.129
    expect(result.value).toBeCloseTo(116.129, 2);
  });

  it('switches to avg(Epley, Brzycki) at r=7', () => {
    const result = estimate1RM(100, 7);
    expect(result.formula).toBe('avg');
    // Epley = 100 × (1 + 7/30) = 123.333
    // Brzycki = 100 × 36 / 30 = 120.0
    // avg = 121.667
    expect(result.value).toBeCloseTo(121.667, 2);
  });

  it('uses avg for 90kg × 8 reps (~112.86kg)', () => {
    const result = estimate1RM(90, 8);
    expect(result.formula).toBe('avg');
    // Epley = 90 × (1 + 8/30) = 114.0
    // Brzycki = 90 × 36 / 29 ≈ 111.724
    // avg ≈ 112.862
    expect(result.value).toBeCloseTo(112.862, 2);
  });

  it('switches to Epley at r=11', () => {
    const result = estimate1RM(100, 11);
    expect(result.formula).toBe('epley');
    // 100 × (1 + 11/30) = 136.667
    expect(result.value).toBeCloseTo(136.667, 2);
  });

  it('returns {0, "epley"} when weight is non-positive', () => {
    expect(estimate1RM(0, 5)).toEqual({ value: 0, formula: 'epley' });
    expect(estimate1RM(-50, 5)).toEqual({ value: 0, formula: 'epley' });
  });

  it('returns {0, "epley"} when reps is non-positive', () => {
    expect(estimate1RM(100, 0)).toEqual({ value: 0, formula: 'epley' });
    expect(estimate1RM(100, -3)).toEqual({ value: 0, formula: 'epley' });
  });

  it('clamps reps to EPLEY_REPS_CAP (30) instead of extrapolating', () => {
    const cappedExpected = 100 * (1 + EPLEY_REPS_CAP / 30); // 200
    const r30 = estimate1RM(100, 30);
    expect(r30.formula).toBe('epley');
    expect(r30.value).toBeCloseTo(cappedExpected, 6);

    const r31 = estimate1RM(100, 31);
    expect(r31.formula).toBe('epley');
    expect(r31.value).toBeCloseTo(cappedExpected, 6);

    const r500 = estimate1RM(100, 500);
    expect(r500.formula).toBe('epley');
    expect(r500.value).toBeCloseTo(cappedExpected, 6);
  });

  it('never produces the legacy 1766.7kg artifact from a 100kg lift', () => {
    expect(estimate1RM(100, 500).value).toBeLessThan(250);
  });
});

describe('estimateOneRepMax (rounded hybrid)', () => {
  it('returns {value: w, formula: "brzycki"} at 1 rep', () => {
    expect(estimateOneRepMax(100, 1)).toEqual({ value: 100, formula: 'brzycki' });
  });

  it('rounds Brzycki for 100kg × 5 to one decimal place (112.5)', () => {
    expect(estimateOneRepMax(100, 5)).toEqual({ value: 112.5, formula: 'brzycki' });
  });

  it('rounds avg path for 90kg × 8 (~112.9)', () => {
    expect(estimateOneRepMax(90, 8)).toEqual({ value: 112.9, formula: 'avg' });
  });

  it('returns {0, "epley"} for non-positive inputs', () => {
    expect(estimateOneRepMax(0, 5)).toEqual({ value: 0, formula: 'epley' });
    expect(estimateOneRepMax(100, 0)).toEqual({ value: 0, formula: 'epley' });
    expect(estimateOneRepMax(-1, 5)).toEqual({ value: 0, formula: 'epley' });
    expect(estimateOneRepMax(100, -1)).toEqual({ value: 0, formula: 'epley' });
  });

  it('clamps reps at 30 (Epley path)', () => {
    const expected = Math.round(100 * (1 + 30 / 30) * 10) / 10; // 200
    expect(estimateOneRepMax(100, 30)).toEqual({ value: expected, formula: 'epley' });
    expect(estimateOneRepMax(100, 99)).toEqual({ value: expected, formula: 'epley' });
    expect(estimateOneRepMax(100, 500)).toEqual({ value: expected, formula: 'epley' });
  });
});

describe('estimateWeightForReps', () => {
  it('returns the 1RM at 1 rep', () => {
    expect(estimateWeightForReps(120, 1)).toBe(120);
  });

  it('inverts the Epley side within rounding tolerance', () => {
    // Forward via hybrid is path-dependent; the inverse always uses
    // the Epley equation (no formula choice on the way back).
    // Plug in an Epley-shaped 1RM to round-trip cleanly.
    const oneRm = 100 * (1 + 5 / 30); // 116.6667
    const back = estimateWeightForReps(oneRm, 5);
    expect(back).toBeCloseTo(100, 0);
  });

  it('returns 0 for non-positive inputs', () => {
    expect(estimateWeightForReps(0, 5)).toBe(0);
    expect(estimateWeightForReps(120, 0)).toBe(0);
    expect(estimateWeightForReps(-1, 5)).toBe(0);
    expect(estimateWeightForReps(120, -1)).toBe(0);
  });

  it('clamps target reps at 30', () => {
    const at30 = estimateWeightForReps(200, 30);
    expect(estimateWeightForReps(200, 99)).toBe(at30);
    expect(estimateWeightForReps(200, 500)).toBe(at30);
  });
});
