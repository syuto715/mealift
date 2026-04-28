import type { Profile } from '../../types/profile';
import { TRIAL_DURATION_DAYS } from '../../constants/pricing';

export type PlanTier = 'free' | 'plus' | 'pro';

// Richer runtime view: distinguishes "free user on active Plus trial" from
// "free user, no trial" and from "paid Plus". Used by gate logic and the
// subscription UI. `PlanTier` remains the DB-facing value for historical code.
export type PlanStatus = 'free' | 'trial' | 'plus' | 'pro';

export interface FeatureFlags {
  maxRoutines: number;
  barcodeScanner: boolean;
  photoMealLog: boolean;
  goalPrediction: boolean;
  goalPredictionDetailed: boolean;
  adaptiveGoal: boolean;
  adaptiveCalories: boolean;
  weeklyReport: boolean;
  progressPhotos: boolean;
  aiReview: boolean;
  detailedAnalytics: boolean;
  exportData: boolean;
  aiNutritionEstimate: boolean;
  unlimitedFavorites: boolean;
  unlimitedTemplates: boolean;
  workoutSuggestion: boolean;
  healthSync: boolean;
  extendedNutrientBalance: boolean;
  mealNutrientBalance: boolean;
  aiNutrientAdvice: boolean;
  prAllTypes: boolean;
  restTimerPerExercise: boolean;
  shareImages: boolean;
  historyUnlimited: boolean;
}

const PLAN_FEATURES: Record<PlanTier, FeatureFlags> = {
  free: {
    maxRoutines: 3,
    barcodeScanner: false,
    photoMealLog: false,
    goalPrediction: true,
    goalPredictionDetailed: false,
    adaptiveGoal: false,
    adaptiveCalories: false,
    weeklyReport: false,
    progressPhotos: false,
    aiReview: false,
    detailedAnalytics: false,
    exportData: false,
    aiNutritionEstimate: false,
    unlimitedFavorites: false,
    unlimitedTemplates: false,
    workoutSuggestion: false,
    // Health integrations (Apple Health / Health Connect) are free for all
    // users — DO NOT gate behind subscription. Read access to active-energy
    // / step counts is required for accurate calorie tracking, which is the
    // core value of the free tier. Confirm with product before changing.
    healthSync: true,
    extendedNutrientBalance: false,
    mealNutrientBalance: false,
    aiNutrientAdvice: false,
    prAllTypes: false,
    restTimerPerExercise: false,
    shareImages: false,
    historyUnlimited: false,
  },
  plus: {
    maxRoutines: Infinity,
    barcodeScanner: true,
    photoMealLog: false,
    goalPrediction: true,
    goalPredictionDetailed: true,
    adaptiveGoal: true,
    adaptiveCalories: false,
    weeklyReport: true,
    progressPhotos: true,
    aiReview: false,
    detailedAnalytics: true,
    exportData: true,
    aiNutritionEstimate: false,
    unlimitedFavorites: true,
    unlimitedTemplates: true,
    workoutSuggestion: true,
    healthSync: true,
    extendedNutrientBalance: true,
    mealNutrientBalance: true,
    aiNutrientAdvice: false,
    prAllTypes: true,
    restTimerPerExercise: true,
    shareImages: true,
    historyUnlimited: true,
  },
  pro: {
    maxRoutines: Infinity,
    barcodeScanner: true,
    photoMealLog: true,
    goalPrediction: true,
    goalPredictionDetailed: true,
    adaptiveGoal: true,
    adaptiveCalories: true,
    weeklyReport: true,
    progressPhotos: true,
    aiReview: true,
    detailedAnalytics: true,
    exportData: true,
    aiNutritionEstimate: true,
    unlimitedFavorites: true,
    unlimitedTemplates: true,
    workoutSuggestion: true,
    healthSync: true,
    extendedNutrientBalance: true,
    mealNutrientBalance: true,
    aiNutrientAdvice: true,
    prAllTypes: true,
    restTimerPerExercise: true,
    shareImages: true,
    historyUnlimited: true,
  },
};

// Free plan limits
export const FREE_LIMITS = {
  maxFavorites: 10,
  maxTemplates: 3,
} as const;

// During development we open every gate so the team can poke around without
// faking a paid plan. `__DEV__` is the React Native global — true under
// `expo start`, false in any production-class build (preview, production,
// release). Inlined at each call site (rather than captured as a constant)
// so jest can override `global.__DEV__` per test.
let currentTier: PlanTier = 'free';

export function getCurrentTier(): PlanTier {
  return currentTier;
}

export function getCurrentPlan(): PlanTier {
  return getCurrentTier();
}

export function setTier(tier: PlanTier): void {
  currentTier = tier;
}

export function getFeatureFlags(): FeatureFlags {
  if (__DEV__) return PLAN_FEATURES.pro;
  return PLAN_FEATURES[currentTier];
}

