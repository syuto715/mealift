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
import { calculateBMR, calculateTDEE, calculateAge } from '../domain/calories';
import {
  calculateDailyTarget,
  estimateTargetDate,
  calculatePFCTargetsByMealPlan,
} from '../domain/onboardingCalc';

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

// Codex review pass 1 / Important #1 — Invalid Date guard for the
// store's runtime cache. Profile carries ISO strings; new Date(...)
// on a malformed string returns Invalid Date which still satisfies
// `Date | null` at the type level. Phase 6.1 established the same
// regex defense at the SQL boundary; this layer is the secondary
// belt-and-suspenders for the in-memory cache.
function parseDateOrNull(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
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

  // Phase A-4 — actual logic. Reads the user's collected v2 fields
  // from store state and populates the 5 cache fields. The required
  // v2 fields are the ones the user explicitly chooses (weeklyRatePct,
  // targetWeightKg, proteinFactor, mealPlan); the existing
  // gender/birthYear/height/weight/activity defaults are populated
  // from the body-info / activity-level screens before [10] fires
  // calculateAll, so we trust those.
  //
  // No-op when any required v2 field is still null — calling
  // calculateAll mid-flow shouldn't crash; the cache stays at its
  // last computed state (or the INITIAL_STATE null if never
  // calculated). UI guards against rendering pre-calculation cache
  // via null checks.
  calculateAll: () => {
    const s = get();
    // Codex review pass 1 / Important #1 — also gate on
    // onboardingStep so the placeholder legacy defaults
    // (birthYear=1995, heightCm=170, etc — INITIAL_STATE
    // scaffolding) can't silently flow into a "computed plan".
    // By onboardingStep >= 8 the user has advanced past the
    // body-info / activity-level / goal-weight / meal-plan /
    // protein-target screens, all of which populate the
    // legacy + v2 inputs.
    if (
      s.weeklyRatePct === null ||
      s.targetWeightKg === null ||
      s.proteinFactor === null ||
      s.mealPlan === null ||
      s.onboardingStep < 8
    ) {
      // Codex review pass 1 / Important #2 — clear cache when
      // inputs become incomplete (user navigated back, reset a
      // field, etc). Without this clear, the cache could describe
      // inputs the store no longer carries — UI gating on cache
      // null vs computed needs the cache to track the inputs.
      set({
        bmr: null,
        tdee: null,
        dailyCalorieTarget: null,
        estimatedTargetDate: null,
        pfcTargets: null,
      });
      return;
    }
    // Locals carry the post-narrow types so the calc helpers
    // receive non-null inputs. The early-return above already
    // guarantees these are non-null; re-bind for TS narrowing
    // (TypeScript doesn't narrow object property accesses
    // through aggregated boolean conditions).
    const weeklyRatePct = s.weeklyRatePct;
    const targetWeightKg = s.targetWeightKg;
    const proteinFactor = s.proteinFactor;
    const mealPlan = s.mealPlan;

    const age = calculateAge(s.birthYear);
    // Mifflin-St Jeor returns a real number; round at the cache
    // boundary so downstream UI / persisted Profile see integer
    // calories the way the rest of the app expects.
    const bmr = Math.round(
      calculateBMR(s.currentWeightKg, s.heightCm, age, s.gender),
    );
    const tdee = calculateTDEE(bmr, s.activityLevel);
    const dailyCalorieTarget = calculateDailyTarget({
      currentWeight: s.currentWeightKg,
      weeklyRatePct,
      tdee,
    });
    const { date: estimatedTargetDate } = estimateTargetDate({
      currentWeight: s.currentWeightKg,
      targetWeight: targetWeightKg,
      weeklyRatePct,
    });
    const pfcTargets = calculatePFCTargetsByMealPlan({
      dailyCalorie: dailyCalorieTarget,
      currentWeight: s.currentWeightKg,
      proteinFactor,
      mealPlan,
    });
    set({
      bmr,
      tdee,
      dailyCalorieTarget,
      estimatedTargetDate,
      pfcTargets,
    });
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
      // Codex review pass 1 / Important #1 — defensive Date
      // reconstruction. A malformed ISO string from sync poison
      // / manual edit would yield `Invalid Date` (NaN getTime),
      // which still satisfies `Date | null` and would break later
      // formatting / comparison code (Phase 6.1 lesson). Drop to
      // null on bad input.
      estimatedTargetDate: parseDateOrNull(profile.estimatedTargetDate),
      // bmr / tdee / dailyCalorieTarget / pfcTargets are NOT
      // serialized in profiles — recomputed by calculateAll on
      // first prefill-aware screen mount.
    }),

  reset: () => set({ ...INITIAL_STATE }),
}));
