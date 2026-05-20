import type { MealType } from '../types/common';
import type {
  DailyNutritionSummary,
  MealLogItem,
} from '../types/nutrition';

// v1.5 Phase 2.4 Sprint 2.4.4 — meal-type grouping.
//
// `getDailyNutritionSummary` returns `MealLogWithItems[]` already
// grouped by meal_log row (which is itself per-meal-type). The
// timeline view wants a 4-bucket map keyed by MealType so the
// section list always shows ordered breakfast → lunch → dinner →
// snack rows, even when one or more buckets is empty.

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type MealItemsByType = Record<MealType, MealLogItem[]>;

export function groupMealItemsByType(
  summary: DailyNutritionSummary | null | undefined,
): MealItemsByType {
  const out: MealItemsByType = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  if (!summary) return out;
  for (const meal of summary.meals) {
    if (MEAL_TYPES.includes(meal.mealType)) {
      out[meal.mealType] = [...out[meal.mealType], ...meal.items];
    }
  }
  return out;
}
