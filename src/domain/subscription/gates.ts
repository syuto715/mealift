import { hasFeature, type PlanStatus } from '../../infra/services/subscriptionService';

// Domain-level gate functions — one place for cross-cutting rules that don't
// map cleanly to a single FeatureFlags boolean. Each function takes a
// PlanStatus (derived from a Profile via derivePlanSnapshot) so callers remain
// pure and testable.

// Free users can only see the most recent N days of nutrition / workout
// history; Plus and above see everything. Trial users get Plus access.
export const FREE_HISTORY_WINDOW_DAYS = 30;

export function canAccessHistoryBeyond(
  status: PlanStatus,
  daysAgo: number,
): boolean {
  if (hasFeature('historyUnlimited', status)) return true;
  return daysAgo <= FREE_HISTORY_WINDOW_DAYS;
}

/**
 * Returns the number of days a repo query should clamp to, or `null` when
 * the caller's plan allows unlimited history. Convenience wrapper so hooks
 * / screens can just forward the return value straight into repo calls.
 */
export function historyWindowDaysFor(status: PlanStatus): number | null {
  return hasFeature('historyUnlimited', status) ? null : FREE_HISTORY_WINDOW_DAYS;
}

// Free users are capped on progress-photo count; Plus/Pro get unlimited.
// `currentCount` is the number of photos already stored for the user.
export const FREE_PROGRESS_PHOTO_LIMIT = 3;

export function canAddProgressPhoto(
  status: PlanStatus,
  currentCount: number,
): boolean {
  if (hasFeature('progressPhotos', status)) return true;
  return currentCount < FREE_PROGRESS_PHOTO_LIMIT;
}

// Macro nutrients (P/F/C, calories, fiber, salt) are always free.
// Extended micro nutrients require extendedNutrientBalance / mealNutrientBalance.
const FREE_NUTRIENTS = new Set([
  'calories',
  'proteinG',
  'fatG',
  'carbG',
  'fiberG',
  'sodiumMg',
  'saltG',
]);

export function canViewNutrient(
  status: PlanStatus,
  nutrientKey: string,
): boolean {
  if (FREE_NUTRIENTS.has(nutrientKey)) return true;
  return hasFeature('extendedNutrientBalance', status);
}
