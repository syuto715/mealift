import { create } from 'zustand';
import { GoalType, ActivityLevel, Gender, Equipment } from '../types/common';
import type {
  Profile,
  WeeklyRatePct,
  MealPlan,
  ProteinFactor,
  WeeklyDistribution,
  MacroKey,
} from '../types/profile';

// v1.3.0 / Onboarding v2 / Phase A-3 — onboardingStore extension.
//
// Existing Build 14/15 fields preserved (goalType / gender /
// birthYear / heightCm / currentWeightKg / targetWeightKg /
// targetBodyFatPct / activityLevel / trainingDaysPerWeek /
// equipment / targetDate). The new flow adds:
//
//   - Identity: nickname (separate from Profile.displayName; the
//     latter is the Supabase-derived login identity, while
//     nickname is the warm onboarding copy carried throughout the
//     app — kickoff §6.2 sign-off (i)).
//   - Goal pace: weeklyRatePct (-1.0..0.25)
//   - Meal plan: mealPlan + mealTimings
//   - Protein: proteinFactor (g/kg multiplier)
//   - Weekly distribution: weeklyDistribution + cheatDays
//   - Onboarding state: onboardingStep (mid-flow resume cursor)
//   - Calculated cache: bmr / tdee / dailyCalorieTarget /
//     estimatedTargetDate / pfcTargets — all populated by
//     calculateAll(), which reads from onboardingCalc helpers
//     (Phase A-4 lands the actual logic; A-3 stubs to no-op).
//
// Actions:
//   - Existing setGoal / setBody / setTraining preserved for
//     Build 14/15 callers (welcome-and-goal.tsx + body-and-training.tsx
//     still use them — those screens get deleted in Phase D-X
//     once their replacements ship).
//   - New setField<K> generic — enforces field/value type pairing
//     (Phase 6.1 generic-T preservation pattern, applied at setter
//     scope).
//   - calculateAll / persistToProfile: stubs in A-3, filled in
//     A-4 / A-5 respectively.
//   - prefillFromProfile: hydrates store from an existing Profile
//     row so Build 14/15 users see all their data pre-filled when
//     re-running the onboarding (kickoff Q2 (a) sign-off — full
//     edit + fast-track skip).
//   - reset: clears every field back to its initial value, including
//     all v2 additions and cache.

// === Data shape ===

export interface OnboardingData {
  // Build 14/15 fields (preserved)
  goalType: GoalType;
  gender: Gender;
  birthYear: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number | null;
  targetBodyFatPct: number | null;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  equipment: Equipment;
  targetDate: string | null;

  // v1.3.0 / Onboarding v2 fields (new)
  nickname: string | null;
  weeklyRatePct: WeeklyRatePct | null;
  mealPlan: MealPlan | null;
  mealTimings: string[] | null;
  proteinFactor: ProteinFactor | null;
  weeklyDistribution: WeeklyDistribution | null;
  cheatDays: number[] | null;
  onboardingStep: number;

  // Calculated cache (filled by calculateAll, read by [10] [11] [12])
  bmr: number | null;
  tdee: number | null;
  dailyCalorieTarget: number | null;
  estimatedTargetDate: Date | null;
  pfcTargets: Record<MacroKey, number> | null;
}

// === Actions ===

export interface OnboardingActions {
  // Build 14/15 bulk setters (preserved for legacy screens)
  setGoal: (goalType: GoalType) => void;
  setBody: (data: {
    gender: Gender;
    birthYear: number;
    heightCm: number;
    currentWeightKg: number;
    targetWeightKg: number | null;
    targetBodyFatPct: number | null;
  }) => void;
  setTraining: (data: {
    activityLevel: ActivityLevel;
    trainingDaysPerWeek: number;
    equipment: Equipment;
    targetDate: string | null;
  }) => void;

  // v1.3.0 actions
  setField: <K extends keyof OnboardingData>(
    field: K,
    value: OnboardingData[K],
  ) => void;
  calculateAll: () => void;
  persistToProfile: () => Promise<void>;
  prefillFromProfile: (profile: Profile) => void;
  reset: () => void;
}

export type OnboardingState = OnboardingData & OnboardingActions;

// === Initial state ===

