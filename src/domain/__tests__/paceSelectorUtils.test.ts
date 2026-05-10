// v1.3.0 / Onboarding v2 / Phase B-3 — pure-helper tests for the
// PaceSelector component. Render tests deferred per Build 15+
// TODO 12 (no jest-expo / RNTL preset); the component's logic is
// covered through these helpers.
//
// paceSelectorUtils imports onboardingCalc (for ACHIEVEMENT_THRESHOLD_KG)
// which imports workoutRepository which pulls in expo-sqlite. Mock
// the DB-side imports so jest's CJS runtime doesn't choke on the
// ESM SQLite module — same pattern Phase 6.0 muscleRecoveryHours.test.ts
// established.
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../utils/id', () => ({ generateId: () => 'stub-id' }));

import {
  DEFAULT_PACE_OPTIONS,
  formatPaceLabel,
  formatPaceSublabel,
  getDirection,
  isOptionDisabled,
  filterAvailableOptions,
  isValidPace,
  assertPaceSelectorProps,
  sanitizePaceSelectorProps,
} from '../paceSelectorUtils';

// ---------------------------------------------------------------------------
// DEFAULT_PACE_OPTIONS — sign-off pin
// ---------------------------------------------------------------------------

describe('DEFAULT_PACE_OPTIONS', () => {
  it('exposes 6 entries spanning -1.0%..+0.25% (sign-off § Schema 整合)', () => {
    expect([...DEFAULT_PACE_OPTIONS]).toEqual([
      -1.0, -0.7, -0.5, -0.25, 0, 0.25,
    ]);
  });

  it('every option fits the v30 weekly_rate_pct CHECK BETWEEN -1.5 AND 0.5', () => {
    for (const v of DEFAULT_PACE_OPTIONS) {
      expect(v).toBeGreaterThanOrEqual(-1.5);
      expect(v).toBeLessThanOrEqual(0.5);
    }
  });
});

// ---------------------------------------------------------------------------
// formatPaceLabel
// ---------------------------------------------------------------------------

describe('formatPaceLabel', () => {
  it('negative whole rate: -1.0 → "-1.0%/週"', () => {
    expect(formatPaceLabel(-1.0)).toBe('-1.0%/週');
  });

  it('negative fractional: -0.25 → "-0.25%/週"', () => {
    expect(formatPaceLabel(-0.25)).toBe('-0.25%/週');
  });

  it('-0.5 → "-0.5%/週" (single-decimal trailing zero retained)', () => {
    expect(formatPaceLabel(-0.5)).toBe('-0.5%/週');
  });

  it('zero: 0 → "±0%/週" (maintain copy)', () => {
    expect(formatPaceLabel(0)).toBe('±0%/週');
  });

  it('positive fractional: 0.25 → "+0.25%/週"', () => {
    expect(formatPaceLabel(0.25)).toBe('+0.25%/週');
  });

  it('non-finite rate falls back to "--"', () => {
    expect(formatPaceLabel(NaN)).toBe('--');
    expect(formatPaceLabel(Infinity)).toBe('--');
  });
});

// ---------------------------------------------------------------------------
// formatPaceSublabel
// ---------------------------------------------------------------------------

