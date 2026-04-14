import { COMPLIANCE_CALORIE_TOLERANCE } from '../constants/defaults';

export function calculateNutritionCompliance(
  dailyCalories: number[],
  targetCalories: number
): number {
  if (dailyCalories.length === 0 || targetCalories <= 0) return 0;

  const adherentDays = dailyCalories.filter((cal) => {
    const diff = Math.abs(cal - targetCalories) / targetCalories;
    return diff <= COMPLIANCE_CALORIE_TOLERANCE;
  }).length;

  return adherentDays / dailyCalories.length;
}

export function calculateTrainingCompliance(
  sessionsCompleted: number,
  sessionsTarget: number
): number {
  if (sessionsTarget <= 0) return 1;
  return Math.min(1, sessionsCompleted / sessionsTarget);
}
