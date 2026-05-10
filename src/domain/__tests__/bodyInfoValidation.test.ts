// v1.3.0 / Onboarding v2 / Phase C-3 — pure-helper tests for the
// [3] body-info screen. Render tests deferred per Build 15+ TODO 12;
// the screen's logic is fully covered through these helpers + the
// store action tests in onboardingStore.test.ts.
//
// bodyInfoValidation imports from domain/bmi.ts which is pure (no
// SQLite chain), so unlike the B-3 / B-4 / B-5 / C-1 / C-2 test
// files we don't need the DB-mock shim here.

import {
  BIRTH_YEAR_MIN,
  BMI_EXTREME_HIGH,
  BMI_EXTREME_LOW,
  CURRENT_WEIGHT_KG_MAX,
  CURRENT_WEIGHT_KG_MIN,
  GENDER_OPTIONS,
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  MIN_AGE_YEARS,
  getBMIFeedback,
  getBirthYearErrorMessage,
  getGenderLabel,
  getHeightErrorMessage,
  getMaxBirthYear,
  getWeightErrorMessage,
  isAllInputsValid,
  isValidGender,
  validateBirthYear,
  validateCurrentWeightKg,
  validateHeightCm,
} from '../bodyInfoValidation';

// ---------------------------------------------------------------------------
// Constants — sign-off pins
// ---------------------------------------------------------------------------

