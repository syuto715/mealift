// Phase A-4 — onboardingStore now imports onboardingCalc which
// imports workoutRepository (for suggestProteinFactor's
// getRecentSessionCount). Mock the DB-side imports so jest's CJS
// runtime doesn't pull expo-sqlite. Same defensive boundary as
// the other domain-level test files.
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../utils/id', () => ({ generateId: () => 'stub-id' }));

import { useOnboardingStore } from '../onboardingStore';
import type { Profile } from '../../types/profile';

// v1.3.0 / Onboarding v2 / Phase A-3 — onboardingStore extension tests.
//
// The Phase A-3 commit ships data-shape + setField + prefillFromProfile +
// reset; calculateAll and persistToProfile are stubs (filled by A-4 / A-5).
// These tests pin:
//   1. INITIAL_STATE preservation for Build 14/15 fields and null
//      defaults for new v2 fields.
//   2. setField type-safe updates per field.
//   3. prefillFromProfile mapping completeness (every documented
//      Profile field flows into the store).
//   4. prefillFromProfile graceful handling for Build 14/15 holdouts
//      whose Profile lacks v2 columns (those columns are null).
//   5. reset() clears every field — both legacy and v2 additions —
//      back to INITIAL_STATE.
//   6. Existing setGoal / setBody / setTraining still work
//      (Build 14/15 onboarding screens depend on them until Phase D-X).

beforeEach(() => {
  // Re-init the store between tests. Calling reset() through the
  // store action exercises the same code path the production app
  // uses on navigation away from onboarding.
  useOnboardingStore.getState().reset();
});

// ---------------------------------------------------------------------------
// 1. INITIAL_STATE
// ---------------------------------------------------------------------------

