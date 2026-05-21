import type { MealLogItem } from '../types/nutrition';

// v1.5 Phase 2.4 Sprint 2.4.5 — portion re-scale pure helper.
//
// The (gamma) snapshot-only path from Sprint 2.4.1 writes
// `meal_log_items` with `food_id = null`, so production's
// `nutrition/index.tsx::handleEditItem` (which needs `item.foodId`
// to load the canonical Food row) can't edit those rows. Instead
// we re-scale the snapshot in place: the row already stores
// macros at the original `servingAmount`, so adjusting the
// portion is just a per-axis multiply by `newAmount / oldAmount`.
//
// This is by-design lossy for the macros only — extended
// nutrients aren't writable by `updateMealLogItem` today (it only
// accepts the 4-macro tuple). We still compute the scaled values
// here so the edit sheet can display them, but only the macro
// quartet round-trips to the DB.
//
// Drafting 166 alignment: re-scaling the snapshot is a user-
// initiated edit, not a master-update propagation. The history
// immutability invariant covers external master refreshes, not
// the user's own corrections.

export interface ScaledMacros {
  servingAmount: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

export function scaleMealLogItemPortion(
  item: MealLogItem,
  newAmount: number,
): ScaledMacros {
  // Guard against the degenerate case where the stored amount is 0
  // (shouldn't happen because the schema requires NOT NULL DEFAULT 1,
  // but we never want NaN sneaking into the meal log).
  const base = item.servingAmount > 0 ? item.servingAmount : 1;
  const factor = newAmount / base;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round0 = (n: number) => Math.round(n);
  return {
    servingAmount: newAmount,
    servingUnit: item.servingUnit,
    calories: round0(item.calories * factor),
    proteinG: round1(item.proteinG * factor),
    fatG: round1(item.fatG * factor),
    carbG: round1(item.carbG * factor),
  };
}
