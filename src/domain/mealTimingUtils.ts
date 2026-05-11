import { type MealTiming, MEAL_TIMING_OPTIONS } from '../types/profile';

// v1.3.0 / Onboarding v2 / Phase D-3 — pure helpers for the [7]
// meal-timing screen.
//
// Multi-select checkbox list — user picks one or more meal slots.
// Validation enforces at least one selection + dedupe + sort to
// MEAL_TIMING_OPTIONS canonical order so a back-nav edit that
// reorders selection (tap order != chronological) still persists
// in a deterministic shape.

export { type MealTiming, MEAL_TIMING_OPTIONS };

// === Labels + descriptions ===
//
// Sign-off § Phase D-3 §1 — JP labels + time-of-day descriptions.
// The descriptions are illustrative ranges (not enforced or
// referenced by any meal-logging logic); they help the user pick
// which slots match their actual eating pattern.
const LABELS: Record<MealTiming, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  snack: '間食',
  dinner: '夕食',
  late_night: '夜食',
};

const DESCRIPTIONS: Record<MealTiming, string> = {
  breakfast: '6:00 - 10:00',
  lunch: '11:00 - 14:00',
  snack: '14:00 - 17:00',
  dinner: '17:00 - 21:00',
  late_night: '21:00 以降',
};

export function getMealTimingLabel(timing: MealTiming): string {
  return LABELS[timing];
}

export function getMealTimingDescription(timing: MealTiming): string {
  return DESCRIPTIONS[timing];
}

// === isValidMealTiming ===
export function isValidMealTiming(value: unknown): value is MealTiming {
  return (
    typeof value === 'string' &&
    (MEAL_TIMING_OPTIONS as readonly string[]).includes(value)
  );
}

// === validateMealTimings ===

export type MealTimingsFailure = 'empty' | 'invalid_value' | 'duplicate';

export type MealTimingsValidation =
  | { valid: true; sanitized: readonly MealTiming[] }
  | { valid: false; reason: MealTimingsFailure };

export function validateMealTimings(values: string[]): MealTimingsValidation {
  if (!Array.isArray(values) || values.length === 0) {
    return { valid: false, reason: 'empty' };
  }
  const seen = new Set<string>();
  for (const v of values) {
    if (!isValidMealTiming(v)) {
      return { valid: false, reason: 'invalid_value' };
    }
    if (seen.has(v)) {
      return { valid: false, reason: 'duplicate' };
    }
    seen.add(v);
  }
  // Sort to MEAL_TIMING_OPTIONS canonical order so equivalent
  // selections produce identical persisted JSON regardless of
  // tap order (improves DB-snapshot comparisons + makes diffs
  // stable across sessions).
  const sorted = MEAL_TIMING_OPTIONS.filter((opt) =>
    (values as readonly string[]).includes(opt),
  );
  return { valid: true, sanitized: sorted };
}

// === isAllInputsValidForD3 ===

export function isAllInputsValidForD3(
  mealTimings: string[] | null,
): boolean {
  if (mealTimings == null) return false;
  return validateMealTimings(mealTimings).valid;
}

// === toggleSelection ===
//
// Immutable add/remove helper for the checkbox list. Used by the
// screen's onPress handler — returns a new array (canonical-sorted)
// rather than mutating to keep React state flow clean.
export function toggleSelection(
  current: readonly MealTiming[],
  toggled: MealTiming,
): readonly MealTiming[] {
  if (current.includes(toggled)) {
    return current.filter((t) => t !== toggled);
  }
  // Insert in canonical order — same shape validateMealTimings
  // produces so equivalent post-toggle / post-validate arrays are
  // shape-identical.
  const next = [...current, toggled];
  return MEAL_TIMING_OPTIONS.filter((opt) => next.includes(opt));
}

// === formatSelectedCountLabel ===

export function formatSelectedCountLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '選択してください';
  return `${count} 件選択中`;
}

// === Error messages (JP) ===

const ERROR_MESSAGES: Record<MealTimingsFailure, string> = {
  empty: '1 つ以上選択してください',
  invalid_value: '無効な選択肢が含まれています',
  duplicate: '重複した選択があります',
};

export function getMealTimingsErrorMessage(
  reason: MealTimingsFailure,
): string {
  return ERROR_MESSAGES[reason];
}
