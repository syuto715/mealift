import { useEffect, useState, useCallback } from 'react';
import { useProfileStore } from '../stores/profileStore';
import { predictGoalArrival } from '../domain/goalPrediction';
import { GoalPrediction } from '../types/goalPrediction';

export function useGoalPrediction() {
  const profile = useProfileStore((s) => s.profile);
  const [prediction, setPrediction] = useState<GoalPrediction | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!profile) {
      setPrediction(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const result = await predictGoalArrival(profile);
      setPrediction(result);
    } catch {
      setPrediction(null);
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { prediction, isLoading, refresh };
}
