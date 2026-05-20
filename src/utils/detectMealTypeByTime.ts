import type { MealType } from '../types/common';

// v1.5 Phase 2.4 Sprint 2.4.1 — wall-clock → meal type heuristic.
//
// Heuristic windows tuned for the typical Japanese day:
//   - breakfast: 00:00 – 09:59 (early morning + breakfast)
//   - lunch:     10:00 – 14:59
//   - dinner:    15:00 – 20:59
//   - snack:     21:00 – 23:59
//
// The caller (Quick log composable) feeds this into `useNutrition.addFood`
// when the user hasn't explicitly chosen a meal slot. Pure function so
// tests can pin the contract without mocking Date.

export function detectMealTypeByTime(now: Date = new Date()): MealType {
  const h = now.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}
