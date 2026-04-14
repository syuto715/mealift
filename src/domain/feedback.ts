import { GoalType } from '../types/common';

export interface FeedbackInput {
  goalType: GoalType;
  hasWeightToday: boolean;
  hasMealsToday: boolean;
  todayCalories: number;
  targetCalories: number;
  todayProteinG: number;
  targetProteinG: number;
  isTrainingDay: boolean;
  hasTrainedToday: boolean;
  nutritionCompliance: number;
  previousNutritionCompliance: number;
}

export interface FeedbackResult {
  message: string;
  type: 'info' | 'warning' | 'success' | 'action';
  icon: string;
}

export function generateFeedback(input: FeedbackInput): FeedbackResult {
  const {
    goalType,
    hasWeightToday,
    hasMealsToday,
    todayCalories,
    targetCalories,
    todayProteinG,
    targetProteinG,
    isTrainingDay,
    hasTrainedToday,
    nutritionCompliance,
    previousNutritionCompliance,
  } = input;

  // Priority 1: No weight today
  if (!hasWeightToday) {
    return {
      message: '今日の体重を記録しましょう',
      type: 'action',
      icon: 'scale-outline',
    };
  }

  // Priority 2: No meals logged
  if (!hasMealsToday) {
    return {
      message: '食事を記録すると目標が近づきます',
      type: 'action',
      icon: 'restaurant-outline',
    };
  }

  // Priority 3: Calorie check (depends on goal)
  if (targetCalories > 0 && todayCalories > 0) {
    const diff = todayCalories - targetCalories;
    const tolerance = targetCalories * 0.10;

    if (goalType === 'cut' && diff > tolerance) {
      return {
        message: `今日は${Math.round(diff)}kcalオーバーです`,
        type: 'warning',
        icon: 'alert-circle-outline',
      };
    }

    if ((goalType === 'bulk' || goalType === 'recomp') && diff < -tolerance) {
      return {
        message: `目標カロリーに${Math.round(Math.abs(diff))}kcal足りません`,
        type: 'info',
        icon: 'information-circle-outline',
      };
    }
  }

  // Priority 4: Protein shortage
  if (targetProteinG > 0 && todayProteinG > 0) {
    const proteinDiff = targetProteinG - todayProteinG;
    if (proteinDiff > targetProteinG * 0.2) {
      return {
        message: `タンパク質があと${Math.round(proteinDiff)}g足りません`,
        type: 'warning',
        icon: 'nutrition-outline',
      };
    }
  }

  // Priority 5: Training day reminder
  if (isTrainingDay && !hasTrainedToday) {
    return {
      message: '今日はトレーニング日です',
      type: 'action',
      icon: 'barbell-outline',
    };
  }

  // Priority 6: On track
  if (nutritionCompliance >= 0.7) {
    // Priority 7: Improving
    if (nutritionCompliance > previousNutritionCompliance && previousNutritionCompliance > 0) {
      return {
        message: '先週より順守率が上がっています',
        type: 'success',
        icon: 'trending-up-outline',
      };
    }

    return {
      message: 'いい調子です！このペースを維持しましょう',
      type: 'success',
      icon: 'checkmark-circle-outline',
    };
  }

  return {
    message: 'いい調子です！このペースを維持しましょう',
    type: 'success',
    icon: 'checkmark-circle-outline',
  };
}
