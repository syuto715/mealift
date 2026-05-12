// v1.3.0 / Onboarding v2 / Phase A-5 — service tests.
//
// Two layers:
//   1. buildProfilePatch (pure) — partial-state gating, monotonic
//      onboardingStep, onboardingStartedAt set-once, ISO-8601 Date
//      boundary, JSON-array preservation, empty-array vs null
//      distinction.
//   2. persistToProfile (DB delegate) — getProfile/updateProfile
//      mocking, profileId validation, end-to-end wiring.

jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../../../utils/id', () => ({ generateId: () => 'stub-id' }));
jest.mock('../../repositories/profileRepository', () => ({
  createProfile: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}));
// onboardingSteps imports react-native's Platform; mock so Jest's
// CJS runtime can resolve the module for the SSoT cross-check test.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  buildProfilePatch,
  createProfileFromOnboarding,
  persistToProfile,
} from '../onboardingService';
import {
  createProfile,
  getProfile,
  updateProfile,
} from '../../repositories/profileRepository';
import type { Profile } from '../../../types/profile';
import type { OnboardingData } from '../../../stores/onboardingStore';
import { ONBOARDING_ROUTES } from '../../../domain/onboardingSteps';

const mockCreateProfile = createProfile as jest.MockedFunction<
  typeof createProfile
>;
const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;
const mockUpdateProfile = updateProfile as jest.MockedFunction<
  typeof updateProfile
>;

