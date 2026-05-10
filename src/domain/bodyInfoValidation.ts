import type { Gender } from '../types/common';
import { calculateBMI, type BMIResult } from './bmi';

// v1.3.0 / Onboarding v2 / Phase C-3 — pure validation helpers for
// the [3] body-info screen.
//
// Each input has its own narrow validator returning a discriminated
// union so the screen can render a per-field error message without
// re-running the validation. isAllInputsValid is the screen-level
// gate that the CTA disabled-state subscribes to.
//
// Pattern 18 SSoT — BMI math + JP-standard category classification
// stays in domain/bmi.ts (already shipped); this file only provides
// the validation gates and the screen-friendly composite checker.

// === HEIGHT_CM bounds ===

// Range matches the WHO global anthropometric references for adults:
// the shortest documented adult is ~57 cm (Pingping) and the
// tallest ~272 cm (Wadlow), but onboarding-grade validation can
// safely clamp to a more pragmatic 140-220 cm window — under-13
// users are blocked at the birthYear gate anyway.
export const HEIGHT_CM_MIN = 140;
export const HEIGHT_CM_MAX = 220;
export const HEIGHT_CM_STEP = 0.5;

// === CURRENT_WEIGHT_KG bounds (Pattern 18 — match B-2 WeightSlider) ===
//
// B-2 WeightSlider exports its bounds as component props (default
// 30 / 200) rather than module-level constants. We mirror those
// defaults here so the validation rejects values outside the
// component's slider range. Pattern 18 SSoT lives at the screen
// level: the screen passes these constants as explicit min/max
// props to WeightSlider, keeping a single source of truth visible.
export const CURRENT_WEIGHT_KG_MIN = 30;
export const CURRENT_WEIGHT_KG_MAX = 200;
export const CURRENT_WEIGHT_KG_STEP = 0.1;

// === BIRTH_YEAR bounds ===

// Hard floor on the lower bound (you cannot have been born before
// the calendar). Upper bound is computed dynamically via
// getMaxBirthYear so a 13-year-old can JUST sign up on their
// birthday — the JP MEXT child-protection guidance + Apple App
// Review minimum-age guidance both pin 13 as the safe floor.
export const BIRTH_YEAR_MIN = 1900;
export const MIN_AGE_YEARS = 13;

export function getMaxBirthYear(now: Date = new Date()): number {
  return now.getFullYear() - MIN_AGE_YEARS;
}

// === Gender ===

export const GENDER_OPTIONS: readonly Gender[] = ['male', 'female', 'other'];

const GENDER_LABELS: Record<Gender, string> = {
  male: '男性',
  female: '女性',
  other: 'その他',
};

export function getGenderLabel(value: Gender): string {
  return GENDER_LABELS[value];
}

export function isValidGender(value: unknown): value is Gender {
  return (
    typeof value === 'string' &&
    (GENDER_OPTIONS as readonly string[]).includes(value)
  );
}

// === Birth year ===

export type BirthYearFailure = 'too_old' | 'too_young' | 'not_integer';

export type BirthYearValidation =
  | { valid: true; sanitized: number }
  | { valid: false; reason: BirthYearFailure };

export function validateBirthYear(
  value: number,
  now: Date = new Date(),
): BirthYearValidation {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { valid: false, reason: 'not_integer' };
  }
  if (value < BIRTH_YEAR_MIN) {
    return { valid: false, reason: 'too_old' };
  }
  const max = getMaxBirthYear(now);
  if (value > max) {
    return { valid: false, reason: 'too_young' };
  }
  return { valid: true, sanitized: value };
}

// === Height cm ===

export type HeightFailure = 'too_short' | 'too_tall' | 'not_finite';

export type HeightValidation =
  | { valid: true; sanitized: number }
  | { valid: false; reason: HeightFailure };

export function validateHeightCm(value: number): HeightValidation {
  if (!Number.isFinite(value)) {
    return { valid: false, reason: 'not_finite' };
  }
  if (value < HEIGHT_CM_MIN) {
    return { valid: false, reason: 'too_short' };
  }
  if (value > HEIGHT_CM_MAX) {
    return { valid: false, reason: 'too_tall' };
  }
  return { valid: true, sanitized: value };
}

