import { useCallback, useEffect, useState } from 'react';
import { useProfileStore } from '../stores/profileStore';
import {
  generateGoalSuggestion,
  applySuggestion as applySuggestionDomain,
  dismissSuggestion as dismissSuggestionDomain,
  shouldShowSuggestionNow,
} from '../domain/adaptiveGoal';
import { AdaptiveGoalSuggestion } from '../types/adaptiveGoal';
import { canUse } from '../infra/services/subscriptionService';

export function useAdaptiveGoal() {
  const profile = useProfileStore((s) => s.profile);
  const updateProfileStore = useProfileStore((s) => s.updateProfile);
  const [suggestion, setSuggestion] = useState<AdaptiveGoalSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const enabled = !!profile && profile.adaptiveGoalEnabled;
  const canShow = canUse('adaptiveGoal');

  const load = useCallback(async () => {
    if (!profile || !enabled || !canShow) {
      setSuggestion(null);
      setIsLoading(false);
      return;
    }
    if (!shouldShowSuggestionNow(profile)) {
      setSuggestion(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const s = await generateGoalSuggestion(profile);
      setSuggestion(s);
    } catch {
      setSuggestion(null);
    } finally {
      setIsLoading(false);
    }
  }, [profile, enabled, canShow]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = useCallback(async () => {
    if (!profile || !suggestion) return;
    await applySuggestionDomain(profile, suggestion);
    updateProfileStore({
      targetCalories: suggestion.suggestedCalorieTarget,
      adaptiveGoalLastShownAt: new Date().toISOString(),
    });
    setSuggestion(null);
  }, [profile, suggestion, updateProfileStore]);

  const dismiss = useCallback(async () => {
    if (!profile || !suggestion) return;
    await dismissSuggestionDomain(profile, suggestion);
    updateProfileStore({ adaptiveGoalLastShownAt: new Date().toISOString() });
    setSuggestion(null);
  }, [profile, suggestion, updateProfileStore]);

  return { suggestion, isLoading, approve, dismiss, locked: !canShow };
}
