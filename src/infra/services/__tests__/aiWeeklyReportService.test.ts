// __DEV__ flips hasFeature() open by default in development. Force
// it off here so the preflight tier gate behaves like a real
// production build — tests are about the gate logic, not the dev
// override.
(global as unknown as { __DEV__: boolean }).__DEV__ = false;

// Phase 1.3 Codex pass 1 / Important #1 — service now imports
// syncRepository to detect pending profile writes and bypass the
// cache. syncRepository transitively pulls expo-sqlite (an ESM
// native module), so stub it at the boundary. Default behavior:
// no pending writes (cache active); individual tests override via
// getPendingForTable.mockResolvedValueOnce.
jest.mock('../../repositories/syncRepository', () => ({
  getPendingForTable: jest.fn(async () => []),
}));

// Stub the AsyncStorage native module the cache reaches for at module
// scope. In-memory store keeps cache integration tests honest without
// the polyfill chain.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      __resetForTest: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    },
  };
});

// Mock the network helper so the wrapper logic (preflight gate, cache,
// stamping, error remap) is what we actually exercise. AIError is
// reproduced as a plain class because TS parameter-property syntax
// isn't permitted inside a jest.mock factory (babel hoisting).
jest.mock('../aiNutritionService', () => {
  class AIError extends Error {
    code: string;
    status: number;
    details?: Record<string, unknown>;
    constructor(
      code: string,
      message: string,
      status: number,
      details?: Record<string, unknown>,
    ) {
      super(message);
      this.name = 'AIError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }
  return {
    AIError,
    callEdgeFunction: jest.fn(),
  };
});

import {
  generateAIWeeklyReport,
  AIWeeklyReportError,
  type GenerateWeeklyReportRequest,
} from '../aiWeeklyReportService';
import {
  AIError,
  callEdgeFunction as mockedCallEdgeFunction,
} from '../aiNutritionService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NARRATIVE_CACHE_VERSION } from '../../../types/weeklyReport';
import type { WeeklyReportData } from '../../../types/weeklyReport';
import type { PlanStatus } from '../subscriptionService';

const callEdgeFunction = mockedCallEdgeFunction as jest.MockedFunction<
  typeof mockedCallEdgeFunction
>;
const asyncStorageWithReset = AsyncStorage as unknown as {
  __resetForTest: () => void;
};

const SAMPLE_REPORT: WeeklyReportData = {
  weekStart: '2026-05-04',
  weekEnd: '2026-05-10',
  weightStart: 70.5,
  weightEnd: 70.7,
  weightChange: 0.2,
  avgCalories: 2400,
  avgProtein: 140,
  avgFat: 80,
  avgCarb: 280,
  mealLogDays: 7,
  workoutCount: 4,
  totalVolume: 18500,
  totalCaloriesBurned: 1600,
  consistencyScore: 100,
  nutritionScore: 100,
  trainingScore: 100,
  overallScore: 100,
};

const VALID_REQUEST: GenerateWeeklyReportRequest = {
  weekStart: '2026-05-04',
  reportData: SAMPLE_REPORT,
};

const VALID_NARRATIVE = {
  overall:
    '今週は安定したペースで増量フェーズを進めることができました。トレーニング刺激と栄養摂取のバランスが良好です。',
  sections: {
    workout: '4 回のセッションで総ボリューム 18,500 kg-reps を記録しました。',
    nutrition: 'タンパク質 1.6 g/kg を維持し、PFC バランスも良好です。',
    weight: '体重 +0.2 kg と緩やかな増加で、増量ペースとして適切です。',
    integration:
      'カロリー摂取とトレーニングボリュームの整合性が高く、増量効率が高い 1 週間でした。来週も同じペースを維持しましょう。',
  },
};

const PLUS_STATUS: PlanStatus = 'plus';
const FREE_STATUS: PlanStatus = 'free';
const TRIAL_STATUS: PlanStatus = 'trial';
const PRO_STATUS: PlanStatus = 'pro';

const CACHE_ARGS = {
  profileId: 'profile-1',
  goalType: 'bulk',
};

afterEach(() => {
  callEdgeFunction.mockReset();
  asyncStorageWithReset.__resetForTest();
});

describe('generateAIWeeklyReport — preflight tier gate', () => {
  it('throws plus_required immediately for a free user without hitting the EF', async () => {
    await expect(
      generateAIWeeklyReport(VALID_REQUEST, { planStatus: FREE_STATUS }),
    ).rejects.toMatchObject({
      name: 'AIWeeklyReportError',
      code: 'plus_required',
      status: 402,
    });
    expect(callEdgeFunction).not.toHaveBeenCalled();
  });

  it('passes the preflight for trial users (Phase 9.1 hasFeature lesson)', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, { planStatus: TRIAL_STATUS });
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);
  });

  it('passes the preflight for plus and pro tiers', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS });
    await generateAIWeeklyReport(VALID_REQUEST, { planStatus: PRO_STATUS });
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });
});

