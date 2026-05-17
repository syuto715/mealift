// v1.5 Stage 1 Phase 1.4 — coachAdviceStore tests.

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
  getRecentSessionCount: jest.fn(async () => 0),
}));
jest.mock('../../infra/repositories/bodyLogRepository', () => ({
  getBodyLogs: jest.fn(async () => []),
}));

// fetchCoachAdvice goes through the EF over fetch; stub the client
// module so tests can control the response without spinning up
// supabase or fetch mocks.
const mockFetchCoachAdvice = jest.fn();
jest.mock('../../infra/llm/coachAdviceClient', () => ({
  fetchCoachAdvice: (...args: unknown[]) =>
    mockFetchCoachAdvice(...(args as [unknown])),
}));

import { useCoachAdviceStore } from '../coachAdviceStore';
import { AIError } from '../../infra/services/aiNutritionService';
import type { LocalCoachAdvice } from '../../types/coachAdvice';

function resetStore() {
  useCoachAdviceStore.setState({
    advices: {},
    loadingScopes: new Set(),
    error: null,
  });
  mockFetchCoachAdvice.mockReset();
}

beforeEach(resetStore);

describe('coachAdviceStore.fetchAdvice', () => {
  it('hits the EF on first call + caches the response under a user-scoped key (Codex round 1 Critical fix)', async () => {
    mockFetchCoachAdvice.mockResolvedValueOnce({
      id: 'a-1',
      scope: 'weekly',
      periodStart: '2026-05-11',
      content: '今週のアドバイス',
      generatedAt: '2026-05-17T10:00:00Z',
    });
    const result = await useCoachAdviceStore.getState().fetchAdvice({
      userId: 'u-1',
      profileId: 'p-1',
      scope: 'weekly',
    });
    expect(result?.id).toBe('a-1');
    expect(mockFetchCoachAdvice).toHaveBeenCalledTimes(1);
    expect(
      useCoachAdviceStore.getState().advices['u-1:weekly:latest']?.id,
    ).toBe('a-1');
    expect(
      useCoachAdviceStore.getState().advices['u-1:weekly:2026-05-11']?.id,
    ).toBe('a-1');
  });

  it('reset() wipes the cache for cross-account safety (Codex round 1 Critical)', () => {
    useCoachAdviceStore.setState({
      advices: {
        'u-1:weekly:latest': {
          id: 'a',
          userId: 'u-1',
          scope: 'weekly',
          periodStart: '2026-05-11',
          content: 'A',
          generatedAt: '2026-05-17T00:00:00Z',
        },
      },
      loadingScopes: new Set(['weekly']),
      error: new AIError('network_error', 'x', 0),
    });
    useCoachAdviceStore.getState().reset();
    expect(useCoachAdviceStore.getState().advices).toEqual({});
    expect(useCoachAdviceStore.getState().loadingScopes.size).toBe(0);
    expect(useCoachAdviceStore.getState().error).toBeNull();
  });

  it('does NOT double-fire when called concurrently (per-scope loading lock)', async () => {
    let resolveCall!: (v: unknown) => void;
    mockFetchCoachAdvice.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveCall = res;
        }),
    );
    const p1 = useCoachAdviceStore.getState().fetchAdvice({
      userId: 'u-1',
      profileId: 'p-1',
      scope: 'weekly',
    });
    const p2 = useCoachAdviceStore.getState().fetchAdvice({
      userId: 'u-1',
      profileId: 'p-1',
      scope: 'weekly',
    });
    // The second call short-circuits to null while the first is
    // in-flight, so only one EF call is queued.
    expect(await p2).toBeNull();
    resolveCall({
      id: 'a-1',
      scope: 'weekly',
      periodStart: '2026-05-11',
      content: '...',
      generatedAt: '2026-05-17T10:00:00Z',
    });
    await p1;
    expect(mockFetchCoachAdvice).toHaveBeenCalledTimes(1);
  });

  it('surfaces AIError without wiping a previously cached row (Drafting 103)', async () => {
    // Seed a cached row.
    const cached: LocalCoachAdvice = {
      id: 'a-old',
      userId: 'u-1',
      scope: 'weekly',
      periodStart: '2026-05-04',
      content: 'old advice',
      generatedAt: '2026-05-10T10:00:00Z',
    };
    useCoachAdviceStore.setState({
      advices: {
        'u-1:weekly:2026-05-04': cached,
        'u-1:weekly:latest': cached,
      },
    });

    mockFetchCoachAdvice.mockRejectedValueOnce(
      new AIError('gemini_error', 'AI応答失敗', 502),
    );
    const result = await useCoachAdviceStore.getState().fetchAdvice({
      userId: 'u-1',
      profileId: 'p-1',
      scope: 'weekly',
    });
    expect(result).toBeNull();
    expect(useCoachAdviceStore.getState().error?.code).toBe('gemini_error');
    // Cache survives the failed fetch.
    expect(
      useCoachAdviceStore.getState().advices['u-1:weekly:latest']?.id,
    ).toBe('a-old');
  });

  it('always hits the EF (no UTC-based client short-circuit — Codex round 1 Important #2)', async () => {
    // Pre-Codex behavior: same-UTC-day cached daily row would
    // short-circuit and skip the EF. The freshness truth is
    // profile-timezone (only the EF knows that), so the client
    // delegates to STEP 6 every mount.
    mockFetchCoachAdvice.mockResolvedValueOnce({
      id: 'a-fresh',
      scope: 'daily',
      periodStart: '2026-05-17',
      content: '今日',
      generatedAt: '2026-05-17T00:00:00Z',
    });
    useCoachAdviceStore.setState({
      advices: {
        'u-1:daily:latest': {
          id: 'a-cached',
          userId: 'u-1',
          scope: 'daily',
          periodStart: '2026-05-17',
          content: '古いキャッシュ',
          generatedAt: '2026-05-17T00:00:00Z',
        },
      },
    });
    const result = await useCoachAdviceStore.getState().fetchAdvice({
      userId: 'u-1',
      profileId: 'p-1',
      scope: 'daily',
    });
    expect(mockFetchCoachAdvice).toHaveBeenCalledTimes(1);
    expect(result?.id).toBe('a-fresh');
  });

  it('dismissError clears the error state', () => {
    useCoachAdviceStore.setState({
      error: new AIError('internal_error', 'x', 500),
    });
    useCoachAdviceStore.getState().dismissError();
    expect(useCoachAdviceStore.getState().error).toBeNull();
  });
});