describe('formatPaceSublabel', () => {
  it('rate=0 returns null (sublabel implicit in upper label)', () => {
    expect(formatPaceSublabel(0, 70)).toBeNull();
  });

  it('rate=-1.0, currentWeight=70 → "約 0.70 kg/週 減"', () => {
    // 70 × 1.0 / 100 = 0.7 kg/week
    expect(formatPaceSublabel(-1.0, 70)).toBe('約 0.70 kg/週 減');
  });

  it('rate=+0.25, currentWeight=70 → "約 0.18 kg/週 増"', () => {
    // 70 × 0.25 / 100 = 0.175 → toFixed(2) = '0.18'
    expect(formatPaceSublabel(0.25, 70)).toBe('約 0.18 kg/週 増');
  });

  it('rate=-0.5, currentWeight=80 → "約 0.40 kg/週 減"', () => {
    expect(formatPaceSublabel(-0.5, 80)).toBe('約 0.40 kg/週 減');
  });

  // Codex pass 1 / Important #1 — FP edges Codex surfaced via
  // brute-force on the {-0.7} × {30..200 by 0.1} domain. The
  // original integer-pre-multiply fix (Math.round(cw × rate)) caught
  // 70 × 0.25 but missed these because 0.7 isn't exact in IEEE 754;
  // the percent-points scaling fix (Math.round(rate × 100)) does.
  it('rate=-0.7, currentWeight=45 → "約 0.32 kg/週 減" (FP edge)', () => {
    // Naive: 45 × -0.7 = -31.499999999999996 → Math.round drops to 31 → "0.31".
    // Algebraic: 0.315 → round half away from zero → "0.32".
    expect(formatPaceSublabel(-0.7, 45)).toBe('約 0.32 kg/週 減');
  });

  it('rate=-0.7, currentWeight=85 → "約 0.60 kg/週 減" (FP edge)', () => {
    // Algebraic: 0.595 → "0.60".
    expect(formatPaceSublabel(-0.7, 85)).toBe('約 0.60 kg/週 減');
  });

  it('rate=-0.7, currentWeight=165 → "約 1.16 kg/週 減" (FP edge)', () => {
    // Algebraic: 1.155 → "1.16".
    expect(formatPaceSublabel(-0.7, 165)).toBe('約 1.16 kg/週 減');
  });

  it('rate=-0.7, currentWeight=175 → "約 1.23 kg/週 減" (FP edge)', () => {
    // Algebraic: 1.225 → "1.23".
    expect(formatPaceSublabel(-0.7, 175)).toBe('約 1.23 kg/週 減');
  });

  it('returns null for non-finite inputs (defensive)', () => {
    expect(formatPaceSublabel(NaN, 70)).toBeNull();
    expect(formatPaceSublabel(-1.0, NaN)).toBeNull();
    expect(formatPaceSublabel(-1.0, Infinity)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getDirection
// ---------------------------------------------------------------------------

describe('getDirection', () => {
  it('target < current (gap > 0.5kg) → decrease', () => {
    // Boundary changed from `<` to `<=` per Codex pass 1 #2;
    // gap > 0.5 (strict) returns decrease, gap = 0.5 returns
    // maintain (covered by the boundary-inclusive test below).
    expect(getDirection(70, 65)).toBe('decrease');
    expect(getDirection(70, 69.4)).toBe('decrease'); // gap=0.6 > 0.5
  });

  it('target > current (gap > 0.5kg) → increase', () => {
    expect(getDirection(65, 70)).toBe('increase');
    expect(getDirection(70, 70.6)).toBe('increase');
  });

  it('|target - current| < 0.5kg → maintain', () => {
    expect(getDirection(70, 70)).toBe('maintain');
    expect(getDirection(70, 70.4)).toBe('maintain');
    expect(getDirection(70, 69.6)).toBe('maintain');
  });

  // Codex pass 1 / Important #2 — boundary now inclusive (<=) to
  // match estimateTargetDate. At gap=exactly 0.5kg, both paths
  // agree: "you're effectively there" / direction = maintain.
  it('|target - current| === 0.5kg → maintain (boundary inclusive)', () => {
    expect(getDirection(70, 70.5)).toBe('maintain');
    expect(getDirection(70, 69.5)).toBe('maintain');
  });

  it('non-finite inputs return maintain (safest fallback)', () => {
    expect(getDirection(NaN, 70)).toBe('maintain');
    expect(getDirection(70, Infinity)).toBe('maintain');
  });
});

// ---------------------------------------------------------------------------
// isOptionDisabled
// ---------------------------------------------------------------------------

describe('isOptionDisabled', () => {
  it('decrease intent: positive rates disabled (incl. zero)', () => {
    expect(isOptionDisabled(0.25, 'decrease')).toBe(true);
    expect(isOptionDisabled(0, 'decrease')).toBe(true);
    expect(isOptionDisabled(-0.25, 'decrease')).toBe(false);
    expect(isOptionDisabled(-1.0, 'decrease')).toBe(false);
  });

  it('increase intent: negative rates disabled (incl. zero)', () => {
    expect(isOptionDisabled(-0.5, 'increase')).toBe(true);
    expect(isOptionDisabled(0, 'increase')).toBe(true);
    expect(isOptionDisabled(0.25, 'increase')).toBe(false);
  });

  it('maintain intent: anything non-zero disabled', () => {
    expect(isOptionDisabled(-1.0, 'maintain')).toBe(true);
    expect(isOptionDisabled(0, 'maintain')).toBe(false);
    expect(isOptionDisabled(0.25, 'maintain')).toBe(true);
  });

  it('non-finite option always disabled (defensive)', () => {
    expect(isOptionDisabled(NaN, 'decrease')).toBe(true);
    expect(isOptionDisabled(Infinity, 'increase')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterAvailableOptions
// ---------------------------------------------------------------------------

describe('filterAvailableOptions', () => {
  it('decrease leaves the 4 negative options', () => {
    expect([
      ...filterAvailableOptions(DEFAULT_PACE_OPTIONS, 'decrease'),
    ]).toEqual([-1.0, -0.7, -0.5, -0.25]);
  });

  it('increase leaves only positive options (1 from defaults)', () => {
    expect([
      ...filterAvailableOptions(DEFAULT_PACE_OPTIONS, 'increase'),
    ]).toEqual([0.25]);
  });

  it('maintain leaves only the zero option', () => {
    expect([
      ...filterAvailableOptions(DEFAULT_PACE_OPTIONS, 'maintain'),
    ]).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// isValidPace
// ---------------------------------------------------------------------------

describe('isValidPace', () => {
  it('returns true for a value present in options', () => {
    expect(isValidPace(-0.5, DEFAULT_PACE_OPTIONS)).toBe(true);
    expect(isValidPace(0, DEFAULT_PACE_OPTIONS)).toBe(true);
  });

  it('returns false for a value not in options', () => {
    expect(isValidPace(-0.4, DEFAULT_PACE_OPTIONS)).toBe(false);
    expect(isValidPace(1.5, DEFAULT_PACE_OPTIONS)).toBe(false);
  });

  it('returns false for non-finite values', () => {
    expect(isValidPace(NaN, DEFAULT_PACE_OPTIONS)).toBe(false);
    expect(isValidPace(Infinity, DEFAULT_PACE_OPTIONS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertPaceSelectorProps — caller-misuse fail-fast (Pattern 28 dev path)
// ---------------------------------------------------------------------------

describe('assertPaceSelectorProps', () => {
  const validInput = {
    value: -0.5,
    options: DEFAULT_PACE_OPTIONS,
    currentWeight: 70,
    targetWeight: 65,
  };

  it('passes through for valid input', () => {
    expect(() => assertPaceSelectorProps(validInput)).not.toThrow();
  });

  it('null value is permitted (unselected initial state)', () => {
    expect(() =>
      assertPaceSelectorProps({ ...validInput, value: null }),
    ).not.toThrow();
  });

  it('throws on empty options array', () => {
    expect(() =>
      assertPaceSelectorProps({ ...validInput, options: [] }),
    ).toThrow(/options must not be empty/);
  });

  it('throws on duplicate options', () => {
    expect(() =>
      assertPaceSelectorProps({
        ...validInput,
        options: [-0.5, -0.5, 0],
      }),
    ).toThrow(/duplicate option/);
  });

  it('throws on non-finite option', () => {
    expect(() =>
      assertPaceSelectorProps({
        ...validInput,
        options: [-0.5, NaN],
      }),
    ).toThrow(/not finite/);
  });

  it('throws on non-finite or non-positive currentWeight', () => {
    expect(() =>
      assertPaceSelectorProps({ ...validInput, currentWeight: NaN }),
    ).toThrow(/currentWeight must be finite and positive/);
    expect(() =>
      assertPaceSelectorProps({ ...validInput, currentWeight: 0 }),
    ).toThrow(/currentWeight must be finite and positive/);
    expect(() =>
      assertPaceSelectorProps({ ...validInput, currentWeight: -10 }),
    ).toThrow(/currentWeight must be finite and positive/);
  });

  it('throws on non-finite or non-positive targetWeight', () => {
    expect(() =>
      assertPaceSelectorProps({ ...validInput, targetWeight: Infinity }),
    ).toThrow(/targetWeight must be finite and positive/);
    expect(() =>
      assertPaceSelectorProps({ ...validInput, targetWeight: 0 }),
    ).toThrow(/targetWeight must be finite and positive/);
  });

  it('throws on value outside options', () => {
    expect(() =>
      assertPaceSelectorProps({ ...validInput, value: -0.4 }),
    ).toThrow(/not in options/);
    expect(() =>
      assertPaceSelectorProps({ ...validInput, value: 999 }),
    ).toThrow(/not in options/);
  });
});

// ---------------------------------------------------------------------------
// sanitizePaceSelectorProps — Pattern 28 production-safe path
// ---------------------------------------------------------------------------

describe('sanitizePaceSelectorProps', () => {
  it('passes valid input through unchanged', () => {
    const input = {
      value: -0.5,
      options: DEFAULT_PACE_OPTIONS,
      currentWeight: 70,
      targetWeight: 65,
    };
    const out = sanitizePaceSelectorProps(input);
    expect(out.value).toBe(-0.5);
    expect([...out.options]).toEqual([...DEFAULT_PACE_OPTIONS]);
    expect(out.currentWeight).toBe(70);
    expect(out.targetWeight).toBe(65);
  });

  it('falls back to DEFAULT_PACE_OPTIONS on empty options', () => {
    const out = sanitizePaceSelectorProps({
      value: null,
      options: [],
      currentWeight: 70,
      targetWeight: 65,
    });
    expect([...out.options]).toEqual([...DEFAULT_PACE_OPTIONS]);
  });

  it('dedupes options + drops non-finite entries', () => {
    const out = sanitizePaceSelectorProps({
      value: null,
      options: [-0.5, -0.5, NaN, 0, Infinity, 0.25],
      currentWeight: 70,
      targetWeight: 65,
    });
    expect([...out.options]).toEqual([-0.5, 0, 0.25]);
  });

  it('coerces non-finite/non-positive weights to 1', () => {
    const out = sanitizePaceSelectorProps({
      value: null,
      options: DEFAULT_PACE_OPTIONS,
      currentWeight: NaN,
      targetWeight: 0,
    });
    expect(out.currentWeight).toBe(1);
    expect(out.targetWeight).toBe(1);
  });

  it('drops out-of-options value to null', () => {
    const out = sanitizePaceSelectorProps({
      value: 999,
      options: DEFAULT_PACE_OPTIONS,
      currentWeight: 70,
      targetWeight: 65,
    });
    expect(out.value).toBeNull();
  });

  it('preserves a value that survives the deduplication', () => {
    const out = sanitizePaceSelectorProps({
      value: -0.5,
      options: [-0.5, -0.5, 0],
      currentWeight: 70,
      targetWeight: 65,
    });
    expect(out.value).toBe(-0.5);
  });
});