describe('generateAIWeeklyReport — happy path', () => {
  it('returns the EF narrative stamped with generatedAt + cacheVersion', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_NARRATIVE);
    const result = await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
    });
    expect(result.narrative.overall).toBe(VALID_NARRATIVE.overall);
    expect(result.narrative.sections).toEqual(VALID_NARRATIVE.sections);
    expect(typeof result.narrative.generatedAt).toBe('number');
    expect(result.narrative.cacheVersion).toBe(NARRATIVE_CACHE_VERSION);
    expect(result.fromCache).toBe(false);
  });

  it('passes the request body verbatim to the EF helper', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS });
    expect(callEdgeFunction).toHaveBeenCalledWith(
      'generate-weekly-report',
      VALID_REQUEST,
      { signal: undefined },
    );
  });

  it('forwards an AbortSignal when provided', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_NARRATIVE);
    const controller = new AbortController();
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      signal: controller.signal,
    });
    expect(callEdgeFunction).toHaveBeenCalledWith(
      'generate-weekly-report',
      VALID_REQUEST,
      { signal: controller.signal },
    );
  });
});

describe('generateAIWeeklyReport — error remap', () => {
  // `code` typed as the matching union so the AIError constructor
  // accepts it without a cast.
  const ERR_CASES: Array<{
    code:
      | 'plus_required'
      | 'quota_exceeded'
      | 'invalid_request'
      | 'unauthorized'
      | 'invalid_token'
      | 'gemini_error'
      | 'validation_failed'
      | 'internal_error'
      | 'network_error'
      | 'aborted';
    status: number;
    expectMsg: string;
  }> =
    [
      { code: 'plus_required', status: 402, expectMsg: 'Plus' },
      { code: 'quota_exceeded', status: 429, expectMsg: '上限' },
      { code: 'invalid_request', status: 400, expectMsg: '不備' },
      { code: 'unauthorized', status: 401, expectMsg: 'ログイン' },
      { code: 'invalid_token', status: 401, expectMsg: 'セッション' },
      { code: 'gemini_error', status: 502, expectMsg: 'AI 生成' },
      { code: 'validation_failed', status: 502, expectMsg: '想定外' },
      { code: 'internal_error', status: 500, expectMsg: 'サーバー' },
      { code: 'network_error', status: 0, expectMsg: 'ネットワーク' },
      { code: 'aborted', status: 0, expectMsg: '中止' },
    ];

  for (const { code, status, expectMsg } of ERR_CASES) {
    it(`rethrows AIError "${code}" as AIWeeklyReportError with same code + ja message`, async () => {
      callEdgeFunction.mockRejectedValueOnce(new AIError(code, 'raw', status));
      let caught: AIWeeklyReportError | null = null;
      try {
        await generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS });
      } catch (e) {
        caught = e as AIWeeklyReportError;
      }
      expect(caught?.code).toBe(code);
      expect(caught?.status).toBe(status);
      expect(caught?.message).toContain(expectMsg);
    });
  }

  it('preserves details payload (e.g. quota_exceeded resetAt)', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('quota_exceeded', 'limit reached', 429, {
        used: 4,
        limit: 4,
        plan: 'plus',
        resetAt: '2026-06-01T00:00:00.000Z',
      }),
    );
    let caught: AIWeeklyReportError | null = null;
    try {
      await generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS });
    } catch (e) {
      caught = e as AIWeeklyReportError;
    }
    expect(caught?.details).toMatchObject({
      used: 4,
      limit: 4,
      plan: 'plus',
      resetAt: '2026-06-01T00:00:00.000Z',
    });
  });

  it('throws validation_failed when the EF returns a malformed payload', async () => {
    callEdgeFunction.mockResolvedValueOnce({ not: 'a narrative' } as never);
    await expect(
      generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('wraps non-AIError throws as internal_error', async () => {
    callEdgeFunction.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(
      generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS }),
    ).rejects.toMatchObject({
      name: 'AIWeeklyReportError',
      code: 'internal_error',
    });
  });
});

