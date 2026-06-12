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
  // target が 0 / 負 / 未設定のときは達成率を測れない。以前は 1(=100%)を
  // 返しており「記録ゼロなのにトレ100%」の誤表示を生んでいた。測定不能は
  // 0 として扱う(calculateNutritionCompliance の targetCalories<=0→0 と整合)。
  if (sessionsTarget <= 0) return 0;
  return Math.min(1, sessionsCompleted / sessionsTarget);
}
