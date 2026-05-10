// v1.3.0 / Onboarding v2 / Phase C-4 — pure-helper tests for the
// [4] activity-level screen.
//
// activityValidation imports from domain/calories.ts which is pure
// (no SQLite chain) and constants/defaults.ts (pure). No DB mock
// required — same flat shape as bodyInfoValidation tests.

import {
  ACTIVITY_LEVEL_OPTIONS,
  TRAINING_DAYS_MAX,
  TRAINING_DAYS_MIN,
  calculateMaintenanceCalories,
  formatMaintenanceKcal,
  getActivityFactor,
  getActivityLevelDescription,
  getActivityLevelLabel,
  getTrainingDaysErrorMessage,
  isAllInputsValidForC4,
  isValidActivityLevel,
  validateTrainingDaysPerWeek,
} from '../activityValidation';
import { ACTIVITY_MULTIPLIERS } from '../../constants/defaults';
import { calculateBMR, calculateTDEE, calculateAge } from '../calories';

// ---------------------------------------------------------------------------
// ACTIVITY_LEVEL_OPTIONS — sign-off pin
// ---------------------------------------------------------------------------

describe('ACTIVITY_LEVEL_OPTIONS', () => {
  it('exposes the 5 levels in least → most order', () => {
    expect([...ACTIVITY_LEVEL_OPTIONS]).toEqual([
      'sedentary',
      'light',
      'moderate',
      'active',
      'very_active',
    ]);
  });
});

// ---------------------------------------------------------------------------
// isValidActivityLevel
// ---------------------------------------------------------------------------

