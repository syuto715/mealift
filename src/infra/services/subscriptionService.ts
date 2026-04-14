export type PlanTier = 'free' | 'plus' | 'pro';

export interface FeatureFlags {
  maxRoutines: number;
  barcodeScanner: boolean;
  photoMealLog: boolean;
  goalPrediction: boolean;
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
}

const PLAN_FEATURES: Record<PlanTier, FeatureFlags> = {
  free: {
    maxRoutines: 3,
    barcodeScanner: false,
    photoMealLog: false,
    goalPrediction: false,
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
    healthSync: false,
    extendedNutrientBalance: false,
    mealNutrientBalance: false,
    aiNutrientAdvice: false,
  },
  plus: {
    maxRoutines: Infinity,
    barcodeScanner: true,
    photoMealLog: false,
    goalPrediction: true,
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
  },
  pro: {
    maxRoutines: Infinity,
    barcodeScanner: true,
    photoMealLog: true,
    goalPrediction: true,
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
  },
};

// Free plan limits
export const FREE_LIMITS = {
  maxFavorites: 10,
  maxTemplates: 3,
} as const;

// MVP: All features unlocked for development
const DEV_MODE = true;

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
  if (DEV_MODE) return PLAN_FEATURES.pro;
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
