import { Gender, GoalType, ActivityLevel } from '../types/common';
import { ACTIVITY_MULTIPLIERS, GOAL_CALORIE_MULTIPLIERS } from '../constants/defaults';

export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: Gender
): number {
  if (gender === 'male' || gender === 'other') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function calculateTargetCalories(
  tdee: number,
  bmr: number,
  goalType: GoalType
): number {
  const multipliers = GOAL_CALORIE_MULTIPLIERS[goalType];
  const avg = (multipliers.min + multipliers.max) / 2;
  const target = Math.round(tdee * avg);

  // For cut, never go below BMR
  if (goalType === 'cut') {
    return Math.max(target, Math.round(bmr));
  }

  return target;
}

export function calculateAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

export function calculateAllCalories(
  weightKg: number,
  heightCm: number,
  birthYear: number,
  gender: Gender,
  activityLevel: ActivityLevel,
  goalType: GoalType
): { bmr: number; tdee: number; targetCalories: number } {
  const age = calculateAge(birthYear);
  const bmr = calculateBMR(weightKg, heightCm, age, gender);
  const tdee = calculateTDEE(bmr, activityLevel);
  const targetCalories = calculateTargetCalories(tdee, bmr, goalType);
  return { bmr: Math.round(bmr), tdee, targetCalories };
}

// ---------------------------------------------------------------------------
// Workout calorie burn (MET-based)
// ---------------------------------------------------------------------------

const MET_VALUES = { light: 3.5, moderate: 6.0, vigorous: 8.0 } as const;

export type WorkoutIntensity = keyof typeof MET_VALUES;

/**
 * Estimate calories burned during a strength-training session.
 * Formula: MET × bodyWeight(kg) × duration(h)
 */
export function calculateWorkoutCalories(
  bodyWeightKg: number,
  durationMinutes: number,
  intensity: WorkoutIntensity = 'moderate',
): number {
  const met = MET_VALUES[intensity];
  return Math.round(met * bodyWeightKg * (durationMinutes / 60));
}

/**
 * Estimate total daily calorie burn.
 * - If HealthKit/Health Connect data is available, use that + workout calories.
 * - Otherwise, use TDEE + partial workout calories (×0.5 to avoid double-counting
 *   activity already baked into the TDEE activity multiplier).
 */
export function calculateDailyBurn(
  tdee: number,
  workoutCalories: number,
  healthKitCalories?: number,
): number {
  if (healthKitCalories !== undefined && healthKitCalories > 0) {
    return healthKitCalories + workoutCalories;
  }
  return tdee + Math.round(workoutCalories * 0.5);
}
