// v1.5 Stage 1 Phase 1.5 — routineGenStore tests.
//
// Coverage: runGeneration (success + concurrency lock), applyDraft
// (atomicity + slug-resolution), discardDraft state transition,
// reset() cross-account safety.

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
  getProfile: jest.fn(async () => ({
    id: 'p-1',
    gender: 'male',
    birthYear: 1990,
    heightCm: 175,
    currentWeightKg: 72,
    goalType: 'cut',
    activityLevel: 'moderate',
    trainingDaysPerWeek: 4,
    targetCalories: 2000,
    targetProteinG: 150,
    targetFatG: 60,
    targetCarbG: 200,
  })),
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
jest.mock('../../infra/repositories/workoutRepository', () => ({
  findExerciseBySlug: jest.fn(async (slug: string) => {
    if (slug === 'bench-press' || slug === 'overhead-press') {
      return { id: `ex-${slug}`, slug };
    }
    return null;
  }),
  getRecentSessionCount: jest.fn(async () => 0),
  createRoutine: jest.fn(async (profileId: string, name: string) => ({
    id: `routine-${profileId}-${name}`,
    profileId,
    name,
    description: null,
    sortOrder: 0,
    createdAt: '2026-05-17T00:00:00Z',
    updatedAt: '2026-05-17T00:00:00Z',
  })),
}));
jest.mock('../../infra/repositories/bodyLogRepository', () => ({
  getBodyLogs: jest.fn(async () => []),
}));
jest.mock('../../infra/repositories/syncRepository', () => ({
  enqueueSync: jest.fn(async () => {}),
}));
jest.mock('../../infra/repositories/routineGenerationRepository', () => ({
  upsertGeneration: jest.fn(async () => {}),
  updateGenerationStatus: jest.fn(async () => ({ ok: true })),
  syncGenerationsFromSupabase: jest.fn(async () => {}),
  getGenerationById: jest.fn(async () => null),
  listDraftsByUser: jest.fn(async () => []),
}));

const mockFetchRoutineGeneration = jest.fn();
jest.mock('../../infra/llm/routineGenerationClient', () => ({
  fetchRoutineGeneration: (...args: unknown[]) =>
    mockFetchRoutineGeneration(...(args as [unknown])),
}));

import {
  draftKey,
  draftCurrentKey,
  useRoutineGenStore,
} from '../routineGenStore';
import { AIError } from '../../infra/services/aiNutritionService';

function resetStore() {
  useRoutineGenStore.setState({
    drafts: {},
    isGenerating: false,
    isApplying: false,
    error: null,
  });
  mockFetchRoutineGeneration.mockReset();
}

beforeEach(resetStore);

describe('routineGenStore.runGeneration', () => {
  it('persists the response under user-scoped + current keys', async () => {
    mockFetchRoutineGeneration.mockResolvedValueOnce({
      generationId: 'g-1',
      status: 'draft',
      generatedRoutine: {
        routineName: 'プッシュ日',
        items: [
          { exerciseSlug: 'bench-press', targetSets: 3, targetReps: '8-12' },
        ],
      },
    });
    const result = await useRoutineGenStore.getState().runGeneration({
      userId: 'u-1',
      profileId: 'p-1',
      intentText: '胸の日',
      exerciseSlugs: ['bench-press'],
    });
    expect(result?.generationId).toBe('g-1');
    const state = useRoutineGenStore.getState();
    expect(state.drafts[draftKey('u-1', 'g-1')]?.status).toBe('draft');
    expect(state.drafts[draftCurrentKey('u-1')]?.id).toBe('g-1');
  });

  it('per-user lock — concurrent runGeneration returns null on the second call', async () => {
    let resolveFirst!: (v: unknown) => void;
    mockFetchRoutineGeneration.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFirst = res;
        }),
    );
    const p1 = useRoutineGenStore.getState().runGeneration({
      userId: 'u-1',
      profileId: 'p-1',
      intentText: 'x',
      exerciseSlugs: ['bench-press'],
    });
    const p2 = useRoutineGenStore.getState().runGeneration({
      userId: 'u-1',
      profileId: 'p-1',
      intentText: 'x',
      exerciseSlugs: ['bench-press'],
    });
    expect(await p2).toBeNull();
    resolveFirst({
      generationId: 'g-1',
      status: 'draft',
      generatedRoutine: { routineName: 'x', items: [] },
    });
    await p1;
    expect(mockFetchRoutineGeneration).toHaveBeenCalledTimes(1);
  });

  it('surfaces AIError via state.error', async () => {
    mockFetchRoutineGeneration.mockRejectedValueOnce(
      new AIError('quota_exceeded', '上限です', 429),
    );
    const result = await useRoutineGenStore.getState().runGeneration({
      userId: 'u-1',
      profileId: 'p-1',
      intentText: 'x',
      exerciseSlugs: ['bench-press'],
    });
    expect(result).toBeNull();
    expect(useRoutineGenStore.getState().error?.code).toBe('quota_exceeded');
  });
});

