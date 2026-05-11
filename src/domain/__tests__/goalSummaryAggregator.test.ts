// v1.3.0 / Onboarding v2 / Phase D-1 — pure-helper tests for the
// [5.5] goal-summary screen aggregator.
//
// goalSummaryAggregator imports onboardingCalc which pulls
// workoutRepository → expo-sqlite. Mock the DB-side shim same as
// every Phase B/C test file.
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../utils/id', () => ({ generateId: () => 'stub-id' }));

import {
  type AggregatorInputs,
  DEFAULT_PROTEIN_FACTOR_FALLBACK,
  aggregateOnboardingSummary,
  formatCaloriesLabel,
  formatDeltaLabel,
} from '../goalSummaryAggregator';
import { calculateMaintenanceCalories } from '../activityValidation';
import { calculateDailyTarget } from '../onboardingCalc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DEFAULT_PROTEIN_FACTOR_FALLBACK', () => {
  it('is 1.6 (matches suggestProteinFactor "適度な筋トレ" tier)', () => {
    expect(DEFAULT_PROTEIN_FACTOR_FALLBACK).toBe(1.6);
  });
});

// ---------------------------------------------------------------------------
// aggregateOnboardingSummary — happy paths
// ---------------------------------------------------------------------------

describe('aggregateOnboardingSummary', () => {
  const now = new Date(2026, 4, 12);

  const baseCut: AggregatorInputs = {
    gender: 'male',
    birthYear: 1995,
    heightCm: 170,
    currentWeightKg: 70,
    activityLevel: 'moderate',
    trainingDaysPerWeek: 3,
    targetWeightKg: 65,
    goalType: 'cut',
    weeklyRatePct: -0.5,
    proteinFactor: 1.6,
    now,
  };

  it('standard cut case populates every section', () => {
    const out = aggregateOnboardingSummary(baseCut);
    expect(out).not.toBeNull();
    expect(out!.weight.current).toBe(70);
    expect(out!.weight.target).toBe(65);
    expect(out!.weight.deltaKg).toBe(-5);
    expect(out!.weight.direction).toBe('cut');
    expect(out!.schedule).not.toBeNull();
    expect(out!.schedule!.weeklyRatePct).toBe(-0.5);
    expect(out!.calories.maintenance).toBeGreaterThan(0);
    expect(out!.calories.target).toBeLessThan(out!.calories.maintenance);
    expect(out!.calories.deltaPerDay).toBeLessThan(0);
    expect(out!.bodyComposition.proteinFactorUsed).toBe(1.6);
    expect(out!.bodyComposition.proteinFactorIsDefault).toBe(false);
  });

  it('maintain case: schedule=null, direction=maintain, deltaPerDay≈0', () => {
    const out = aggregateOnboardingSummary({
      ...baseCut,
      targetWeightKg: 70,
      goalType: 'maintain',
      weeklyRatePct: 0,
    });
    expect(out).not.toBeNull();
    expect(out!.weight.direction).toBe('maintain');
    expect(out!.schedule).toBeNull();
    // calculateDailyTarget(maintain rate 0) returns TDEE exactly,
    // so target should equal maintenance.
    expect(out!.calories.deltaPerDay).toBe(0);
    expect(out!.calories.target).toBe(out!.calories.maintenance);
  });

  it('bulk case: direction=bulk, deltaPerDay>0, schedule present', () => {
    const out = aggregateOnboardingSummary({
      ...baseCut,
      currentWeightKg: 65,
      targetWeightKg: 70,
      goalType: 'bulk',
      weeklyRatePct: 0.25,
    });
    expect(out).not.toBeNull();
    expect(out!.weight.direction).toBe('bulk');
    expect(out!.calories.deltaPerDay).toBeGreaterThan(0);
    expect(out!.schedule).not.toBeNull();
  });

  it('recomp case: direction=maintain (per goalType), schedule=null', () => {
    const out = aggregateOnboardingSummary({
      ...baseCut,
      targetWeightKg: 70,
      goalType: 'recomp',
      weeklyRatePct: 0,
    });
    expect(out).not.toBeNull();
    // direction follows goalType for cut/bulk and falls through to
    // maintain for both 'maintain' and 'recomp' (per aggregator
    // logic — the display layer differentiates via goalType label).
    expect(out!.weight.direction).toBe('maintain');
  });

  it('proteinFactor=null falls back to 1.6 + flags default', () => {
    const out = aggregateOnboardingSummary({
      ...baseCut,
      proteinFactor: null,
    });
    expect(out).not.toBeNull();
    expect(out!.bodyComposition.proteinFactorUsed).toBe(
      DEFAULT_PROTEIN_FACTOR_FALLBACK,
    );
    expect(out!.bodyComposition.proteinFactorIsDefault).toBe(true);
  });

  it('proteinFactor=2.2 preserved + not flagged as default', () => {
    const out = aggregateOnboardingSummary({
      ...baseCut,
      proteinFactor: 2.2,
    });
    expect(out!.bodyComposition.proteinFactorUsed).toBe(2.2);
    expect(out!.bodyComposition.proteinFactorIsDefault).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aggregateOnboardingSummary — null short-circuits
// ---------------------------------------------------------------------------

describe('aggregateOnboardingSummary — invalid input → null', () => {
  const now = new Date(2026, 4, 12);
  const valid: AggregatorInputs = {
    gender: 'male',
    birthYear: 1995,
    heightCm: 170,
    currentWeightKg: 70,
    activityLevel: 'moderate',
    trainingDaysPerWeek: 3,
    targetWeightKg: 65,
    goalType: 'cut',
    weeklyRatePct: -0.5,
    proteinFactor: 1.6,
    now,
  };

  it('NaN currentWeight → null', () => {
    expect(
      aggregateOnboardingSummary({ ...valid, currentWeightKg: NaN }),
    ).toBeNull();
  });

  it('birthYear too young → null', () => {
    expect(
      aggregateOnboardingSummary({ ...valid, birthYear: 2020 }),
    ).toBeNull();
  });

  it('out-of-range height → null', () => {
    expect(
      aggregateOnboardingSummary({ ...valid, heightCm: 100 }),
    ).toBeNull();
  });

  it('inconsistent goalType+rate → null (C-5 consistency gate fires)', () => {
    expect(
      aggregateOnboardingSummary({
        ...valid,
        goalType: 'cut',
        weeklyRatePct: 0.25, // positive rate for cut → inconsistent
      }),
    ).toBeNull();
  });

  it('invalid activityLevel cast escape → null', () => {
    expect(
      aggregateOnboardingSummary({
        ...valid,
        // @ts-expect-error — exercising the runtime cast escape.
        activityLevel: 'extreme',
      }),
    ).toBeNull();
  });

  it('out-of-range trainingDaysPerWeek → null', () => {
    expect(
      aggregateOnboardingSummary({ ...valid, trainingDaysPerWeek: 10 }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pattern 18 SSoT cross-check — target - maintenance = deltaPerDay
// ---------------------------------------------------------------------------

describe('aggregateOnboardingSummary — Pattern 18 SSoT cross-check', () => {
  const now = new Date(2026, 4, 12);

  it('calories.target equals calculateDailyTarget(maintenance)', () => {
    // Independent recompute via the canonical helpers; the
    // aggregator's output must be identical to running the same
    // helper chain manually. Pin so a future calculateDailyTarget
    // rebalancing can't silently drift summary copy from the
    // calorie-budgeting backend.
    const inputs: AggregatorInputs = {
      gender: 'male',
      birthYear: 1995,
      heightCm: 170,
      currentWeightKg: 70,
      activityLevel: 'moderate',
      trainingDaysPerWeek: 3,
      targetWeightKg: 65,
      goalType: 'cut',
      weeklyRatePct: -0.5,
      proteinFactor: 1.6,
      now,
    };
    const out = aggregateOnboardingSummary(inputs)!;
    const expectedMaintenance = calculateMaintenanceCalories({
      weightKg: inputs.currentWeightKg,
      heightCm: inputs.heightCm,
      birthYear: inputs.birthYear,
      gender: inputs.gender,
      activityLevel: inputs.activityLevel,
      now,
    })!;
    const expectedTarget = calculateDailyTarget({
      currentWeight: inputs.currentWeightKg,
      weeklyRatePct: inputs.weeklyRatePct,
      tdee: expectedMaintenance,
    });
    expect(out.calories.maintenance).toBe(expectedMaintenance);
    expect(out.calories.target).toBe(expectedTarget);
  });

  it('deltaPerDay = target - maintenance algebraically', () => {
    const out = aggregateOnboardingSummary({
      gender: 'male',
      birthYear: 1995,
      heightCm: 170,
      currentWeightKg: 70,
      activityLevel: 'moderate',
      trainingDaysPerWeek: 3,
      targetWeightKg: 65,
      goalType: 'cut',
      weeklyRatePct: -0.5,
      proteinFactor: 1.6,
      now,
    })!;
    expect(out.calories.deltaPerDay).toBe(
      out.calories.target - out.calories.maintenance,
    );
  });
});

// ---------------------------------------------------------------------------
// formatCaloriesLabel
// ---------------------------------------------------------------------------

describe('formatCaloriesLabel', () => {
  it('formats with JP comma-thousands', () => {
    expect(formatCaloriesLabel(2341)).toBe('2,341 kcal/日');
    expect(formatCaloriesLabel(1000)).toBe('1,000 kcal/日');
    expect(formatCaloriesLabel(800)).toBe('800 kcal/日');
  });

  it('non-finite → fallback', () => {
    expect(formatCaloriesLabel(NaN)).toBe('-- kcal/日');
    expect(formatCaloriesLabel(Infinity)).toBe('-- kcal/日');
  });
});

// ---------------------------------------------------------------------------
// formatDeltaLabel
// ---------------------------------------------------------------------------

describe('formatDeltaLabel', () => {
  it('negative delta → 減量 with absolute value', () => {
    expect(formatDeltaLabel(-450)).toBe('-450 kcal/日 で減量');
    expect(formatDeltaLabel(-1200)).toBe('-1,200 kcal/日 で減量');
  });

  it('positive delta → 増量', () => {
    expect(formatDeltaLabel(200)).toBe('+200 kcal/日 で増量');
    expect(formatDeltaLabel(1500)).toBe('+1,500 kcal/日 で増量');
  });

  it('zero or non-finite → 維持', () => {
    expect(formatDeltaLabel(0)).toBe('維持');
    expect(formatDeltaLabel(NaN)).toBe('維持');
    expect(formatDeltaLabel(Infinity)).toBe('維持');
  });
});
