// v1.5 Stage 1 Phase 1.3 — diagnosticStore tests.

let mockNextUuid = 0;
jest.mock('../../utils/id', () => ({
  generateId: () => `uuid-${++mockNextUuid}`,
}));
jest.mock('../../infra/supabase/client', () => ({ supabase: null }));
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(async () => ({
    runAsync: jest.fn(async () => {}),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  })),
}));
jest.mock('../../infra/repositories/profileRepository', () => ({
  getProfile: jest.fn(async () => null),
}));
jest.mock('../../infra/repositories/nutritionRepository', () => ({
  getDailyNutritionSummary: jest.fn(async () => ({
    totalCalories: 0,
    totalProteinG: 0,
    totalFatG: 0,
    totalCarbG: 0,
    meals: [],
  })),
}));
jest.mock('../../infra/repositories/bodyLogRepository', () => ({
  getBodyLogs: jest.fn(async () => []),
}));

const mockListAllExerciseSlugs = jest.fn(async () => [
  'bench-press',
  'overhead-press',
]);
jest.mock('../../infra/repositories/workoutRepository', () => ({
  listAllExerciseSlugs: () => mockListAllExerciseSlugs(),
  findExerciseBySlug: jest.fn(async () => null),
  getRecentSessionCount: jest.fn(async () => 0),
  createRoutine: jest.fn(),
}));

const mockRunGeneration = jest.fn();
jest.mock('../routineGenStore', () => ({
  useRoutineGenStore: {
    getState: () => ({
      runGeneration: mockRunGeneration,
    }),
  },
}));

import { useDiagnosticStore } from '../diagnosticStore';

beforeEach(() => {
  useDiagnosticStore.setState({ wizards: {} });
  mockRunGeneration.mockReset();
  mockListAllExerciseSlugs.mockClear();
});

describe('diagnosticStore.setAnswer + getAnswers', () => {
  it('stores answers under the user-scoped key (Drafting 106)', () => {
    useDiagnosticStore.getState().setAnswer('u-1', 'experience', 'intermediate');
    useDiagnosticStore.getState().setAnswer('u-1', 'goal', 'cut');
    const ans = useDiagnosticStore.getState().getAnswers('u-1');
    expect(ans).toEqual({ experience: 'intermediate', goal: 'cut' });
  });

  it('keeps User A and User B answers isolated', () => {
    useDiagnosticStore.getState().setAnswer('u-A', 'experience', 'beginner');
    useDiagnosticStore.getState().setAnswer('u-B', 'experience', 'advanced');
    expect(useDiagnosticStore.getState().getAnswers('u-A').experience).toBe(
      'beginner',
    );
    expect(useDiagnosticStore.getState().getAnswers('u-B').experience).toBe(
      'advanced',
    );
  });

  // v1.5.2-A Fix 1 (H6-δ) regression guard. getAnswers is used as a zustand
  // selector (getSnapshot) in diagnostic/[step].tsx; for a user with no wizard
  // state it MUST return the same object reference on every call. A reversion
  // to `?? {}` would still pass the deep-equality tests above but reintroduce
  // the getSnapshot-instability re-render storm (incident 2726719B candidate).
  // Referential equality (toBe) is the invariant that actually matters.
  it('returns a referentially stable empty object for a missing wizard', () => {
    const first = useDiagnosticStore.getState().getAnswers('no-such-user');
    const second = useDiagnosticStore.getState().getAnswers('no-such-user');
    expect(first).toEqual({});
    expect(first).toBe(second);
  });
});

describe('diagnosticStore.clearWizard + reset (Drafting 106)', () => {
  it('clearWizard removes ONLY the target user', () => {
    useDiagnosticStore.getState().setAnswer('u-A', 'goal', 'cut');
    useDiagnosticStore.getState().setAnswer('u-B', 'goal', 'bulk');
    useDiagnosticStore.getState().clearWizard('u-A');
    expect(useDiagnosticStore.getState().getAnswers('u-A')).toEqual({});
    expect(useDiagnosticStore.getState().getAnswers('u-B').goal).toBe('bulk');
  });

  it('reset() wipes EVERY user wizard (logout cleanup)', () => {
    useDiagnosticStore.getState().setAnswer('u-A', 'goal', 'cut');
    useDiagnosticStore.getState().setAnswer('u-B', 'goal', 'bulk');
    useDiagnosticStore.getState().reset();
    expect(useDiagnosticStore.getState().wizards).toEqual({});
  });
});

describe('diagnosticStore.composeIntentText', () => {
  it('returns the natural-language intent for the current user', () => {
    useDiagnosticStore.getState().setAnswer('u-1', 'experience', 'beginner');
    useDiagnosticStore.getState().setAnswer('u-1', 'goal', 'maintain');
    useDiagnosticStore.getState().setAnswer('u-1', 'frequency', 3);
    const intent = useDiagnosticStore.getState().composeIntentText('u-1');
    expect(intent).toContain('初心者');
    expect(intent).toContain('週3回');
  });

  it('returns the placeholder when no answers exist for the user', () => {
    expect(useDiagnosticStore.getState().composeIntentText('u-empty')).toBe(
      'バランスのとれたルーティンを作ってください',
    );
  });
});

describe('diagnosticStore.submitToGeneration (Phase 1.5 routineGenStore re-use)', () => {
  it('calls routineGenStore.runGeneration with the composed intent text + slug list', async () => {
    useDiagnosticStore.getState().setAnswer('u-1', 'experience', 'intermediate');
    useDiagnosticStore.getState().setAnswer('u-1', 'goal', 'cut');
    useDiagnosticStore.getState().setAnswer('u-1', 'frequency', 4);
    useDiagnosticStore.getState().setAnswer('u-1', 'duration', '45');
    useDiagnosticStore.getState().setAnswer('u-1', 'equipment', ['dumbbell']);
    useDiagnosticStore.getState().setAnswer('u-1', 'limitations', '特になし');

    mockRunGeneration.mockResolvedValueOnce({
      generationId: 'g-1',
      status: 'draft',
      generatedRoutine: { routineName: 'x', items: [] },
    });

    const result = await useDiagnosticStore.getState().submitToGeneration({
      userId: 'u-1',
      profileId: 'p-1',
    });

    expect(result).toEqual({ generationId: 'g-1' });
    expect(mockRunGeneration).toHaveBeenCalledTimes(1);
    const call = mockRunGeneration.mock.calls[0][0];
    expect(call.userId).toBe('u-1');
    expect(call.profileId).toBe('p-1');
    expect(call.intentText).toContain('中級者');
    expect(call.intentText).toContain('機材: ダンベル');
    expect(call.exerciseSlugs).toEqual(['bench-press', 'overhead-press']);
  });

  it('returns null without invoking the EF when no exercise slugs are seeded', async () => {
    mockListAllExerciseSlugs.mockResolvedValueOnce([]);
    useDiagnosticStore.getState().setAnswer('u-1', 'experience', 'beginner');
    const result = await useDiagnosticStore.getState().submitToGeneration({
      userId: 'u-1',
      profileId: 'p-1',
    });
    expect(result).toBeNull();
    expect(mockRunGeneration).not.toHaveBeenCalled();
  });
});