// === Current weight kg ===

export type WeightFailure = 'too_light' | 'too_heavy' | 'not_finite';

export type WeightValidation =
  | { valid: true; sanitized: number }
  | { valid: false; reason: WeightFailure };

export function validateCurrentWeightKg(value: number): WeightValidation {
  if (!Number.isFinite(value)) {
    return { valid: false, reason: 'not_finite' };
  }
  if (value < CURRENT_WEIGHT_KG_MIN) {
    return { valid: false, reason: 'too_light' };
  }
  if (value > CURRENT_WEIGHT_KG_MAX) {
    return { valid: false, reason: 'too_heavy' };
  }
  return { valid: true, sanitized: value };
}

// === isAllInputsValid ===

export function isAllInputsValid(
  gender: Gender | null,
  birthYear: number | null,
  heightCm: number | null,
  weightKg: number | null,
  now: Date = new Date(),
): boolean {
  if (gender == null || birthYear == null || heightCm == null || weightKg == null) {
    return false;
  }
  if (!isValidGender(gender)) return false;
  if (!validateBirthYear(birthYear, now).valid) return false;
  if (!validateHeightCm(heightCm).valid) return false;
  if (!validateCurrentWeightKg(weightKg).valid) return false;
  return true;
}

// === Error messages (JP) ===

const BIRTH_YEAR_ERROR: Record<BirthYearFailure, string> = {
  not_integer: '生まれ年は4桁の数字で入力してください',
  too_old: `${BIRTH_YEAR_MIN} 年以降の年を入力してください`,
  too_young: `${MIN_AGE_YEARS} 歳以上の方のみご利用いただけます`,
};

const HEIGHT_ERROR: Record<HeightFailure, string> = {
  not_finite: '身長を入力してください',
  too_short: `身長は ${HEIGHT_CM_MIN} cm 以上で入力してください`,
  too_tall: `身長は ${HEIGHT_CM_MAX} cm 以下で入力してください`,
};

const WEIGHT_ERROR: Record<WeightFailure, string> = {
  not_finite: '体重を入力してください',
  too_light: `体重は ${CURRENT_WEIGHT_KG_MIN} kg 以上で入力してください`,
  too_heavy: `体重は ${CURRENT_WEIGHT_KG_MAX} kg 以下で入力してください`,
};

export function getBirthYearErrorMessage(reason: BirthYearFailure): string {
  return BIRTH_YEAR_ERROR[reason];
}

export function getHeightErrorMessage(reason: HeightFailure): string {
  return HEIGHT_ERROR[reason];
}

export function getWeightErrorMessage(reason: WeightFailure): string {
  return WEIGHT_ERROR[reason];
}

// === BMI live feedback (Pattern 18 SSoT — reuses domain/bmi.ts) ===
//
// Returns null when inputs aren't fully valid yet, so the screen can
// hide the BMI line during partial input. Wraps domain/bmi.ts's
// 6-tier JP-standard classification (低体重 / 普通体重 / 肥満 1〜4度).
//
// Sign-off § Phase C-3 §4 — extreme values flagged for medical
// recommendation. Threshold pinned at BMI < 16 (severe underweight,
// WHO Class III thinness) or BMI ≥ 35 (obese 2 度+ in JP standard,
// where comorbidity risk climbs sharply). The screen renders the
// warning text alongside the standard category label.
export const BMI_EXTREME_LOW = 16;
export const BMI_EXTREME_HIGH = 35;

export interface BMIFeedback {
  result: BMIResult;
  isExtreme: boolean;
}

export function getBMIFeedback(
  weightKg: number,
  heightCm: number,
): BMIFeedback | null {
  if (
    !validateCurrentWeightKg(weightKg).valid ||
    !validateHeightCm(heightCm).valid
  ) {
    return null;
  }
  const result = calculateBMI(weightKg, heightCm);
  if (result === null) return null;
  return {
    result,
    isExtreme: result.bmi < BMI_EXTREME_LOW || result.bmi >= BMI_EXTREME_HIGH,
  };
}
