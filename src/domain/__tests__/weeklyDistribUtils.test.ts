// v1.3.0 / Onboarding v2 / Phase D-5 — pure-helper tests for the
// [9] weekly-distribution screen.

import {
  CHEAT_DAYS_MAX,
  DAY_OF_WEEK_OPTIONS,
  WEEKLY_DISTRIBUTION_OPTIONS,
  formatCheatDaysCountLabel,
  getCheatDaysErrorMessage,
  getDayOfWeekLabel,
  getDistributionDescription,
  getDistributionLabel,
  isAllInputsValidForD5,
  isValidDayOfWeek,
  isValidWeeklyDistribution,
  toggleCheatDay,
  validateCheatDays,
} from '../weeklyDistribUtils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('WEEKLY_DISTRIBUTION_OPTIONS', () => {
  it('exposes even / cheat_days in order', () => {
    expect([...WEEKLY_DISTRIBUTION_OPTIONS]).toEqual(['even', 'cheat_days']);
  });
});

describe('DAY_OF_WEEK_OPTIONS', () => {
  it('exposes 0..6 (0=Sun..6=Sat per Profile schema)', () => {
    expect([...DAY_OF_WEEK_OPTIONS]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('CHEAT_DAYS_MAX = 3', () => {
    expect(CHEAT_DAYS_MAX).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// isValidWeeklyDistribution / isValidDayOfWeek
// ---------------------------------------------------------------------------

describe('isValidWeeklyDistribution', () => {
  it('true for the 2 options', () => {
    expect(isValidWeeklyDistribution('even')).toBe(true);
    expect(isValidWeeklyDistribution('cheat_days')).toBe(true);
  });

  it('false for non-distribution strings / non-strings', () => {
    expect(isValidWeeklyDistribution('Even')).toBe(false);
    expect(isValidWeeklyDistribution('')).toBe(false);
    expect(isValidWeeklyDistribution(null)).toBe(false);
    expect(isValidWeeklyDistribution(0)).toBe(false);
  });
});

describe('isValidDayOfWeek', () => {
  it('true for 0..6', () => {
    for (const d of DAY_OF_WEEK_OPTIONS) {
      expect(isValidDayOfWeek(d)).toBe(true);
    }
  });

  it('false for out-of-range / non-integer / non-number', () => {
    expect(isValidDayOfWeek(-1)).toBe(false);
    expect(isValidDayOfWeek(7)).toBe(false);
    expect(isValidDayOfWeek(1.5)).toBe(false);
    expect(isValidDayOfWeek('1')).toBe(false);
    expect(isValidDayOfWeek(null)).toBe(false);
    expect(isValidDayOfWeek(NaN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

describe('Distribution + Day labels', () => {
  it('returns non-empty JP strings for every option', () => {
    for (const d of WEEKLY_DISTRIBUTION_OPTIONS) {
      expect(getDistributionLabel(d).length).toBeGreaterThan(0);
      expect(getDistributionDescription(d).length).toBeGreaterThan(0);
    }
    for (const d of DAY_OF_WEEK_OPTIONS) {
      expect(getDayOfWeekLabel(d).length).toBeGreaterThan(0);
    }
  });

  it('day labels align with 0=Sun convention (日/月/火/水/木/金/土)', () => {
    expect(getDayOfWeekLabel(0)).toBe('日');
    expect(getDayOfWeekLabel(1)).toBe('月');
    expect(getDayOfWeekLabel(6)).toBe('土');
  });
});

// ---------------------------------------------------------------------------
// validateCheatDays
// ---------------------------------------------------------------------------

describe('validateCheatDays', () => {
  it('empty array → empty', () => {
    expect(validateCheatDays([])).toEqual({ valid: false, reason: 'empty' });
  });

  it('non-array (defensive) → empty', () => {
    // @ts-expect-error — exercising runtime cast escape.
    expect(validateCheatDays(null).valid).toBe(false);
  });

  it('valid single → valid + sanitized identical', () => {
    expect(validateCheatDays([3])).toEqual({
      valid: true,
      sanitized: [3],
    });
  });

  it('sorts to canonical DAY_OF_WEEK_OPTIONS order', () => {
    expect(validateCheatDays([5, 1, 3])).toEqual({
      valid: true,
      sanitized: [1, 3, 5],
    });
  });

  it('over CHEAT_DAYS_MAX → too_many', () => {
    expect(validateCheatDays([0, 1, 2, 3])).toEqual({
      valid: false,
      reason: 'too_many',
    });
  });

  it('duplicate → duplicate', () => {
    expect(validateCheatDays([0, 0])).toEqual({
      valid: false,
      reason: 'duplicate',
    });
  });

  it('non-DayOfWeek value → invalid_value', () => {
    expect(validateCheatDays([7])).toEqual({
      valid: false,
      reason: 'invalid_value',
    });
    expect(validateCheatDays([-1])).toEqual({
      valid: false,
      reason: 'invalid_value',
    });
  });

  // Pattern 18 補強 canonical view regression (D-3 mealTimings
  // precedent extended here) — every valid input produces a
  // monotonically-sorted sanitized array.
  it('sanitized is always DAY_OF_WEEK_OPTIONS-ordered for valid input', () => {
    const cases: number[][] = [
      [6, 0],
      [3, 1, 5],
      [4, 2],
    ];
    for (const input of cases) {
      const out = validateCheatDays(input);
      expect(out.valid).toBe(true);
      if (out.valid) {
        for (let i = 1; i < out.sanitized.length; i++) {
          expect(out.sanitized[i]).toBeGreaterThan(out.sanitized[i - 1]);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isAllInputsValidForD5
// ---------------------------------------------------------------------------

describe('isAllInputsValidForD5', () => {
  it('null distribution → false', () => {
    expect(isAllInputsValidForD5(null, [3])).toBe(false);
  });

  it('even + null cheatDays → true (no cheat days needed)', () => {
    expect(isAllInputsValidForD5('even', null)).toBe(true);
  });

  it('even + empty cheatDays → true (still no cheat days)', () => {
    expect(isAllInputsValidForD5('even', [])).toBe(true);
  });

  it('cheat_days + null cheatDays → false (need selection)', () => {
    expect(isAllInputsValidForD5('cheat_days', null)).toBe(false);
  });

  it('cheat_days + empty cheatDays → false', () => {
    expect(isAllInputsValidForD5('cheat_days', [])).toBe(false);
  });

  it('cheat_days + valid cheatDays → true', () => {
    expect(isAllInputsValidForD5('cheat_days', [1, 3])).toBe(true);
  });

  it('cheat_days + invalid cheatDays (over cap) → false', () => {
    expect(isAllInputsValidForD5('cheat_days', [0, 1, 2, 3])).toBe(false);
  });

  it('invalid distribution cast → false', () => {
    // @ts-expect-error — exercising runtime cast escape.
    expect(isAllInputsValidForD5('weekend_only', [1])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggleCheatDay
// ---------------------------------------------------------------------------

describe('toggleCheatDay', () => {
  it('adds missing day in canonical order', () => {
    expect(toggleCheatDay([3], 1)).toEqual([1, 3]);
  });

  it('removes existing day', () => {
    expect(toggleCheatDay([1, 3, 5], 3)).toEqual([1, 5]);
  });

  it('round-trip restores original shape', () => {
    const initial = [1, 3] as const;
    const afterAdd = toggleCheatDay(initial, 5);
    expect(afterAdd).toEqual([1, 3, 5]);
    expect(toggleCheatDay(afterAdd, 5)).toEqual([...initial]);
  });

  it('add to empty', () => {
    expect(toggleCheatDay([], 0)).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// formatCheatDaysCountLabel
// ---------------------------------------------------------------------------

describe('formatCheatDaysCountLabel', () => {
  it('0 → fallback prompt', () => {
    expect(formatCheatDaysCountLabel(0)).toBe('選択してください');
  });

  it('1-2 → standard count', () => {
    expect(formatCheatDaysCountLabel(1)).toBe('1 件選択中');
    expect(formatCheatDaysCountLabel(2)).toBe('2 件選択中');
  });

  it('3 (cap) → count + 上限 marker', () => {
    expect(formatCheatDaysCountLabel(3)).toBe('3 件選択中（上限）');
  });

  it('negative / non-finite → fallback', () => {
    expect(formatCheatDaysCountLabel(-1)).toBe('選択してください');
    expect(formatCheatDaysCountLabel(NaN)).toBe('選択してください');
  });
});

// ---------------------------------------------------------------------------
// getCheatDaysErrorMessage
// ---------------------------------------------------------------------------

describe('getCheatDaysErrorMessage', () => {
  it('returns distinct non-empty JP messages for each reason', () => {
    const e = getCheatDaysErrorMessage('empty');
    const tm = getCheatDaysErrorMessage('too_many');
    const iv = getCheatDaysErrorMessage('invalid_value');
    const dup = getCheatDaysErrorMessage('duplicate');
    expect(new Set([e, tm, iv, dup]).size).toBe(4);
    expect(tm).toMatch(/3/); // mentions CHEAT_DAYS_MAX
  });
});
