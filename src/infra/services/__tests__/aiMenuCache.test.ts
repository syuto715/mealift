import {
  fnv1a,
  buildCacheKey,
  getCached,
  setCached,
  recordCacheHit,
  recordCacheMiss,
  readTelemetry,
  CACHE_VERSION,
  TTL_MS,
  type CacheStorage,
  type CacheableInput,
} from '../aiMenuCache';
import type { GeneratedProgram } from '../aiWorkoutService';

// In-memory CacheStorage that records calls. Same shape as the
// AsyncStorage subset the cache module uses; constructed fresh per
// test so state never leaks across cases.
function makeFakeStorage(): CacheStorage & {
  store: Map<string, string>;
  removeCalls: string[];
} {
  const store = new Map<string, string>();
  const removeCalls: string[] = [];
  return {
    store,
    removeCalls,
    async getItem(k) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    async setItem(k, v) {
      store.set(k, v);
    },
    async removeItem(k) {
      removeCalls.push(k);
      store.delete(k);
    },
  };
}

const SAMPLE_PROGRAM: GeneratedProgram = {
  programName: 'PPL 4週',
  durationWeeks: 4,
  splitType: 'ppl',
  weeks: [
    {
      weekIndex: 1,
      deload: false,
      days: [
        {
          dayLabel: '月',
          blocks: [
            {
              exerciseSlug: 'bench_press_barbell',
              sets: 3,
              repRangeMin: 5,
              repRangeMax: 8,
              targetRPE: 8,
              restSeconds: 180,
              notes: null,
            },
          ],
        },
      ],
    },
  ],
};

const SAMPLE_INPUT: CacheableInput = {
  targetMuscles: ['chest', 'back'],
  durationMinutes: 60,
  equipmentSet: ['barbell', 'machine'],
  goalType: 'muscle_gain',
  trainingDaysPerWeek: 3,
  exerciseSlugs: ['bench_press_barbell', 'lat_pulldown_machine'],
};

