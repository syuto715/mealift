// v1.3.0 / Onboarding v2 / Phase D-3 — pure-helper tests for the
// [7] meal-timing screen.

import {
  MEAL_TIMING_OPTIONS,
  formatSelectedCountLabel,
  getMealTimingDescription,
  getMealTimingLabel,
  getMealTimingsErrorMessage,
  isAllInputsValidForD3,
  isValidMealTiming,
  toggleSelection,
  validateMealTimings,
} from '../mealTimingUtils';

// ---------------------------------------------------------------------------
// MEAL_TIMING_OPTIONS — sign-off pin
// ---------------------------------------------------------------------------

describe('MEAL_TIMING_OPTIONS', () => {
  it('orders chronologically (breakfast..late_night)', () => {
    expect([...MEAL_TIMING_OPTIONS]).toEqual([
      'breakfast',
      'lunch',
      'snack',
      'dinner',
      'late_night',
    ]);
  });
});

// ---------------------------------------------------------------------------
// isValidMealTiming
// ---------------------------------------------------------------------------

describe('isValidMealTiming', () => {
  it('true for each of the 5 options', () => {
    for (const t of MEAL_TIMING_OPTIONS) {
      expect(isValidMealTiming(t)).toBe(true);
    }
  });

  it('false for non-MealTiming strings', () => {
    expect(isValidMealTiming('brunch')).toBe(false);
    expect(isValidMealTiming('Breakfast')).toBe(false); // case
    expect(isValidMealTiming('')).toBe(false);
  });

  it('false for non-string inputs', () => {
    expect(isValidMealTiming(null)).toBe(false);
    expect(isValidMealTiming(undefined)).toBe(false);
    expect(isValidMealTiming(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMealTimingLabel / Description
// ---------------------------------------------------------------------------

describe('getMealTimingLabel / Description', () => {
  it('returns non-empty JP strings for every option', () => {
    for (const t of MEAL_TIMING_OPTIONS) {
      expect(getMealTimingLabel(t).length).toBeGreaterThan(0);
      expect(getMealTimingDescription(t).length).toBeGreaterThan(0);
    }
  });

  it('labels distinct (no copy-paste collisions)', () => {
    const labels = MEAL_TIMING_OPTIONS.map(getMealTimingLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('descriptions distinct', () => {
    const descs = MEAL_TIMING_OPTIONS.map(getMealTimingDescription);
    expect(new Set(descs).size).toBe(descs.length);
  });
});

// ---------------------------------------------------------------------------
// validateMealTimings
// ---------------------------------------------------------------------------

describe('validateMealTimings', () => {
  it('empty array → empty', () => {
    expect(validateMealTimings([])).toEqual({
      valid: false,
      reason: 'empty',
    });
  });

  it('non-array (defensive) → empty', () => {
    // @ts-expect-error — exercising the runtime cast escape.
    expect(validateMealTimings(null).valid).toBe(false);
    // @ts-expect-error — exercising the runtime cast escape.
    expect(validateMealTimings('breakfast').valid).toBe(false);
  });

  it('valid single → valid + sanitized identical', () => {
    expect(validateMealTimings(['breakfast'])).toEqual({
      valid: true,
      sanitized: ['breakfast'],
    });
  });

  it('sorts to canonical MEAL_TIMING_OPTIONS order', () => {
    const out = validateMealTimings(['dinner', 'breakfast', 'lunch']);
    expect(out).toEqual({
      valid: true,
      sanitized: ['breakfast', 'lunch', 'dinner'],
    });
  });

  it('all 5 valid → returns all 5 in canonical order', () => {
    const reversed = [...MEAL_TIMING_OPTIONS].reverse();
    const out = validateMealTimings(reversed);
    expect(out).toEqual({
      valid: true,
      sanitized: [...MEAL_TIMING_OPTIONS],
    });
  });

  it('duplicate value → duplicate', () => {
    expect(validateMealTimings(['breakfast', 'breakfast'])).toEqual({
      valid: false,
      reason: 'duplicate',
    });
  });

  it('non-MealTiming value → invalid_value', () => {
    expect(validateMealTimings(['breakfast', 'brunch'])).toEqual({
      valid: false,
      reason: 'invalid_value',
    });
  });
});

// ---------------------------------------------------------------------------
// isAllInputsValidForD3
// ---------------------------------------------------------------------------

describe('isAllInputsValidForD3', () => {
  it('null → false', () => {
    expect(isAllInputsValidForD3(null)).toBe(false);
  });

  it('empty array → false (validation requires 1+)', () => {
    expect(isAllInputsValidForD3([])).toBe(false);
  });

  it('valid single → true', () => {
    expect(isAllInputsValidForD3(['breakfast'])).toBe(true);
  });

  it('invalid value short-circuits → false', () => {
    expect(isAllInputsValidForD3(['breakfast', 'brunch'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggleSelection
// ---------------------------------------------------------------------------

describe('toggleSelection', () => {
  it('adds a missing timing in canonical order', () => {
    expect(toggleSelection(['lunch'], 'breakfast')).toEqual([
      'breakfast',
      'lunch',
    ]);
  });

  it('removes an existing timing', () => {
    expect(toggleSelection(['breakfast', 'lunch'], 'breakfast')).toEqual([
      'lunch',
    ]);
  });

  it('toggle round-trip restores original shape', () => {
    const initial = ['breakfast', 'lunch'] as const;
    const afterAdd = toggleSelection(initial, 'dinner');
    expect(afterAdd).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(toggleSelection(afterAdd, 'dinner')).toEqual([...initial]);
  });

  it('adds to empty', () => {
    expect(toggleSelection([], 'snack')).toEqual(['snack']);
  });
});

// ---------------------------------------------------------------------------
// formatSelectedCountLabel
// ---------------------------------------------------------------------------

describe('formatSelectedCountLabel', () => {
  it('0 → "選択してください"', () => {
    expect(formatSelectedCountLabel(0)).toBe('選択してください');
  });

  it('1 → "1 件選択中"', () => {
    expect(formatSelectedCountLabel(1)).toBe('1 件選択中');
  });

  it('5 → "5 件選択中"', () => {
    expect(formatSelectedCountLabel(5)).toBe('5 件選択中');
  });

  it('negative / non-finite → fallback prompt', () => {
    expect(formatSelectedCountLabel(-1)).toBe('選択してください');
    expect(formatSelectedCountLabel(NaN)).toBe('選択してください');
  });
});

// ---------------------------------------------------------------------------
// getMealTimingsErrorMessage
// ---------------------------------------------------------------------------

describe('getMealTimingsErrorMessage', () => {
  it('returns distinct non-empty JP messages for each reason', () => {
    const empty = getMealTimingsErrorMessage('empty');
    const invalid = getMealTimingsErrorMessage('invalid_value');
    const dup = getMealTimingsErrorMessage('duplicate');
    expect(new Set([empty, invalid, dup]).size).toBe(3);
    expect(empty.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
    expect(dup.length).toBeGreaterThan(0);
  });
});
