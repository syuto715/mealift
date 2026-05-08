// Phase 7 — aiWorkoutService now imports aiMenuCache, which pulls
// AsyncStorage at module scope. Stubbing it with an in-memory store
// keeps the cache module exercising its real logic (key build, TTL,
// telemetry counters) without dragging the native polyfill chain.
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
      // Test seam — lets us reset between cases without re-importing.
      __resetForTest: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    },
  };
});

// Mock the aiNutritionService module so the test runtime doesn't pull
// in the Expo env transform chain (constants/config → expo/virtual/env).
// This pins the test surface to aiWorkoutService's wrapper logic
// (error mapping + result shape check) — what callEdgeFunction
// actually does on the wire is covered separately by the EF's own
// validation contract (no client-side fetch tests here).
jest.mock('../aiNutritionService', () => {
  // Plain JS class — TS parameter-property syntax isn't allowed inside
  // jest.mock factory (babel restriction on hoisted scope).
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
  generateAIWorkoutMenu,
  AIWorkoutError,
  type GenerateMenuRequest,
  type GeneratedProgram,
} from '../aiWorkoutService';
import {
  AIError,
  callEdgeFunction as mockedCallEdgeFunction,
} from '../aiNutritionService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readTelemetry } from '../aiMenuCache';

const callEdgeFunction = mockedCallEdgeFunction as jest.MockedFunction<
  typeof mockedCallEdgeFunction
>;

const asyncStorageWithReset = AsyncStorage as unknown as {
  __resetForTest: () => void;
};

const VALID_REQUEST: GenerateMenuRequest = {
  targetMuscles: ['chest', 'back'],
  durationMinutes: 60,
  exerciseSlugs: ['bench_press_barbell', 'lat_pulldown_machine'],
};

const VALID_PROGRAM: GeneratedProgram = {
  programName: 'プッシュプル 4週',
  durationWeeks: 4,
  splitType: 'upper_lower',
  weeks: [
    {
      weekIndex: 1,
      deload: false,
      days: [
        {
          dayLabel: '月曜日',
          blocks: [
            {
              exerciseSlug: 'bench_press_barbell',
              sets: 3,
              repRangeMin: 5,
              repRangeMax: 8,
              targetRPE: 8,
              restSeconds: 180,
              notes: '胸を張って下ろす',
            },
          ],
        },
      ],
    },
  ],
};

afterEach(() => {
  callEdgeFunction.mockReset();
  asyncStorageWithReset.__resetForTest();
});

describe('generateAIWorkoutMenu', () => {
  it('returns the parsed program on a 200 success response', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_PROGRAM);
    const result = await generateAIWorkoutMenu(VALID_REQUEST);
    expect(result.programName).toBe('プッシュプル 4週');
    expect(result.weeks[0].days[0].blocks[0].exerciseSlug).toBe(
      'bench_press_barbell',
    );
  });

  it('passes the request body verbatim to the EF helper', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_PROGRAM);
    await generateAIWorkoutMenu(VALID_REQUEST);
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);
    // Phase 7 normalizes the third arg to { signal } — even when
    // the caller didn't pass a signal — so the cache wrapper can
    // forward AbortSignal independently of cache options.
    expect(callEdgeFunction).toHaveBeenCalledWith(
      'generate-workout-menu',
      VALID_REQUEST,
      { signal: undefined },
    );
  });

  it('forwards an AbortSignal to callEdgeFunction when provided', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_PROGRAM);
    const controller = new AbortController();
    await generateAIWorkoutMenu(VALID_REQUEST, { signal: controller.signal });
    expect(callEdgeFunction).toHaveBeenCalledWith(
      'generate-workout-menu',
      VALID_REQUEST,
      { signal: controller.signal },
    );
  });

  it('rethrows AIError "aborted" as AIWorkoutError with same code', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('aborted', 'user cancelled', 0),
    );
    await expect(generateAIWorkoutMenu(VALID_REQUEST)).rejects.toMatchObject({
      name: 'AIWorkoutError',
      code: 'aborted',
    });
  });

  it('rethrows AIError "no_equipment" as AIWorkoutError with same code', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('no_equipment', 'no equipment', 400),
    );
    await expect(generateAIWorkoutMenu(VALID_REQUEST)).rejects.toMatchObject({
      name: 'AIWorkoutError',
      code: 'no_equipment',
      status: 400,
    });
  });

  it('rethrows AIError "invalid_request" with status 400', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('invalid_request', 'bad input', 400),
    );
    await expect(generateAIWorkoutMenu(VALID_REQUEST)).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
  });

  it('rethrows AIError "unauthorized" with status 401', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('unauthorized', 'login required', 401),
    );
    await expect(generateAIWorkoutMenu(VALID_REQUEST)).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
    });
  });

  it('rethrows AIError "quota_exceeded" + preserves details payload', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('quota_exceeded', 'limit reached', 429, {
        used: 3,
        limit: 3,
        plan: 'free',
      }),
    );
    let caught: AIWorkoutError | null = null;
    try {
      await generateAIWorkoutMenu(VALID_REQUEST);
    } catch (e) {
      caught = e as AIWorkoutError;
    }
    expect(caught?.code).toBe('quota_exceeded');
    expect(caught?.status).toBe(429);
    expect(caught?.details).toMatchObject({ used: 3, limit: 3, plan: 'free' });
  });

  it('rethrows AIError "gemini_error" with status 502', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('gemini_error', 'gemini failed', 502),
    );
    await expect(generateAIWorkoutMenu(VALID_REQUEST)).rejects.toMatchObject({
      code: 'gemini_error',
      status: 502,
    });
  });

  it('rethrows AIError "validation_failed" + reason details', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('validation_failed', 'shape mismatch', 502, {
        reason: 'block.sets out of [1, 10]',
      }),
    );
    let caught: AIWorkoutError | null = null;
    try {
      await generateAIWorkoutMenu(VALID_REQUEST);
    } catch (e) {
      caught = e as AIWorkoutError;
    }
    expect(caught?.code).toBe('validation_failed');
    expect(caught?.details?.reason).toBe('block.sets out of [1, 10]');
  });

  it('rethrows AIError "internal_error" with status 500', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('internal_error', 'oops', 500),
    );
    await expect(generateAIWorkoutMenu(VALID_REQUEST)).rejects.toMatchObject({
      code: 'internal_error',
      status: 500,
    });
  });

  it('surfaces ja-localized message via ERROR_MESSAGE_BY_CODE map', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('no_equipment', 'raw english', 400),
    );
    let caught: AIWorkoutError | null = null;
    try {
      await generateAIWorkoutMenu(VALID_REQUEST);
    } catch (e) {
      caught = e as AIWorkoutError;
    }
    expect(caught?.message).toContain('器具');
  });

  it('throws AIWorkoutError "validation_failed" when EF returns a malformed program', async () => {
    callEdgeFunction.mockResolvedValueOnce({
      not: 'a program',
    } as unknown as GeneratedProgram);
    await expect(generateAIWorkoutMenu(VALID_REQUEST)).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it('wraps non-AIError throws as AIWorkoutError "internal_error"', async () => {
    callEdgeFunction.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(generateAIWorkoutMenu(VALID_REQUEST)).rejects.toMatchObject({
      name: 'AIWorkoutError',
      code: 'internal_error',
    });
  });
});