const INITIAL_STATE: OnboardingData = {
  // Build 14/15 defaults preserved
  goalType: 'cut',
  gender: 'male',
  birthYear: 1995,
  heightCm: 170,
  currentWeightKg: 70,
  targetWeightKg: null,
  targetBodyFatPct: null,
  activityLevel: 'moderate',
  trainingDaysPerWeek: 3,
  equipment: 'gym',
  targetDate: null,
  // v1.3.0 / Onboarding v2 — null defaults so a partial flow
  // (user closes the app mid-step) doesn't fabricate fake choices.
  // The 13 screens collect each value explicitly; presence of a
  // non-null value is the signal that the user advanced past that
  // screen.
  nickname: null,
  weeklyRatePct: null,
  mealPlan: null,
  mealTimings: null,
  proteinFactor: null,
  weeklyDistribution: null,
  cheatDays: null,
  onboardingStep: 0,
  // Cache fields — recomputed by calculateAll on each transition;
  // null until [10] motivation screen fires the calc.
  bmr: null,
  tdee: null,
  dailyCalorieTarget: null,
  estimatedTargetDate: null,
  pfcTargets: null,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...INITIAL_STATE,

  // Build 14/15 bulk setters
  setGoal: (goalType) => set({ goalType }),
  setBody: (data) => set(data),
  setTraining: (data) => set(data),

  // v1.3.0 generic setter — type-safe field-by-field updates from
  // the new 13 screens. setField('mealPlan', 'high_protein') compiles;
  // setField('mealPlan', 'invalid') does not. Mirrors the Phase 4.1
  // generic-T preservation pattern at the setter scope.
  setField: (field, value) =>
    set({ [field]: value } as Partial<OnboardingData>),

  // Phase A-4 will swap this stub for actual onboardingCalc imports.
  // Keeping it as a no-op (rather than throwing) so screens that
  // call it during A-3 development don't crash; the cache fields
  // simply stay null until A-4 lands.
  calculateAll: () => {
    // TODO Phase A-4: read currentWeightKg / weeklyRatePct / etc
    // from get() and call calculateBMR / calculateTDEE /
    // calculateDailyTarget / estimateTargetDate /
    // calculatePFCTargetsByMealPlan; then set the cache fields.
  },

  // Phase A-5 will swap this stub for an onboardingService call
  // that writes the store snapshot to profiles via updateProfile.
  // Returning a resolved Promise so callers' await chains work
  // identically once the real implementation lands.
  persistToProfile: async () => {
    // TODO Phase A-5: call onboardingService.persistOnboarding(get())
  },

  // Hydrate the store from an existing Profile row. Used by Build
  // 14/15 returning users so all 13 screens come up pre-filled.
  // null/undefined Profile fields stay null in the store; the
  // existing INITIAL_STATE non-null defaults (goalType='cut',
  // gender='male', etc) are overwritten ONLY when the Profile
  // carries an actual value.
  //
  // estimatedTargetDate / mealTimings / cheatDays in Profile are
  // ISO strings / arrays already (profileRepository narrows them
  // at the row boundary). The Date object for estimatedTargetDate
  // is reconstructed here.
  prefillFromProfile: (profile) =>
    set({
      goalType: profile.goalType,
      gender: profile.gender,
      birthYear: profile.birthYear,
      heightCm: profile.heightCm,
      currentWeightKg: profile.currentWeightKg,
      targetWeightKg: profile.targetWeightKg,
      targetBodyFatPct: profile.targetBodyFatPct,
      activityLevel: profile.activityLevel,
      trainingDaysPerWeek: profile.trainingDaysPerWeek,
      equipment: profile.equipment,
      targetDate: profile.targetDate,
      nickname: profile.nickname,
      weeklyRatePct: profile.weeklyRatePct,
      mealPlan: profile.mealPlan,
      mealTimings: profile.mealTimings,
      proteinFactor: profile.proteinFactor,
      weeklyDistribution: profile.weeklyDistribution,
      cheatDays: profile.cheatDays,
      onboardingStep: profile.onboardingStep,
      estimatedTargetDate: profile.estimatedTargetDate
        ? new Date(profile.estimatedTargetDate)
        : null,
      // bmr / tdee / dailyCalorieTarget / pfcTargets are NOT
      // serialized in profiles — recomputed by calculateAll on
      // first prefill-aware screen mount.
    }),

  reset: () => set({ ...INITIAL_STATE }),
}));
