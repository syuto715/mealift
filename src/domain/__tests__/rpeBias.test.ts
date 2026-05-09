import {
  backDeriveRpeFromWeight,
  computeRpeBias,
  applyBiasToRir,
  BIAS_WINDOW_SIZE,
  BIAS_CLAMP_MAX,
  COLD_START_MIN_SAMPLES,
  COLD_START_FULL_SAMPLES,
  type RpeBiasSample,
} from '../rpeBias';
import { rirToPctOf1RM } from '../workoutRecommendation';

// Build 16 / Phase 3.1 — pure-domain tests for the RPE bias module.
// Three blocks:
//   1. backDeriveRpeFromWeight  — table lookup + boundaries.
//   2. computeRpeBias           — drift sign convention, clamp,
//                                 cold-start gradient.
//   3. applyBiasToRir           — boundary clamp at [0, 5].

// ---------------------------------------------------------------------------
// 1. backDeriveRpeFromWeight
// ---------------------------------------------------------------------------

describe('backDeriveRpeFromWeight', () => {
  it('maps an exact table value to the matching RPE', () => {
    // rirToPctOf1RM[8][2] = 0.745 → RPE = 10 - 2 = 8.
    const e1rm = 100;
    const weight = e1rm * rirToPctOf1RM[8][2];
    expect(backDeriveRpeFromWeight(weight, 8, e1rm)).toBe(8);
  });

  // Codex review pass 1 / Critical #1 — non-key reps must use the
  // same fallback row as recommendNextSet (= rep-8 row containing
  // FALLBACK_PCT), not "snap to nearest". A previous "snap to nearest"
  // policy broke round-trip consistency: a recommendation engine that
  // suggests 0.745×e1rm at reps=6 would round-trip to RPE 6 instead
  // of the intended RPE 8.
  it('non-key reps fall back to the rep-8 row (matches recommendNextSet fallback)', () => {
    const e1rm = 100;
    // Weight that recommendNextSet would suggest at reps=6, rir=2 —
    // that's the FALLBACK path (= rep-8 row, RIR 2, 0.745).
    const weight = e1rm * rirToPctOf1RM[8][2];
    expect(backDeriveRpeFromWeight(weight, 6, e1rm)).toBe(8);
  });

  it('non-key reps far above the table also use the rep-8 row', () => {
    const e1rm = 100;
    const weight = e1rm * rirToPctOf1RM[8][2];
    // reps=15 → row 8 fallback; same weight → RPE 8.
    expect(backDeriveRpeFromWeight(weight, 15, e1rm)).toBe(8);
  });

  // Round-trip consistency tests for the non-key reps cases. Mirrors
  // exactly how recommendNextSet would have advised a weight at a
  // given (reps, rir), then backDerives and asserts the matching
  // RPE. Phase 3.1 Codex pass 1 baseline regression — break this and
  // bias estimation drifts systematically for any non-{1,3,5,8,10,12}
  // rep target.
  it('round-trip: recommendNextSet(reps=6, rir=2) → backDerive returns RPE 8', () => {
    const e1rm = 100;
    // recommendNextSet uses FALLBACK_PCT for non-key reps regardless
    // of rir, so its "RIR 2" weight at reps=6 is 0.745 × e1rm.
    const recommendedWeight = e1rm * rirToPctOf1RM[8][2];
    expect(backDeriveRpeFromWeight(recommendedWeight, 6, e1rm)).toBe(8);
  });

  it('round-trip: recommendNextSet(reps=9, rir=2) → backDerive returns RPE 8', () => {
    const e1rm = 100;
    const recommendedWeight = e1rm * rirToPctOf1RM[8][2];
    expect(backDeriveRpeFromWeight(recommendedWeight, 9, e1rm)).toBe(8);
  });

  it('round-trip: recommendNextSet(reps=11, rir=2) → backDerive returns RPE 8', () => {
    const e1rm = 100;
    const recommendedWeight = e1rm * rirToPctOf1RM[8][2];
    expect(backDeriveRpeFromWeight(recommendedWeight, 11, e1rm)).toBe(8);
  });

  // Forward path with key reps still uses the explicit row.
  it('round-trip: key reps (10) preserve their own row', () => {
    const e1rm = 100;
    // recommendNextSet(reps=10, rir=2) would use rirToPctOf1RM[10][2] = 0.700.
    const recommendedWeight = e1rm * rirToPctOf1RM[10][2];
    expect(backDeriveRpeFromWeight(recommendedWeight, 10, e1rm)).toBe(8);
  });

  it('returns 10 (max effort) when pct >= 1.0 (weight at or above 1RM)', () => {
    expect(backDeriveRpeFromWeight(100, 5, 100)).toBe(10);
    expect(backDeriveRpeFromWeight(110, 5, 100)).toBe(10);
  });

  it('caps very-low percentages at RPE 6 (= RIR 4 row floor)', () => {
    // pct = 0.30 is way below the rirToPctOf1RM[8][4] = 0.700
    // floor — closest table value is RIR 4, so RPE = 6.
    expect(backDeriveRpeFromWeight(30, 8, 100)).toBe(6);
  });

  it('returns null for non-finite or non-positive inputs', () => {
    expect(backDeriveRpeFromWeight(0, 5, 100)).toBeNull();
    expect(backDeriveRpeFromWeight(-50, 5, 100)).toBeNull();
    expect(backDeriveRpeFromWeight(50, 0, 100)).toBeNull();
    expect(backDeriveRpeFromWeight(50, -3, 100)).toBeNull();
    expect(backDeriveRpeFromWeight(50, 5, 0)).toBeNull();
    expect(backDeriveRpeFromWeight(50, 5, -10)).toBeNull();
    expect(backDeriveRpeFromWeight(NaN, 5, 100)).toBeNull();
    expect(backDeriveRpeFromWeight(50, NaN, 100)).toBeNull();
    expect(backDeriveRpeFromWeight(50, 5, NaN)).toBeNull();
    expect(backDeriveRpeFromWeight(Infinity, 5, 100)).toBeNull();
  });

  it('returns RPE 9 when pct is closest to RIR 1 row (e.g. 0.770 at reps=8)', () => {
    const e1rm = 100;
    const weight = e1rm * rirToPctOf1RM[8][1];
    expect(backDeriveRpeFromWeight(weight, 8, e1rm)).toBe(9);
  });

  it('handles fractional weight correctly', () => {
    // 92.2 / 100 = 0.922 — table[1][1] is 0.955 (RIR 1) and
    // table[1][2] is 0.922 (RIR 2). Should pick RIR 2 → RPE 8.
    expect(backDeriveRpeFromWeight(92.2, 1, 100)).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// 2. computeRpeBias
// ---------------------------------------------------------------------------

// Helper — a sample whose computed RPE is known (target=8 by default).
function sampleAtComputedRpe8(actualRpe: number, e1rm = 100): RpeBiasSample {
  // weight chosen so the 8-rep RIR-2 row hits → RPE 8 exactly.
  const weight = e1rm * rirToPctOf1RM[8][2];
  return { weight, reps: 8, actualRpe, e1rm };
}

describe('computeRpeBias', () => {
  it('returns zero / cold_start for an empty input', () => {
    expect(computeRpeBias([])).toEqual({
      bias: 0,
      sampleCount: 0,
      confidence: 'cold_start',
    });
  });

  it('returns zero / cold_start for fewer than COLD_START_MIN_SAMPLES samples', () => {
    const samples = Array.from({ length: COLD_START_MIN_SAMPLES - 1 }, () =>
      sampleAtComputedRpe8(7), // each sample has drift = 8 - 7 = +1
    );
    const result = computeRpeBias(samples);
    expect(result.bias).toBe(0);
    expect(result.confidence).toBe('cold_start');
    expect(result.sampleCount).toBe(COLD_START_MIN_SAMPLES - 1);
  });

  it('blends bias linearly between MIN and FULL samples', () => {
    // Each sample has drift = +1.0 (computed 8, actual 7). At N=7
    // the blend factor = (7-5)/(10-5) = 0.4. Expected bias = 1.0
    // * 0.4 = 0.4.
    const samples = Array.from({ length: 7 }, () => sampleAtComputedRpe8(7));
    const result = computeRpeBias(samples);
    expect(result.bias).toBeCloseTo(0.4, 5);
    expect(result.confidence).toBe('partial');
    expect(result.sampleCount).toBe(7);
  });

  it('returns full bias at exactly COLD_START_FULL_SAMPLES', () => {
    const samples = Array.from({ length: COLD_START_FULL_SAMPLES }, () =>
      sampleAtComputedRpe8(7),
    );
    const result = computeRpeBias(samples);
    expect(result.bias).toBeCloseTo(1.0, 5);
    expect(result.confidence).toBe('full');
  });

  it('clamps mean drift to +BIAS_CLAMP_MAX even with very strong samples', () => {
    // computed=8, actual=4 → drift +4. After clamp must be +1.0.
    const samples = Array.from({ length: 12 }, () => sampleAtComputedRpe8(4));
    const result = computeRpeBias(samples);
    expect(result.bias).toBe(BIAS_CLAMP_MAX);
    expect(result.confidence).toBe('full');
  });

  it('clamps mean drift to -BIAS_CLAMP_MAX in the negative direction', () => {
    // computed=8, actual=10 → drift -2. After clamp must be -1.0.
    const samples = Array.from({ length: 12 }, () => sampleAtComputedRpe8(10));
    const result = computeRpeBias(samples);
    expect(result.bias).toBe(-BIAS_CLAMP_MAX);
    expect(result.confidence).toBe('full');
  });

  it('averages mixed-direction drifts (zeroes out cleanly)', () => {
    const samples: RpeBiasSample[] = [
      ...Array.from({ length: 5 }, () => sampleAtComputedRpe8(7)), // +1 each
      ...Array.from({ length: 5 }, () => sampleAtComputedRpe8(9)), // -1 each
    ];
    const result = computeRpeBias(samples);
    expect(result.bias).toBeCloseTo(0, 5);
    expect(result.confidence).toBe('full');
  });

  it('preserves the sign convention (positive bias = user stronger than model)', () => {
    // Phase 3 sign-off F7 + kickoff direction: actual lower than
    // computed → user finds it easier → bias positive → adjustedRir
    // lower → recommendation heavier.
    const samples = Array.from({ length: 10 }, () => sampleAtComputedRpe8(6));
    const result = computeRpeBias(samples);
    expect(result.bias).toBeGreaterThan(0);
  });

  it('preserves the sign convention (negative bias = user weaker than model)', () => {
    // Inverse: actual higher than computed → user finds it harder
    // → bias negative → adjustedRir higher → recommendation lighter.
    const samples = Array.from({ length: 10 }, () => sampleAtComputedRpe8(9));
    const result = computeRpeBias(samples);
    expect(result.bias).toBeLessThan(0);
  });

  it('caps the window at BIAS_WINDOW_SIZE even when more samples are passed', () => {
    // 15 samples; the window must trim to the last 10. Mix the
    // first 5 as drift +2 (would push toward clamp) and the last
    // 10 as drift 0 — only the last 10 should be averaged.
    const noisyHead = Array.from({ length: 5 }, () => sampleAtComputedRpe8(6));
    const cleanTail = Array.from({ length: 10 }, () => sampleAtComputedRpe8(8));
    const result = computeRpeBias([...noisyHead, ...cleanTail]);
    expect(result.bias).toBeCloseTo(0, 5);
    expect(result.sampleCount).toBe(10);
  });

  it('drops samples whose backDeriveRpeFromWeight returns null', () => {
    const samples: RpeBiasSample[] = [
      ...Array.from({ length: 5 }, () => sampleAtComputedRpe8(7)),
      // Garbage entries that should be silently dropped.
      { weight: 0, reps: 5, actualRpe: 8, e1rm: 100 },
      { weight: 50, reps: 5, actualRpe: 8, e1rm: 0 },
    ];
    const result = computeRpeBias(samples);
    // 5 valid samples — would be cold_start (N < MIN). Confirms the
    // garbage entries didn't bring N up to 7 (which would have
    // landed in 'partial').
    expect(result.sampleCount).toBe(5);
    // 5 / 5 (= COLD_START_MIN_SAMPLES) — partial range starts here.
    expect(result.confidence).toBe('partial');
  });

  it('drops samples with non-finite actualRpe', () => {
    const samples: RpeBiasSample[] = [
      ...Array.from({ length: 6 }, () => sampleAtComputedRpe8(7)),
      // Bad RPE values — must not poison the average.
      sampleAtComputedRpe8(NaN),
      sampleAtComputedRpe8(Infinity),
    ];
    const result = computeRpeBias(samples);
    expect(result.sampleCount).toBe(6);
    // 6 valid → partial blend.
    expect(result.confidence).toBe('partial');
  });

  it('returns cold_start when every sample is invalid', () => {
    const samples: RpeBiasSample[] = [
      { weight: 0, reps: 5, actualRpe: 8, e1rm: 100 },
      { weight: 50, reps: 5, actualRpe: 8, e1rm: 0 },
      { weight: 50, reps: 5, actualRpe: NaN, e1rm: 100 },
    ];
    expect(computeRpeBias(samples)).toEqual({
      bias: 0,
      sampleCount: 0,
      confidence: 'cold_start',
    });
  });
});

// ---------------------------------------------------------------------------
// 3. applyBiasToRir
// ---------------------------------------------------------------------------

describe('applyBiasToRir', () => {
  it('subtracts bias from the baseline (positive bias → lower RIR)', () => {
    // Phase 3 sign-off F7 — RIR=baseline-bias.
    expect(applyBiasToRir(2, 1)).toBe(1);
    expect(applyBiasToRir(2, 0.5)).toBe(1.5);
  });

  it('subtracts bias from the baseline (negative bias → higher RIR)', () => {
    expect(applyBiasToRir(2, -1)).toBe(3);
    expect(applyBiasToRir(2, -0.5)).toBe(2.5);
  });

  it('returns the baseline unchanged when bias is 0', () => {
    expect(applyBiasToRir(2, 0)).toBe(2);
  });

  it('clamps the result at the floor (0)', () => {
    expect(applyBiasToRir(0, 1)).toBe(0);
    expect(applyBiasToRir(1, 5)).toBe(0);
  });

  it('clamps the result at the ceiling (5)', () => {
    expect(applyBiasToRir(5, -1)).toBe(5);
    expect(applyBiasToRir(4, -10)).toBe(5);
  });

  it('handles edge baseline values without leaking out of [0, 5]', () => {
    expect(applyBiasToRir(0, BIAS_CLAMP_MAX)).toBe(0);
    expect(applyBiasToRir(0, -BIAS_CLAMP_MAX)).toBe(1);
    expect(applyBiasToRir(5, BIAS_CLAMP_MAX)).toBe(4);
    expect(applyBiasToRir(5, -BIAS_CLAMP_MAX)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 4. Constants — pin the publicly-exported numbers so accidental
//    edits show up as a test diff (mirrors the VOLUME_LANDMARKS
//    invariant from Phase 2.1).
// ---------------------------------------------------------------------------

describe('rpeBias constants', () => {
  it('matches the Phase 3 sign-off values', () => {
    expect(BIAS_WINDOW_SIZE).toBe(10);
    expect(BIAS_CLAMP_MAX).toBe(1.0);
    expect(COLD_START_MIN_SAMPLES).toBe(5);
    expect(COLD_START_FULL_SAMPLES).toBe(10);
  });

  it('keeps cold-start bounds monotonic (MIN ≤ FULL ≤ WINDOW)', () => {
    expect(COLD_START_MIN_SAMPLES).toBeLessThanOrEqual(COLD_START_FULL_SAMPLES);
    expect(COLD_START_FULL_SAMPLES).toBeLessThanOrEqual(BIAS_WINDOW_SIZE);
  });
});
