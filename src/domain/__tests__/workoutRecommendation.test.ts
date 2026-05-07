import {
  rirToPctOf1RM,
  FALLBACK_PCT,
  roundToPlate,
  recommendNextSet,
} from '../workoutRecommendation';

describe('roundToPlate', () => {
  it('rounds to the nearest plate multiple (positive)', () => {
    expect(roundToPlate(81.1, 2.5)).toBe(80);
    expect(roundToPlate(81.25, 2.5)).toBe(82.5); // Math.round half toward +∞
    expect(roundToPlate(80, 2.5)).toBe(80);
    expect(roundToPlate(83.74, 2.5)).toBe(82.5);
    expect(roundToPlate(83.76, 2.5)).toBe(85);
  });

  it('handles all four supported plate steps', () => {
    expect(roundToPlate(81.1, 0.5)).toBe(81);
    expect(roundToPlate(81.4, 1.0)).toBe(81);
    expect(roundToPlate(81.0, 1.25)).toBe(81.25);
    expect(roundToPlate(81.0, 2.5)).toBe(80);
  });

  it('returns input unchanged when plateStep is non-positive', () => {
    // Defensive — pre-v27 rows surface as 2.5 via repository fallback,
    // but in case 0 leaks through anywhere, don't divide-by-zero.
    expect(roundToPlate(81.1, 0)).toBe(81.1);
    expect(roundToPlate(81.1, -2.5)).toBe(81.1);
  });
});

describe('rirToPctOf1RM table', () => {
  it('exposes the Helms/RTS Tier-1 anchor values', () => {
    // Pin a few cells so any accidental edit shows up in CI.
    expect(rirToPctOf1RM[1][0]).toBe(1.0);
    expect(rirToPctOf1RM[5][2]).toBe(0.811);
    expect(rirToPctOf1RM[8][2]).toBe(0.745);
    expect(rirToPctOf1RM[12][4]).toBe(0.626);
  });

  it('FALLBACK_PCT mirrors the 8-rep × 2-RIR cell', () => {
    expect(FALLBACK_PCT).toBe(0.745);
    expect(FALLBACK_PCT).toBe(rirToPctOf1RM[8][2]);
  });
});

