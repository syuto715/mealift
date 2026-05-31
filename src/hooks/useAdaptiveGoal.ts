import { useCallback, useEffect, useState } from 'react';
import { useProfileStore } from '../stores/profileStore';
import {
  generateGoalSuggestion,
  applySuggestion as applySuggestionDomain,
  dismissSuggestion as dismissSuggestionDomain,
  shouldShowSuggestionNow,
} from '../domain/adaptiveGoal';
import { AdaptiveGoalSuggestion } from '../types/adaptiveGoal';
import { useSubscription } from './useSubscription';

export function useAdaptiveGoal() {
  const profile = useProfileStore((s) => s.profile);
  const updateProfileStore = useProfileStore((s) => s.updateProfile);
  const { hasFeature } = useSubscription();
  const [suggestion, setSuggestion] = useState<AdaptiveGoalSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const enabled = !!profile && profile.adaptiveGoalEnabled;
  // v1.5 UI sprint Phase 1a — reactive gate (was canUse, non-reactive module
  // currentTier). Same tier gated (adaptiveGoal); only reactivity added so a
  // plan change re-runs the suggestion load without a manual remount.
  const canShow = hasFeature('adaptiveGoal');

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
