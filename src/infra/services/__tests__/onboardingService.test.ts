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

  it('step=12 produces full patch with all v2 fields', () => {
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
        estimatedTargetDate: new Date('2026-12-01T00:00:00.000Z'),
        mealPlan: 'balanced',
        mealTimings: ['breakfast', 'lunch', 'dinner'],
        proteinFactor: 1.6,
        weeklyDistribution: 'cheat_days',
        cheatDays: [0, 6],
        bmr: 1700,
        tdee: 2635,
        dailyCalorieTarget: 2250,
        pfcTargets: { protein: 112, fat: 60, carbs: 280 },
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.nickname).toBe('シュート');
    expect(patch.activityLevel).toBe('moderate');
    expect(patch.targetWeightKg).toBe(65);
    expect(patch.weeklyRatePct).toBe(-0.5);
    expect(patch.mealPlan).toBe('balanced');
    expect(patch.mealTimings).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(patch.proteinFactor).toBe(1.6);
    expect(patch.weeklyDistribution).toBe('cheat_days');
    expect(patch.cheatDays).toEqual([0, 6]);
    // PFC cache → persisted target columns
    expect(patch.targetCalories).toBe(2250);
    expect(patch.targetProteinG).toBe(112);
    expect(patch.targetFatG).toBe(60);
    expect(patch.targetCarbG).toBe(280);
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
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 7,
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
        onboardingStep: 7,
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
        onboardingStep: 7,
        mealPlan: 'balanced',
        mealTimings: null,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.mealTimings).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. buildProfilePatch — service-managed fields
// ---------------------------------------------------------------------------

describe('buildProfilePatch — Date → ISO 8601 boundary', () => {
  it('Date → toISOString roundtrip (Phase A-1 schema = TEXT, not INTEGER ms)', () => {
    const target = new Date('2026-12-01T00:00:00.000Z');
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 5,
        targetWeightKg: 65,
        weeklyRatePct: -0.5,
        estimatedTargetDate: target,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.estimatedTargetDate).toBe('2026-12-01T00:00:00.000Z');
  });

  it('null estimatedTargetDate stays null', () => {
    const patch = buildProfilePatch({
      store: makeStore({
        onboardingStep: 5,
        targetWeightKg: 65,
        weeklyRatePct: -0.5,
        estimatedTargetDate: null,
      }),
      existing: makeExistingProfile(),
      now: NOW,
    });
    expect(patch.estimatedTargetDate).toBeNull();
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
