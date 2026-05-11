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
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}));

import {
  buildProfilePatch,
  persistToProfile,
} from '../onboardingService';
import {
  getProfile,
  updateProfile,
} from '../../repositories/profileRepository';
import type { Profile } from '../../../types/profile';
import type { OnboardingData } from '../../../stores/onboardingStore';

const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;
const mockUpdateProfile = updateProfile as jest.MockedFunction<
  typeof updateProfile
>;

beforeEach(() => {
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
  it('Build 14/15 user (version=1) → patch bumps to 2', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 2 }),
      existing: makeExistingProfile({ onboardingVersion: 1 }),
      now: NOW,
    });
    expect(patch.onboardingVersion).toBe(2);
  });

  it('already-v2 user does NOT get a redundant write', () => {
    const patch = buildProfilePatch({
      store: makeStore({ onboardingStep: 2 }),
      existing: makeExistingProfile({ onboardingVersion: 2 }),
      now: NOW,
    });
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