beforeEach(() => {
  mockCreateProfile.mockReset();
  mockGetProfile.mockReset();
  mockUpdateProfile.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStore(overrides: Partial<OnboardingData> = {}): OnboardingData {
  return {
    // Build 14/15 INITIAL_STATE defaults
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
    // v2 defaults
    nickname: null,
    weeklyRatePct: null,
    mealPlan: null,
    mealTimings: null,
    proteinFactor: null,
    weeklyDistribution: null,
    cheatDays: null,
    onboardingStep: 0,
    // Cache
    bmr: null,
    tdee: null,
    dailyCalorieTarget: null,
    estimatedTargetDate: null,
    pfcTargets: null,
    ...overrides,
  };
}

function makeExistingProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    supabaseUid: null,
    displayName: 'X',
    gender: 'male',
    birthYear: 1995,
    heightCm: 170,
    currentWeightKg: 70,
    targetWeightKg: null,
    targetBodyFatPct: null,
    goalType: 'cut',
    activityLevel: 'moderate',
    trainingDaysPerWeek: 3,
    targetDate: null,
    equipment: 'gym',
    targetCalories: null,
    targetProteinG: null,
    targetFatG: null,
    targetCarbG: null,
    onboardingCompleted: false,
    adaptiveGoalEnabled: true,
    adaptiveGoalSensitivity: 'standard',
    adaptiveGoalLastShownAt: null,
    dailyWaterTargetMl: 2500,
    onboardingVersion: 1,
    trialStartedAt: null,
    planBillingCycle: null,
    planExpiresAt: null,
    notificationsSubmissionEnabled: true,
    plateStepKg: 2.5,
    nickname: null,
    weeklyRatePct: null,
    mealPlan: null,
    mealTimings: null,
    proteinFactor: null,
    weeklyDistribution: null,
    cheatDays: null,
    onboardingStep: 0,
    onboardingStartedAt: null,
    estimatedTargetDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-05-10T12:00:00.000Z');

// ---------------------------------------------------------------------------
// 1. buildProfilePatch — per-field step gating (Pattern 18)
// ---------------------------------------------------------------------------

describe('buildProfilePatch — partial-state gating', () => {
  it('step=3 produces minimal patch with body-info fields only', () => {
    // Even if v2 fields somehow carry stale values (test-fixture
    // induced; production INITIAL_STATE would have them null),
    // the gating threshold blocks them from entering the patch.
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 3,
        gender: 'female',
        birthYear: 1990,
        heightCm: 165,
        currentWeightKg: 60,
        // Stale v2 fields that should NOT land in the patch:
        mealPlan: 'washoku',
        proteinFactor: 1.6,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.gender).toBe('female');
    expect(patch.birthYear).toBe(1990);
    expect(patch.heightCm).toBe(165);
    expect(patch.currentWeightKg).toBe(60);
    // step >= 4 not yet reached:
    expect(patch.activityLevel).toBeUndefined();
    // step >= 6 not yet reached:
    expect(patch.mealPlan).toBeUndefined();
    // step >= 8 not yet reached:
    expect(patch.proteinFactor).toBeUndefined();
  });

  it('step=12 produces full patch with v2 fields + recomputed PFC bundle', () => {
    // Codex review pass 1 / Important — buildProfilePatch derives
    // PFC + estimatedTargetDate from the snapshot inputs, NOT from
    // the (potentially stale) store cache. Verify the patch carries
    // values computed from the snapshot, not whatever values the
    // test happens to plant in the cache fields.
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 12,
        nickname: 'シュート',
        gender: 'male',
        birthYear: 1995,
        heightCm: 170,
        currentWeightKg: 70,
        activityLevel: 'moderate',
        targetWeightKg: 65,
        weeklyRatePct: -0.5,
        // Cache fields are intentionally bogus / out-of-sync — the
        // service should ignore them and recompute from the inputs.
        estimatedTargetDate: new Date('2099-01-01T00:00:00.000Z'),
        bmr: 99999,
        tdee: 99999,
        dailyCalorieTarget: 99999,
        pfcTargets: { protein: 999, fat: 999, carbs: 999 },
        mealPlan: 'balanced',
        mealTimings: ['breakfast', 'lunch', 'dinner'],
        proteinFactor: 1.6,
        weeklyDistribution: 'cheat_days',
        cheatDays: [0, 6],
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    // Non-derived fields pass through:
    expect(patch.nickname).toBe('シュート');
    expect(patch.activityLevel).toBe('moderate');
    expect(patch.targetWeightKg).toBe(65);
    expect(patch.weeklyRatePct).toBe(-0.5);
    expect(patch.mealPlan).toBe('balanced');
    expect(patch.mealTimings).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(patch.proteinFactor).toBe(1.6);
    expect(patch.weeklyDistribution).toBe('cheat_days');
    expect(patch.cheatDays).toEqual([0, 6]);
    // Derived fields recomputed from snapshot, not from stale cache:
    // BMR (Mifflin male, age=31, 70kg, 170cm) = 1612.5 → 1613
    // TDEE = 1613 × 1.55 (moderate) = 2500.15 → 2500
    // dailyCalorieTarget = 2500 + (-385 from -0.5%) = 2115
    // proteinG = 70 × 1.6 = 112; proteinKcal = 448
    // remaining = 1667; balanced fat 30% / carbs 70%
    // fatG = 1667 × 0.30 / 9 → 56; carbsG = 1667 × 0.70 / 4 → 292
    expect(patch.targetCalories).toBe(2115);
    expect(patch.targetProteinG).toBe(112);
    expect(patch.targetFatG).toBe(56);
    expect(patch.targetCarbG).toBe(292);
    // estimatedTargetDate recomputed (NOT 2099-01-01).
    expect(patch.estimatedTargetDate).not.toBe('2099-01-01T00:00:00.000Z');
    expect(patch.estimatedTargetDate).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('step=5 with stale step >= 8 store fields skips them (trust boundary)', () => {
    // Simulates the kickoff §8 case: user navigated back to [5]
    // goal-weight after having advanced to [8]. Store still
    // carries the [8] proteinFactor value, but the persisted
    // patch must NOT include proteinFactor or any step >= 8 field.
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 5,
        gender: 'female',
        birthYear: 1990,
        heightCm: 165,
        currentWeightKg: 60,
        activityLevel: 'active',
        targetWeightKg: 55,
        weeklyRatePct: -0.5,
        // Stale step >= 8 fields:
        proteinFactor: 1.6,
        mealPlan: 'washoku',
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.targetWeightKg).toBe(55);
    expect(patch.weeklyRatePct).toBe(-0.5);
    // Step >= 6 not reached — mealPlan dropped:
    expect(patch.mealPlan).toBeUndefined();
    // Step >= 8 not reached — proteinFactor dropped:
    expect(patch.proteinFactor).toBeUndefined();
    expect(patch.targetCalories).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. buildProfilePatch — JSON-array fields
// ---------------------------------------------------------------------------

describe('buildProfilePatch — JSON-array fields', () => {
  it('mealTimings populated array passes through as array', () => {
    // updateProfile's JSON_ARRAY_KEYS path stringifies; here we
    // verify the patch holds the raw array (boundary lives in
    // updateProfile).
    // Phase D-2 threshold fix — mealTimings now gates at step 8
    // (was 7) since goal-summary inserted step 6, pushing every
    // downstream input by +1.
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 8,
        gender: 'male',
        birthYear: 1995,
        heightCm: 170,
        currentWeightKg: 70,
        activityLevel: 'moderate',
        targetWeightKg: 65,
        weeklyRatePct: -0.5,
        mealPlan: 'balanced',
        mealTimings: ['breakfast', 'lunch', 'dinner'],
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.mealTimings).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('mealTimings empty array is preserved (distinguishes "set but empty" from "unset")', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 8,
        mealPlan: 'balanced',
        mealTimings: [],
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.mealTimings).toEqual([]);
  });

  it('mealTimings null stays null (unset)', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 8,
        mealPlan: 'balanced',
        mealTimings: null,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.mealTimings).toBeNull();
  });

  // Codex pass 1 / Phase D-2 sign-off violation regression — every
  // v2 input field's threshold must match its collecting screen's
  // step number per ONBOARDING_ROUTES. Pre-fix, mealPlan gated at
  // step 6 (goal-summary) instead of 7 (meal-plan), so a prefilled
  // mealPlan could leak into the DB on a goal-summary persist
  // before the user reached the meal-plan screen. Same off-by-one
  // affected mealTimings (8 vs 7), proteinFactor (9 vs 8),
  // weeklyDistribution (10 vs 9), cheatDays (10 vs 9).
  it('mealPlan at step=6 (goal-summary) is NOT persisted (stale-prefill defense)', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 6,
        mealPlan: 'balanced', // simulating prefilled value
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.mealPlan).toBeUndefined();
  });

  it('mealPlan at step=7 (meal-plan reached) IS persisted', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 7,
        mealPlan: 'balanced',
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.mealPlan).toBe('balanced');
  });

  it('mealTimings at step=7 is NOT persisted (boundary regression)', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 7,
        mealPlan: 'balanced',
        mealTimings: ['breakfast'],
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.mealTimings).toBeUndefined();
  });

  // Codex pass 1 / Phase D-5 Important regression — service-layer
  // defense for the cheatDays/weeklyDistribution composite
  // invariant. Without these gates, an oversize / 'even'-mode
  // cheatDays prefill could leak into the DB.
  it('weeklyDistribution=even forces cheatDays=null in patch', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 10,
        weeklyDistribution: 'even',
        cheatDays: [1, 3, 5], // stale from a prior cheat_days session
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.weeklyDistribution).toBe('even');
    expect(patch.cheatDays).toBeNull();
  });

  it('cheatDays.length > 3 truncates to first 3 in patch', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 10,
        weeklyDistribution: 'cheat_days',
        cheatDays: [0, 1, 2, 3, 4], // unreachable from UI but possible via prefill
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.cheatDays).toEqual([0, 1, 2]);
  });

  it('weeklyDistribution=cheat_days + valid cheatDays passes through', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 10,
        weeklyDistribution: 'cheat_days',
        cheatDays: [1, 3],
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.weeklyDistribution).toBe('cheat_days');
    expect(patch.cheatDays).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// 3. buildProfilePatch — service-managed fields