describe('fnv1a', () => {
  it('is deterministic for the same input', () => {
    expect(fnv1a('hello world')).toBe(fnv1a('hello world'));
  });

  it('returns 8-character lowercase hex', () => {
    const out = fnv1a('anything');
    expect(out).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces different hashes for different inputs', () => {
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });

  it('handles non-ASCII characters via charCodeAt', () => {
    // Smoke test: doesn't throw, returns valid hex.
    expect(fnv1a('胸・三頭の日')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('buildCacheKey', () => {
  it('is order-invariant for targetMuscles, equipmentSet, exerciseSlugs', () => {
    const a = buildCacheKey(SAMPLE_INPUT);
    const b = buildCacheKey({
      ...SAMPLE_INPUT,
      targetMuscles: ['back', 'chest'],
      equipmentSet: ['machine', 'barbell'],
      exerciseSlugs: ['lat_pulldown_machine', 'bench_press_barbell'],
    });
    expect(a).toBe(b);
  });

  it('is sensitive to durationMinutes', () => {
    const a = buildCacheKey(SAMPLE_INPUT);
    const b = buildCacheKey({ ...SAMPLE_INPUT, durationMinutes: 45 });
    expect(a).not.toBe(b);
  });

  it('is sensitive to goalType', () => {
    const a = buildCacheKey(SAMPLE_INPUT);
    const b = buildCacheKey({ ...SAMPLE_INPUT, goalType: 'maintenance' });
    expect(a).not.toBe(b);
  });

  // Codex review #1 — partition by trainingDaysPerWeek so a schedule
  // change doesn't return a stale program shape.
  it('is sensitive to trainingDaysPerWeek', () => {
    const a = buildCacheKey(SAMPLE_INPUT);
    const b = buildCacheKey({ ...SAMPLE_INPUT, trainingDaysPerWeek: 5 });
    expect(a).not.toBe(b);
  });

  it('treats null trainingDaysPerWeek distinctly from a number', () => {
    const a = buildCacheKey({ ...SAMPLE_INPUT, trainingDaysPerWeek: null });
    const b = buildCacheKey({ ...SAMPLE_INPUT, trainingDaysPerWeek: 3 });
    expect(a).not.toBe(b);
  });

  it('does not mutate the caller arrays', () => {
    const input: CacheableInput = {
      ...SAMPLE_INPUT,
      targetMuscles: ['chest', 'back'],
    };
    buildCacheKey(input);
    expect(input.targetMuscles).toEqual(['chest', 'back']);
  });
});

describe('getCached / setCached', () => {
  it('returns null on cache miss', async () => {
    const storage = makeFakeStorage();
    const result = await getCached('user-1', 'somehash', { storage });
    expect(result).toBeNull();
  });

  it('round-trips a program through setCached → getCached', async () => {
    const storage = makeFakeStorage();
    await setCached('user-1', 'h', SAMPLE_PROGRAM, { storage });
    const result = await getCached('user-1', 'h', { storage });
    expect(result).toEqual(SAMPLE_PROGRAM);
  });

  it('namespaces entries per user — same hash, different user is a miss', async () => {
    const storage = makeFakeStorage();
    await setCached('user-1', 'h', SAMPLE_PROGRAM, { storage });
    const otherUser = await getCached('user-2', 'h', { storage });
    expect(otherUser).toBeNull();
  });

  it('expires entries past TTL and removes them from storage', async () => {
    const storage = makeFakeStorage();
    const writeNow = 1_000_000;
    await setCached('user-1', 'h', SAMPLE_PROGRAM, {
      storage,
      now: writeNow,
    });
    const readNow = writeNow + TTL_MS + 1;
    const result = await getCached('user-1', 'h', { storage, now: readNow });
    expect(result).toBeNull();
    expect(storage.removeCalls).toContain('ai_menu:cache:user-1:h');
  });

  it('returns cached data when read inside TTL window', async () => {
    const storage = makeFakeStorage();
    const writeNow = 1_000_000;
    await setCached('user-1', 'h', SAMPLE_PROGRAM, {
      storage,
      now: writeNow,
    });
    const result = await getCached('user-1', 'h', {
      storage,
      now: writeNow + TTL_MS - 1,
    });
    expect(result).toEqual(SAMPLE_PROGRAM);
  });

  it('treats version mismatch as expired and removes the entry', async () => {
    const storage = makeFakeStorage();
    // Hand-write an entry with a stale version number.
    await storage.setItem(
      'ai_menu:cache:user-1:h',
      JSON.stringify({
        version: CACHE_VERSION + 1,
        createdAt: Date.now(),
        data: SAMPLE_PROGRAM,
      }),
    );
    const result = await getCached('user-1', 'h', { storage });
    expect(result).toBeNull();
    expect(storage.removeCalls).toContain('ai_menu:cache:user-1:h');
  });

  it('drops corrupt JSON and returns null', async () => {
    const storage = makeFakeStorage();
    await storage.setItem('ai_menu:cache:user-1:h', '{not-json');
    const result = await getCached('user-1', 'h', { storage });
    expect(result).toBeNull();
    expect(storage.removeCalls).toContain('ai_menu:cache:user-1:h');
  });

  // Codex review #4 — structurally-valid CacheEntry whose `data` lacks
  // a programName must be treated as expired (self-healing). Mirrors
  // the non-cache path's programName check in aiWorkoutService.
  it('treats entry with empty programName as expired and removes it', async () => {
    const storage = makeFakeStorage();
    await storage.setItem(
      'ai_menu:cache:user-1:h',
      JSON.stringify({
        version: CACHE_VERSION,
        createdAt: Date.now(),
        // empty string is the most likely "structurally valid but
        // semantically broken" shape Gemini could ever produce.
        data: { programName: '', durationWeeks: 0, splitType: 'ppl', weeks: [] },
      }),
    );
    const result = await getCached('user-1', 'h', { storage });
    expect(result).toBeNull();
    expect(storage.removeCalls).toContain('ai_menu:cache:user-1:h');
  });

  it('treats entry with missing data field as expired and removes it', async () => {
    const storage = makeFakeStorage();
    await storage.setItem(
      'ai_menu:cache:user-1:h',
      JSON.stringify({
        version: CACHE_VERSION,
        createdAt: Date.now(),
        // data omitted entirely.
      }),
    );
    const result = await getCached('user-1', 'h', { storage });
    expect(result).toBeNull();
    expect(storage.removeCalls).toContain('ai_menu:cache:user-1:h');
  });

  // Codex review #3 — storage failure must not propagate to the
  // caller. A getItem reject becomes a cache miss; setItem reject is
  // swallowed silently so generation success isn't undone.
  it('returns null (cache miss) when storage.getItem rejects', async () => {
    const failing: CacheStorage = {
      async getItem() {
        throw new Error('storage offline');
      },
      async setItem() {
        // not called
      },
      async removeItem() {
        // not called
      },
    };
    const result = await getCached('user-1', 'h', { storage: failing });
    expect(result).toBeNull();
  });

  it('does not throw when storage.setItem rejects', async () => {
    const failing: CacheStorage = {
      async getItem() {
        return null;
      },
      async setItem() {
        throw new Error('disk full');
      },
      async removeItem() {
        // not called
      },
    };
    await expect(
      setCached('user-1', 'h', SAMPLE_PROGRAM, { storage: failing }),
    ).resolves.toBeUndefined();
  });
});

describe('telemetry counters', () => {
  it('increments hits and misses independently', async () => {
    const storage = makeFakeStorage();
    await recordCacheHit({ storage });
    await recordCacheHit({ storage });
    await recordCacheMiss({ storage });
    const t = await readTelemetry({ storage });
    expect(t).toEqual({ hits: 2, misses: 1 });
  });

  it('starts at zero when nothing has been recorded', async () => {
    const storage = makeFakeStorage();
    const t = await readTelemetry({ storage });
    expect(t).toEqual({ hits: 0, misses: 0 });
  });

  it('swallows storage errors during increment (best-effort)', async () => {
    const failing: CacheStorage = {
      async getItem() {
        throw new Error('storage offline');
      },
      async setItem() {
        throw new Error('storage offline');
      },
      async removeItem() {
        // not called in this test
      },
    };
    // Should not throw.
    await expect(recordCacheHit({ storage: failing })).resolves.toBeUndefined();
  });
});
