import { useMemo } from 'react';
import { useProfileStore } from '../stores/profileStore';
import {
  derivePlanSnapshot,
  hasFeature,
  getCurrentTier,
  type PlanSnapshot,
  type PlanStatus,
  type PlanTier,
  type FeatureFlags,
} from '../infra/services/subscriptionService';

type BooleanFeatureKey = {
  [K in keyof FeatureFlags]: FeatureFlags[K] extends boolean ? K : never;
}[keyof FeatureFlags];

export interface UseSubscriptionResult extends PlanSnapshot {
  isFree: boolean;
  isTrial: boolean;
  isPlus: boolean;
  isPro: boolean;
  isPaid: boolean;
  hasFeature: (feature: BooleanFeatureKey) => boolean;
}

// Subscribes to the profile store so billing state re-renders when the
// profile mutates (e.g., trial start, plan purchase). Callers should use
// `result.hasFeature(...)` for gating and the status booleans for UI.
export function useSubscription(): UseSubscriptionResult {
  const profile = useProfileStore((s) => s.profile);

  return useMemo(() => {
    const snapshot = derivePlanSnapshot(profile);
    // Upgrade snapshot.tier when the process-level currentTier claims pro —
    // keeps getCurrentTier-driven code paths aligned with the hook's view.
    const moduleTier = getCurrentTier();
    const tier: PlanTier =
      snapshot.tier === 'plus' && moduleTier === 'pro' ? 'pro' : snapshot.tier;
    const status: PlanStatus =
      snapshot.status === 'plus' && moduleTier === 'pro' ? 'pro' : snapshot.status;

    return {
      ...snapshot,
      tier,
      status,
      isFree: status === 'free',
      isTrial: status === 'trial',
      isPlus: status === 'plus',
      isPro: status === 'pro',
      isPaid: status === 'plus' || status === 'pro',
      hasFeature: (feature: BooleanFeatureKey) => hasFeature(feature, status),
    };
  }, [profile]);
}