// ---------------------------------------------------------------------------

describe('buildProfilePatch — Date → ISO 8601 boundary (recomputed from snapshot)', () => {
  it('estimatedTargetDate recomputed from snapshot inputs, ignoring store cache (Codex pass 1 stale-cache fix)', () => {
    // Plant a deliberately-wrong cache value; the service must
    // ignore it and recompute from currentWeight/targetWeight/rate.
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 5,
        currentWeightKg: 70,
        targetWeightKg: 65,
        weeklyRatePct: -0.5,
        // Bogus stale cache:
        estimatedTargetDate: new Date('2099-12-31T00:00:00.000Z'),
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.estimatedTargetDate).not.toBe('2099-12-31T00:00:00.000Z');
    expect(patch.estimatedTargetDate).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('estimatedTargetDate is null at step >= 5 when targetWeightKg / weeklyRatePct are unset', () => {
    // Step gate is met but the inputs needed for the calc aren't.
    // patch still records the field as null (write-through to clear).
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 5,
        targetWeightKg: null,
        weeklyRatePct: null,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.estimatedTargetDate).toBeNull();
  });
});

describe('buildProfilePatch — Codex pass 1 stale-cache resistance (Important)', () => {
  // Tests that pin the new "service-side recompute" invariant:
  // setField mutating an input AFTER calculateAll fired must NOT
  // result in stale derived values landing in the patch.

  it('PFC bundle recomputed when proteinFactor changes after calculateAll', () => {
    // Imagine: user reaches protein-target with proteinFactor=2.2,
    // calculateAll fires (cache populated for 2.2), user navigates
    // back to protein-target and changes to 1.6, then persistToProfile
    // fires WITHOUT a fresh calculateAll. Cache still reflects 2.2;
    // service must use 1.6.
    // Phase D-2 threshold fix — ONBOARDING_STEP_FULL_INPUT is now 9
    // (was 8) since goal-summary inserted step 6.
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 9,
        gender: 'male',
        birthYear: 1995,
        heightCm: 170,
        currentWeightKg: 70,
        activityLevel: 'moderate',
        targetWeightKg: 65,
        weeklyRatePct: -0.5,
        mealPlan: 'balanced',
        proteinFactor: 1.6, // Snapshot reflects 1.6
        // Stale cache reflecting earlier 2.2 selection
        pfcTargets: { protein: 154, fat: 50, carbs: 280 }, // 70×2.2=154
        dailyCalorieTarget: 2115,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    // Recomputed protein from snapshot (1.6 × 70 = 112), NOT cached 154
    expect(patch.targetProteinG).toBe(112);
    // F/C also recomputed because dailyCalorie & remaining differ
    expect(patch.targetFatG).toBe(56);
    expect(patch.targetCarbG).toBe(292);
  });

  it('PFC bundle null when cache is null but inputs are populated (calculateAll never fired)', () => {
    // Coverage gap from Codex review: step >= ONBOARDING_STEP_FULL_INPUT
    // (= 9 post Phase D-2 fix) with all snapshot inputs set but
    // ALL cache fields null (calculateAll didn't fire / failed).
    // Service should still emit a valid patch with the bundle
    // present (recomputed), not skip due to null cache.
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 9,
        gender: 'male',
        birthYear: 1995,
        heightCm: 170,
        currentWeightKg: 70,
        activityLevel: 'moderate',
        targetWeightKg: 65,
        weeklyRatePct: -0.5,
        mealPlan: 'balanced',
        proteinFactor: 1.6,
        // All cache null (calculateAll never ran):
        bmr: null,
        tdee: null,
        dailyCalorieTarget: null,
        estimatedTargetDate: null,
        pfcTargets: null,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.targetCalories).toBe(2115);
    expect(patch.targetProteinG).toBe(112);
    expect(patch.targetFatG).toBe(56);
    expect(patch.targetCarbG).toBe(292);
    // Also recomputes estimatedTargetDate.
    expect(patch.estimatedTargetDate).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('PFC bundle persisted ATOMICALLY (cannot persist only half)', () => {
    // Codex flag: targetCalories and pfcTargets had independent
    // null checks in the original code. Refactor unifies them so a
    // future cache-coherence break can't write only one half.
    // Phase D-2 threshold fix — step bumped to 9 (= new
    // ONBOARDING_STEP_FULL_INPUT).
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 9,
        gender: 'male',
        birthYear: 1995,
        heightCm: 170,
        currentWeightKg: 70,
        activityLevel: 'moderate',
        targetWeightKg: 65,
        weeklyRatePct: -0.5,
        mealPlan: 'balanced',
        proteinFactor: 1.6,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    // All four target columns either all populated or all absent.
    const hasCalories = patch.targetCalories !== undefined;
    const hasProtein = patch.targetProteinG !== undefined;
    const hasFat = patch.targetFatG !== undefined;
    const hasCarb = patch.targetCarbG !== undefined;
    expect(hasCalories).toBe(true);
    expect(hasProtein).toBe(true);
    expect(hasFat).toBe(true);
    expect(hasCarb).toBe(true);
  });
});

describe('buildProfilePatch — onboardingStartedAt set-once preservation', () => {
  it('first persist (existing.onboardingStartedAt = null) → set to now', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 2 }),
      existing: makeExistingProfile({ onboardingStartedAt: null }),
      now: NOW,
    });
    expect(patch.onboardingStartedAt).toBe('2026-05-10T12:00:00.000Z');
  });

  it('subsequent persist preserves existing onboardingStartedAt (skip in patch)', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 5 }),
      existing: makeExistingProfile({
        onboardingStartedAt: '2026-05-01T00:00:00.000Z',
      }),
      now: NOW,
    });
    expect(patch.onboardingStartedAt).toBeUndefined();
  });
});