describe('generateAIWeeklyReport — cache integration', () => {
  it('returns cached narrative on hit and skips the EF call', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_NARRATIVE);
    // Miss → EF fires → cache write.
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);
    callEdgeFunction.mockClear();
    // Hit → no EF.
    const result = await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).not.toHaveBeenCalled();
    expect(result.narrative.overall).toBe(VALID_NARRATIVE.overall);
    // Codex review pass 1 / Important #2 — cache hit must surface
    // fromCache=true so callers can suppress optimistic quota
    // increments.
    expect(result.fromCache).toBe(true);
  });

  it('returns fromCache=false on a cache miss', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_NARRATIVE);
    const result = await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(result.fromCache).toBe(false);
  });

  it('does NOT cache without cache args (e.g. unit tests)', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS });
    await generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS });
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });

  it('partitions cache by profileId — same request, different user is a miss', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: { ...CACHE_ARGS, profileId: 'profile-2' },
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });

  it('partitions cache by goalType (Phase 1.2 prompt-tone differentiator)', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: { ...CACHE_ARGS, goalType: 'cut' },
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });

  it('does NOT write to cache when the EF errors', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('gemini_error', 'fail', 502),
    );
    await expect(
      generateAIWeeklyReport(VALID_REQUEST, {
        planStatus: PLUS_STATUS,
        cache: CACHE_ARGS,
      }),
    ).rejects.toMatchObject({ code: 'gemini_error' });

    callEdgeFunction.mockResolvedValueOnce(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });

  it('does NOT touch cache when the preflight gate trips (no namespace pollution from free users)', async () => {
    await expect(
      generateAIWeeklyReport(VALID_REQUEST, {
        planStatus: FREE_STATUS,
        cache: CACHE_ARGS,
      }),
    ).rejects.toMatchObject({ code: 'plus_required' });
    expect(callEdgeFunction).not.toHaveBeenCalled();
  });

  it('records hit and miss telemetry counters', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    const { readTelemetry } = await jest.requireActual<
      typeof import('../aiWeeklyReportCache')
    >('../aiWeeklyReportCache');
    const t = await readTelemetry();
    expect(t.hits).toBe(1);
    expect(t.misses).toBe(1);
  });
});

// Phase 1.3 Codex pass 1 / Important #1 — sync-lag drift bypass.
describe('generateAIWeeklyReport — sync-bypass guard', () => {
  const { getPendingForTable } = jest.requireMock(
    '../../repositories/syncRepository',
  ) as { getPendingForTable: jest.Mock };

  beforeEach(() => {
    getPendingForTable.mockReset();
    getPendingForTable.mockImplementation(async () => []);
  });

  it('skips cache read when profiles has pending sync writes', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    // Prime the cache with a clean state.
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);

    // Now simulate a pending profile write — should bypass cache and
    // call the EF again even though the entry exists.
    callEdgeFunction.mockClear();
    getPendingForTable.mockImplementation(async (table: string) =>
      table === 'profiles' ? [{ id: 'pending-profile' }] : [],
    );
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);
  });

  it('skips cache write while profiles is pending so a poisoned entry never lands', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    getPendingForTable.mockImplementation(async (table: string) =>
      table === 'profiles' ? [{ id: 'pending-profile' }] : [],
    );
    // Generate while sync is pending — no cache write should land.
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });

    // Sync now drained. A second call must still hit the EF (no
    // cache entry was written during the pending window).
    callEdgeFunction.mockClear();
    getPendingForTable.mockImplementation(async () => []);
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);
  });

  it('uses cache normally when sync queue is clean', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    callEdgeFunction.mockClear();
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).not.toHaveBeenCalled();
  });

  it('fails open (cache active) when getPendingForTable itself throws', async () => {
    callEdgeFunction.mockResolvedValue(VALID_NARRATIVE);
    getPendingForTable.mockImplementation(async () => {
      throw new Error('sqlite hiccup');
    });
    // First call: miss (no entry yet) → EF.
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    callEdgeFunction.mockClear();
    // Second call: should hit cache because we treat sync read failure
    // as "no pending" (fail open) — see shouldBypassCache comment.
    await generateAIWeeklyReport(VALID_REQUEST, {
      planStatus: PLUS_STATUS,
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).not.toHaveBeenCalled();
  });
});

// Phase 1.3 Codex pass 1 / Important #2 — full 4-section validation.
describe('generateAIWeeklyReport — payload shape validation', () => {
  const PARTIAL_PAYLOADS: Array<{ label: string; payload: unknown }> = [
    {
      label: 'missing workout section',
      payload: {
        overall: 'overall summary',
        sections: {
          nutrition: 'n',
          weight: 'w',
          integration: 'i',
        },
      },
    },
    {
      label: 'missing nutrition section',
      payload: {
        overall: 'overall summary',
        sections: {
          workout: 'w',
          weight: 'wt',
          integration: 'i',
        },
      },
    },
    {
      label: 'missing weight section',
      payload: {
        overall: 'overall summary',
        sections: {
          workout: 'w',
          nutrition: 'n',
          integration: 'i',
        },
      },
    },
    {
      label: 'missing integration section',
      payload: {
        overall: 'overall summary',
        sections: {
          workout: 'w',
          nutrition: 'n',
          weight: 'wt',
        },
      },
    },
    {
      label: 'empty-string section',
      payload: {
        overall: 'overall summary',
        sections: {
          workout: '',
          nutrition: 'n',
          weight: 'wt',
          integration: 'i',
        },
      },
    },
  ];

  for (const { label, payload } of PARTIAL_PAYLOADS) {
    it(`rejects EF response with ${label} as validation_failed`, async () => {
      callEdgeFunction.mockResolvedValueOnce(payload as never);
      await expect(
        generateAIWeeklyReport(VALID_REQUEST, { planStatus: PLUS_STATUS }),
      ).rejects.toMatchObject({ code: 'validation_failed' });
    });
  }
});
