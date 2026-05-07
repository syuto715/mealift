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

const callEdgeFunction = mockedCallEdgeFunction as jest.MockedFunction<
  typeof mockedCallEdgeFunction
>;

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
    expect(callEdgeFunction).toHaveBeenCalledWith(
      'generate-workout-menu',
      VALID_REQUEST,
    );
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