describe('isValidActivityLevel', () => {
  it('returns true for the 5 valid options', () => {
    for (const level of ACTIVITY_LEVEL_OPTIONS) {
      expect(isValidActivityLevel(level)).toBe(true);
    }
  });

  it('returns false for non-activity strings', () => {
    expect(isValidActivityLevel('Sedentary')).toBe(false); // case
    expect(isValidActivityLevel('extreme')).toBe(false);
    expect(isValidActivityLevel('')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(isValidActivityLevel(null)).toBe(false);
    expect(isValidActivityLevel(undefined)).toBe(false);
    expect(isValidActivityLevel(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Labels + descriptions + factor accessor
// ---------------------------------------------------------------------------

describe('getActivityLevelLabel / Description', () => {
  it('returns non-empty JP label and description for every level', () => {
    for (const level of ACTIVITY_LEVEL_OPTIONS) {
      expect(getActivityLevelLabel(level).length).toBeGreaterThan(0);
      expect(getActivityLevelDescription(level).length).toBeGreaterThan(0);
    }
  });

  it('labels are distinct (no copy-paste collisions)', () => {
    const labels = ACTIVITY_LEVEL_OPTIONS.map(getActivityLevelLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('descriptions are distinct', () => {
    const descs = ACTIVITY_LEVEL_OPTIONS.map(getActivityLevelDescription);
    expect(new Set(descs).size).toBe(descs.length);
  });
});

describe('getActivityFactor (Pattern 18 SSoT passthrough)', () => {
  it('returns ACTIVITY_MULTIPLIERS for every level', () => {
    // Pin the SSoT relationship — getActivityFactor is a thin
    // accessor over ACTIVITY_MULTIPLIERS in constants/defaults.ts.
    // Any future rebalancing of the multipliers must flow through
    // automatically without touching this helper.
    for (const level of ACTIVITY_LEVEL_OPTIONS) {
      expect(getActivityFactor(level)).toBe(ACTIVITY_MULTIPLIERS[level]);
    }
  });

  it('matches the canonical Mifflin / Harris-Benedict factors', () => {
    expect(getActivityFactor('sedentary')).toBe(1.2);
    expect(getActivityFactor('light')).toBe(1.375);
    expect(getActivityFactor('moderate')).toBe(1.55);
    expect(getActivityFactor('active')).toBe(1.725);
    expect(getActivityFactor('very_active')).toBe(1.9);
  });
});

// ---------------------------------------------------------------------------
// validateTrainingDaysPerWeek
// ---------------------------------------------------------------------------

describe('validateTrainingDaysPerWeek', () => {
  it('accepts 0..7 inclusive', () => {
    for (let d = TRAINING_DAYS_MIN; d <= TRAINING_DAYS_MAX; d++) {
      expect(validateTrainingDaysPerWeek(d)).toEqual({
        valid: true,
        sanitized: d,
      });
    }
  });

  it('rejects -1 as too_few', () => {
    expect(validateTrainingDaysPerWeek(-1)).toEqual({
      valid: false,
      reason: 'too_few',
    });
  });

  it('rejects 8 as too_many', () => {
    expect(validateTrainingDaysPerWeek(8)).toEqual({
      valid: false,
      reason: 'too_many',
    });
  });

  it('rejects non-integer (3.5) as not_integer', () => {
    expect(validateTrainingDaysPerWeek(3.5)).toEqual({
      valid: false,
      reason: 'not_integer',
    });
  });

  it('rejects NaN / Infinity as not_integer', () => {
    expect(validateTrainingDaysPerWeek(NaN)).toEqual({
      valid: false,
      reason: 'not_integer',
    });
    expect(validateTrainingDaysPerWeek(Infinity)).toEqual({
      valid: false,
      reason: 'not_integer',
    });
  });
});

// ---------------------------------------------------------------------------
// isAllInputsValidForC4 — composite gate
// ---------------------------------------------------------------------------

describe('isAllInputsValidForC4', () => {
  it('valid combo passes', () => {
    expect(isAllInputsValidForC4('moderate', 3)).toBe(true);
  });

  it('null activityLevel fails', () => {
    expect(isAllInputsValidForC4(null, 3)).toBe(false);
  });

  it('null trainingDays fails', () => {
    expect(isAllInputsValidForC4('moderate', null)).toBe(false);
  });

  it('invalid activityLevel fails (cast escape)', () => {
    // @ts-expect-error — exercising runtime cast escape.
    expect(isAllInputsValidForC4('extreme', 3)).toBe(false);
  });

  it('invalid trainingDays fails', () => {
    expect(isAllInputsValidForC4('moderate', -1)).toBe(false);
    expect(isAllInputsValidForC4('moderate', 10)).toBe(false);
    expect(isAllInputsValidForC4('moderate', 3.5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateMaintenanceCalories — Pattern 18 SSoT cross-check
// ---------------------------------------------------------------------------

describe('calculateMaintenanceCalories', () => {
  const baseInput = {
    weightKg: 70,
    heightCm: 170,
    birthYear: 1995,
    gender: 'male' as const,
    activityLevel: 'moderate' as const,
    now: new Date(2026, 4, 10),
  };

  it('returns null when any prior-screen input is invalid', () => {
    expect(
      calculateMaintenanceCalories({ ...baseInput, weightKg: NaN }),
    ).toBeNull();
    expect(
      calculateMaintenanceCalories({ ...baseInput, heightCm: 130 }),
    ).toBeNull(); // too short
    expect(
      calculateMaintenanceCalories({ ...baseInput, birthYear: 2020 }),
    ).toBeNull(); // too young
    expect(
      // @ts-expect-error — exercising runtime cast escape.
      calculateMaintenanceCalories({ ...baseInput, gender: 'unknown' }),
    ).toBeNull();
    expect(
      calculateMaintenanceCalories({
        ...baseInput,
        // @ts-expect-error — exercising runtime cast escape.
        activityLevel: 'extreme',
      }),
    ).toBeNull();
  });

  it('returns BMR × activity factor for valid inputs (TDEE cross-check)', () => {
    const out = calculateMaintenanceCalories(baseInput);
    expect(out).not.toBeNull();
    // Cross-check: replicate the calc independently to verify the
    // helper's chain (calculateAge → calculateBMR → calculateTDEE)
    // aligns with the public API. Pattern 18 SSoT pin.
    const age = calculateAge(baseInput.birthYear);
    const bmr = calculateBMR(
      baseInput.weightKg,
      baseInput.heightCm,
      age,
      baseInput.gender,
    );
    const expectedTdee = calculateTDEE(bmr, baseInput.activityLevel);
    expect(out).toBe(expectedTdee);
  });

  it('honors activityLevel choice (sedentary < moderate < very_active)', () => {
    const sedentary = calculateMaintenanceCalories({
      ...baseInput,
      activityLevel: 'sedentary',
    });
    const moderate = calculateMaintenanceCalories({
      ...baseInput,
      activityLevel: 'moderate',
    });
    const veryActive = calculateMaintenanceCalories({
      ...baseInput,
      activityLevel: 'very_active',
    });
    expect(sedentary).toBeLessThan(moderate!);
    expect(moderate).toBeLessThan(veryActive!);
  });
});

// ---------------------------------------------------------------------------
// formatMaintenanceKcal — JP comma-thousands formatting
// ---------------------------------------------------------------------------

describe('formatMaintenanceKcal', () => {
  it('formats with JP locale comma-thousands', () => {
    expect(formatMaintenanceKcal(2341)).toBe('2,341 kcal/日');
    expect(formatMaintenanceKcal(1500)).toBe('1,500 kcal/日');
    expect(formatMaintenanceKcal(800)).toBe('800 kcal/日');
  });

  it('null / non-finite collapse to fallback string', () => {
    expect(formatMaintenanceKcal(null)).toBe('-- kcal/日');
    expect(formatMaintenanceKcal(NaN)).toBe('-- kcal/日');
    expect(formatMaintenanceKcal(Infinity)).toBe('-- kcal/日');
  });
});

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

describe('getTrainingDaysErrorMessage', () => {
  it('returns distinct non-empty JP messages for each reason', () => {
    const tooFew = getTrainingDaysErrorMessage('too_few');
    const tooMany = getTrainingDaysErrorMessage('too_many');
    const notInteger = getTrainingDaysErrorMessage('not_integer');
    expect(new Set([tooFew, tooMany, notInteger]).size).toBe(3);
    expect(tooFew).toMatch(/0/);
    expect(tooMany).toMatch(/7/);
    expect(notInteger.length).toBeGreaterThan(0);
  });
});
