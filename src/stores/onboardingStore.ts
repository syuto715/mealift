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
  ONBOARDING_STEP_FULL_INPUT,
} from '../domain/onboardingCalc';
import { persistToProfile as onboardingServicePersist } from '../infra/services/onboardingService';
import { useProfileStore } from './profileStore';

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

  // Phase C-1 — Welcome screen mount triggers this to bump
  // onboardingStep past 0 (the INITIAL_STATE sentinel) so the
  // service's monotonic step max can flow the first non-zero
  // value through to the DB. The DB-side set-once for
  // onboardingStartedAt is handled by the service's
  // buildProfilePatch (line ~237) — markStarted intentionally
  // does NOT track startedAt in the store, since the store value
  // would be ignored by the service's existing-row check anyway
  // and would just duplicate state.
  markStarted: () => void;

  // Phase C-2 — Nickname screen [2] field setter. Updates the
  // nickname AND bumps onboardingStep monotonically in one set()
  // call so the two values stay consistent for nav-guard reads.
  setNickname: (value: string) => void;

  // Phase C-3 — Body info screen [3] field setters. Each writes
  // its field AND bumps onboardingStep monotonically to 3. The
  // screen calls them per-input (slider / segmented control /
  // TextInput onChangeText) so partial input still pins the step
  // cursor — a user who types their birth year then closes the
  // app should resume on [3], not [2].
  setGender: (value: Gender) => void;
  setBirthYear: (value: number) => void;
  setHeightCm: (value: number) => void;
  setCurrentWeightKg: (value: number) => void;

  // Phase C-4 — Activity screen [4] field setters. Same atomic
  // value+step semantics as C-3. Bumps to 4 monotonically so a
  // back-nav revisit doesn't regress the cursor.
  setActivityLevel: (value: ActivityLevel) => void;
  setTrainingDaysPerWeek: (value: number) => void;
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
      s.onboardingStep < ONBOARDING_STEP_FULL_INPUT
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

  // Phase A-5 — actual logic. Delegates to onboardingService which
  // builds the gated patch + calls updateProfile. profileId is read
  // at call time from useProfileStore to avoid coupling the
  // onboardingStore type to ProfileStore.
  //
  // No-op when no profile is loaded (e.g., during pre-auth boot).
  // Phase A-6 / B / C screen-trigger wiring will guarantee a profile
  // exists before invoking; this guard is defense-in-depth.
  persistToProfile: async () => {
    const profileId = useProfileStore.getState().profile?.id;
    if (!profileId) return;
    await onboardingServicePersist(get(), profileId);
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

  // Phase C-1 — Welcome screen [1] mount handler. Bumps
  // onboardingStep monotonically (max with existing value, so a
  // user who's already past [1] doesn't regress on a screen revisit).
  // The Welcome screen calls this in useEffect on mount, then awaits
  // persistToProfile so the service's set-once
  // onboardingStartedAt timestamp lands on the DB row.
  markStarted: () =>
    set((s) => ({ onboardingStep: Math.max(s.onboardingStep, 1) })),

  // Phase C-2 — Nickname screen [2] field setter. Two reasons we
  // ship a dedicated setter rather than reusing setField:
  //   1. The atomic value-and-step write avoids a brief render
  //      where step has advanced but nickname is still null
  //      (would mis-trigger any nav-guard that reads both).
  //   2. Step bump is monotonic max — a user who's already past
  //      [2] and revisits via a back nav shouldn't regress.
  //      setField doesn't carry that semantics, so a direct
  //      `setField('nickname', ...)` would skip the bump.
  setNickname: (value: string) =>
    set((s) => ({
      nickname: value,
      onboardingStep: Math.max(s.onboardingStep, 2),
    })),

  // Phase C-3 — Body info screen [3] field setters. Each carries
  // the same atomic value+step semantics as setNickname (C-2),
  // pinning the cursor at >=3 so partial input survives a mid-
  // screen close. Per-field setters (rather than one bulk
  // `setBodyInfo`) so the slider can fire on every drag-tick
  // without forcing the screen to re-bundle all four values.
  setGender: (value) =>
    set((s) => ({
      gender: value,
      onboardingStep: Math.max(s.onboardingStep, 3),
    })),
  setBirthYear: (value) =>
    set((s) => ({
      birthYear: value,
      onboardingStep: Math.max(s.onboardingStep, 3),
    })),
  setHeightCm: (value) =>
    set((s) => ({
      heightCm: value,
      onboardingStep: Math.max(s.onboardingStep, 3),
    })),
  setCurrentWeightKg: (value) =>
    set((s) => ({
      currentWeightKg: value,
      onboardingStep: Math.max(s.onboardingStep, 3),
    })),

  // Phase C-4 — Activity screen [4] field setters. Same atomic
  // semantics as C-3, bumping to step 4 on each per-field change
  // so the hasInteracted gate (Pattern 18 補強) flips true the
  // moment a user touches anything on the screen.
  setActivityLevel: (value) =>
    set((s) => ({
      activityLevel: value,
      onboardingStep: Math.max(s.onboardingStep, 4),
    })),
  setTrainingDaysPerWeek: (value) =>
    set((s) => ({
      trainingDaysPerWeek: value,
      onboardingStep: Math.max(s.onboardingStep, 4),
    })),
}));
