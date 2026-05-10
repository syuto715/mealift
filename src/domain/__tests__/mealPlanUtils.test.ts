// v1.3.0 / Onboarding v2 / Phase B-4 — pure-helper tests for the
// MealPlanCard component. Render tests deferred per Build 15+
// TODO 12 (no jest-expo / RNTL preset); the component's logic is
// covered through these helpers.
//
// mealPlanUtils imports onboardingCalc (for FC_RATIOS) which imports
// workoutRepository which pulls in expo-sqlite. Mock the DB-side
// imports so jest's CJS runtime doesn't choke on the ESM SQLite
// module — same pattern Phase 6.0 muscleRecoveryHours.test.ts and
// Phase B-3 paceSelectorUtils.test.ts established.
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../utils/id', () => ({ generateId: () => 'stub-id' }));

import {
  MEAL_PLAN_OPTIONS,
  getMealPlanLabel,
  getMealPlanDescription,
  getMealPlanIcon,
  getMealPlanPFCHint,
  isValidMealPlan,
  assertMealPlanCardProps,
  sanitizeMealPlanCardProps,
  FC_RATIOS,
} from '../mealPlanUtils';

// ---------------------------------------------------------------------------
// MEAL_PLAN_OPTIONS — sign-off pin
// ---------------------------------------------------------------------------

describe('MEAL_PLAN_OPTIONS', () => {
  it('exposes the 5 plans pinned by sign-off § Phase B-4', () => {
    expect([...MEAL_PLAN_OPTIONS]).toEqual([
      'balanced',
      'washoku',
      'high_protein',
      'low_carb',
      'fasting',
    ]);
  });
});

// ---------------------------------------------------------------------------
// getMealPlanLabel
// ---------------------------------------------------------------------------

describe('getMealPlanLabel', () => {
  it('returns Japanese label for each plan', () => {
    expect(getMealPlanLabel('balanced')).toBe('バランス型');
    expect(getMealPlanLabel('washoku')).toBe('和食型 ★');
    expect(getMealPlanLabel('high_protein')).toBe('高タンパク型');
    expect(getMealPlanLabel('low_carb')).toBe('低糖質型');
    expect(getMealPlanLabel('fasting')).toBe('ファスティング型');
  });

  it('washoku label carries the ★ Mealift Original flag', () => {
    // Sign-off § Phase B-4 §1 — washoku is the only option flagged
    // with ★ to differentiate Mealift's JP-market original from the
    // four orthodox international plans.
    expect(getMealPlanLabel('washoku')).toContain('★');
    expect(getMealPlanLabel('balanced')).not.toContain('★');
    expect(getMealPlanLabel('high_protein')).not.toContain('★');
    expect(getMealPlanLabel('low_carb')).not.toContain('★');
    expect(getMealPlanLabel('fasting')).not.toContain('★');
  });
});

// ---------------------------------------------------------------------------
// getMealPlanDescription
// ---------------------------------------------------------------------------

describe('getMealPlanDescription', () => {
  it('returns a non-empty description for every plan', () => {
    for (const plan of MEAL_PLAN_OPTIONS) {
      expect(getMealPlanDescription(plan).length).toBeGreaterThan(0);
    }
  });

  it('descriptions are distinct (no copy-paste collisions)', () => {
    const descs = MEAL_PLAN_OPTIONS.map(getMealPlanDescription);
    expect(new Set(descs).size).toBe(descs.length);
  });
});

// ---------------------------------------------------------------------------
// getMealPlanIcon
// ---------------------------------------------------------------------------

