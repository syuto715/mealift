import { useCallback, useMemo, useState } from 'react';
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
import {
  getCurrentOffering,
  purchasePackage,
  restorePurchases,
  applyCustomerInfoToProfile,
  isRevenueCatAvailable,
} from '../infra/services/revenueCatService';

type BooleanFeatureKey = {
  [K in keyof FeatureFlags]: FeatureFlags[K] extends boolean ? K : never;
}[keyof FeatureFlags];

export interface UseSubscriptionResult extends PlanSnapshot {
  // Alias for `tier` — matches the spec's "plan" terminology. Same value.
  plan: PlanTier;
  isFree: boolean;
  isTrial: boolean;
  isPlus: boolean;
  isPro: boolean;
  isPaid: boolean;
  isLoading: boolean;
  hasFeature: (feature: BooleanFeatureKey) => boolean;
  // Triggers a RevenueCat purchase for the given package identifier
  // (e.g. "plus_annual", "pro_monthly"). Returns true on success, false when
  // the user cancels. Throws RevenueCatError for genuine errors.
  subscribe: (packageId: string) => Promise<boolean>;
  // Restores prior purchases. Applies the restored CustomerInfo to profile
  // state on success. Throws RevenueCatError on failure.
  restore: () => Promise<void>;
}

// Subscribes to the profile store so billing state re-renders when the
// profile mutates (e.g., trial start, plan purchase). Callers should use
// `result.hasFeature(...)` for gating and the status booleans for UI.
export function useSubscription(): UseSubscriptionResult {
  const profile = useProfileStore((s) => s.profile);
  const [isLoading, setIsLoading] = useState(false);

  const subscribe = useCallback(async (packageId: string): Promise<boolean> => {
    if (!isRevenueCatAvailable()) return false;
    setIsLoading(true);
    try {
      const offering = await getCurrentOffering();
      const pkg =
        offering?.availablePackages.find((p) => p.identifier === packageId) ??
        null;
      if (!pkg) return false;
      const { customerInfo, userCancelled } = await purchasePackage(pkg);
      if (userCancelled) return false;
      await applyCustomerInfoToProfile(customerInfo);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restore = useCallback(async (): Promise<void> => {
    if (!isRevenueCatAvailable()) return;
    setIsLoading(true);
    try {
      const info = await restorePurchases();
      await applyCustomerInfoToProfile(info);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const derived = useMemo(() => {
    const snapshot = derivePlanSnapshot(profile);
    // Upgrade snapshot.tier when the process-level currentTier claims pro —
    // keeps getCurrentTier-driven code paths aligned with the hook's view.
    const moduleTier = getCurrentTier();
    const tier: PlanTier =
      snapshot.tier === 'plus' && moduleTier === 'pro' ? 'pro' : snapshot.tier;
    const status: PlanStatus =
      snapshot.status === 'plus' && moduleTier === 'pro' ? 'pro' : snapshot.status;

    return {
      snapshot,
      tier,
      status,
    };
  }, [profile]);

  return {
    ...derived.snapshot,
    tier: derived.tier,
    status: derived.status,
    plan: derived.tier,
    isFree: derived.status === 'free',
    isTrial: derived.status === 'trial',
    isPlus: derived.status === 'plus',
    isPro: derived.status === 'pro',
    isPaid: derived.status === 'plus' || derived.status === 'pro',
    isLoading,
    hasFeature: (feature: BooleanFeatureKey) => hasFeature(feature, derived.status),
    subscribe,
    restore,
  };
}