export function canUse(feature: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags();
  const value = flags[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return true;
}

export function getFeaturesForTier(tier: PlanTier): FeatureFlags {
  return PLAN_FEATURES[tier];
}

// ---------------------------------------------------------------------------
// FEATURE_MATRIX — semantic mapping from feature key to minimum required plan.
//
// `canUse()` above asks "does the currently-active `FeatureFlags` allow X?",
// which is correct but flag-centric. `FEATURE_MATRIX` + `hasFeature()` ask the
// inverse: "which plan does a user need to use X?". The matrix is derived from
// `PLAN_FEATURES` (not hand-kept), so the two stay in sync automatically.
//
// Existing callers continue to use `canUse()` against `getFeatureFlags()`; new
// callers (gates.ts, upgrade prompts) use `hasFeature()` against a
// `PlanStatus` so they can reason about trial users explicitly.
// ---------------------------------------------------------------------------

type BooleanFeatureKey = {
  [K in keyof FeatureFlags]: FeatureFlags[K] extends boolean ? K : never;
}[keyof FeatureFlags];

const TIER_RANK: Record<PlanTier, number> = { free: 0, plus: 1, pro: 2 };

function minimumTierFor(feature: BooleanFeatureKey): PlanTier {
  if (PLAN_FEATURES.free[feature]) return 'free';
  if (PLAN_FEATURES.plus[feature]) return 'plus';
  return 'pro';
}

export const FEATURE_MATRIX: Record<BooleanFeatureKey, PlanTier> = (() => {
  const out = {} as Record<BooleanFeatureKey, PlanTier>;
  const sample = PLAN_FEATURES.free;
  for (const key of Object.keys(sample) as Array<keyof FeatureFlags>) {
    if (typeof sample[key] === 'boolean') {
      out[key as BooleanFeatureKey] = minimumTierFor(key as BooleanFeatureKey);
    }
  }
  return out;
})();

// Collapses a PlanStatus to the underlying PlanTier for ranking purposes.
// Trial users get Plus-level access until the trial ends.
function statusToEffectiveTier(status: PlanStatus): PlanTier {
  if (status === 'trial') return 'plus';
  return status;
}

export function hasFeature(
  feature: BooleanFeatureKey,
  status: PlanStatus,
): boolean {
  if (__DEV__) return true;
  const required = FEATURE_MATRIX[feature];
  const effective = statusToEffectiveTier(status);
  return TIER_RANK[effective] >= TIER_RANK[required];
}

// ---------------------------------------------------------------------------
// Profile → PlanStatus derivation.
//
// A user's plan is reconstructed from three profile columns added in v11:
//   trial_started_at  — when the 7-day Plus trial started (or NULL)
//   plan_billing_cycle — active paid cycle (or NULL when not paying)
//   plan_expires_at    — when the active paid plan lapses
//
// Priority, highest first:
//   1. plan_expires_at in the future AND plan_billing_cycle set → paid tier.
//      (Pro vs. Plus is disambiguated by the currentTier module state, which
//      is kept in sync by setTier() when a purchase is processed.)
//   2. trial_started_at within TRIAL_DURATION_DAYS → 'trial'
//   3. otherwise → 'free'
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlanSnapshot {
  status: PlanStatus;
  tier: PlanTier;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  planExpiresAt: string | null;
  billingCycle: Profile['planBillingCycle'];
}

export function derivePlanSnapshot(
  profile: Profile | null,
  now: Date = new Date(),
): PlanSnapshot {
  const trialStartedAt = profile?.trialStartedAt ?? null;
  const planExpiresAt = profile?.planExpiresAt ?? null;
  const billingCycle = profile?.planBillingCycle ?? null;

  // Paid plan takes precedence.
  if (planExpiresAt && Date.parse(planExpiresAt) > now.getTime()) {
    const tier = currentTier === 'pro' ? 'pro' : 'plus';
    return {
      status: tier,
      tier,
      trialStartedAt,
      trialEndsAt: null,
      trialDaysRemaining: null,
      planExpiresAt,
      billingCycle,
    };
  }

  // Active trial.
  if (trialStartedAt) {
    const startedMs = Date.parse(trialStartedAt);
    if (!Number.isNaN(startedMs)) {
      const endsMs = startedMs + TRIAL_DURATION_DAYS * DAY_MS;
      if (endsMs > now.getTime()) {
        const daysLeft = Math.max(
          0,
          Math.ceil((endsMs - now.getTime()) / DAY_MS),
        );
        return {
          status: 'trial',
          tier: 'free',
          trialStartedAt,
          trialEndsAt: new Date(endsMs).toISOString(),
          trialDaysRemaining: daysLeft,
          planExpiresAt: null,
          billingCycle: null,
        };
      }
    }
  }

  return {
    status: 'free',
    tier: 'free',
    trialStartedAt,
    trialEndsAt: trialStartedAt
      ? new Date(
          Date.parse(trialStartedAt) + TRIAL_DURATION_DAYS * DAY_MS,
        ).toISOString()
      : null,
    trialDaysRemaining: 0,
    planExpiresAt,
    billingCycle,
  };
}