describe('getMealPlanIcon', () => {
  it('returns a non-empty emoji icon for every plan', () => {
    for (const plan of MEAL_PLAN_OPTIONS) {
      expect(getMealPlanIcon(plan).length).toBeGreaterThan(0);
    }
  });

  it('icons are distinct per plan (visual disambiguation)', () => {
    const icons = MEAL_PLAN_OPTIONS.map(getMealPlanIcon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

// ---------------------------------------------------------------------------
// getMealPlanPFCHint
// ---------------------------------------------------------------------------

describe('getMealPlanPFCHint', () => {
  it('returns the sign-off § Phase B-4 §1 mapping verbatim', () => {
    expect(getMealPlanPFCHint('balanced')).toEqual({
      protein: 'mid',
      fat: 'mid',
      carb: 'mid',
    });
    expect(getMealPlanPFCHint('washoku')).toEqual({
      protein: 'mid',
      fat: 'low',
      carb: 'high',
    });
    expect(getMealPlanPFCHint('high_protein')).toEqual({
      protein: 'high',
      fat: 'mid',
      carb: 'low',
    });
    expect(getMealPlanPFCHint('low_carb')).toEqual({
      protein: 'high',
      fat: 'high',
      carb: 'low',
    });
    expect(getMealPlanPFCHint('fasting')).toEqual({
      protein: 'mid',
      fat: 'mid',
      carb: 'mid',
    });
  });

  // Pattern 18 cross-check: keep the qualitative hints in lockstep
  // with FC_RATIOS so any future onboardingCalc ratio retune that
  // changes the *ordering* of plans surfaces as a test failure here.
  // We only assert *unambiguous* relative orderings — the hint table
  // is UX-intent-driven (e.g., balanced is mid/mid/mid even though
  // its carb ratio is numerically 0.7), so we don't pin per-plan
  // levels against absolute FC thresholds.
  it('hint.fat ordering preserves FC_RATIOS.fat ordering for unambiguous pairs', () => {
    // washoku has the lowest fat ratio (0.20); low_carb has the
    // highest (0.65). The qualitative hint must reflect that:
    //   washoku.fat ('low') < low_carb.fat ('high').
    expect(FC_RATIOS.washoku.fat).toBeLessThan(FC_RATIOS.low_carb.fat);
    const fatLevelOrder: Record<'low' | 'mid' | 'high', number> = {
      low: 0,
      mid: 1,
      high: 2,
    };
    expect(
      fatLevelOrder[getMealPlanPFCHint('washoku').fat],
    ).toBeLessThan(fatLevelOrder[getMealPlanPFCHint('low_carb').fat]);
  });

  it('hint.carb ordering preserves FC_RATIOS.carbs ordering for unambiguous pairs', () => {
    // washoku has the highest carb ratio (0.80); low_carb the lowest
    // (0.35). Qualitative hint must mirror: washoku 'high' >
    // low_carb 'low'.
    expect(FC_RATIOS.washoku.carbs).toBeGreaterThan(FC_RATIOS.low_carb.carbs);
    const carbLevelOrder: Record<'low' | 'mid' | 'high', number> = {
      low: 0,
      mid: 1,
      high: 2,
    };
    expect(
      carbLevelOrder[getMealPlanPFCHint('washoku').carb],
    ).toBeGreaterThan(carbLevelOrder[getMealPlanPFCHint('low_carb').carb]);
  });

  it('every plan in MEAL_PLAN_OPTIONS has a PFC hint', () => {
    // Total-coverage guard — Record<MealPlan, PFCHint> already
    // enforces this at compile time but the assertion documents the
    // expectation and protects against runtime additions.
    for (const plan of MEAL_PLAN_OPTIONS) {
      const hint = getMealPlanPFCHint(plan);
      expect(hint).toBeDefined();
      expect(['low', 'mid', 'high']).toContain(hint.protein);
      expect(['low', 'mid', 'high']).toContain(hint.fat);
      expect(['low', 'mid', 'high']).toContain(hint.carb);
    }
  });
});

// ---------------------------------------------------------------------------
// isValidMealPlan
// ---------------------------------------------------------------------------

describe('isValidMealPlan', () => {
  it('returns true for every option in MEAL_PLAN_OPTIONS', () => {
    for (const plan of MEAL_PLAN_OPTIONS) {
      expect(isValidMealPlan(plan)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isValidMealPlan('keto')).toBe(false);
    expect(isValidMealPlan('')).toBe(false);
    expect(isValidMealPlan('Balanced')).toBe(false); // case-sensitive
    expect(isValidMealPlan('BALANCED')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertMealPlanCardProps — caller-misuse fail-fast (Pattern 28 dev path)
// ---------------------------------------------------------------------------

describe('assertMealPlanCardProps', () => {
  const validInput = {
    value: 'balanced' as const,
    options: MEAL_PLAN_OPTIONS,
  };

  it('passes through for valid input', () => {
    expect(() => assertMealPlanCardProps(validInput)).not.toThrow();
  });

  it('null value is permitted (unselected initial state)', () => {
    expect(() =>
      assertMealPlanCardProps({ ...validInput, value: null }),
    ).not.toThrow();
  });

  it('throws on empty options array', () => {
    expect(() =>
      assertMealPlanCardProps({ ...validInput, options: [] }),
    ).toThrow(/options must not be empty/);
  });

  it('throws on duplicate options', () => {
    expect(() =>
      assertMealPlanCardProps({
        value: 'balanced',
        options: ['balanced', 'balanced', 'washoku'],
      }),
    ).toThrow(/duplicate option/);
  });

  it('throws on non-MealPlan option (cast escape)', () => {
    expect(() =>
      assertMealPlanCardProps({
        value: null,
        // @ts-expect-error — simulating a runtime cast that bypasses TS.
        options: ['balanced', 'keto'],
      }),
    ).toThrow(/not a valid MealPlan/);
  });

  it('throws on value not in options', () => {
    expect(() =>
      assertMealPlanCardProps({
        value: 'fasting',
        options: ['balanced', 'washoku'],
      }),
    ).toThrow(/not in options/);
  });
});

// ---------------------------------------------------------------------------
// sanitizeMealPlanCardProps — Pattern 28 production-safe path
// ---------------------------------------------------------------------------

describe('sanitizeMealPlanCardProps', () => {
  it('passes valid input through unchanged', () => {
    const out = sanitizeMealPlanCardProps({
      value: 'balanced',
      options: MEAL_PLAN_OPTIONS,
    });
    expect(out.value).toBe('balanced');
    expect([...out.options]).toEqual([...MEAL_PLAN_OPTIONS]);
  });

  it('falls back to MEAL_PLAN_OPTIONS on empty options', () => {
    const out = sanitizeMealPlanCardProps({
      value: null,
      options: [],
    });
    expect([...out.options]).toEqual([...MEAL_PLAN_OPTIONS]);
  });

  it('dedupes options + drops invalid entries', () => {
    const out = sanitizeMealPlanCardProps({
      value: null,
      // @ts-expect-error — simulating a runtime cast that bypasses TS.
      options: ['balanced', 'balanced', 'keto', 'washoku', ''],
    });
    expect([...out.options]).toEqual(['balanced', 'washoku']);
  });

  it('drops out-of-options value to null', () => {
    const out = sanitizeMealPlanCardProps({
      value: 'fasting',
      options: ['balanced', 'washoku'],
    });
    expect(out.value).toBeNull();
  });

  it('preserves a value that survives the deduplication', () => {
    const out = sanitizeMealPlanCardProps({
      value: 'balanced',
      options: ['balanced', 'balanced', 'washoku'],
    });
    expect(out.value).toBe('balanced');
    expect([...out.options]).toEqual(['balanced', 'washoku']);
  });

  it('falls back to MEAL_PLAN_OPTIONS when all options are invalid', () => {
    const out = sanitizeMealPlanCardProps({
      value: 'balanced',
      // @ts-expect-error — simulating a runtime cast that bypasses TS.
      options: ['keto', '', 'paleo'],
    });
    expect([...out.options]).toEqual([...MEAL_PLAN_OPTIONS]);
    // value 'balanced' IS in the fallback options, so it survives.
    expect(out.value).toBe('balanced');
  });
});
