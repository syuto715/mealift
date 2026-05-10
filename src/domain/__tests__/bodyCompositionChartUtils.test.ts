// v1.3.0 / Onboarding v2 / Phase B-5 — pure-helper tests for the
// BodyCompositionChart component. Render tests deferred per Build 15+
// TODO 12 (no jest-expo / RNTL preset); the component's logic is
// covered through these helpers + the cross-check against
// onboardingCalc.predictBodyComposition.
//
// bodyCompositionChartUtils imports onboardingCalc which transitively
// pulls workoutRepository → expo-sqlite (via suggestProteinFactor's
// getRecentSessionCount). Mock the DB-side imports so jest's CJS
// runtime doesn't choke — same pattern Phase B-3 / B-4 established.
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../utils/id', () => ({ generateId: () => 'stub-id' }));

import {
  type ChartData,
  DEFAULT_CURRENT_BODY_FAT_PCT,
  WEEKLY_RATE_MAX,
  WEEKLY_RATE_MIN,
  assertChartProps,
  clampNonNegative,
  computeChartData,
  computeSegmentWidths,
  formatChartAccessibilityLabel,
  formatRateLabel,
  formatWeightLabel,
  sanitizeChartProps,
} from '../bodyCompositionChartUtils';
import {
  forecastBodyComposition,
  predictBodyComposition,
} from '../onboardingCalc';

// ---------------------------------------------------------------------------
// computeChartData — happy paths + edge cases
// ---------------------------------------------------------------------------