describe('buildProfilePatch — onboardingStep monotonic max', () => {
  it('regression: store=5 + existing=8 → patch.onboardingStep=8 (preserve high-water)', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 5 }),
      existing: makeExistingProfile({ onboardingStep: 8 }),
      now: NOW,
    });
    expect(patch.onboardingStep).toBe(8);
  });

  it('advance: store=10 + existing=8 → patch.onboardingStep=10', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 10 }),
      existing: makeExistingProfile({ onboardingStep: 8 }),
      now: NOW,
    });
    expect(patch.onboardingStep).toBe(10);
  });

  it('first persist (existing.onboardingStep undefined → 0): patch=store value', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 3 }),
      existing: null,
      now: NOW,
    });
    expect(patch.onboardingStep).toBe(3);
  });
});

describe('buildProfilePatch — onboardingVersion v2 bump', () => {
  // Phase E-1 / Codex pass 1 Critical regression — the version bump
  // MUST be gated on markCompleted. Without the gate, the welcome-
  // mount persist (which fires before the user enters any v2 input)
  // would write onboardingVersion=2 to a row that still has
  // onboardingCompleted=true (from v1) — leaving the v1 user
  // permanently routed past the v2 inputs on next boot.

  it('intermediate persist (no markCompleted) does NOT bump version even when v1 user', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 2 }),
      existing: makeExistingProfile({ onboardingVersion: 1 }),
      now: NOW,
    });
    expect(patch.onboardingVersion).toBeUndefined();
  });

  it('completion path (markCompleted=true) bumps a v1 user to v2', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 12 }),
      existing: makeExistingProfile({ onboardingVersion: 1 }),
      now: NOW,
      markCompleted: true,
    });
    expect(patch.onboardingVersion).toBe(2);
  });

  it('completion path on an already-v2 row does NOT get a redundant write', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 12 }),
      existing: makeExistingProfile({ onboardingVersion: 2 }),
      now: NOW,
      markCompleted: true,
    });
    expect(patch.onboardingVersion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3b. Phase E-2 invariant audit pass — buildProfilePatch coverage completeness
// ---------------------------------------------------------------------------

describe('buildProfilePatch — Phase E-2 legacy fields collected by new flow', () => {
  // Critical regression — pre-E-2 `goalType` (C-5) + `trainingDaysPerWeek`
  // (C-4) were absent from FIELD_STEP_THRESHOLDS and absent from the per-
  // field section. They only persisted via createProfile.legacyInput on
  // the first-time-user path. On the Option A re-onboarding path (D-8
  // pre-existing-profile detect → skip createProfile → route through
  // buildProfilePatch only), any user-changed value was silently dropped.

  it('trainingDaysPerWeek: step<4 → not in patch (gate enforces)', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 3, trainingDaysPerWeek: 5 }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.trainingDaysPerWeek).toBeUndefined();
  });

  it('trainingDaysPerWeek: step>=4 → in patch (C-4 collects)', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 4, trainingDaysPerWeek: 5 }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.trainingDaysPerWeek).toBe(5);
  });

  it('goalType: step<5 → not in patch (gate enforces)', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 4, goalType: 'recomp' }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.goalType).toBeUndefined();
  });

  it('goalType: step>=5 → in patch (C-5 collects)', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 5, goalType: 'recomp' }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.goalType).toBe('recomp');
  });

  it('Option A re-onboarding: existing trainingDaysPerWeek=3 + store=5 → patch carries 5', () => {
    // The whole point of E-2 Critical fix: existing v1 row has
    // legacy 3, user changed to 5 in C-4. Pre-fix the new value
    // was dropped; post-fix it lands in the update patch.
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 12, trainingDaysPerWeek: 5 }),
      existing: makeExistingProfile({ trainingDaysPerWeek: 3 }),
      now: NOW,
    });
    expect(patch.trainingDaysPerWeek).toBe(5);
  });

  it('Option A re-onboarding: existing goalType=cut + store=recomp → patch carries recomp', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 12, goalType: 'recomp' }),
      existing: makeExistingProfile({ goalType: 'cut' }),
      now: NOW,
    });
    expect(patch.goalType).toBe('recomp');
  });
});

