import { useEffect, useCallback } from 'react';
import { useNutritionStore } from '../stores/nutritionStore';
import { useProfileStore } from '../stores/profileStore';
import { MealType } from '../types/common';
import { MealLogItemInput, MealLogWithItems } from '../types/nutrition';
import { getISODate } from '../utils/format';
import {
  getOrCreateMealLog,
  addMealLogItem,
  updateMealLogItem,
  removeMealLogItem,
  getDailyNutritionSummary,
} from '../infra/repositories/nutritionRepository';
import { incrementFoodUseCount } from '../infra/repositories/foodRepository';

/**
 * @param date Optional date override (defaults to today)
 */
export function useNutrition(date?: string) {
  const { todaySummary, setTodaySummary } = useNutritionStore();
  const profile = useProfileStore((s) => s.profile);
  const profileId = profile?.id ?? '';
  const targetDate = date ?? getISODate();

  const refreshSummary = useCallback(async () => {
    if (!profileId) return;
    const summary = await getDailyNutritionSummary(profileId, targetDate);
    setTodaySummary(summary);
  }, [profileId, targetDate, setTodaySummary]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  const getMealItems = useCallback(
    (mealType: MealType): MealLogWithItems | undefined => {
      return todaySummary?.meals.find((m) => m.mealType === mealType);
    },
    [todaySummary]
  );

  const addFood = useCallback(
    async (mealType: MealType, item: MealLogItemInput) => {
      if (!profileId) return;
      const mealLog = await getOrCreateMealLog(profileId, targetDate, mealType);
      await addMealLogItem(mealLog.id, item);
      if (item.foodId) {
        await incrementFoodUseCount(item.foodId);
      }
      await refreshSummary();
    },
    [profileId, targetDate, refreshSummary]
  );

  const updateFood = useCallback(
    async (
      itemId: string,
      updates: {
        servingAmount: number;
        servingUnit: string;
        calories: number;
        proteinG: number;
        fatG: number;
        carbG: number;
      }
    ) => {
      await updateMealLogItem(itemId, updates);
      await refreshSummary();
    },
    [refreshSummary]
  );

  const removeFood = useCallback(
    async (itemId: string) => {
      await removeMealLogItem(itemId);
      await refreshSummary();
    },
    [refreshSummary]
  );

  return {
    todaySummary,
    totalCalories: todaySummary?.totalCalories ?? 0,
    totalProteinG: todaySummary?.totalProteinG ?? 0,
    totalFatG: todaySummary?.totalFatG ?? 0,
    totalCarbG: todaySummary?.totalCarbG ?? 0,
    meals: todaySummary?.meals ?? [],
    getMealItems,
    addFood,
    updateFood,
    removeFood,
    refreshSummary,
  };
}
