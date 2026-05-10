// v1.3.0 / Onboarding v2 / Phase A-3 Codex pass 1 / Important #3 —
// trust-boundary defense tests for the v30 narrow helpers and
// parseJsonArrayOrNull. These helpers are the only runtime barrier
// between sync-poisoned / hand-edited row values and the typed
// Profile interface; covering them directly catches regressions
// that rowToProfile-only tests would miss.

jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../../../utils/id', () => ({ generateId: () => 'stub-id' }));

import {
  narrowWeeklyRatePct,
  narrowMealPlan,
  narrowProteinFactor,
  narrowWeeklyDistribution,
  parseJsonArrayOrNull,
} from '../profileRepository';

describe('narrowWeeklyRatePct', () => {
  it.each([-1.0, -0.7, -0.5, -0.25, 0, 0.25])(
    'accepts the in-domain value %p',
    (v) => {
      expect(narrowWeeklyRatePct(v)).toBe(v);
    },
  );

  it.each([-1.5, -0.6, 0.5, 1.0, 100])(
    'rejects out-of-domain numeric %p',
    (v) => {
      expect(narrowWeeklyRatePct(v)).toBeNull();
    },
  );

  it('rejects non-numeric (string / null / undefined / object)', () => {
    expect(narrowWeeklyRatePct('-0.5')).toBeNull();
    expect(narrowWeeklyRatePct(null)).toBeNull();
    expect(narrowWeeklyRatePct(undefined)).toBeNull();
    expect(narrowWeeklyRatePct({})).toBeNull();
  });
});

describe('narrowMealPlan', () => {
  it.each(['balanced', 'washoku', 'high_protein', 'low_carb', 'fasting'])(
    'accepts the in-domain literal %p',
    (v) => {
      expect(narrowMealPlan(v)).toBe(v);
    },
  );

  it.each(['Balanced', 'WASHOKU', 'keto', '', 'high-protein'])(
    'rejects unknown literal %p',
    (v) => {
      expect(narrowMealPlan(v)).toBeNull();
    },
  );

  it('rejects non-string (number / null / array)', () => {
    expect(narrowMealPlan(0)).toBeNull();
    expect(narrowMealPlan(null)).toBeNull();
    expect(narrowMealPlan(['balanced'])).toBeNull();
  });
});

describe('narrowProteinFactor', () => {
  it.each([1.0, 1.6, 2.2, 3.0])('accepts the in-domain value %p', (v) => {
    expect(narrowProteinFactor(v)).toBe(v);
  });

  it.each([0.5, 1.5, 2.5, 4.0])('rejects out-of-domain numeric %p', (v) => {
    expect(narrowProteinFactor(v)).toBeNull();
  });

  it('rejects non-numeric (string / null)', () => {
    expect(narrowProteinFactor('1.6')).toBeNull();
    expect(narrowProteinFactor(null)).toBeNull();
  });
});

describe('narrowWeeklyDistribution', () => {
  it('accepts "even"', () => {
    expect(narrowWeeklyDistribution('even')).toBe('even');
  });

  it('accepts "cheat_days"', () => {
    expect(narrowWeeklyDistribution('cheat_days')).toBe('cheat_days');
  });

  it.each(['EVEN', 'cheat-days', 'cheat days', '', 0, null])(
    'rejects unknown / non-string %p',
    (v) => {
      expect(narrowWeeklyDistribution(v)).toBeNull();
    },
  );
});

describe('parseJsonArrayOrNull — mealTimings (string predicate)', () => {
  const isString = (x: unknown): x is string => typeof x === 'string';

  it('returns null on null / undefined input (un-set column)', () => {
    expect(parseJsonArrayOrNull(null, isString)).toBeNull();
    expect(parseJsonArrayOrNull(undefined, isString)).toBeNull();
  });

  it('returns null on non-string input (numeric / object)', () => {
    expect(parseJsonArrayOrNull(42, isString)).toBeNull();
    expect(parseJsonArrayOrNull({}, isString)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseJsonArrayOrNull('{not-json', isString)).toBeNull();
    expect(parseJsonArrayOrNull('"breakfast"', isString)).toBeNull(); // scalar JSON
    expect(parseJsonArrayOrNull('null', isString)).toBeNull();
    expect(parseJsonArrayOrNull('{"a":1}', isString)).toBeNull(); // object JSON
  });

  it('parses a valid string array', () => {
    expect(
      parseJsonArrayOrNull('["breakfast","lunch","dinner"]', isString),
    ).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('parses an empty array', () => {
    expect(parseJsonArrayOrNull('[]', isString)).toEqual([]);
  });

  it('FILTERS (not rejects) item-level corruption — Phase 4.2 convention', () => {
    // Codex pass 1 / Important #2 (REJECT, design choice): partial
    // preservation beats "invalid → null re-pick all" for UX. Pin
    // the behavior so a future drift to all-or-nothing is caught.
    expect(
      parseJsonArrayOrNull('["breakfast",123,"dinner"]', isString),
    ).toEqual(['breakfast', 'dinner']);
  });
});

describe('parseJsonArrayOrNull — cheatDays (integer 0-6 predicate)', () => {
  const isWeekdayIndex = (x: unknown): x is number =>
    typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 6;

  it('parses a valid weekday-index array', () => {
    expect(parseJsonArrayOrNull('[0,6]', isWeekdayIndex)).toEqual([0, 6]);
    expect(parseJsonArrayOrNull('[3]', isWeekdayIndex)).toEqual([3]);
  });

  it('drops out-of-range integers', () => {
    expect(parseJsonArrayOrNull('[0,7,3]', isWeekdayIndex)).toEqual([0, 3]);
    expect(parseJsonArrayOrNull('[-1,3]', isWeekdayIndex)).toEqual([3]);
  });

  it('drops floats', () => {
    expect(parseJsonArrayOrNull('[0,1.5,3]', isWeekdayIndex)).toEqual([0, 3]);
  });

  it('drops NaN / Infinity (Number.isInteger excludes both)', () => {
    // JSON.parse can't produce NaN or Infinity directly, but a
    // future producer / hand-edit could yield them via separate
    // path. The predicate's Number.isInteger excludes both.
    const isInteger = (x: unknown): x is number =>
      typeof x === 'number' && Number.isInteger(x);
    // Direct call to verify the predicate behavior.
    expect(isInteger(NaN)).toBe(false);
    expect(isInteger(Infinity)).toBe(false);
    expect(isInteger(-Infinity)).toBe(false);
  });

  it('returns [] when JSON parses to a valid array of all-invalid items', () => {
    expect(parseJsonArrayOrNull('[7,8,-1]', isWeekdayIndex)).toEqual([]);
  });
});
