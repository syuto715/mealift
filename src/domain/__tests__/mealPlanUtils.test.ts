// v1.3.0 / Onboarding v2 / Phase B-4 — pure-helper tests for the
// MealPlanCard component. Render tests deferred per Build 15+
// TODO 12 (no jest-expo / RNTL preset); the component's logic is
// covered through these helpers.
//
// FC_RATIOS is the canonical fat/carb ratio table; we import it
// here directly from onboardingCalc to cross-check the qualitative
// PFC hints. mealPlanUtils itself does NOT depend on onboardingCalc
// (Codex pass 1 / Important #2 — keeping the render helper free of
// SQLite-pulling imports). The test file pays the DB-mock cost
// because it bridges the two layers; the production layer doesn't.
//
// onboardingCalc → workoutRepository → expo-sqlite chain, hence the
// CJS shims — same pattern Phase 6.0 muscleRecoveryHours.test.ts and
// Phase B-3 paceSelectorUtils.test.ts established.
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../utils/id', () => ({ generateId: () => 'stub-id' }));

import {
  MEAL_PLAN_OPTIONS,
  type PFCLevel,
  getMealPlanLabel,
  getMealPlanDescription,
  getMealPlanIcon,
  getMealPlanPFCHint,
  isValidMealPlan,
  assertMealPlanCardProps,
  sanitizeMealPlanCardProps,
  formatPFCAccessibilityLabel,
} from '../mealPlanUtils';
import { FC_RATIOS } from '../onboardingCalc';

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
  //
  // Codex pass 1 / Important #3 — the original cross-check only
  // pinned the two extreme pairs (washoku vs low_carb), leaving
  // many plausible regressions uncaught (e.g., flipping
  // balanced.fat from 'mid' to 'high' would still pass with just
  // the endpoint check). The expanded loop iterates over every
  // unordered pair with a strict FC_RATIOS difference and asserts
  // the qualitative bucket ordering is monotonic — ties are
  // allowed because the 3-bucket low/mid/high resolution can't
  // distinguish all 5 numeric ratios.
  const LEVEL_ORDER: Record<PFCLevel, number> = {
    low: 0,
    mid: 1,
    high: 2,
  };

  it('hint.fat ordering is monotonic with FC_RATIOS.fat across all pairs', () => {
    for (const a of MEAL_PLAN_OPTIONS) {
      for (const b of MEAL_PLAN_OPTIONS) {
        if (a === b) continue;
        if (FC_RATIOS[a].fat < FC_RATIOS[b].fat) {
          expect(
            LEVEL_ORDER[getMealPlanPFCHint(a).fat],
          ).toBeLessThanOrEqual(
            LEVEL_ORDER[getMealPlanPFCHint(b).fat],
          );
        }
      }
    }
  });

  it('hint.carb ordering is monotonic with FC_RATIOS.carbs across all pairs', () => {
    for (const a of MEAL_PLAN_OPTIONS) {
      for (const b of MEAL_PLAN_OPTIONS) {
        if (a === b) continue;
        if (FC_RATIOS[a].carbs < FC_RATIOS[b].carbs) {
          expect(
            LEVEL_ORDER[getMealPlanPFCHint(a).carb],
          ).toBeLessThanOrEqual(
            LEVEL_ORDER[getMealPlanPFCHint(b).carb],
          );
        }
      }
    }
  });

  it('endpoint pairs use distinct buckets (not all collapsed to mid)', () => {
    // Sanity guard — monotonicity alone allows the trivial
    // all-'mid' table to pass. Pin the extremes so the cross-check
    // can't be silently weakened.
    expect(getMealPlanPFCHint('washoku').fat).toBe('low');
    expect(getMealPlanPFCHint('low_carb').fat).toBe('high');
    expect(getMealPlanPFCHint('washoku').carb).toBe('high');
    expect(getMealPlanPFCHint('low_carb').carb).toBe('low');
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
// formatPFCAccessibilityLabel — Codex pass 1 / Important #1
// ---------------------------------------------------------------------------

describe('formatPFCAccessibilityLabel', () => {
  it('spells out macro names + level so VoiceOver reads cleanly', () => {
    // iOS VoiceOver reads "P" as "ピー" by default; spelling out
    // タンパク質 / 脂質 / 糖質 + 低/中/高 is the only safe form.
    expect(formatPFCAccessibilityLabel('balanced')).toBe(
      'タンパク質中 脂質中 糖質中',
    );
    expect(formatPFCAccessibilityLabel('washoku')).toBe(
      'タンパク質中 脂質低 糖質高',
    );
    expect(formatPFCAccessibilityLabel('high_protein')).toBe(
      'タンパク質高 脂質中 糖質低',
    );
    expect(formatPFCAccessibilityLabel('low_carb')).toBe(
      'タンパク質高 脂質高 糖質低',
    );
    expect(formatPFCAccessibilityLabel('fasting')).toBe(
      'タンパク質中 脂質中 糖質中',
    );
  });

  it('produces non-empty output for every plan', () => {
    for (const plan of MEAL_PLAN_OPTIONS) {
      const label = formatPFCAccessibilityLabel(plan);
      expect(label).toMatch(/タンパク質/);
      expect(label).toMatch(/脂質/);
      expect(label).toMatch(/糖質/);
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
