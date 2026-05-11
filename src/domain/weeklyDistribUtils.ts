import {
  type DayOfWeek,
  DAY_OF_WEEK_OPTIONS,
  type WeeklyDistribution,
  WEEKLY_DISTRIBUTION_OPTIONS,
} from '../types/profile';

// v1.3.0 / Onboarding v2 / Phase D-5 — pure helpers for the [9]
// weekly-distribution screen.
//
// Two coupled inputs:
//   - weeklyDistribution: 'even' | 'cheat_days'
//   - cheatDays:          DayOfWeek[] (only relevant when
//                         weeklyDistribution === 'cheat_days')
//
// Pattern 18 補強 canonical view (D-3 mealTimings precedent) —
// validateCheatDays.sanitized returns the array sorted to
// DAY_OF_WEEK_OPTIONS order with dedupes dropped. Screen drives
// display + validation + persist from the same canonical shape
// so equivalent selections produce identical JSON regardless of
// tap order.

export {
  type DayOfWeek,
  DAY_OF_WEEK_OPTIONS,
  type WeeklyDistribution,
  WEEKLY_DISTRIBUTION_OPTIONS,
};

// Sign-off § Phase D-5 §1 — semantic limits. Schema has no
// CHECK constraint on cheat-days length, so this app-side limit
// is the source of truth.
export const CHEAT_DAYS_MAX = 3;
export const CHEAT_DAYS_RECOMMENDED_MAX = 2;

// === Labels + descriptions ===

const DISTRIBUTION_LABELS: Record<WeeklyDistribution, string> = {
  even: '均等',
  cheat_days: '自由日',
};

const DISTRIBUTION_DESCRIPTIONS: Record<WeeklyDistribution, string> = {
  even: '毎日同じ kcal',
  cheat_days: '週に何日か自由に',
};

// 0=Sun..6=Sat per profile.ts:120 convention. JP labels picked
// for the chronologically-first letter (日/月/火/水/木/金/土).
const DAY_LABELS: Record<DayOfWeek, string> = {
  0: '日',
  1: '月',
  2: '火',
  3: '水',
  4: '木',
  5: '金',
  6: '土',
};

export function getDistributionLabel(d: WeeklyDistribution): string {
  return DISTRIBUTION_LABELS[d];
}

export function getDistributionDescription(d: WeeklyDistribution): string {
  return DISTRIBUTION_DESCRIPTIONS[d];
}

export function getDayOfWeekLabel(d: DayOfWeek): string {
  return DAY_LABELS[d];
}

// === Validation primitives ===

export function isValidWeeklyDistribution(
  value: unknown,
): value is WeeklyDistribution {
  return (
    typeof value === 'string' &&
    (WEEKLY_DISTRIBUTION_OPTIONS as readonly string[]).includes(value)
  );
}

export function isValidDayOfWeek(value: unknown): value is DayOfWeek {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (DAY_OF_WEEK_OPTIONS as readonly number[]).includes(value)
  );
}

// === validateCheatDays ===

export type CheatDaysFailure =
  | 'empty'
  | 'too_many'
  | 'invalid_value'
  | 'duplicate';

export type CheatDaysValidation =
  | { valid: true; sanitized: readonly DayOfWeek[] }
  | { valid: false; reason: CheatDaysFailure };

export function validateCheatDays(values: number[]): CheatDaysValidation {
  if (!Array.isArray(values) || values.length === 0) {
    return { valid: false, reason: 'empty' };
  }
  if (values.length > CHEAT_DAYS_MAX) {
    return { valid: false, reason: 'too_many' };
  }
  const seen = new Set<number>();
  for (const v of values) {
    if (!isValidDayOfWeek(v)) {
      return { valid: false, reason: 'invalid_value' };
    }
    if (seen.has(v)) {
      return { valid: false, reason: 'duplicate' };
    }
    seen.add(v);
  }
  // Canonical sort (same Pattern 18 補強 D-3 mealTimings used).
  const sorted = DAY_OF_WEEK_OPTIONS.filter((opt) =>
    (values as readonly number[]).includes(opt),
  );
  return { valid: true, sanitized: sorted };
}

// === isAllInputsValidForD5 ===
//
// Composite gate. `even` distribution doesn't need cheatDays;
// `cheat_days` requires a non-empty + valid cheatDays array.
export function isAllInputsValidForD5(
  weeklyDistribution: WeeklyDistribution | null,
  cheatDays: number[] | null,
): boolean {
  if (weeklyDistribution == null) return false;
  if (!isValidWeeklyDistribution(weeklyDistribution)) return false;
  if (weeklyDistribution === 'even') {
    // cheatDays can be null or empty — both mean "no cheat days
    // configured" and are valid for the even distribution.
    return true;
  }
  // 'cheat_days' requires a populated valid array.
  if (cheatDays == null) return false;
  return validateCheatDays(cheatDays).valid;
}

// === toggleCheatDay ===
//
// Immutable add/remove returning a canonical-sorted array.
// Mirrors mealTimingUtils.toggleSelection's shape so the screen
// pattern is symmetric.
export function toggleCheatDay(
  current: readonly DayOfWeek[],
  toggled: DayOfWeek,
): readonly DayOfWeek[] {
  if (current.includes(toggled)) {
    return current.filter((d) => d !== toggled);
  }
  const next = [...current, toggled];
  return DAY_OF_WEEK_OPTIONS.filter((opt) => next.includes(opt));
}

// === formatCheatDaysCountLabel ===

export function formatCheatDaysCountLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '選択してください';
  if (count >= CHEAT_DAYS_MAX) return `${count} 件選択中（上限）`;
  return `${count} 件選択中`;
}

// === Error messages (JP) ===

const ERROR_MESSAGES: Record<CheatDaysFailure, string> = {
  empty: '1 つ以上選択してください',
  too_many: `自由日は ${CHEAT_DAYS_MAX} 日まで選択できます`,
  invalid_value: '無効な曜日が含まれています',
  duplicate: '重複した曜日があります',
};

export function getCheatDaysErrorMessage(reason: CheatDaysFailure): string {
  return ERROR_MESSAGES[reason];
}