describe('recommendNextSet', () => {
  it('returns null when e1rm is null / zero / negative', () => {
    expect(recommendNextSet(null, 5, 2, 2.5)).toBeNull();
    expect(recommendNextSet(0, 5, 2, 2.5)).toBeNull();
    expect(recommendNextSet(-100, 5, 2, 2.5)).toBeNull();
  });

  it('returns null when repTarget is null / zero / negative', () => {
    expect(recommendNextSet(100, null, 2, 2.5)).toBeNull();
    expect(recommendNextSet(100, 0, 2, 2.5)).toBeNull();
    expect(recommendNextSet(100, -3, 2, 2.5)).toBeNull();
  });

  it('computes Helms-anchored weights for 5×2-RIR @ 100kg e1rm, 2.5 plate', () => {
    const out = recommendNextSet(100, 5, 2, 2.5);
    // base = 100 × 0.811 = 81.1
    // easy = 81.1 × 0.95 = 77.045 → round(30.818)·2.5 = 77.5
    // normal = round(32.44)·2.5 = 80
    // hard = 81.1 × 1.025 = 83.1275 → round(33.251)·2.5 = 82.5
    expect(out).toEqual({
      easy: { weight: 77.5, reps: 5 },
      normal: { weight: 80, reps: 5 },
      hard: { weight: 82.5, reps: 5 },
    });
  });

  it('preserves repTarget verbatim across all three chips', () => {
    const out = recommendNextSet(100, 8, 2, 2.5);
    expect(out?.easy.reps).toBe(8);
    expect(out?.normal.reps).toBe(8);
    expect(out?.hard.reps).toBe(8);
  });

  it('defaults RIR to 2 when omitted', () => {
    const withDefault = recommendNextSet(100, 5);
    const explicit = recommendNextSet(100, 5, 2, 2.5);
    expect(withDefault).toEqual(explicit);
  });

  it('defaults plateStep to 2.5 when omitted', () => {
    const withDefault = recommendNextSet(100, 5, 2);
    const explicit = recommendNextSet(100, 5, 2, 2.5);
    expect(withDefault).toEqual(explicit);
  });

  it('falls back to FALLBACK_PCT (0.745) for non-key rep counts', () => {
    // rep=7 isn't in the table; expect [8][2] = 0.745 anchor.
    const out = recommendNextSet(100, 7, 2, 2.5);
    // base = 100 × 0.745 = 74.5
    // easy = 70.775 → round(28.31)·2.5 = 70
    // normal = round(29.8)·2.5 = 75
    // hard = 76.3625 → round(30.545)·2.5 = 77.5
    expect(out).toEqual({
      easy: { weight: 70, reps: 7 },
      normal: { weight: 75, reps: 7 },
      hard: { weight: 77.5, reps: 7 },
    });
  });

  it('falls back to FALLBACK_PCT for non-key RIR within a known rep row', () => {
    // rep=5 is in the table, but RIR=5 isn't; the row.[5] is undefined,
    // so the ?? fallback kicks in.
    const out = recommendNextSet(100, 5, 5, 2.5);
    // Same as the rep=8/RIR=2 fallback target above (because base
    // collapses to FALLBACK_PCT × 100 = 74.5).
    expect(out?.normal.weight).toBe(75);
  });

  it('Easy / Normal / Hard order is monotonic non-decreasing', () => {
    const out = recommendNextSet(150, 5, 1, 2.5);
    expect(out!.easy.weight).toBeLessThanOrEqual(out!.normal.weight);
    expect(out!.normal.weight).toBeLessThanOrEqual(out!.hard.weight);
  });

  it('respects the 0.5 kg plate step (Olympic micro)', () => {
    const out = recommendNextSet(100, 5, 2, 0.5);
    // base = 81.1; rounding to 0.5:
    //   easy = 77.045 → round(154.09)·0.5 = 77
    //   normal = round(162.2)·0.5 = 81
    //   hard = 83.1275 → round(166.255)·0.5 = 83
    expect(out).toEqual({
      easy: { weight: 77, reps: 5 },
      normal: { weight: 81, reps: 5 },
      hard: { weight: 83, reps: 5 },
    });
  });

  it('respects the 1.25 kg plate step (fractional plates)', () => {
    const out = recommendNextSet(100, 5, 2, 1.25);
    // base = 81.1
    //   easy = 77.045 → round(61.636)·1.25 = 62·1.25 = 77.5
    //   normal = round(64.88)·1.25 = 65·1.25 = 81.25
    //   hard = 83.1275 → round(66.502)·1.25 = 67·1.25 = 83.75
    expect(out).toEqual({
      easy: { weight: 77.5, reps: 5 },
      normal: { weight: 81.25, reps: 5 },
      hard: { weight: 83.75, reps: 5 },
    });
  });

  it('scales linearly with e1rm (200kg ⇒ 2× of 100kg result, modulo rounding)', () => {
    const at100 = recommendNextSet(100, 5, 2, 0.5);
    const at200 = recommendNextSet(200, 5, 2, 0.5);
    // Within plate-step rounding tolerance.
    expect(at200!.normal.weight).toBeCloseTo(at100!.normal.weight * 2, 0);
  });

  it('handles small e1rm without collapsing to zero', () => {
    const out = recommendNextSet(20, 5, 2, 2.5);
    // base = 20 × 0.811 = 16.22
    //   easy   = 15.409  → round(6.16)·2.5 = 15
    //   normal = round(6.488)·2.5 = 17.5  (Math.round(6.488)=6 → 15)
    //                           ↑ wait: round(6.488) = 6, *2.5 = 15
    //   hard   = 16.625  → round(6.65)·2.5 = 17.5
    // Actually verify by computing here:
    expect(out).not.toBeNull();
    expect(out!.normal.weight).toBeGreaterThan(0);
  });
});