describe('computeChartData', () => {
  it('standard cut: 70 → 65, factor 1.6, default 25% bf', () => {
    const data = computeChartData({
      currentWeight: 70,
      targetWeight: 65,
      proteinFactor: 1.6,
      // currentBodyFatPct omitted → DEFAULT_CURRENT_BODY_FAT_PCT (25)
    });
    // current: 70 kg, fat 25% = 17.5 kg, muscle 52.5 kg
    expect(data.current.weightKg).toBe(70);
    expect(data.current.fatKg).toBe(17.5);
    expect(data.current.muscleKg).toBe(52.5);
    // factor 1.6 → fat 0.75, muscle 0.25; totalKgChange = -5
    // targetFatKg = 17.5 + (-5)(0.75) = 17.5 - 3.75 = 13.75 → round1 → 13.8
    // targetMuscleKg = 52.5 + (-5)(0.25) = 52.5 - 1.25 = 51.25 → round1 → 51.3 (ties to +∞)
    expect(data.target.weightKg).toBe(65);
    expect(data.target.fatKg).toBe(13.8);
    expect(data.target.muscleKg).toBe(51.3);
  });

  it('maintain: 70 → 70, factor 1.6 — no change', () => {
    const data = computeChartData({
      currentWeight: 70,
      targetWeight: 70,
      proteinFactor: 1.6,
    });
    expect(data.current.weightKg).toBe(70);
    expect(data.target.weightKg).toBe(70);
    expect(data.target.muscleKg).toBe(data.current.muscleKg);
    expect(data.target.fatKg).toBe(data.current.fatKg);
  });

  it('bulk: 60 → 70, factor 2.2 (athlete-tier), muscle-prioritized', () => {
    const data = computeChartData({
      currentWeight: 60,
      targetWeight: 70,
      proteinFactor: 2.2,
    });
    // factor 2.2 → fat 0.85, muscle 0.15; totalKgChange = +10
    // currentFat = 60 * 0.25 = 15, currentMuscle = 45
    // targetFat = 15 + 10*0.85 = 23.5
    // targetMuscle = 45 + 10*0.15 = 46.5
    // NOTE: factor 2.2 lookup says fat:0.85 muscle:0.15 (Mealift mapping —
    // higher protein means MORE muscle preservation during cuts but the
    // SAME asymmetric ratio applies on bulks per A-4 sign-off § 8.6).
    expect(data.target.fatKg).toBe(23.5);
    expect(data.target.muscleKg).toBe(46.5);
  });

  it('caller-provided currentBodyFatPct overrides the default', () => {
    const dataDefault = computeChartData({
      currentWeight: 70,
      targetWeight: 65,
      proteinFactor: 1.6,
    });
    const dataOverride = computeChartData({
      currentWeight: 70,
      targetWeight: 65,
      proteinFactor: 1.6,
      currentBodyFatPct: 15,
    });
    // 15% bf instead of 25% → less fat, more muscle in current snapshot
    expect(dataOverride.current.fatKg).toBeLessThan(dataDefault.current.fatKg);
    expect(dataOverride.current.muscleKg).toBeGreaterThan(
      dataDefault.current.muscleKg,
    );
  });

  // Pattern 18 cross-check — Phase B-5 / single source of truth.
  // forecastBodyComposition's muscleKg delta MUST equal
  // predictBodyComposition's muscleMassChange to 1 decimal,
  // otherwise the chart's bars would contradict the [10] copy line.
  it('muscle delta equals predictBodyComposition.muscleMassChange', () => {
    const cases = [
      { currentWeight: 70, targetWeight: 65, proteinFactor: 1.6 },
      { currentWeight: 60, targetWeight: 70, proteinFactor: 2.2 },
      { currentWeight: 80, targetWeight: 75, proteinFactor: 1.0 },
      { currentWeight: 75, targetWeight: 80, proteinFactor: 3.0 },
    ];
    for (const c of cases) {
      const forecast = forecastBodyComposition(c);
      const predict = predictBodyComposition(c);
      const muscleDelta =
        forecast.target.muscleKg - forecast.current.muscleKg;
      // round1 both sides since predict already returns rounded
      const muscleDeltaRounded = Math.round(muscleDelta * 10) / 10;
      expect(muscleDeltaRounded).toBeCloseTo(predict.muscleMassChange, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// formatWeightLabel
// ---------------------------------------------------------------------------

describe('formatWeightLabel', () => {
  it('always retains 1 decimal so column-aligned labels do not jitter', () => {
    expect(formatWeightLabel(70)).toBe('70.0 kg');
    expect(formatWeightLabel(70.5)).toBe('70.5 kg');
    expect(formatWeightLabel(72.349)).toBe('72.3 kg');
    expect(formatWeightLabel(72.351)).toBe('72.4 kg');
  });

  it('falls back to "-- kg" for non-finite input', () => {
    expect(formatWeightLabel(NaN)).toBe('-- kg');
    expect(formatWeightLabel(Infinity)).toBe('-- kg');
  });
});

// ---------------------------------------------------------------------------
// formatRateLabel
// ---------------------------------------------------------------------------

describe('formatRateLabel', () => {
  it('formats negative / positive / zero rates', () => {
    expect(formatRateLabel(-1.0)).toBe('-1.0%/週');
    expect(formatRateLabel(-0.5)).toBe('-0.5%/週');
    expect(formatRateLabel(-0.25)).toBe('-0.25%/週');
    expect(formatRateLabel(0)).toBe('±0%/週');
    expect(formatRateLabel(0.25)).toBe('+0.25%/週');
  });

  it('falls back to "--" for non-finite', () => {
    expect(formatRateLabel(NaN)).toBe('--');
    expect(formatRateLabel(Infinity)).toBe('--');
  });
});

// ---------------------------------------------------------------------------
// formatChartAccessibilityLabel
// ---------------------------------------------------------------------------

describe('formatChartAccessibilityLabel', () => {
  const cutData: ChartData = {
    current: { weightKg: 70, muscleKg: 52.5, fatKg: 17.5 },
    target: { weightKg: 65, muscleKg: 51.3, fatKg: 13.8 },
  };

  it('decrease case mentions current → target → 減量', () => {
    const label = formatChartAccessibilityLabel(cutData, -0.5);
    expect(label).toContain('現在 70.0 kg');
    expect(label).toContain('目標 65.0 kg');
    expect(label).toContain('減量');
    expect(label).toContain('-0.5%/週');
  });

  it('increase case mentions 増量', () => {
    const bulk: ChartData = {
      current: { weightKg: 60, muscleKg: 45, fatKg: 15 },
      target: { weightKg: 70, muscleKg: 46.5, fatKg: 23.5 },
    };
    const label = formatChartAccessibilityLabel(bulk, 0.25);
    expect(label).toContain('増量');
    expect(label).toContain('+0.25%/週');
  });

  it('maintain case uses 維持 phrasing (no target labeled)', () => {
    const maintain: ChartData = {
      current: { weightKg: 70, muscleKg: 52.5, fatKg: 17.5 },
      target: { weightKg: 70, muscleKg: 52.5, fatKg: 17.5 },
    };
    const label = formatChartAccessibilityLabel(maintain, 0);
    expect(label).toContain('維持');
    expect(label).toContain('±0%/週');
    expect(label).not.toContain('目標');
  });

  // Codex pass 1 / Important #1 — direction must reuse
  // ACHIEVEMENT_THRESHOLD_KG = 0.5 (inclusive) so the chart reads
  // 維持 for the same gap that paceSelectorUtils.getDirection +
  // estimateTargetDate already classify as 維持. Without this, a
  // 70.0 → 70.4 user gets cross-screen contradiction.
  it('|gap| <= 0.5kg reads 維持 (matches paceSelectorUtils + estimateTargetDate)', () => {
    const nearMatch: ChartData = {
      current: { weightKg: 70, muscleKg: 52.5, fatKg: 17.5 },
      target: { weightKg: 70.4, muscleKg: 52.6, fatKg: 17.8 },
    };
    expect(formatChartAccessibilityLabel(nearMatch, 0)).toContain('維持');

    const exactBoundary: ChartData = {
      current: { weightKg: 70, muscleKg: 52.5, fatKg: 17.5 },
      target: { weightKg: 70.5, muscleKg: 52.6, fatKg: 17.9 },
    };
    expect(formatChartAccessibilityLabel(exactBoundary, 0)).toContain('維持');

    const justOverBoundary: ChartData = {
      current: { weightKg: 70, muscleKg: 52.5, fatKg: 17.5 },
      target: { weightKg: 70.6, muscleKg: 52.6, fatKg: 18.0 },
    };
    expect(formatChartAccessibilityLabel(justOverBoundary, 0)).toContain('増量');
  });
});

// ---------------------------------------------------------------------------
// assertChartProps — caller-misuse fail-fast (Pattern 28 dev path)
// ---------------------------------------------------------------------------

describe('assertChartProps', () => {
  const valid = {
    currentWeight: 70,
    targetWeight: 65,
    proteinFactor: 1.6,
    weeklyRatePct: -0.5,
  };

  it('passes for valid input', () => {
    expect(() => assertChartProps(valid)).not.toThrow();
  });

  it('passes when currentBodyFatPct is provided in (0, 100)', () => {
    expect(() =>
      assertChartProps({ ...valid, currentBodyFatPct: 18 }),
    ).not.toThrow();
  });

  it('throws on non-finite or non-positive currentWeight', () => {
    expect(() => assertChartProps({ ...valid, currentWeight: NaN })).toThrow(
      /currentWeight/,
    );
    expect(() => assertChartProps({ ...valid, currentWeight: 0 })).toThrow(
      /currentWeight/,
    );
    expect(() => assertChartProps({ ...valid, currentWeight: -5 })).toThrow(
      /currentWeight/,
    );
  });

  it('throws on non-finite or non-positive targetWeight', () => {
    expect(() =>
      assertChartProps({ ...valid, targetWeight: Infinity }),
    ).toThrow(/targetWeight/);
    expect(() => assertChartProps({ ...valid, targetWeight: 0 })).toThrow(
      /targetWeight/,
    );
  });

  it('throws on proteinFactor outside PROTEIN_FACTOR_OPTIONS', () => {
    expect(() => assertChartProps({ ...valid, proteinFactor: 1.5 })).toThrow(
      /proteinFactor/,
    );
    expect(() => assertChartProps({ ...valid, proteinFactor: 4.0 })).toThrow(
      /proteinFactor/,
    );
  });

  it('throws on weeklyRatePct outside schema CHECK [-1.5, 0.5]', () => {
    expect(() =>
      assertChartProps({ ...valid, weeklyRatePct: WEEKLY_RATE_MIN - 0.01 }),
    ).toThrow(/weeklyRatePct/);
    expect(() =>
      assertChartProps({ ...valid, weeklyRatePct: WEEKLY_RATE_MAX + 0.01 }),
    ).toThrow(/weeklyRatePct/);
    expect(() =>
      assertChartProps({ ...valid, weeklyRatePct: NaN }),
    ).toThrow(/weeklyRatePct/);
  });

  it('throws on currentBodyFatPct outside (0, 100)', () => {
    expect(() =>
      assertChartProps({ ...valid, currentBodyFatPct: 0 }),
    ).toThrow(/currentBodyFatPct/);
    expect(() =>
      assertChartProps({ ...valid, currentBodyFatPct: 100 }),
    ).toThrow(/currentBodyFatPct/);
    expect(() =>
      assertChartProps({ ...valid, currentBodyFatPct: -5 }),
    ).toThrow(/currentBodyFatPct/);
    expect(() =>
      assertChartProps({ ...valid, currentBodyFatPct: NaN }),
    ).toThrow(/currentBodyFatPct/);
  });
});

// ---------------------------------------------------------------------------
// sanitizeChartProps — Pattern 28 production-safe path
// ---------------------------------------------------------------------------

describe('sanitizeChartProps', () => {
  const valid = {
    currentWeight: 70,
    targetWeight: 65,
    proteinFactor: 1.6,
    weeklyRatePct: -0.5,
  };

  it('passes valid input through unchanged', () => {
    const out = sanitizeChartProps(valid);
    expect(out).toEqual({
      currentWeight: 70,
      targetWeight: 65,
      proteinFactor: 1.6,
      weeklyRatePct: -0.5,
      currentBodyFatPct: undefined,
    });
  });

  it('coerces non-finite weights to default 70', () => {
    const out = sanitizeChartProps({
      ...valid,
      currentWeight: NaN,
      targetWeight: -10,
    });
    expect(out.currentWeight).toBe(70);
    expect(out.targetWeight).toBe(70);
  });

  it('coerces invalid proteinFactor to 1.6', () => {
    expect(sanitizeChartProps({ ...valid, proteinFactor: 1.5 }).proteinFactor)
      .toBe(1.6);
    expect(sanitizeChartProps({ ...valid, proteinFactor: NaN }).proteinFactor)
      .toBe(1.6);
  });

  it('coerces out-of-schema weeklyRatePct to 0', () => {
    expect(
      sanitizeChartProps({ ...valid, weeklyRatePct: -2.0 }).weeklyRatePct,
    ).toBe(0);
    expect(
      sanitizeChartProps({ ...valid, weeklyRatePct: 1.0 }).weeklyRatePct,
    ).toBe(0);
  });

  it('strips out-of-range currentBodyFatPct (caller asked for default)', () => {
    expect(
      sanitizeChartProps({ ...valid, currentBodyFatPct: 0 }).currentBodyFatPct,
    ).toBeUndefined();
    expect(
      sanitizeChartProps({ ...valid, currentBodyFatPct: 150 })
        .currentBodyFatPct,
    ).toBeUndefined();
  });

  it('preserves valid currentBodyFatPct', () => {
    expect(
      sanitizeChartProps({ ...valid, currentBodyFatPct: 18 })
        .currentBodyFatPct,
    ).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// clampNonNegative
// ---------------------------------------------------------------------------

describe('clampNonNegative', () => {
  it('returns positive values unchanged', () => {
    expect(clampNonNegative(10)).toBe(10);
    expect(clampNonNegative(0.5)).toBe(0.5);
  });

  it('clamps negative values to 0', () => {
    expect(clampNonNegative(-1)).toBe(0);
    expect(clampNonNegative(-50)).toBe(0);
  });

  it('returns 0 for non-finite input (defensive)', () => {
    // Pixel-width math downstream can't render NaN or Infinity;
    // collapse all non-finite values to 0 so a degenerate forecast
    // still produces a (zero-width) bar segment instead of crashing.
    expect(clampNonNegative(NaN)).toBe(0);
    expect(clampNonNegative(Infinity)).toBe(0);
    expect(clampNonNegative(-Infinity)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeSegmentWidths — Codex pass 1 / Critical regression guard
// ---------------------------------------------------------------------------

describe('computeSegmentWidths', () => {
  it('non-extreme case: muscle + fat = barWidth, both non-negative', () => {
    const out = computeSegmentWidths(50, 20, 280); // 70 kg total
    expect(out.muscleWidth).toBeCloseTo(200, 5); // 50/70 * 280
    expect(out.fatWidth).toBeCloseTo(80, 5); // 20/70 * 280
    expect(out.muscleWidth + out.fatWidth).toBeCloseTo(280, 5);
  });

  it('extreme cut where targetFatKg goes negative — fat clamped to 0', () => {
    // Regression — pre-fix this case produced fatWidth < 0 because
    // `barWidth - muscleWidth` could go negative when muscleKg
    // exceeded the bar's implied weight. The re-normalize approach
    // floors fat at 0 and lets muscle fill the bar.
    const out = computeSegmentWidths(50, -5, 280);
    expect(out.fatWidth).toBe(0);
    expect(out.muscleWidth).toBe(280);
  });

  it('both segments non-negative when muscle goes negative too', () => {
    const out = computeSegmentWidths(-10, 30, 280);
    expect(out.muscleWidth).toBe(0);
    expect(out.fatWidth).toBe(280);
  });

  it('zero total returns zero-width segments (no division by zero)', () => {
    expect(computeSegmentWidths(0, 0, 280)).toEqual({
      muscleWidth: 0,
      fatWidth: 0,
    });
    expect(computeSegmentWidths(-5, -5, 280)).toEqual({
      muscleWidth: 0,
      fatWidth: 0,
    });
  });

  it('zero or negative barWidth returns zero-width segments', () => {
    expect(computeSegmentWidths(50, 20, 0)).toEqual({
      muscleWidth: 0,
      fatWidth: 0,
    });
    expect(computeSegmentWidths(50, 20, -100)).toEqual({
      muscleWidth: 0,
      fatWidth: 0,
    });
  });

  it('NaN inputs collapse to zero-width segments (defensive)', () => {
    expect(computeSegmentWidths(NaN, 20, 280)).toEqual({
      muscleWidth: 0,
      fatWidth: 280,
    });
    expect(computeSegmentWidths(50, NaN, 280)).toEqual({
      muscleWidth: 280,
      fatWidth: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_CURRENT_BODY_FAT_PCT — pinned by sign-off § Phase B-5 §1
// ---------------------------------------------------------------------------

describe('DEFAULT_CURRENT_BODY_FAT_PCT', () => {
  it('is 25 (typical-adult assumption)', () => {
    expect(DEFAULT_CURRENT_BODY_FAT_PCT).toBe(25);
  });
});
