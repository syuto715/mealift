import type { ActivityLevel, Gender } from '../types/common';
import { ACTIVITY_MULTIPLIERS } from '../constants/defaults';
import { calculateAge, calculateBMR, calculateTDEE } from './calories';
import {
  isValidGender,
  validateBirthYear,
  validateCurrentWeightKg,
  validateHeightCm,
} from './bodyInfoValidation';

// v1.3.0 / Onboarding v2 / Phase C-4 — pure helpers for the [4]
// activity-level screen. Same Pattern 25 helper-thick split as
// C-2 / C-3 — every label / validation / kcal calc lives here so
// the screen file stays render-only and jest can exercise the
// branches without RNTL.
//
// Pattern 18 SSoT — `ACTIVITY_MULTIPLIERS` is the single source of
// truth for the BMR → TDEE activity factor (canonical Mifflin /
// Harris-Benedict factors live in constants/defaults.ts:9, used
// by both calculateTDEE and this screen). We import rather than
// redeclare so a future rebalancing flows through automatically.

// === ACTIVITY_LEVEL_OPTIONS ===
//
// Re-export the 5 values as a `readonly` literal-ordered array so
// the vertical card list renders deterministically. Order is
// least → most active (sedentary..very_active), matching the
// expected mental progression for first-time onboarding.
export const ACTIVITY_LEVEL_OPTIONS = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
] as const satisfies readonly ActivityLevel[];

// === Labels + descriptions ===
//
// Sign-off § Phase C-4 §1 copy pinned (kickoff draft tone — warmer
// than i18n/ja.ts's terser version, which is currently unused
// elsewhere in the codebase). JP-only audience.
const LABELS: Record<ActivityLevel, string> = {
  sedentary: 'ほぼ運動しない',
  light: '軽い運動',
  moderate: 'ふつう',
  active: '活発',
  very_active: 'とても活発',
};

const DESCRIPTIONS: Record<ActivityLevel, string> = {
  sedentary: 'デスクワーク中心',
  light: '週 1〜2 回の散歩程度',
  moderate: '週 3〜5 回の運動',
  active: 'ほぼ毎日運動する',
  very_active: '毎日激しい運動 + 肉体労働',
};

export function getActivityLevelLabel(level: ActivityLevel): string {
  return LABELS[level];
}

export function getActivityLevelDescription(level: ActivityLevel): string {
  return DESCRIPTIONS[level];
}

// === Activity-factor accessor (Pattern 18 SSoT passthrough) ===
export function getActivityFactor(level: ActivityLevel): number {
  return ACTIVITY_MULTIPLIERS[level];
}

// === isValidActivityLevel ===
export function isValidActivityLevel(value: unknown): value is ActivityLevel {
  return (
    typeof value === 'string' &&
    (ACTIVITY_LEVEL_OPTIONS as readonly string[]).includes(value)
  );
}

// === Training days per week ===
//
// 0..7 inclusive. 0 means "never trains" (e.g., walking-only
// users); 7 means "trains every day". The previous Build 14/15
// flow constrained 1..7 via the legacy SegmentedControl, but the
// schema's `training_days_per_week INTEGER` allows 0 for
// completeness.
export const TRAINING_DAYS_MIN = 0;
export const TRAINING_DAYS_MAX = 7;

export type TrainingDaysFailure = 'too_few' | 'too_many' | 'not_integer';

export type TrainingDaysValidation =
  | { valid: true; sanitized: number }
  | { valid: false; reason: TrainingDaysFailure };

export function validateTrainingDaysPerWeek(
  value: number,
): TrainingDaysValidation {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { valid: false, reason: 'not_integer' };
  }
  if (value < TRAINING_DAYS_MIN) {
    return { valid: false, reason: 'too_few' };
  }
  if (value > TRAINING_DAYS_MAX) {
    return { valid: false, reason: 'too_many' };
  }
  return { valid: true, sanitized: value };
}

// === isAllInputsValidForC4 ===
//
// Composite gate for the screen's CTA. Activity-level + training-
// days both required. The hasInteracted gate (per-screen
// onboardingStep >= 4 sentinel, Pattern 18 補強 from C-3) lives
// at the screen layer because it depends on store state that the
// helper doesn't see.
export function isAllInputsValidForC4(
  activityLevel: ActivityLevel | null,
  trainingDaysPerWeek: number | null,
): boolean {
  if (activityLevel == null || trainingDaysPerWeek == null) return false;
  if (!isValidActivityLevel(activityLevel)) return false;
  if (!validateTrainingDaysPerWeek(trainingDaysPerWeek).valid) return false;
  return true;
}

// === calculateMaintenanceCalories ===
//
// BMR × activity factor — the live-feedback number the screen
// shows below the cards. Returns null when any prior-screen input
// is missing or invalid, so the screen can hide the kcal display
// during partial input rather than rendering a misleading number.
//
// Reuses calculateBMR (Mifflin-St Jeor) + calculateTDEE from
// domain/calories.ts (Pattern 18 SSoT). The maintenance figure
// is exactly the TDEE — no goal multiplier applied (that comes
// in later goal-weight / pace screens).
export function calculateMaintenanceCalories(input: {
  weightKg: number;
  heightCm: number;
  birthYear: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  now?: Date;
}): number | null {
  if (
    !validateCurrentWeightKg(input.weightKg).valid ||
    !validateHeightCm(input.heightCm).valid ||
    !validateBirthYear(input.birthYear, input.now ?? new Date()).valid ||
    !isValidGender(input.gender) ||
    !isValidActivityLevel(input.activityLevel)
  ) {
    return null;
  }
  const age = calculateAge(input.birthYear);
  const bmr = calculateBMR(
    input.weightKg,
    input.heightCm,
    age,
    input.gender,
  );
  return calculateTDEE(bmr, input.activityLevel);
}

// === Error messages (JP) ===

const TRAINING_DAYS_ERROR: Record<TrainingDaysFailure, string> = {
  not_integer: 'トレーニング日数を 0 〜 7 の整数で入力してください',
  too_few: `トレーニング日数は ${TRAINING_DAYS_MIN} 日以上で入力してください`,
  too_many: `トレーニング日数は ${TRAINING_DAYS_MAX} 日以下で入力してください`,
};

export function getTrainingDaysErrorMessage(
  reason: TrainingDaysFailure,
): string {
  return TRAINING_DAYS_ERROR[reason];
}

// === formatMaintenanceKcal ===
//
// "2,341 kcal/日" — comma-thousands separator, JP convention.
// Returns null-friendly fallback when input is null so the screen
// doesn't have to branch on display.
export function formatMaintenanceKcal(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-- kcal/日';
  return `${value.toLocaleString('ja-JP')} kcal/日`;
}