describe('useOnboardingStore — initial state', () => {
  it('preserves Build 14/15 defaults', () => {
    const s = useOnboardingStore.getState();
    expect(s.goalType).toBe('cut');
    expect(s.gender).toBe('male');
    expect(s.birthYear).toBe(1995);
    expect(s.heightCm).toBe(170);
    expect(s.currentWeightKg).toBe(70);
    expect(s.targetWeightKg).toBeNull();
    expect(s.targetBodyFatPct).toBeNull();
    expect(s.activityLevel).toBe('moderate');
    expect(s.trainingDaysPerWeek).toBe(3);
    expect(s.equipment).toBe('gym');
    expect(s.targetDate).toBeNull();
  });

  it('null defaults for v1.3.0 onboarding v2 fields', () => {
    const s = useOnboardingStore.getState();
    expect(s.nickname).toBeNull();
    expect(s.weeklyRatePct).toBeNull();
    expect(s.mealPlan).toBeNull();
    expect(s.mealTimings).toBeNull();
    expect(s.proteinFactor).toBeNull();
    expect(s.weeklyDistribution).toBeNull();
    expect(s.cheatDays).toBeNull();
  });

  it('onboardingStep starts at 0 (NOT NULL DEFAULT 0 contract)', () => {
    expect(useOnboardingStore.getState().onboardingStep).toBe(0);
  });

  it('cache fields start null (calculateAll fills them on demand)', () => {
    const s = useOnboardingStore.getState();
    expect(s.bmr).toBeNull();
    expect(s.tdee).toBeNull();
    expect(s.dailyCalorieTarget).toBeNull();
    expect(s.estimatedTargetDate).toBeNull();
    expect(s.pfcTargets).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. setField — generic type-safe setter
// ---------------------------------------------------------------------------

describe('useOnboardingStore — setField (generic type-safe)', () => {
  it('updates a string-union field (mealPlan)', () => {
    useOnboardingStore.getState().setField('mealPlan', 'washoku');
    expect(useOnboardingStore.getState().mealPlan).toBe('washoku');
  });

  it('updates a numeric-union field (weeklyRatePct)', () => {
    useOnboardingStore.getState().setField('weeklyRatePct', -0.7);
    expect(useOnboardingStore.getState().weeklyRatePct).toBe(-0.7);
  });

  it('updates a numeric-union field (proteinFactor)', () => {
    useOnboardingStore.getState().setField('proteinFactor', 1.6);
    expect(useOnboardingStore.getState().proteinFactor).toBe(1.6);
  });

  it('updates an array field (mealTimings)', () => {
    useOnboardingStore
      .getState()
      .setField('mealTimings', ['breakfast', 'lunch', 'dinner']);
    expect(useOnboardingStore.getState().mealTimings).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ]);
  });

  it('updates an array field (cheatDays)', () => {
    useOnboardingStore.getState().setField('cheatDays', [0, 6]);
    expect(useOnboardingStore.getState().cheatDays).toEqual([0, 6]);
  });

  it('updates a string field (nickname)', () => {
    useOnboardingStore.getState().setField('nickname', 'シュート');
    expect(useOnboardingStore.getState().nickname).toBe('シュート');
  });

  it('updates onboardingStep (resume cursor)', () => {
    useOnboardingStore.getState().setField('onboardingStep', 7);
    expect(useOnboardingStore.getState().onboardingStep).toBe(7);
  });

  it('updates a Build 14/15 legacy field (currentWeightKg)', () => {
    useOnboardingStore.getState().setField('currentWeightKg', 75);
    expect(useOnboardingStore.getState().currentWeightKg).toBe(75);
  });

  it('updates a cache field (pfcTargets)', () => {
    useOnboardingStore.getState().setField('pfcTargets', {
      protein: 120,
      fat: 60,
      carbs: 180,
    });
    expect(useOnboardingStore.getState().pfcTargets).toEqual({
      protein: 120,
      fat: 60,
      carbs: 180,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. calculateAll / persistToProfile — A-3 stubs (no-op)
// ---------------------------------------------------------------------------

describe('useOnboardingStore — calculateAll (Phase A-4 wired) + persistToProfile stub', () => {
  it('calculateAll is no-op when required v2 fields are null', () => {
    // Initial state has weeklyRatePct=null etc — calculateAll should
    // bail without populating cache rather than crashing on a null
    // weeklyRatePct dereference.
    useOnboardingStore.getState().calculateAll();
    const s = useOnboardingStore.getState();
    expect(s.bmr).toBeNull();
    expect(s.tdee).toBeNull();
    expect(s.dailyCalorieTarget).toBeNull();
    expect(s.pfcTargets).toBeNull();
    expect(s.estimatedTargetDate).toBeNull();
  });

  it('calculateAll populates all 5 cache fields when all v2 inputs are set', () => {
    const s = useOnboardingStore.getState();
    // Build 14/15 defaults: male / 1995 / 170cm / 70kg / moderate.
    s.setField('targetWeightKg', 65);
    s.setField('weeklyRatePct', -0.5);
    s.setField('proteinFactor', 1.6);
    s.setField('mealPlan', 'balanced');
    s.calculateAll();
    const after = useOnboardingStore.getState();
    expect(after.bmr).not.toBeNull();
    expect(after.tdee).not.toBeNull();
    expect(after.dailyCalorieTarget).not.toBeNull();
    expect(after.pfcTargets).not.toBeNull();
    expect(after.estimatedTargetDate).toBeInstanceOf(Date);
    // BMR / TDEE numerical sanity for default body inputs.
    expect(after.bmr).toBeGreaterThan(1000);
    expect(after.bmr).toBeLessThan(2500);
    expect(after.tdee).toBeGreaterThan((after.bmr ?? 0) - 1);
    // pfcTargets is a 3-key Record (Phase 6 #8 defensive shape).
    expect(Object.keys(after.pfcTargets ?? {}).sort()).toEqual([
      'carbs',
      'fat',
      'protein',
    ]);
  });

  it('calculateAll output deterministic for fixed inputs', () => {
    // Seed the same inputs twice; the cache must match. Pin against
    // a future calculator drift (rounding, formula change).
    const s = useOnboardingStore.getState();
    s.setField('currentWeightKg', 70);
    s.setField('heightCm', 170);
    s.setField('birthYear', 1995);
    s.setField('gender', 'male');
    s.setField('activityLevel', 'moderate');
    s.setField('targetWeightKg', 65);
    s.setField('weeklyRatePct', -0.5);
    s.setField('proteinFactor', 1.6);
    s.setField('mealPlan', 'balanced');
    s.calculateAll();
    const first = {
      bmr: useOnboardingStore.getState().bmr,
      tdee: useOnboardingStore.getState().tdee,
      dailyCalorieTarget: useOnboardingStore.getState().dailyCalorieTarget,
      pfcTargets: useOnboardingStore.getState().pfcTargets,
    };
    s.calculateAll();
    expect(useOnboardingStore.getState().bmr).toBe(first.bmr);
    expect(useOnboardingStore.getState().tdee).toBe(first.tdee);
    expect(useOnboardingStore.getState().dailyCalorieTarget).toBe(
      first.dailyCalorieTarget,
    );
    expect(useOnboardingStore.getState().pfcTargets).toEqual(first.pfcTargets);
  });

  it('persistToProfile returns a resolved Promise (A-5 stub still in place)', async () => {
    await expect(
      useOnboardingStore.getState().persistToProfile(),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. prefillFromProfile
// ---------------------------------------------------------------------------

function makeFullProfile(): Profile {
  // Profile shape mirrors a Build 14/15 user who has run through the
  // v2 onboarding (every field populated). Used to verify mapping
  // completeness.
  return {
    id: 'p1',
    supabaseUid: null,
    displayName: 'Display',
    gender: 'female',
    birthYear: 1990,
    heightCm: 165,
    currentWeightKg: 60,
    targetWeightKg: 55,
    targetBodyFatPct: 22,
    goalType: 'bulk',
    activityLevel: 'active',
    trainingDaysPerWeek: 5,
    targetDate: '2026-12-01',
    equipment: 'dumbbell',
    targetCalories: 2000,
    targetProteinG: 100,
    targetFatG: 60,
    targetCarbG: 220,
    onboardingCompleted: true,
    adaptiveGoalEnabled: true,
    adaptiveGoalSensitivity: 'standard',
    adaptiveGoalLastShownAt: null,
    dailyWaterTargetMl: 2500,
    onboardingVersion: 2,
    trialStartedAt: null,
    planBillingCycle: null,
    planExpiresAt: null,
    notificationsSubmissionEnabled: true,
    plateStepKg: 2.5,
    nickname: 'シュート',
    weeklyRatePct: -0.5,
    mealPlan: 'washoku',
    mealTimings: ['breakfast', 'lunch', 'dinner'],
    proteinFactor: 1.6,
    weeklyDistribution: 'cheat_days',
    cheatDays: [0, 6],
    onboardingStep: 12,
    onboardingStartedAt: '2026-05-01T00:00:00.000Z',
    estimatedTargetDate: '2026-12-15T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  };
}

describe('useOnboardingStore — prefillFromProfile', () => {
  it('hydrates every documented Build 14/15 + v2 field from the Profile', () => {
    const p = makeFullProfile();
    useOnboardingStore.getState().prefillFromProfile(p);
    const s = useOnboardingStore.getState();
    expect(s.goalType).toBe('bulk');
    expect(s.gender).toBe('female');
    expect(s.birthYear).toBe(1990);
    expect(s.heightCm).toBe(165);
    expect(s.currentWeightKg).toBe(60);
    expect(s.targetWeightKg).toBe(55);
    expect(s.targetBodyFatPct).toBe(22);
    expect(s.activityLevel).toBe('active');
    expect(s.trainingDaysPerWeek).toBe(5);
    expect(s.equipment).toBe('dumbbell');
    expect(s.targetDate).toBe('2026-12-01');
    expect(s.nickname).toBe('シュート');
    expect(s.weeklyRatePct).toBe(-0.5);
    expect(s.mealPlan).toBe('washoku');
    expect(s.mealTimings).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(s.proteinFactor).toBe(1.6);
    expect(s.weeklyDistribution).toBe('cheat_days');
    expect(s.cheatDays).toEqual([0, 6]);
    expect(s.onboardingStep).toBe(12);
  });

  it('reconstructs estimatedTargetDate Date from Profile ISO string', () => {
    const p = makeFullProfile();
    useOnboardingStore.getState().prefillFromProfile(p);
    const d = useOnboardingStore.getState().estimatedTargetDate;
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe('2026-12-15T00:00:00.000Z');
  });

  it('handles a Build 14/15 holdout (v2 fields all null)', () => {
    // Build 14/15 user re-running onboarding before completing v2.
    // Their Profile carries the legacy fields but null for everything
    // post-v30. Store should mirror that (null for v2 fields, real
    // values for legacy fields).
    const p: Profile = {
      ...makeFullProfile(),
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
    };
    useOnboardingStore.getState().prefillFromProfile(p);
    const s = useOnboardingStore.getState();
    // Legacy fields populated.
    expect(s.gender).toBe('female');
    expect(s.heightCm).toBe(165);
    // v2 fields null.
    expect(s.nickname).toBeNull();
    expect(s.mealPlan).toBeNull();
    expect(s.proteinFactor).toBeNull();
    expect(s.estimatedTargetDate).toBeNull();
  });

  it('does NOT serialize cache fields (bmr/tdee/etc never come from Profile)', () => {
    // Profile doesn't carry bmr / tdee / dailyCalorieTarget /
    // pfcTargets — those are runtime-computed cache. Verify they
    // stay at INITIAL_STATE values after prefill.
    const p = makeFullProfile();
    useOnboardingStore.getState().prefillFromProfile(p);
    const s = useOnboardingStore.getState();
    expect(s.bmr).toBeNull();
    expect(s.tdee).toBeNull();
    expect(s.dailyCalorieTarget).toBeNull();
    expect(s.pfcTargets).toBeNull();
  });

  // Codex review pass 1 / Important #1 — parseDateOrNull defense.
  // A malformed ISO string from sync poison / manual edit would
  // yield Invalid Date, which still satisfies `Date | null` and
  // breaks downstream formatting. Drop to null on bad input.
  it('drops malformed estimatedTargetDate ISO to null (Invalid Date defense)', () => {
    const p: Profile = {
      ...makeFullProfile(),
      estimatedTargetDate: 'not-an-iso' as unknown as Profile['estimatedTargetDate'],
    };
    useOnboardingStore.getState().prefillFromProfile(p);
    expect(useOnboardingStore.getState().estimatedTargetDate).toBeNull();
  });

  it('drops empty-string estimatedTargetDate to null', () => {
    const p: Profile = {
      ...makeFullProfile(),
      estimatedTargetDate: '' as unknown as Profile['estimatedTargetDate'],
    };
    useOnboardingStore.getState().prefillFromProfile(p);
    expect(useOnboardingStore.getState().estimatedTargetDate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. reset
// ---------------------------------------------------------------------------

describe('useOnboardingStore — reset', () => {
  it('clears every field back to INITIAL_STATE — legacy + v2 + cache', () => {
    // Pollute every field so reset has work to do.
    const s = useOnboardingStore.getState();
    s.setField('goalType', 'bulk');
    s.setField('nickname', 'X');
    s.setField('weeklyRatePct', -0.7);
    s.setField('mealPlan', 'high_protein');
    s.setField('mealTimings', ['breakfast']);
    s.setField('proteinFactor', 2.2);
    s.setField('weeklyDistribution', 'cheat_days');
    s.setField('cheatDays', [3]);
    s.setField('onboardingStep', 7);
    s.setField('bmr', 1500);
    s.setField('tdee', 2000);
    s.setField('dailyCalorieTarget', 1800);
    s.setField('pfcTargets', { protein: 100, fat: 50, carbs: 200 });

    s.reset();

    const after = useOnboardingStore.getState();
    expect(after.goalType).toBe('cut');
    expect(after.nickname).toBeNull();
    expect(after.weeklyRatePct).toBeNull();
    expect(after.mealPlan).toBeNull();
    expect(after.mealTimings).toBeNull();
    expect(after.proteinFactor).toBeNull();
    expect(after.weeklyDistribution).toBeNull();
    expect(after.cheatDays).toBeNull();
    expect(after.onboardingStep).toBe(0);
    expect(after.bmr).toBeNull();
    expect(after.tdee).toBeNull();
    expect(after.dailyCalorieTarget).toBeNull();
    expect(after.pfcTargets).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Build 14/15 legacy bulk setters (preservation)
// ---------------------------------------------------------------------------

describe('useOnboardingStore — Build 14/15 bulk setters preserved', () => {
  it('setGoal updates goalType (welcome-and-goal.tsx caller)', () => {
    useOnboardingStore.getState().setGoal('recomp');
    expect(useOnboardingStore.getState().goalType).toBe('recomp');
  });

  it('setBody updates all 6 body fields atomically (body-and-training.tsx caller)', () => {
    useOnboardingStore.getState().setBody({
      gender: 'female',
      birthYear: 1992,
      heightCm: 162,
      currentWeightKg: 58,
      targetWeightKg: 55,
      targetBodyFatPct: 20,
    });
    const s = useOnboardingStore.getState();
    expect(s.gender).toBe('female');
    expect(s.birthYear).toBe(1992);
    expect(s.heightCm).toBe(162);
    expect(s.currentWeightKg).toBe(58);
    expect(s.targetWeightKg).toBe(55);
    expect(s.targetBodyFatPct).toBe(20);
  });

  it('setTraining updates all 4 training fields atomically', () => {
    useOnboardingStore.getState().setTraining({
      activityLevel: 'very_active',
      trainingDaysPerWeek: 6,
      equipment: 'bodyweight',
      targetDate: '2026-12-31',
    });
    const s = useOnboardingStore.getState();
    expect(s.activityLevel).toBe('very_active');
    expect(s.trainingDaysPerWeek).toBe(6);
    expect(s.equipment).toBe('bodyweight');
    expect(s.targetDate).toBe('2026-12-31');
  });
});