describe('Phase C-3 constants', () => {
  it('GENDER_OPTIONS = male / female / other (matches Profile.gender union)', () => {
    expect([...GENDER_OPTIONS]).toEqual(['male', 'female', 'other']);
  });

  it('MIN_AGE_YEARS = 13 (JP MEXT + Apple guideline floor)', () => {
    expect(MIN_AGE_YEARS).toBe(13);
  });

  it('Height bounds 140-220 cm (pragmatic adult onboarding window)', () => {
    expect(HEIGHT_CM_MIN).toBe(140);
    expect(HEIGHT_CM_MAX).toBe(220);
  });

  it('Weight bounds 30-200 kg (mirrors B-2 WeightSlider defaults)', () => {
    expect(CURRENT_WEIGHT_KG_MIN).toBe(30);
    expect(CURRENT_WEIGHT_KG_MAX).toBe(200);
  });

  it('BIRTH_YEAR_MIN = 1900 (calendar floor)', () => {
    expect(BIRTH_YEAR_MIN).toBe(1900);
  });

  it('BMI extreme thresholds (16 / 35) for medical-recommendation flag', () => {
    expect(BMI_EXTREME_LOW).toBe(16);
    expect(BMI_EXTREME_HIGH).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// isValidGender + getGenderLabel
// ---------------------------------------------------------------------------

describe('isValidGender', () => {
  it('returns true for the 3 valid options', () => {
    expect(isValidGender('male')).toBe(true);
    expect(isValidGender('female')).toBe(true);
    expect(isValidGender('other')).toBe(true);
  });

  it('returns false for non-gender strings', () => {
    expect(isValidGender('unknown')).toBe(false);
    expect(isValidGender('')).toBe(false);
    expect(isValidGender('Male')).toBe(false); // case-sensitive
  });

  it('returns false for non-string inputs', () => {
    expect(isValidGender(null)).toBe(false);
    expect(isValidGender(undefined)).toBe(false);
    expect(isValidGender(1)).toBe(false);
  });
});

describe('getGenderLabel', () => {
  it('returns Japanese label for each gender', () => {
    expect(getGenderLabel('male')).toBe('男性');
    expect(getGenderLabel('female')).toBe('女性');
    expect(getGenderLabel('other')).toBe('その他');
  });
});

// ---------------------------------------------------------------------------
// getMaxBirthYear + validateBirthYear
// ---------------------------------------------------------------------------

describe('getMaxBirthYear', () => {
  it('returns currentYear - 13', () => {
    // Use Date constructor with local-time components (not the
    // ISO string form) so the test stays TZ-stable. `new Date('2030-01-01')`
    // is parsed as UTC then displayed in local time, so on TZ=America/Los_Angeles
    // it lands at 2029-12-31 and getFullYear() returns 2029, breaking
    // the test. `new Date(2030, 0, 1)` is unambiguous local-time.
    expect(getMaxBirthYear(new Date(2026, 4, 10))).toBe(2013);
    expect(getMaxBirthYear(new Date(2030, 0, 1))).toBe(2017);
  });
});

describe('validateBirthYear', () => {
  const now = new Date('2026-05-10');

  it('accepts a typical adult year', () => {
    expect(validateBirthYear(1995, now)).toEqual({
      valid: true,
      sanitized: 1995,
    });
  });

  it('accepts the exact max-year boundary (turns 13 this year)', () => {
    expect(validateBirthYear(2013, now)).toEqual({
      valid: true,
      sanitized: 2013,
    });
  });

  it('accepts 1900 (calendar floor inclusive)', () => {
    expect(validateBirthYear(1900, now)).toEqual({
      valid: true,
      sanitized: 1900,
    });
  });

  it('rejects 2014 as too_young (12 yo this year)', () => {
    expect(validateBirthYear(2014, now)).toEqual({
      valid: false,
      reason: 'too_young',
    });
  });

  it('rejects 1899 as too_old', () => {
    expect(validateBirthYear(1899, now)).toEqual({
      valid: false,
      reason: 'too_old',
    });
  });

  it('rejects non-integer (1995.5) as not_integer', () => {
    expect(validateBirthYear(1995.5, now)).toEqual({
      valid: false,
      reason: 'not_integer',
    });
  });

  it('rejects NaN / Infinity as not_integer', () => {
    expect(validateBirthYear(NaN, now)).toEqual({
      valid: false,
      reason: 'not_integer',
    });
    expect(validateBirthYear(Infinity, now)).toEqual({
      valid: false,
      reason: 'not_integer',
    });
  });
});

// ---------------------------------------------------------------------------
// validateHeightCm
// ---------------------------------------------------------------------------

describe('validateHeightCm', () => {
  it('accepts a typical adult height', () => {
    expect(validateHeightCm(170)).toEqual({ valid: true, sanitized: 170 });
  });

  it('accepts the boundary values inclusively', () => {
    expect(validateHeightCm(HEIGHT_CM_MIN)).toEqual({
      valid: true,
      sanitized: HEIGHT_CM_MIN,
    });
    expect(validateHeightCm(HEIGHT_CM_MAX)).toEqual({
      valid: true,
      sanitized: HEIGHT_CM_MAX,
    });
  });

  it('rejects too-short / too-tall', () => {
    expect(validateHeightCm(130)).toEqual({
      valid: false,
      reason: 'too_short',
    });
    expect(validateHeightCm(230)).toEqual({
      valid: false,
      reason: 'too_tall',
    });
  });

  it('rejects non-finite as not_finite', () => {
    expect(validateHeightCm(NaN)).toEqual({
      valid: false,
      reason: 'not_finite',
    });
    expect(validateHeightCm(Infinity)).toEqual({
      valid: false,
      reason: 'not_finite',
    });
  });
});

// ---------------------------------------------------------------------------
// validateCurrentWeightKg
// ---------------------------------------------------------------------------

describe('validateCurrentWeightKg', () => {
  it('accepts typical adult weight', () => {
    expect(validateCurrentWeightKg(70)).toEqual({
      valid: true,
      sanitized: 70,
    });
  });

  it('accepts boundary values inclusively', () => {
    expect(validateCurrentWeightKg(CURRENT_WEIGHT_KG_MIN)).toEqual({
      valid: true,
      sanitized: CURRENT_WEIGHT_KG_MIN,
    });
    expect(validateCurrentWeightKg(CURRENT_WEIGHT_KG_MAX)).toEqual({
      valid: true,
      sanitized: CURRENT_WEIGHT_KG_MAX,
    });
  });

  it('rejects too-light / too-heavy', () => {
    expect(validateCurrentWeightKg(20)).toEqual({
      valid: false,
      reason: 'too_light',
    });
    expect(validateCurrentWeightKg(250)).toEqual({
      valid: false,
      reason: 'too_heavy',
    });
  });

  it('rejects non-finite', () => {
    expect(validateCurrentWeightKg(NaN)).toEqual({
      valid: false,
      reason: 'not_finite',
    });
    expect(validateCurrentWeightKg(-Infinity)).toEqual({
      valid: false,
      reason: 'not_finite',
    });
  });
});

// ---------------------------------------------------------------------------
// isAllInputsValid — composite gate
// ---------------------------------------------------------------------------

describe('isAllInputsValid', () => {
  const now = new Date('2026-05-10');
  const valid = ['male' as const, 1995, 170, 70] as const;

  it('returns true when all four pass their narrow checks', () => {
    expect(isAllInputsValid(...valid, now)).toBe(true);
  });

  it('returns false when any field is null', () => {
    expect(isAllInputsValid(null, 1995, 170, 70, now)).toBe(false);
    expect(isAllInputsValid('male', null, 170, 70, now)).toBe(false);
    expect(isAllInputsValid('male', 1995, null, 70, now)).toBe(false);
    expect(isAllInputsValid('male', 1995, 170, null, now)).toBe(false);
  });

  it('returns false when any field is invalid', () => {
    // @ts-expect-error — exercising the runtime cast escape path.
    expect(isAllInputsValid('unknown', 1995, 170, 70, now)).toBe(false);
    expect(isAllInputsValid('male', 2020, 170, 70, now)).toBe(false); // too young
    expect(isAllInputsValid('male', 1995, 130, 70, now)).toBe(false); // too short
    expect(isAllInputsValid('male', 1995, 170, 250, now)).toBe(false); // too heavy
  });
});

// ---------------------------------------------------------------------------
// getBMIFeedback — Pattern 18 SSoT cross-check (uses domain/bmi.ts)
// ---------------------------------------------------------------------------

describe('getBMIFeedback', () => {
  it('returns null when weight or height is invalid', () => {
    expect(getBMIFeedback(NaN, 170)).toBeNull();
    expect(getBMIFeedback(70, NaN)).toBeNull();
    expect(getBMIFeedback(20, 170)).toBeNull(); // too light
    expect(getBMIFeedback(70, 130)).toBeNull(); // too short
  });

  it('returns BMI 24.2 + normal label for 70kg / 170cm', () => {
    // 70 / 1.7^2 = 24.221... → round1 → 24.2
    const out = getBMIFeedback(70, 170);
    expect(out).not.toBeNull();
    expect(out!.result.bmi).toBe(24.2);
    expect(out!.result.category).toBe('normal');
    expect(out!.result.label).toBe('普通体重');
    expect(out!.isExtreme).toBe(false);
  });

  it('flags isExtreme=true for BMI < 16 (severe underweight)', () => {
    // 30 kg / 170 cm → BMI ≈ 10.4 (under 16)
    const out = getBMIFeedback(30, 170);
    expect(out).not.toBeNull();
    expect(out!.result.bmi).toBeLessThan(BMI_EXTREME_LOW);
    expect(out!.isExtreme).toBe(true);
  });

  it('flags isExtreme=true for BMI >= 35 (obese 2 度+)', () => {
    // 110 kg / 170 cm → BMI ≈ 38.06
    const out = getBMIFeedback(110, 170);
    expect(out).not.toBeNull();
    expect(out!.result.bmi).toBeGreaterThanOrEqual(BMI_EXTREME_HIGH);
    expect(out!.isExtreme).toBe(true);
  });

  it('boundary: BMI exactly 16 is NOT extreme (LOW threshold strict <)', () => {
    // Find weight that produces BMI=16 at 170cm: 16 * 1.7^2 = 46.24
    const out = getBMIFeedback(46.24, 170);
    expect(out).not.toBeNull();
    expect(out!.result.bmi).toBe(16);
    expect(out!.isExtreme).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

describe('error message resolvers', () => {
  it('birthYear error messages are non-empty + distinct', () => {
    const tooOld = getBirthYearErrorMessage('too_old');
    const tooYoung = getBirthYearErrorMessage('too_young');
    const notInteger = getBirthYearErrorMessage('not_integer');
    expect(new Set([tooOld, tooYoung, notInteger]).size).toBe(3);
    expect(tooOld).toMatch(/1900/);
    expect(tooYoung).toMatch(/13/);
  });

  it('height error messages mention the bounds', () => {
    expect(getHeightErrorMessage('too_short')).toMatch(/140/);
    expect(getHeightErrorMessage('too_tall')).toMatch(/220/);
    expect(getHeightErrorMessage('not_finite').length).toBeGreaterThan(0);
  });

  it('weight error messages mention the bounds', () => {
    expect(getWeightErrorMessage('too_light')).toMatch(/30/);
    expect(getWeightErrorMessage('too_heavy')).toMatch(/200/);
    expect(getWeightErrorMessage('not_finite').length).toBeGreaterThan(0);
  });
});