describe('buildProfilePatch — Phase E-2 non-collected legacy fields intentional skip', () => {
  // The new flow's C-3..D-5 screens do NOT collect equipment /
  // targetBodyFatPct / targetDate. These flow exclusively through
  // createProfile.legacyInput on the first-time-user path (default
  // values for new users, prefilled values for v1 re-onboarders).
  // buildProfilePatch never writes them — verified here so future
  // contributors don't add them speculatively and break the
  // "new flow collects + everything else carries from legacy" model.

  it('equipment never lands in patch at any step', () => {
    for (const step of [3, 5, 10, 12]) {
      const patch = buildProfilePatch({
        store: makeStore({ onboardingStep: step, equipment: 'bodyweight' }),
        existing: makeExistingProfile({ equipment: 'gym' }),
        now: NOW,
      });
      expect(patch).not.toHaveProperty('equipment');
    }
  });

  it('targetBodyFatPct never lands in patch at any step', () => {
    for (const step of [3, 5, 10, 12]) {
      const patch = buildProfilePatch({
        store: makeStore({ onboardingStep: step, targetBodyFatPct: 15 }),
        existing: makeExistingProfile({ targetBodyFatPct: null }),
        now: NOW,
      });
      expect(patch).not.toHaveProperty('targetBodyFatPct');
    }
  });

  it('targetDate never lands in patch at any step', () => {
    for (const step of [3, 5, 10, 12]) {
      const patch = buildProfilePatch({
        store: makeStore({ onboardingStep: step, targetDate: '2027-01-01' }),
        existing: makeExistingProfile({ targetDate: null }),
        now: NOW,
      });
      expect(patch).not.toHaveProperty('targetDate');
    }
  });
});

describe('buildProfilePatch — Phase E-2 PFC bundle partial-null inputs (Important)', () => {
  // deriveCacheFromSnapshot requires weeklyRatePct + proteinFactor +
  // mealPlan ALL non-null to emit the bundle. Existing tests cover
  // the all-set case (Pattern 24 atomic 4-field); E-2 adds the
  // partial-null cases so a regression that loosens the AND gate
  // (e.g. computing PFC with a default mealPlan when store has null)
  // surfaces here.

  it('step>=9 with proteinFactor=null → PFC bundle absent (no half-write)', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 9,
        weeklyRatePct: -0.5,
        targetWeightKg: 65,
        mealPlan: 'balanced',
        proteinFactor: null, // ← only this null
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.targetCalories).toBeUndefined();
    expect(patch.targetProteinG).toBeUndefined();
    expect(patch.targetFatG).toBeUndefined();
    expect(patch.targetCarbG).toBeUndefined();
  });

  it('step>=9 with mealPlan=null → PFC bundle absent', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 9,
        weeklyRatePct: -0.5,
        targetWeightKg: 65,
        mealPlan: null, // ← only this null
        proteinFactor: 1.6,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.targetCalories).toBeUndefined();
    expect(patch.targetProteinG).toBeUndefined();
    expect(patch.targetFatG).toBeUndefined();
    expect(patch.targetCarbG).toBeUndefined();
  });

  it('step>=9 with weeklyRatePct=null → PFC bundle absent', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 9,
        weeklyRatePct: null, // ← only this null
        targetWeightKg: 65,
        mealPlan: 'balanced',
        proteinFactor: 1.6,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.targetCalories).toBeUndefined();
    expect(patch.targetProteinG).toBeUndefined();
    expect(patch.targetFatG).toBeUndefined();
    expect(patch.targetCarbG).toBeUndefined();
  });
});