describe('routineGenStore.applyDraft', () => {
  it('resolves slugs + invokes createRoutine + transitions draft → applied', async () => {
    const workoutRepo = require('../../infra/repositories/workoutRepository');
    const repoModule = require('../../infra/repositories/routineGenerationRepository');
    useRoutineGenStore.setState({
      drafts: {
        [draftKey('u-1', 'g-1')]: {
          id: 'g-1',
          userId: 'u-1',
          promptContext: {},
          generatedRoutine: {
            routineName: '胸の日',
            items: [
              {
                exerciseSlug: 'bench-press',
                targetSets: 3,
                targetReps: '8-12',
              },
              {
                exerciseSlug: 'overhead-press',
                targetSets: 3,
                targetReps: '6-10',
              },
              {
                exerciseSlug: 'unknown-slug',
                targetSets: 3,
                targetReps: '10',
              },
            ],
          },
          status: 'draft',
          appliedRoutineId: null,
          createdAt: '2026-05-17T00:00:00Z',
          appliedAt: null,
        },
        [draftCurrentKey('u-1')]: {} as never,
      },
    });
    // Pretend current pointer references the same draft.
    useRoutineGenStore.setState((state) => ({
      drafts: {
        ...state.drafts,
        [draftCurrentKey('u-1')]: state.drafts[draftKey('u-1', 'g-1')],
      },
    }));

    const result = await useRoutineGenStore.getState().applyDraft({
      userId: 'u-1',
      profileId: 'p-1',
      generationId: 'g-1',
    });
    expect(result?.routineId).toBe('routine-p-1-胸の日');
    // Only known slugs (2 of 3) were forwarded.
    expect(workoutRepo.createRoutine).toHaveBeenCalledWith(
      'p-1',
      '胸の日',
      [
        { exerciseId: 'ex-bench-press', targetSets: 3, targetReps: '8-12' },
        { exerciseId: 'ex-overhead-press', targetSets: 3, targetReps: '6-10' },
      ],
    );
    expect(repoModule.updateGenerationStatus).toHaveBeenCalledWith(
      'u-1',
      'g-1',
      {
        status: 'applied',
        appliedRoutineId: 'routine-p-1-胸の日',
        appliedAt: expect.any(String),
      },
    );
    const state = useRoutineGenStore.getState();
    expect(state.drafts[draftKey('u-1', 'g-1')]?.status).toBe('applied');
    expect(state.drafts[draftCurrentKey('u-1')]).toBeUndefined();
  });

  it('rejects when all slugs fail to resolve', async () => {
    useRoutineGenStore.setState({
      drafts: {
        [draftKey('u-1', 'g-2')]: {
          id: 'g-2',
          userId: 'u-1',
          promptContext: {},
          generatedRoutine: {
            routineName: 'x',
            items: [
              { exerciseSlug: 'unknown-1', targetSets: 3, targetReps: '8' },
              { exerciseSlug: 'unknown-2', targetSets: 3, targetReps: '8' },
            ],
          },
          status: 'draft',
          appliedRoutineId: null,
          createdAt: '2026-05-17T00:00:00Z',
          appliedAt: null,
        },
      },
    });
    const result = await useRoutineGenStore.getState().applyDraft({
      userId: 'u-1',
      profileId: 'p-1',
      generationId: 'g-2',
    });
    expect(result).toBeNull();
    expect(useRoutineGenStore.getState().error?.code).toBe('invalid_request');
  });
});

describe('routineGenStore.discardDraft + reset', () => {
  it('discardDraft flips state + clears the current pointer', async () => {
    useRoutineGenStore.setState({
      drafts: {
        [draftKey('u-1', 'g-3')]: {
          id: 'g-3',
          userId: 'u-1',
          promptContext: {},
          generatedRoutine: { routineName: 'x', items: [] },
          status: 'draft',
          appliedRoutineId: null,
          createdAt: '2026-05-17T00:00:00Z',
          appliedAt: null,
        },
        [draftCurrentKey('u-1')]: {} as never,
      },
    });
    useRoutineGenStore.setState((state) => ({
      drafts: {
        ...state.drafts,
        [draftCurrentKey('u-1')]: state.drafts[draftKey('u-1', 'g-3')],
      },
    }));
    await useRoutineGenStore.getState().discardDraft({
      userId: 'u-1',
      generationId: 'g-3',
    });
    const state = useRoutineGenStore.getState();
    expect(state.drafts[draftKey('u-1', 'g-3')]?.status).toBe('discarded');
    expect(state.drafts[draftCurrentKey('u-1')]).toBeUndefined();
  });

  it('reset() wipes drafts + flags + error (cross-account safety per Drafting 106)', () => {
    useRoutineGenStore.setState({
      drafts: {
        [draftKey('u-1', 'g-4')]: {
          id: 'g-4',
          userId: 'u-1',
          promptContext: {},
          generatedRoutine: { routineName: 'x', items: [] },
          status: 'draft',
          appliedRoutineId: null,
          createdAt: '2026-05-17T00:00:00Z',
          appliedAt: null,
        },
      },
      isGenerating: true,
      isApplying: true,
      error: new AIError('internal_error', 'x', 500),
    });
    useRoutineGenStore.getState().reset();
    const state = useRoutineGenStore.getState();
    expect(state.drafts).toEqual({});
    expect(state.isGenerating).toBe(false);
    expect(state.isApplying).toBe(false);
    expect(state.error).toBeNull();
  });
});
