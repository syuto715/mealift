import { useState, useEffect } from 'react';
import { FeedbackResult, generateFeedback } from '../domain/feedback';
import { useProfileStore } from '../stores/profileStore';
import {
  calculateNutritionCompliance,
  calculateTrainingCompliance,
} from '../domain/compliance';
import { getDailyCalories, getWeeklyCalories } from '../infra/repositories/nutritionRepository';
import { getBodyLogByDate } from '../infra/repositories/bodyLogRepository';
import { getRecentSessionCount, getSessions } from '../infra/repositories/workoutRepository';
import { useNutrition } from './useNutrition';
import { getISODate } from '../utils/format';
import { subDays } from 'date-fns';

export function useFeedback(date?: string) {
  const profile = useProfileStore((s) => s.profile);
  const profileId = profile?.id ?? '';
  const { totalProteinG } = useNutrition(date);

  const [feedback, setFeedback] = useState<FeedbackResult>({
    message: 'いい調子です！このペースを維持しましょう',
    type: 'success',
    icon: 'checkmark-circle-outline',
  });

  useEffect(() => {
    if (!profileId || !profile) return;

    let cancelled = false;

    const load = async () => {
      try {
        const todayStr = date ?? getISODate();

        // Load data in parallel
        const [todayCalories, todayBodyLog, recentSessions, weeklyCaloriesData] =
          await Promise.all([
            getDailyCalories(profileId, todayStr),
            getBodyLogByDate(profileId, todayStr),
            getRecentSessionCount(profileId, 1),
            getWeeklyCalories(profileId),
          ]);

        // This week's nutrition compliance
        const thisWeekCalories = weeklyCaloriesData.map((d) => d.calories);
        const targetCalories = profile.targetCalories ?? 0;
        const nutritionCompliance = calculateNutritionCompliance(
          thisWeekCalories,
          targetCalories
        );

        // Previous week compliance (approximate: use 0 if not enough data)
        // We don't have a getWeeklyCalories for a specific range, so use 0 as previous
        const previousNutritionCompliance = 0;

        // Determine if today is a training day (simple: training days per week > 0)
        const dayOfWeek = new Date().getDay(); // 0=Sun
        const trainingDays = profile.trainingDaysPerWeek ?? 0;
        // Simple heuristic: first N days of the week are training days (Mon-based)
        const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Mon=1..Sun=7
        const isTrainingDay = adjustedDay <= trainingDays;

        const hasTrainedToday = recentSessions > 0;

        const result = generateFeedback({
          goalType: profile.goalType,
          hasWeightToday: todayBodyLog !== null && todayBodyLog.weightKg !== null,
          hasMealsToday: todayCalories > 0,
          todayCalories,
          targetCalories,
          todayProteinG: totalProteinG,
          targetProteinG: profile.targetProteinG ?? 0,
          isTrainingDay,
          hasTrainedToday,
          nutritionCompliance,
          previousNutritionCompliance,
        });

        if (!cancelled) {
          setFeedback(result);
        }
      } catch (error) {
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [profileId, profile, totalProteinG, date]);

  return { feedback };
}
