import { calculatePrediction } from '../prediction';
import type { PredictionInput } from '../../types/prediction';

// Cut goal, losing 0.5kg over 14 days → weeklyRate 0.25kg/wk; 5kg remaining.
function baseInput(overrides: Partial<PredictionInput> = {}): PredictionInput {
  return {
    currentWeightAvg7d: 75,
    weightChange14d: -0.5,
    targetWeight: 70,
    goalType: 'cut',
    nutritionCompliance: 1,
    trainingCompliance: 1,
    ...overrides,
  };
}

describe('calculatePrediction — compliance N/A (v1.6.0 Sprint 3)', () => {
  it('trainingCompliance=null blends on nutrition alone (no 0% penalty)', () => {
    const naApart = calculatePrediction(baseInput({ trainingCompliance: null }));
    const bothPerfect = calculatePrediction(baseInput({ trainingCompliance: 1 }));
    expect(naApart).not.toBeNull();
    expect(naApart!.standard.days).toBe(bothPerfect!.standard.days);
  });

  it('null training does NOT penalize like 0 training would', () => {
    const naApart = calculatePrediction(baseInput({ trainingCompliance: null }));
    const trainingZero = calculatePrediction(baseInput({ trainingCompliance: 0 }));
    expect(naApart!.standard.days).toBeLessThan(trainingZero!.standard.days);
  });

  it('present trainingCompliance still uses the 0.6/0.4 blend', () => {
    const blended = calculatePrediction(
      baseInput({ nutritionCompliance: 1, trainingCompliance: 0 }),
    );
    const naApart = calculatePrediction(baseInput({ trainingCompliance: null }));
    expect(blended!.standard.days).toBeGreaterThan(naApart!.standard.days);
  });

  it('returns null when the weekly rate is too small to predict', () => {
    expect(calculatePrediction(baseInput({ weightChange14d: 0 }))).toBeNull();
  });

  it('already-at-target returns 0 days', () => {
    const r = calculatePrediction(baseInput({ currentWeightAvg7d: 70 }));
    expect(r!.standard.days).toBe(0);
  });

  it('currentWeightAvg7d=0 does not divide-by-zero in pace label (v1.6.1)', () => {
    const r = calculatePrediction(baseInput({ currentWeightAvg7d: 0 }));
    expect(r).not.toBeNull();
    expect(r!.paceLabel).toBe('on_track');
    // sanity: no Infinity/NaN leaked into day counts
    expect(Number.isFinite(r!.standard.days)).toBe(true);
  });
});