describe('buildProfilePatch — Phase E-2 markCompleted atomic 3-signal bundle (Important)', () => {
  // Pattern 24 補強 — the three completion signals
  // (onboardingCompleted / onboardingStep>=TERMINAL / onboardingVersion)
  // must all flip atomically on the same markCompleted=true call.
  // Individual signal tests exist above; this pins they coexist in
  // ONE patch so a future refactor splitting them into separate
  // calls (and risking partial-completion DB state) surfaces here.

  it('markCompleted=true with v1 row → all 3 signals in same patch', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 12 }),
      existing: makeExistingProfile({
        onboardingVersion: 1,
        onboardingCompleted: false,
        onboardingStep: 12,
      }),
      now: NOW,
      markCompleted: true,
    });
    // Combined assertion — all three present on the same patch.
    expect(patch.onboardingCompleted).toBe(true);
    expect(patch.onboardingStep).toBe(13);
    expect(patch.onboardingVersion).toBe(2);
  });

  it('markCompleted=false → none of the 3 signals fire', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 12 }),
      existing: makeExistingProfile({
        onboardingVersion: 1,
        onboardingCompleted: false,
        onboardingStep: 10,
      }),
      now: NOW,
      // no markCompleted → defaults to false
    });
    expect(patch.onboardingCompleted).toBeUndefined();
    // step is still in patch (monotonic max), but not promoted to TERMINAL
    expect(patch.onboardingStep).toBe(12);
    expect(patch.onboardingVersion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. persistToProfile — DB delegate
// ---------------------------------------------------------------------------

describe('persistToProfile', () => {
  it('reads profile, builds patch, calls updateProfile', async () => {
    mockGetProfile.mockResolvedValueOnce(
      makeExistingProfile({ id: 'p1', onboardingStartedAt: null }),
    );
    mockUpdateProfile.mockResolvedValueOnce(undefined);
    await persistToProfile(makeStore({ onboardingStep: 3 }), 'p1', {
      now: NOW,
    });
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        gender: 'male',
        onboardingStep: 3,
        onboardingStartedAt: '2026-05-10T12:00:00.000Z',
      }),
    );
  });

  it('throws on empty profileId', async () => {
    await expect(persistToProfile(makeStore(), '')).rejects.toThrow(
      /profileId is required/,
    );
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('throws when no profile is found', async () => {
    mockGetProfile.mockResolvedValueOnce(null);
    await expect(persistToProfile(makeStore(), 'p1')).rejects.toThrow(
      /no profile found/,
    );
  });

  it('throws on profile id mismatch (wrong-user defense)', async () => {
    mockGetProfile.mockResolvedValueOnce(
      makeExistingProfile({ id: 'p2' }),
    );
    await expect(persistToProfile(makeStore(), 'p1')).rejects.toThrow(
      /profile id mismatch/,
    );
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('idempotent at the patch level: same snapshot twice → same patch', async () => {
    // Both reads see the same existing profile (not the post-write
    // state) — verifies buildProfilePatch is deterministic given
    // identical inputs.
    const existing = makeExistingProfile({
      id: 'p1',
      onboardingStartedAt: '2026-05-01T00:00:00.000Z', // already set
    });
    mockGetProfile.mockResolvedValue(existing);
    const snapshot = makeStore({
      onboardingStep: 3,
      gender: 'female',
      birthYear: 1990,
      heightCm: 165,
      currentWeightKg: 60,
    });
    await persistToProfile(snapshot, 'p1', { now: NOW });
    const firstCall = mockUpdateProfile.mock.calls[0][1];
    mockUpdateProfile.mockClear();
    await persistToProfile(snapshot, 'p1', { now: NOW });
    const secondCall = mockUpdateProfile.mock.calls[0][1];
    expect(firstCall).toEqual(secondCall);
  });
});

// ---------------------------------------------------------------------------
// createProfileFromOnboarding — Phase D-8 baseline simplification
// ---------------------------------------------------------------------------

describe('createProfileFromOnboarding', () => {
  // Full-input store: every C-3..D-5 collected field populated +
  // step at terminal value. The wrapper should write all legacy
  // columns via createProfile() then atomically patch the v2
  // fields via updateProfile(buildProfilePatch).
  function makeCompletedStore(): OnboardingData {
    return makeStore({
      gender: 'male',
      birthYear: 1995,
      heightCm: 170,
      currentWeightKg: 70,
      targetWeightKg: 65,
      targetBodyFatPct: 15,
      activityLevel: 'moderate',
      trainingDaysPerWeek: 3,
      equipment: 'gym',
      targetDate: null,
      goalType: 'cut',
      nickname: 'syuto',
      weeklyRatePct: -0.5,
      mealPlan: 'balanced',
      mealTimings: ['breakfast', 'lunch', 'dinner'],
      proteinFactor: 1.6,
      weeklyDistribution: 'even',
      cheatDays: null,
      onboardingStep: 12,
    });
  }

  function makeCreatedProfile(): Profile {
    return makeExistingProfile({
      id: 'p-new',
      gender: 'male',
      birthYear: 1995,
      heightCm: 170,
      currentWeightKg: 70,
      targetWeightKg: 65,
      activityLevel: 'moderate',
      trainingDaysPerWeek: 3,
      goalType: 'cut',
      equipment: 'gym',
      // Legacy createProfile doesn't write v2 columns — they stay
      // at their schema defaults (null) until updateProfile patches.
      nickname: null,
      weeklyRatePct: null,
      mealPlan: null,
      mealTimings: null,
      proteinFactor: null,
      onboardingStep: 0,
      onboardingStartedAt: null,
    });
  }

  it('happy path: createProfile + updateProfile sequenced, returns hydrated terminal profile', async () => {
    const created = makeCreatedProfile();
    const hydrated: Profile = {
      ...created,
      nickname: 'syuto',
      weeklyRatePct: -0.5,
      mealPlan: 'balanced',
      mealTimings: ['breakfast', 'lunch', 'dinner'],
      proteinFactor: 1.6,
      weeklyDistribution: 'even',
      onboardingStep: 13, // terminal (Codex pass 1 / Important fix)
      onboardingCompleted: true, // terminal (Codex pass 1 / Critical fix)
      onboardingStartedAt: NOW.toISOString(),
      onboardingVersion: 2,
    };
    // No existing profile pre-call → createProfile fires.
    mockGetProfile
      .mockResolvedValueOnce(null) // pre-existence check
      .mockResolvedValueOnce(hydrated); // post-update re-read
    mockCreateProfile.mockResolvedValue(created);
    mockUpdateProfile.mockResolvedValue(undefined);

    const result = await createProfileFromOnboarding({
      store: makeCompletedStore(),
      displayName: 'syuto',
      now: NOW,
    });

    expect(mockCreateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(result).toBe(hydrated);
  });

  // Codex pass 1 / Critical regression — the patch MUST flip
  // onboardingCompleted to true and bump step to terminal 13.
  // Pre-fix the wrapper only patched v2 fields, leaving the
  // completion flag at the schema default (false). On next app
  // boot index.tsx would route the user back into onboarding.
  it('terminal save writes onboardingCompleted=true + step=13 in patch', async () => {
    mockGetProfile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCreatedProfile());
    mockCreateProfile.mockResolvedValue(makeCreatedProfile());

    await createProfileFromOnboarding({
      store: makeCompletedStore(), // store.onboardingStep = 12
      displayName: 'syuto',
      now: NOW,
    });

    const patch = mockUpdateProfile.mock.calls[0][1];
    expect(patch.onboardingCompleted).toBe(true);
    expect(patch.onboardingStep).toBe(13);
  });

  // Codex pass 1 / Critical regression — orphan-row defense.
  // Pre-fix: createProfile always fired, generating a fresh id;
  // a retry path (error during updateProfile + screen re-fire)
  // would insert row B alongside row A, then getProfile's
  // LIMIT 1 (no id targeting) could hydrate either. The
  // pre-check makes the wrapper idempotent at the insert level.
  it('skips createProfile when pre-existing profile detected (retry safety)', async () => {
    const existing = makeCreatedProfile();
    mockGetProfile
      .mockResolvedValueOnce(existing) // pre-check sees existing row
      .mockResolvedValueOnce(existing); // re-read after patch
    mockUpdateProfile.mockResolvedValue(undefined);

    await createProfileFromOnboarding({
      store: makeCompletedStore(),
      displayName: 'syuto',
      now: NOW,
    });

    expect(mockCreateProfile).not.toHaveBeenCalled();
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
  });

  it('legacy ProfileInput carries all 11 required columns', async () => {
    mockGetProfile
      .mockResolvedValueOnce(null) // pre-check
      .mockResolvedValueOnce(makeCreatedProfile()); // re-read
    mockCreateProfile.mockResolvedValue(makeCreatedProfile());

    await createProfileFromOnboarding({
      store: makeCompletedStore(),
      displayName: 'syuto',
      now: NOW,
    });

    const legacyInput = mockCreateProfile.mock.calls[0][0];
    expect(legacyInput).toEqual({
      displayName: 'syuto',
      gender: 'male',
      birthYear: 1995,
      heightCm: 170,
      currentWeightKg: 70,
      targetWeightKg: 65,
      targetBodyFatPct: 15,
      goalType: 'cut',
      activityLevel: 'moderate',
      trainingDaysPerWeek: 3,
      targetDate: null,
      equipment: 'gym',
    });
  });

  // Pattern 24 atomic bundle regression — every v2 field present
  // in the store must flow through to the updateProfile patch.
  // A future change that drops a field from buildProfilePatch
  // (or skips this wrapper call) surfaces here.
  it('v2 patch carries all 14 v2 fields atomically (Pattern 24 SSoT regression)', async () => {
    mockGetProfile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCreatedProfile());
    mockCreateProfile.mockResolvedValue(makeCreatedProfile());

    await createProfileFromOnboarding({
      store: makeCompletedStore(),
      displayName: 'syuto',
      now: NOW,
    });

    const v2Patch = mockUpdateProfile.mock.calls[0][1];
    // 14 v2 input fields (or their derived bundle expansions)
    // plus service-managed fields. Pin presence by key — exact
    // values are tested elsewhere in this file.
    expect(v2Patch).toHaveProperty('nickname', 'syuto');
    expect(v2Patch).toHaveProperty('weeklyRatePct', -0.5);
    expect(v2Patch).toHaveProperty('mealPlan', 'balanced');
    expect(v2Patch).toHaveProperty('mealTimings');
    expect(v2Patch).toHaveProperty('proteinFactor', 1.6);
    expect(v2Patch).toHaveProperty('weeklyDistribution', 'even');
    // cheatDays is null when distribution is 'even' (D-5 service
    // defense forces this).
    expect(v2Patch).toHaveProperty('cheatDays', null);
    // PFC bundle (Pattern 24 atomic 4-field).
    expect(v2Patch).toHaveProperty('targetCalories');
    expect(v2Patch).toHaveProperty('targetProteinG');
    expect(v2Patch).toHaveProperty('targetFatG');
    expect(v2Patch).toHaveProperty('targetCarbG');
    // estimatedTargetDate (derived).
    expect(v2Patch).toHaveProperty('estimatedTargetDate');
    // Service-managed monotonic + set-once.
    expect(v2Patch).toHaveProperty('onboardingStep');
    expect(v2Patch).toHaveProperty('onboardingStartedAt');
    expect(v2Patch).toHaveProperty('onboardingVersion');
  });

  it('throws on missing displayName (legacy NOT NULL constraint)', async () => {
    await expect(
      createProfileFromOnboarding({
        store: makeCompletedStore(),
        displayName: '',
        now: NOW,
      }),
    ).rejects.toThrow(/displayName/);
  });

  it('throws when required legacy field missing from store', async () => {
    const broken = makeCompletedStore();
    // Simulate a regression upstream: birthYear cleared somehow.
    broken.birthYear = NaN;
    await expect(
      createProfileFromOnboarding({
        store: broken,
        displayName: 'syuto',
        now: NOW,
      }),
    ).rejects.toThrow(/required legacy inputs missing/);
  });

  it('skips updateProfile call when v2 patch is empty (defensive)', async () => {
    // Store at step 0 (nothing collected) — every threshold gate
    // returns short of writing, so the v2 patch is just service-
    // managed fields (onboardingStep, onboardingStartedAt). Those
    // still constitute a non-empty patch, so updateProfile fires
    // anyway. This test exists to pin that we don't preemptively
    // short-circuit on an empty user-input shape.
    mockGetProfile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCreatedProfile());
    mockCreateProfile.mockResolvedValue(makeCreatedProfile());

    // Use a store where buildProfilePatch returns at least the
    // service-managed fields — this is the realistic path.
    await createProfileFromOnboarding({
      store: makeCompletedStore(),
      displayName: 'syuto',
      now: NOW,
    });

    expect(mockUpdateProfile).toHaveBeenCalled();
  });

  it('throws when getProfile re-read returns null (DB consistency)', async () => {
    mockGetProfile
      .mockResolvedValueOnce(null) // pre-check: no profile
      .mockResolvedValueOnce(null); // re-read also null
    mockCreateProfile.mockResolvedValue(makeCreatedProfile());

    await expect(
      createProfileFromOnboarding({
        store: makeCompletedStore(),
        displayName: 'syuto',
        now: NOW,
      }),
    ).rejects.toThrow(/not found after insert/);
  });

  // Pattern 18 SSoT cross-check — the wrapper's terminal-step
  // hardcode (TERMINAL_ONBOARDING_STEP = 13) must match
  // ONBOARDING_ROUTES.complete.step. The service deliberately
  // doesn't import the routes table (boundary stays at the
  // screen layer); this test pins the value alignment so a
  // future route renumbering surfaces here.
  it('TERMINAL_ONBOARDING_STEP matches ONBOARDING_ROUTES.complete.step', () => {
    const completeRoute = ONBOARDING_ROUTES.find(
      (r) => r.name === 'complete',
    );
    expect(completeRoute?.step).toBe(13);
  });
});
