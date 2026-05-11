// v1.3.0 / Onboarding v2 / Phase D-7 — pure-helper tests for the
// [11] progress-preview screen.
//
// progressTrajectoryUtils imports OnboardingSummary type from
// goalSummaryAggregator which transitively pulls onboardingCalc
// → workoutRepository → expo-sqlite. Mock the DB-side imports.
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../utils/id', () => ({ generateId: () => 'stub-id' }));

import {
  MAX_TRAJECTORY_WEEKS,
  computeTrajectoryBounds,
  computeTrajectoryPoints,
  formatTrajectoryAccessibilityLabel,
  getProgressCopyForDirection,
  isTrajectoryTruncated,
} from '../progressTrajectoryUtils';
import type { OnboardingSummary } from '../goalSummaryAggregator';

// Helper to build a minimal OnboardingSummary for tests.
function buildSummary(overrides: Partial<OnboardingSummary>): OnboardingSummary {
  return {
    weight: {
      current: 70,
      target: 65,
      deltaKg: -5,
      direction: 'cut',
    },
    schedule: {
      targetDate: new Date(2026, 7, 15),
      weeksToGoal: 14,
      weeklyRatePct: -0.5,
    },
    calories: {
      maintenance: 2400,
      target: 1950,
      deltaPerDay: -450,
    },
    bodyComposition: {
      current: { muscleKg: 52.5, fatKg: 17.5 },
      target: { muscleKg: 51.3, fatKg: 13.8 },
      proteinFactorUsed: 1.6,
      proteinFactorIsDefault: false,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeTrajectoryPoints
// ---------------------------------------------------------------------------

describe('computeTrajectoryPoints', () => {
  it('cut 70→65 across 14 weeks → 15 points (week 0..14, linear)', () => {
    const points = computeTrajectoryPoints(buildSummary({}));
    expect(points.length).toBe(15);
    expect(points[0].week).toBe(0);
    expect(points[0].weightKg).toBe(70);
    expect(points[14].week).toBe(14);
    expect(points[14].weightKg).toBe(65);
    // Midpoint: linear interpolation → 67.5
    expect(points[7].weightKg).toBe(67.5);
  });

  it('bulk 65→70 across 20 weeks → ascending trajectory', () => {
    const summary = buildSummary({
      weight: {
        current: 65,
        target: 70,
        deltaKg: 5,
        direction: 'bulk',
      },
      schedule: {
        targetDate: new Date(2026, 9, 1),
        weeksToGoal: 20,
        weeklyRatePct: 0.25,
      },
    });
    const points = computeTrajectoryPoints(summary);
    expect(points.length).toBe(21);
    expect(points[0].weightKg).toBe(65);
    expect(points[20].weightKg).toBe(70);
    // Monotonically increasing.
    for (let i = 1; i < points.length; i++) {
      expect(points[i].weightKg).toBeGreaterThanOrEqual(
        points[i - 1].weightKg,
      );
    }
  });

  it('maintain (schedule=null) → empty', () => {
    expect(
      computeTrajectoryPoints(
        buildSummary({
          weight: { current: 70, target: 70, deltaKg: 0, direction: 'maintain' },
          schedule: null,
        }),
      ),
    ).toEqual([]);
  });

  it('recomp (schedule=null) → empty (D-6 学び — distinct from maintain UI)', () => {
    expect(
      computeTrajectoryPoints(
        buildSummary({
          weight: { current: 70, target: 70, deltaKg: 0, direction: 'recomp' },
          schedule: null,
        }),
      ),
    ).toEqual([]);
  });

  it('null summary → empty', () => {
    expect(computeTrajectoryPoints(null)).toEqual([]);
  });

  it('caps at MAX_TRAJECTORY_WEEKS for long plans', () => {
    const summary = buildSummary({
      schedule: {
        targetDate: new Date(2027, 0, 1),
        weeksToGoal: 100,
        weeklyRatePct: -0.25,
      },
    });
    const points = computeTrajectoryPoints(summary);
    expect(points.length).toBe(MAX_TRAJECTORY_WEEKS + 1);
    expect(points[points.length - 1].week).toBe(MAX_TRAJECTORY_WEEKS);
  });

  it('respects caller-supplied maxWeeks override', () => {
    const summary = buildSummary({
      schedule: {
        targetDate: new Date(2026, 7, 15),
        weeksToGoal: 14,
        weeklyRatePct: -0.5,
      },
    });
    const points = computeTrajectoryPoints(summary, 7);
    expect(points.length).toBe(8); // week 0..7
    expect(points[points.length - 1].week).toBe(7);
  });

  it('zero or negative weeksToGoal → empty', () => {
    expect(
      computeTrajectoryPoints(
        buildSummary({
          schedule: {
            targetDate: new Date(2026, 7, 15),
            weeksToGoal: 0,
            weeklyRatePct: 0,
          },
        }),
      ),
    ).toEqual([]);
  });

  // Codex pass 1 / Important regression — weekCap === 1 edge.
  // The screen's xAxisTicks dedup relies on the helper returning
  // a 2-point trajectory here (week 0 + week 1). Pin so a future
  // change can't accidentally collapse it.
  it('weeksToGoal=1 returns exactly 2 points (week 0 + 1)', () => {
    const points = computeTrajectoryPoints(
      buildSummary({
        weight: {
          current: 70,
          target: 69,
          deltaKg: -1,
          direction: 'cut',
        },
        schedule: {
          targetDate: new Date(2026, 4, 19),
          weeksToGoal: 1,
          weeklyRatePct: -1.0,
        },
      }),
    );
    expect(points.length).toBe(2);
    expect(points[0].week).toBe(0);
    expect(points[1].week).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getProgressCopyForDirection
// ---------------------------------------------------------------------------

describe('getProgressCopyForDirection', () => {
  it('returns non-empty title + body for each of the 4 directions', () => {
    const directions = ['cut', 'maintain', 'bulk', 'recomp'] as const;
    for (const d of directions) {
      const copy = getProgressCopyForDirection(d, 14);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });

  it('cut copy includes the weeks-to-goal context', () => {
    const copy = getProgressCopyForDirection('cut', 14);
    expect(copy.body).toMatch(/14/);
    expect(copy.body).toMatch(/週/);
  });

  it('bulk copy includes the weeks-to-goal context', () => {
    const copy = getProgressCopyForDirection('bulk', 20);
    expect(copy.body).toMatch(/20/);
  });

  it('cut copy with null weeksToGoal falls back without week mention', () => {
    const copy = getProgressCopyForDirection('cut', null);
    expect(copy.body).not.toMatch(/週/);
    expect(copy.body.length).toBeGreaterThan(0);
  });

  // D-6 学び regression — maintain/recomp collapse is the
  // specific bug Codex flagged in D-6. Pin distinctness here so
  // a future merge can't collapse them back together.
  it('recomp distinct from maintain (D-6 学び regression)', () => {
    const recomp = getProgressCopyForDirection('recomp', null);
    const maintain = getProgressCopyForDirection('maintain', null);
    expect(recomp.title).not.toBe(maintain.title);
    expect(recomp.body).not.toBe(maintain.body);
  });

  it('recomp copy mentions 体組成', () => {
    const copy = getProgressCopyForDirection('recomp', null);
    expect(copy.body).toMatch(/体組成|筋肉|脂肪/);
  });

  it('all 4 titles distinct', () => {
    const titles = (['cut', 'maintain', 'bulk', 'recomp'] as const).map((d) =>
      getProgressCopyForDirection(d, 14).title,
    );
    expect(new Set(titles).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// formatTrajectoryAccessibilityLabel
// ---------------------------------------------------------------------------

describe('formatTrajectoryAccessibilityLabel', () => {
  it('empty array → 予測なし', () => {
    expect(formatTrajectoryAccessibilityLabel([])).toBe('予測なし');
  });

  it('single-point → "0 週で N kg"', () => {
    expect(
      formatTrajectoryAccessibilityLabel([{ week: 0, weightKg: 70 }]),
    ).toBe('0 週で 70 kg');
  });

  it('multi-point picks start / mid / end anchors', () => {
    const points = [
      { week: 0, weightKg: 70 },
      { week: 7, weightKg: 67.5 },
      { week: 14, weightKg: 65 },
    ];
    const out = formatTrajectoryAccessibilityLabel(points);
    expect(out).toMatch(/0 週で 70 kg/);
    expect(out).toMatch(/7 週で 67.5 kg/);
    expect(out).toMatch(/14 週で 65 kg/);
  });

  it('long trajectory still picks 3 anchors', () => {
    const points = Array.from({ length: 30 }, (_, w) => ({
      week: w,
      weightKg: 70 - w * 0.1,
    }));
    const out = formatTrajectoryAccessibilityLabel(points);
    expect(out.split('、').length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// isTrajectoryTruncated — Codex pass 1 / Important fix regression
// ---------------------------------------------------------------------------

describe('isTrajectoryTruncated', () => {
  it('null summary → false', () => {
    expect(isTrajectoryTruncated(null)).toBe(false);
  });

  it('null schedule (maintain / recomp) → false', () => {
    expect(
      isTrajectoryTruncated(
        buildSummary({
          schedule: null,
        }),
      ),
    ).toBe(false);
  });

  it('weeksToGoal <= MAX → false', () => {
    expect(
      isTrajectoryTruncated(
        buildSummary({
          schedule: {
            targetDate: new Date(2026, 7, 15),
            weeksToGoal: 14,
            weeklyRatePct: -0.5,
          },
        }),
      ),
    ).toBe(false);
  });

  it('weeksToGoal > MAX → true (chart needs truncation cue)', () => {
    expect(
      isTrajectoryTruncated(
        buildSummary({
          schedule: {
            targetDate: new Date(2027, 7, 15),
            weeksToGoal: 100,
            weeklyRatePct: -0.1,
          },
        }),
      ),
    ).toBe(true);
  });

  it('weeksToGoal exactly == MAX → false (boundary inclusive)', () => {
    expect(
      isTrajectoryTruncated(
        buildSummary({
          schedule: {
            targetDate: new Date(2027, 4, 1),
            weeksToGoal: MAX_TRAJECTORY_WEEKS,
            weeklyRatePct: -0.25,
          },
        }),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeTrajectoryBounds
// ---------------------------------------------------------------------------

describe('computeTrajectoryBounds', () => {
  it('empty points → null', () => {
    expect(computeTrajectoryBounds([])).toBeNull();
  });

  it('multi-point returns weight range with 5% padding', () => {
    const out = computeTrajectoryBounds([
      { week: 0, weightKg: 70 },
      { week: 7, weightKg: 67.5 },
      { week: 14, weightKg: 65 },
    ]);
    expect(out).not.toBeNull();
    expect(out!.weekCap).toBe(14);
    // span = 5, pad = 0.25
    expect(out!.minWeight).toBeCloseTo(64.75, 5);
    expect(out!.maxWeight).toBeCloseTo(70.25, 5);
  });

  it('single-point pads ±1kg to avoid degenerate plot area', () => {
    const out = computeTrajectoryBounds([{ week: 0, weightKg: 70 }]);
    expect(out).not.toBeNull();
    expect(out!.minWeight).toBe(69);
    expect(out!.maxWeight).toBe(71);
  });
});
