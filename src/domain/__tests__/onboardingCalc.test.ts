// v1.3.0 / Onboarding v2 / Phase A-4 — calc helper tests.
//
// 4 layers of coverage:
//   1. calculateDailyTarget pure logic (numerical pin + sign / rounding)
//   2. estimateTargetDate recursive simulator (boundary + cap + Date math)
//   3. calculatePFCTargetsByMealPlan ratio table (5 plans + clamps)
//   4. predictBodyComposition Mealift-original mapping (sign-off § 8.6 pin)
//   5. suggestProteinFactor workout-frequency thresholds (with mocked
//      getRecentSessionCount + DB error path)

// Mock the DB-side imports so Jest doesn't pull expo-sqlite. The
// calc helpers themselves are pure; only suggestProteinFactor
// touches the DB via getRecentSessionCount, which is what we mock.
const mockGetRecentSessionCount = jest.fn();
jest.mock('../../infra/repositories/workoutRepository', () => ({
  getRecentSessionCount: (...args: unknown[]) =>
    mockGetRecentSessionCount(...args),
}));

import {
  calculateDailyTarget,
  estimateTargetDate,
  calculatePFCTargetsByMealPlan,
  predictBodyComposition,
  suggestProteinFactor,
} from '../onboardingCalc';

beforeEach(() => {
  mockGetRecentSessionCount.mockReset();
});

// ---------------------------------------------------------------------------
// 1. calculateDailyTarget
// ---------------------------------------------------------------------------

