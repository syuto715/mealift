import { useState, useEffect, useMemo } from 'react';
import { useProfileStore } from '../stores/profileStore';
import { useBodyLogs } from './useBodyLogs';
import { calculatePrediction } from '../domain/prediction';
import {
  calculateNutritionCompliance,
  calculateTrainingCompliance,
} from '../domain/compliance';
import { getWeeklyCalories } from '../infra/repositories/nutritionRepository';
import { getRecentSessionCount } from '../infra/repositories/workoutRepository';
import { PredictionResult } from '../types/prediction';
import { PREDICTION_MIN_DAYS } from '../constants/defaults';
import { parseISO } from 'date-fns';

export function usePrediction() {
  const profile = useProfileStore((s) => s.profile);
  const profileId = profile?.id ?? '';
  const { logs, avg7d, weightChange14d, isLoading: bodyLogsLoading } = useBodyLogs();

  const [weeklyCalories, setWeeklyCalories] = useState<number[]>([]);
  const [recentSessionCount, setRecentSessionCount] = useState(0);
  const [asyncLoading, setAsyncLoading] = useState(true);

  useEffect(() => {
    if (!profileId) {
      setAsyncLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const [weeklyCals, sessionCount] = await Promise.all([
          getWeeklyCalories(profileId),
          getRecentSessionCount(profileId, 7),
        ]);

        if (!cancelled) {
          setWeeklyCalories(weeklyCals.map((d) => d.calories));
          setRecentSessionCount(sessionCount);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setAsyncLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const logsWithWeight = useMemo(
    () => logs.filter((l) => l.weightKg !== null),
    [logs]
  );

  const daySpan = useMemo(() => {
    if (logsWithWeight.length < 2) return 0;
    const sorted = [...logsWithWeight].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const oldest = parseISO(sorted[0].date);
    const newest = parseISO(sorted[sorted.length - 1].date);
    return Math.round(
      (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24)
    );
  }, [logsWithWeight]);

  const hasEnoughData = daySpan >= PREDICTION_MIN_DAYS;
  const daysNeeded = Math.max(0, PREDICTION_MIN_DAYS - daySpan);

  const prediction: PredictionResult | null = useMemo(() => {
    if (!profile || avg7d === null || weightChange14d === null) return null;
    if (!profile.targetWeightKg) return null;
    if (!hasEnoughData) return null;

    const targetCalories = profile.targetCalories ?? 0;
    const nutritionCompliance = calculateNutritionCompliance(
      weeklyCalories,
      targetCalories
    );
    const trainingCompliance = calculateTrainingCompliance(
      recentSessionCount,
      profile.trainingDaysPerWeek ?? 3
    );

    return calculatePrediction({
      currentWeightAvg7d: avg7d,
      weightChange14d,
      targetWeight: profile.targetWeightKg,
      goalType: profile.goalType,
      nutritionCompliance,
      trainingCompliance,
    });
  }, [
    profile,
    avg7d,
    weightChange14d,
    hasEnoughData,
    weeklyCalories,
    recentSessionCount,
  ]);

  return {
    prediction,
    isLoading: bodyLogsLoading || asyncLoading,
    hasEnoughData,
    daysNeeded,
  };
}
