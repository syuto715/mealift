import {
  EPLEY_REPS_CAP,
  estimate1RM,
  estimateOneRepMax,
  estimateWeightForReps,
} from '../oneRepMax';

describe('estimate1RM (Epley)', () => {
  it('returns the input weight when reps is exactly 1', () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it('matches the canonical Epley value for 100kg × 5 reps (~116.67kg)', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.6667, 3);
  });

  it('matches Epley for 90kg × 8 reps (~114kg)', () => {
    expect(estimate1RM(90, 8)).toBeCloseTo(114, 3);
  });

  it('returns 0 when weight is non-positive', () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(-50, 5)).toBe(0);
  });

  it('returns 0 when reps is non-positive', () => {
    expect(estimate1RM(100, 0)).toBe(0);
    expect(estimate1RM(100, -3)).toBe(0);
  });

  it('clamps reps to EPLEY_REPS_CAP (30) instead of extrapolating', () => {
    const cappedExpected = 100 * (1 + EPLEY_REPS_CAP / 30); // 200
    expect(estimate1RM(100, 30)).toBeCloseTo(cappedExpected, 6);
    expect(estimate1RM(100, 31)).toBeCloseTo(cappedExpected, 6);
    expect(estimate1RM(100, 500)).toBeCloseTo(cappedExpected, 6);
  });

  it('never produces the legacy 1766.7kg artifact from a 100kg lift', () => {
    expect(estimate1RM(100, 500)).toBeLessThan(250);
  });
});

describe('estimateOneRepMax (rounded Epley)', () => {
  it('returns the input weight at 1 rep', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  it('rounds to one decimal place for 100kg × 5', () => {
    expect(estimateOneRepMax(100, 5)).toBe(116.7);
  });

  it('returns 0 for non-positive inputs', () => {
    expect(estimateOneRepMax(0, 5)).toBe(0);
    expect(estimateOneRepMax(100, 0)).toBe(0);
    expect(estimateOneRepMax(-1, 5)).toBe(0);
    expect(estimateOneRepMax(100, -1)).toBe(0);
  });

  it('clamps reps at 30', () => {
    const expected = Math.round(100 * (1 + 30 / 30) * 10) / 10; // 200
    expect(estimateOneRepMax(100, 30)).toBe(expected);
    expect(estimateOneRepMax(100, 99)).toBe(expected);
    expect(estimateOneRepMax(100, 500)).toBe(expected);
  });
});

describe('estimateWeightForReps', () => {
  it('returns the 1RM at 1 rep', () => {
    expect(estimateWeightForReps(120, 1)).toBe(120);
  });

  it('inverts estimateOneRepMax within rounding tolerance', () => {
    const oneRm = estimateOneRepMax(100, 5); // 116.7
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