describe('generateAIWorkoutMenu — cache integration (Phase 7)', () => {
  const CACHE_ARGS = {
    profileId: 'profile-1',
    goalType: 'muscle_gain',
    equipmentKeys: ['barbell', 'machine'],
  };

  it('returns cached program on hit and skips the EF call', async () => {
    callEdgeFunction.mockResolvedValueOnce(VALID_PROGRAM);
    // First call: miss → EF fires → cache write.
    await generateAIWorkoutMenu(VALID_REQUEST, { cache: CACHE_ARGS });
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);

    // Second call: hit → no EF.
    callEdgeFunction.mockClear();
    const result = await generateAIWorkoutMenu(VALID_REQUEST, {
      cache: CACHE_ARGS,
    });
    expect(callEdgeFunction).not.toHaveBeenCalled();
    expect(result.programName).toBe(VALID_PROGRAM.programName);
  });

  it('does NOT cache when no cache args supplied', async () => {
    callEdgeFunction.mockResolvedValue(VALID_PROGRAM);
    await generateAIWorkoutMenu(VALID_REQUEST);
    await generateAIWorkoutMenu(VALID_REQUEST);
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });

  it('partitions cache by profileId — same request, different user is a miss', async () => {
    callEdgeFunction.mockResolvedValue(VALID_PROGRAM);
    await generateAIWorkoutMenu(VALID_REQUEST, { cache: CACHE_ARGS });
    await generateAIWorkoutMenu(VALID_REQUEST, {
      cache: { ...CACHE_ARGS, profileId: 'profile-2' },
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });

  it('partitions cache by goalType — bump invalidates the prior entry', async () => {
    callEdgeFunction.mockResolvedValue(VALID_PROGRAM);
    await generateAIWorkoutMenu(VALID_REQUEST, { cache: CACHE_ARGS });
    await generateAIWorkoutMenu(VALID_REQUEST, {
      cache: { ...CACHE_ARGS, goalType: 'maintenance' },
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });

  it('partitions cache by equipmentKeys (order-invariant)', async () => {
    callEdgeFunction.mockResolvedValue(VALID_PROGRAM);
    await generateAIWorkoutMenu(VALID_REQUEST, { cache: CACHE_ARGS });
    // Reordered equipment array → same canonical key → cache hit.
    callEdgeFunction.mockClear();
    await generateAIWorkoutMenu(VALID_REQUEST, {
      cache: { ...CACHE_ARGS, equipmentKeys: ['machine', 'barbell'] },
    });
    expect(callEdgeFunction).not.toHaveBeenCalled();

    // Different equipment set → miss.
    await generateAIWorkoutMenu(VALID_REQUEST, {
      cache: { ...CACHE_ARGS, equipmentKeys: ['dumbbell'] },
    });
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);
  });

  it('does NOT write to cache on EF error', async () => {
    callEdgeFunction.mockRejectedValueOnce(
      new AIError('gemini_error', 'fail', 502),
    );
    await expect(
      generateAIWorkoutMenu(VALID_REQUEST, { cache: CACHE_ARGS }),
    ).rejects.toMatchObject({ code: 'gemini_error' });

    // Subsequent call should still hit the EF (no poisoned cache entry).
    callEdgeFunction.mockResolvedValueOnce(VALID_PROGRAM);
    await generateAIWorkoutMenu(VALID_REQUEST, { cache: CACHE_ARGS });
    expect(callEdgeFunction).toHaveBeenCalledTimes(2);
  });

  it('records hit and miss telemetry counters', async () => {
    callEdgeFunction.mockResolvedValue(VALID_PROGRAM);
    // Miss + write.
    await generateAIWorkoutMenu(VALID_REQUEST, { cache: CACHE_ARGS });
    // Hit.
    await generateAIWorkoutMenu(VALID_REQUEST, { cache: CACHE_ARGS });

    // Read counters back via the same module so the assertion pins
    // observable state rather than mocked internals.
    const t = await readTelemetry();
    expect(t.hits).toBe(1);
    expect(t.misses).toBe(1);
  });
});