describe('calculateDailyTarget', () => {
  it('maintenance (rate=0) returns tdee unchanged', () => {
    expect(
      calculateDailyTarget({ currentWeight: 70, weeklyRatePct: 0, tdee: 2500 }),
    ).toBe(2500);
  });

  it('cut (rate<0) subtracts a kcal deficit from tdee', () => {
    // 70kg × -0.5%/week = -0.35 kg/week × 7700 kcal/kg / 7 days
    //   = -385 kcal/day → 2500 - 385 = 2115
    expect(
      calculateDailyTarget({
        currentWeight: 70,
        weeklyRatePct: -0.5,
        tdee: 2500,
      }),
    ).toBe(2115);
  });

  it('bulk (rate>0) adds a kcal surplus to tdee', () => {
    // 70kg × +0.25%/week = +0.175 kg/week × 7700 / 7 = +192.5 →
    // Math.round(192.5) = 193 (JS rounds half toward +∞, NOT
    // banker's rounding). 2500 + 193 = 2693.
    const out = calculateDailyTarget({
      currentWeight: 70,
      weeklyRatePct: 0.25,
      tdee: 2500,
    });
    expect(out).toBe(2693);
  });

  it('aggressive cut (-1.0%) — Phase 6 deload-class deficit', () => {
    // 70kg × -1.0%/week = -0.7 kg/week × 7700 / 7 = -770 kcal/day
    // 2500 - 770 = 1730
    expect(
      calculateDailyTarget({
        currentWeight: 70,
        weeklyRatePct: -1.0,
        tdee: 2500,
      }),
    ).toBe(1730);
  });

  it('rounds to integer kcal (no fractional output)', () => {
    const out = calculateDailyTarget({
      currentWeight: 73,
      weeklyRatePct: -0.7,
      tdee: 2531,
    });
    expect(Number.isInteger(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. estimateTargetDate
// ---------------------------------------------------------------------------

const NOW = new Date('2026-05-10T12:00:00.000Z');

describe('estimateTargetDate', () => {
  it('returns weeks=0 when already at target (within ±0.5 kg)', () => {
    const out = estimateTargetDate({
      currentWeight: 70,
      targetWeight: 70.3,
      weeklyRatePct: -0.5,
      now: NOW,
    });
    expect(out.weeks).toBe(0);
    expect(out.date.getTime()).toBe(NOW.getTime());
  });

  it('canonical cut: 70kg → 65kg @ -0.5%/week', () => {
    const out = estimateTargetDate({
      currentWeight: 70,
      targetWeight: 65,
      weeklyRatePct: -0.5,
      now: NOW,
    });
    // Recursive geometric decay; cross-the-line short-circuit on
    // the first week where simulatedWeight ≤ 65. Weeks must be
    // a positive integer in a sane range.
    expect(out.weeks).toBeGreaterThan(0);
    expect(out.weeks).toBeLessThan(50);
    // Date is now + weeks*7 days.
    expect(out.date.getTime()).toBe(
      NOW.getTime() + out.weeks * 7 * 24 * 60 * 60 * 1000,
    );
  });

  it('canonical bulk: 65kg → 70kg @ +0.25%/week', () => {
    const out = estimateTargetDate({
      currentWeight: 65,
      targetWeight: 70,
      weeklyRatePct: 0.25,
      now: NOW,
    });
    expect(out.weeks).toBeGreaterThan(0);
    expect(out.weeks).toBeLessThan(100);
  });

  it('caps at MAX_WEEKS (520) for unreachable targets', () => {
    // weeklyRatePct < 0 with targetWeight > currentWeight: simulated
    // weight monotonically decreases, never reaches the higher
    // target. Loop runs to MAX_WEEKS.
    const out = estimateTargetDate({
      currentWeight: 70,
      targetWeight: 100,
      weeklyRatePct: -0.5,
      now: NOW,
    });
    expect(out.weeks).toBe(520);
  });

  it('maintenance (rate=0) with non-equal target caps immediately', () => {
    // Sign-off behavior: rate=0 + non-equal target is logically
    // unreachable; helper bails to MAX_WEEKS rather than infinite-
    // loop. Pin so the bail-out path doesn't drift.
    const out = estimateTargetDate({
      currentWeight: 70,
      targetWeight: 65,
      weeklyRatePct: 0,
      now: NOW,
    });
    expect(out.weeks).toBe(520);
  });

  it('does NOT mutate the caller-provided now Date', () => {
    const callerNow = new Date(NOW.getTime());
    const before = callerNow.getTime();
    estimateTargetDate({
      currentWeight: 70,
      targetWeight: 65,
      weeklyRatePct: -0.5,
      now: callerNow,
    });
    expect(callerNow.getTime()).toBe(before);
  });

  it('produces an integer weeks count', () => {
    const out = estimateTargetDate({
      currentWeight: 70,
      targetWeight: 65,
      weeklyRatePct: -0.5,
      now: NOW,
    });
    expect(Number.isInteger(out.weeks)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. calculatePFCTargetsByMealPlan
// ---------------------------------------------------------------------------

describe('calculatePFCTargetsByMealPlan', () => {
  // Common base: 70kg user, 2000 kcal target, 1.6 g/kg protein =
  // 112g protein × 4 kcal = 448 kcal protein. Remaining 1552 kcal
  // splits per mealPlan ratio.
  const baseInput = {
    dailyCalorie: 2000,
    currentWeight: 70,
    proteinFactor: 1.6,
  };

  it('balanced: F:C = 30/70 of remaining kcal', () => {
    const out = calculatePFCTargetsByMealPlan({
      ...baseInput,
      mealPlan: 'balanced',
    });
    expect(out.protein).toBe(112);
    // 1552 × 0.30 / 9 ≈ 51.7 → 52
    expect(out.fat).toBe(52);
    // 1552 × 0.70 / 4 ≈ 271.6 → 272
    expect(out.carbs).toBe(272);
  });

  it('washoku: F:C = 20/80 (carb-leaning Japanese)', () => {
    const out = calculatePFCTargetsByMealPlan({
      ...baseInput,
      mealPlan: 'washoku',
    });
    expect(out.protein).toBe(112);
    expect(out.fat).toBe(34); // 1552 × 0.20 / 9
    expect(out.carbs).toBe(310); // 1552 × 0.80 / 4
  });

  it('high_protein: F:C = 40/60', () => {
    const out = calculatePFCTargetsByMealPlan({
      ...baseInput,
      mealPlan: 'high_protein',
    });
    expect(out.fat).toBe(69);
    expect(out.carbs).toBe(233);
  });

  it('low_carb: F:C = 65/35', () => {
    const out = calculatePFCTargetsByMealPlan({
      ...baseInput,
      mealPlan: 'low_carb',
    });
    expect(out.fat).toBe(112);
    expect(out.carbs).toBe(136);
  });

  it('fasting: F:C = 35/65', () => {
    const out = calculatePFCTargetsByMealPlan({
      ...baseInput,
      mealPlan: 'fasting',
    });
    expect(out.fat).toBe(60);
    expect(out.carbs).toBe(252);
  });

  it('returns a 3-key Record (defensive full-shape, Phase 6 #8)', () => {
    const out = calculatePFCTargetsByMealPlan({
      ...baseInput,
      mealPlan: 'balanced',
    });
    expect(Object.keys(out).sort()).toEqual(['carbs', 'fat', 'protein']);
  });

  it('proteinKcal > dailyCalorie clamps fat/carbs to 0 (extreme deficit)', () => {
    // 70kg × 3.0 = 210g protein × 4 = 840 kcal protein. dailyCalorie
    // = 500 → remaining is negative. Clamp at 0.
    const out = calculatePFCTargetsByMealPlan({
      dailyCalorie: 500,
      currentWeight: 70,
      proteinFactor: 3.0,
      mealPlan: 'balanced',
    });
    expect(out.protein).toBe(210);
    expect(out.fat).toBe(0);
    expect(out.carbs).toBe(0);
  });

  it('dailyCalorie=0 returns all 0 (defensive degenerate)', () => {
    const out = calculatePFCTargetsByMealPlan({
      dailyCalorie: 0,
      currentWeight: 70,
      proteinFactor: 1.6,
      mealPlan: 'balanced',
    });
    expect(out).toEqual({ protein: 0, fat: 0, carbs: 0 });
  });

  it('dailyCalorie<0 returns all 0', () => {
    const out = calculatePFCTargetsByMealPlan({
      dailyCalorie: -100,
      currentWeight: 70,
      proteinFactor: 1.6,
      mealPlan: 'balanced',
    });
    expect(out).toEqual({ protein: 0, fat: 0, carbs: 0 });
  });
});

// ---------------------------------------------------------------------------
// 4. predictBodyComposition (Mealift-original sign-off § 8.6 pin)
// ---------------------------------------------------------------------------

describe('predictBodyComposition', () => {
  it('cut + 1.0 g/kg → fat ratio 0.6 (60% of loss is fat)', () => {
    // 70 → 65 = -5kg total. fatRatio=0.6. fatChange=-3, muscleChange=-2.
    // bodyFatPctChange = -3/70 × 100 × 0.5 ≈ -2.14 → -2.1
    const out = predictBodyComposition({
      currentWeight: 70,
      targetWeight: 65,
      proteinFactor: 1.0,
    });
    expect(out.bodyFatChange).toBeCloseTo(-2.1, 1);
    expect(out.muscleMassChange).toBe(-2.0);
  });

  it('cut + 1.6 g/kg → fat ratio 0.75 (75% fat = muscle-preserving)', () => {
    // -5kg × 0.75 = -3.75 fat, -1.25 muscle.
    // Math.round of -1.25 × 10 = Math.round(-12.5) = -12 (JS rounds
    // ties to +∞), so muscleMassChange = -1.2 not -1.3.
    const out = predictBodyComposition({
      currentWeight: 70,
      targetWeight: 65,
      proteinFactor: 1.6,
    });
    expect(out.muscleMassChange).toBe(-1.2);
  });

  it('cut + 2.2 g/kg → fat ratio 0.85 (85% fat = athlete tier)', () => {
    // -5kg × 0.15 (exact muscle ratio from
    // COMPOSITION_BY_PROTEIN_FACTOR lookup) = -0.75. Math.round of
    // -7.5 = -7 (JS rounds ties toward +∞), so muscleMassChange
    // = -0.7. Codex review pass 1 fix — the original
    // implementation derived muscle as `1 - fatRatio` which hit
    // FP noise (0.15000000000000002) and produced -0.8; the
    // pre-computed muscle ratio in the lookup table dodges that.
    const out = predictBodyComposition({
      currentWeight: 70,
      targetWeight: 65,
      proteinFactor: 2.2,
    });
    expect(out.muscleMassChange).toBe(-0.7);
  });

  it('cut + 3.0 g/kg → fat ratio 0.90 (max muscle preservation)', () => {
    const out = predictBodyComposition({
      currentWeight: 70,
      targetWeight: 65,
      proteinFactor: 3.0,
    });
    expect(out.muscleMassChange).toBeCloseTo(-0.5, 1);
  });

  it('maintenance (target = current) returns 0/0', () => {
    const out = predictBodyComposition({
      currentWeight: 70,
      targetWeight: 70,
      proteinFactor: 1.6,
    });
    expect(out.bodyFatChange).toBe(0);
    expect(out.muscleMassChange).toBe(0);
  });

  it('bulk (target > current) returns positive fat + muscle delta', () => {
    // 70 → 75 = +5kg. fatRatio=0.75 (1.6 protein). +3.75 fat, +1.25 muscle.
    const out = predictBodyComposition({
      currentWeight: 70,
      targetWeight: 75,
      proteinFactor: 1.6,
    });
    expect(out.bodyFatChange).toBeGreaterThan(0);
    expect(out.muscleMassChange).toBeCloseTo(1.3, 1);
  });

  it('rounds to 1 decimal (no fractional precision in display copy)', () => {
    const out = predictBodyComposition({
      currentWeight: 67.3,
      targetWeight: 64.1,
      proteinFactor: 2.2,
    });
    // bodyFatChange and muscleMassChange both should have at most 1
    // decimal digit.
    expect(Math.round(out.bodyFatChange * 10)).toBe(out.bodyFatChange * 10);
    expect(Math.round(out.muscleMassChange * 10)).toBe(
      out.muscleMassChange * 10,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. suggestProteinFactor (workout-frequency)
// ---------------------------------------------------------------------------

describe('suggestProteinFactor', () => {
  it('returns 1.0 fallback when count=0 (new user, no workouts)', async () => {
    mockGetRecentSessionCount.mockResolvedValueOnce(0);
    const out = await suggestProteinFactor('p1');
    expect(out.suggested).toBe(1.0);
    expect(out.reason).toContain('日常生活');
  });

  it('returns 1.6 for occasional trainer (count=1..5)', async () => {
    mockGetRecentSessionCount.mockResolvedValueOnce(3);
    const out = await suggestProteinFactor('p1');
    expect(out.suggested).toBe(1.6);
    expect(out.reason).toContain('少しずつ');
  });

  it('returns 1.6 for moderate trainer (count=6..11)', async () => {
    mockGetRecentSessionCount.mockResolvedValueOnce(8);
    const out = await suggestProteinFactor('p1');
    expect(out.suggested).toBe(1.6);
    expect(out.reason).toContain('適度');
  });

  it('returns 2.2 for high-frequency trainer (count>=12)', async () => {
    mockGetRecentSessionCount.mockResolvedValueOnce(15);
    const out = await suggestProteinFactor('p1');
    expect(out.suggested).toBe(2.2);
    expect(out.reason).toContain('高頻度');
  });

  it('does NOT auto-suggest 3.0 (athlete tier user-only opt-in)', async () => {
    // Even at extreme workout volumes, helper caps at 2.2. Sign-off
    // §8.7 — 3.0 is intentionally user-only (high-load tier).
    mockGetRecentSessionCount.mockResolvedValueOnce(50);
    const out = await suggestProteinFactor('p1');
    expect(out.suggested).toBe(2.2);
  });

  it('returns 1.0 fallback on DB error', async () => {
    mockGetRecentSessionCount.mockRejectedValueOnce(new Error('db locked'));
    const out = await suggestProteinFactor('p1');
    expect(out.suggested).toBe(1.0);
  });

  it('returns 1.0 fallback on NaN count (driver glitch defense)', async () => {
    mockGetRecentSessionCount.mockResolvedValueOnce(NaN);
    const out = await suggestProteinFactor('p1');
    expect(out.suggested).toBe(1.0);
  });

  it('returns 1.0 fallback on negative count', async () => {
    mockGetRecentSessionCount.mockResolvedValueOnce(-1);
    const out = await suggestProteinFactor('p1');
    expect(out.suggested).toBe(1.0);
  });

  it('passes 30-day window to getRecentSessionCount', async () => {
    mockGetRecentSessionCount.mockResolvedValueOnce(0);
    await suggestProteinFactor('p1');
    expect(mockGetRecentSessionCount).toHaveBeenCalledWith('p1', 30);
  });
});
