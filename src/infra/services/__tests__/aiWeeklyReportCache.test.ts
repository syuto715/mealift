import {
  buildCacheKey,
  getCached,
  setCached,
  recordCacheHit,
  recordCacheMiss,
  readTelemetry,
  CACHE_VERSION,
  TTL_MS,
  type CacheableWeeklyInput,
} from '../aiWeeklyReportCache';
import type { CacheStorage } from '../aiMenuCache';
import type { WeeklyNarrative } from '../../../types/weeklyReport';

// Same in-memory storage pattern as aiMenuCache tests (Phase 7) —
// keeps the cache module's logic exercised end-to-end without the
// AsyncStorage native polyfill.
function makeFakeStorage(): CacheStorage & {
  store: Map<string, string>;
  removeCalls: string[];
} {
  const store = new Map<string, string>();
  const removeCalls: string[] = [];
  return {
    store,
    removeCalls,
    async getItem(k: string) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    async setItem(k: string, v: string) {
      store.set(k, v);
    },
    async removeItem(k: string) {
      removeCalls.push(k);
      store.delete(k);
    },
  };
}

const SAMPLE_INPUT: CacheableWeeklyInput = {
  weekStart: '2026-05-04',
  goalType: 'bulk',
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
  weightStart: 70.5,
  weightEnd: 70.7,
  weightChange: 0.2,
};

const SAMPLE_NARRATIVE: WeeklyNarrative = {
  overall:
    'よく頑張った 1 週間でした。トレーニングと栄養の整合性が高く、増量フェーズの基盤がしっかりできています。',
  sections: {
    workout: '4 回のセッションで総ボリューム 18,500 kg-reps を記録、計画通りの刺激量です。',
    nutrition: '平均カロリー 2400 kcal、タンパク質 1.6 g/kg を維持できています。',
    weight: '体重は +0.2 kg と緩やかな増加、増量ペースとして適切です。',
    integration:
      'カロリー摂取とトレーニングボリュームのバランスが取れており、増量効率が高い状態です。来週も同じペースを維持しましょう。',
  },
  generatedAt: 1_700_000_000_000,
  cacheVersion: CACHE_VERSION,
};

describe('buildCacheKey', () => {
  it('is deterministic for the same input', () => {
    expect(buildCacheKey(SAMPLE_INPUT)).toBe(buildCacheKey(SAMPLE_INPUT));
  });

  it('returns 8-character lowercase hex (FNV-1a 32-bit)', () => {
    expect(buildCacheKey(SAMPLE_INPUT)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('partitions by weekStart', () => {
    const a = buildCacheKey(SAMPLE_INPUT);
    const b = buildCacheKey({ ...SAMPLE_INPUT, weekStart: '2026-05-11' });
    expect(a).not.toBe(b);
  });

  it('partitions by goalType', () => {
    const a = buildCacheKey(SAMPLE_INPUT);
    const b = buildCacheKey({ ...SAMPLE_INPUT, goalType: 'cut' });
    expect(a).not.toBe(b);
  });

  it('treats null goalType distinctly from a string', () => {
    const a = buildCacheKey({ ...SAMPLE_INPUT, goalType: null });
    const b = buildCacheKey({ ...SAMPLE_INPUT, goalType: 'maintain' });
    expect(a).not.toBe(b);
  });

  it('rounds weight inputs to 1 decimal so noise-floor drift does not bust cache', () => {
    // 70.51 and 70.52 round to 70.5; 70.55 rounds to 70.6 (toFixed
    // banker-half-away). Keep the assertion away from the half-mark
    // ambiguity.
    const a = buildCacheKey({ ...SAMPLE_INPUT, weightStart: 70.51 });
    const b = buildCacheKey({ ...SAMPLE_INPUT, weightStart: 70.53 });
    expect(a).toBe(b);
    const c = buildCacheKey({ ...SAMPLE_INPUT, weightStart: 70.7 });
    expect(a).not.toBe(c);
  });

  it('preserves null weights distinctly from numeric weights', () => {
    const a = buildCacheKey({ ...SAMPLE_INPUT, weightStart: null });
    const b = buildCacheKey({ ...SAMPLE_INPUT, weightStart: 0 });
    expect(a).not.toBe(b);
  });
});

describe('getCached / setCached', () => {
  it('returns null on cache miss', async () => {
    const storage = makeFakeStorage();
    expect(await getCached('user-1', 'h', { storage })).toBeNull();
  });

  it('round-trips a narrative through setCached → getCached', async () => {
    const storage = makeFakeStorage();
    await setCached('user-1', 'h', SAMPLE_NARRATIVE, { storage });
    expect(await getCached('user-1', 'h', { storage })).toEqual(
      SAMPLE_NARRATIVE,
    );
  });

  it('namespaces entries per user — same hash, different user is a miss', async () => {
    const storage = makeFakeStorage();
    await setCached('user-1', 'h', SAMPLE_NARRATIVE, { storage });
    expect(await getCached('user-2', 'h', { storage })).toBeNull();
  });

  it('namespaces away from the menu cache (no key prefix collision)', async () => {
    const storage = makeFakeStorage();
    await setCached('user-1', 'h', SAMPLE_NARRATIVE, { storage });
    // Phase 7 menu cache uses 'ai_menu:cache:user-1:h'; ours uses
    // 'ai_weekly_report:cache:user-1:h'. Sanity-check the actual key.
    expect(Array.from(storage.store.keys())).toEqual([
      'ai_weekly_report:cache:user-1:h',
    ]);
  });

  it('expires entries past 24h TTL and removes them', async () => {
    const storage = makeFakeStorage();
    const writeNow = 1_000_000;
    await setCached('user-1', 'h', SAMPLE_NARRATIVE, {
      storage,
      now: writeNow,
    });
    const result = await getCached('user-1', 'h', {
      storage,
      now: writeNow + TTL_MS + 1,
    });
    expect(result).toBeNull();
    expect(storage.removeCalls).toContain(
      'ai_weekly_report:cache:user-1:h',
    );
  });

  it('returns cached data inside the 24h window', async () => {
    const storage = makeFakeStorage();
    const writeNow = 1_000_000;
    await setCached('user-1', 'h', SAMPLE_NARRATIVE, {
      storage,
      now: writeNow,
    });
    const result = await getCached('user-1', 'h', {
      storage,
      now: writeNow + TTL_MS - 1,
    });
    expect(result).toEqual(SAMPLE_NARRATIVE);
  });

  it('treats version mismatch as expired and removes the entry', async () => {
    const storage = makeFakeStorage();
    await storage.setItem(
      'ai_weekly_report:cache:user-1:h',
      JSON.stringify({
        version: CACHE_VERSION + 1,
        createdAt: Date.now(),
        data: SAMPLE_NARRATIVE,
      }),
    );
    expect(await getCached('user-1', 'h', { storage })).toBeNull();
    expect(storage.removeCalls).toContain(
      'ai_weekly_report:cache:user-1:h',
    );
  });

  it('drops corrupt JSON and returns null', async () => {
    const storage = makeFakeStorage();
    await storage.setItem('ai_weekly_report:cache:user-1:h', '{not-json');
    expect(await getCached('user-1', 'h', { storage })).toBeNull();
    expect(storage.removeCalls).toContain(
      'ai_weekly_report:cache:user-1:h',
    );
  });

  it('treats structurally-invalid entries as expired and removes them', async () => {
    const storage = makeFakeStorage();
    // version OK, createdAt fresh, but data lacks integration section
    // — same self-healing behavior as the menu cache's programName check.
    await storage.setItem(
      'ai_weekly_report:cache:user-1:h',
      JSON.stringify({
        version: CACHE_VERSION,
        createdAt: Date.now(),
        data: { overall: '', sections: { integration: '' } },
      }),
    );
    expect(await getCached('user-1', 'h', { storage })).toBeNull();
    expect(storage.removeCalls).toContain(
      'ai_weekly_report:cache:user-1:h',
    );
  });

  it('falls back to a miss when storage.getItem rejects', async () => {
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
    expect(await getCached('user-1', 'h', { storage: failing })).toBeNull();
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
      setCached('user-1', 'h', SAMPLE_NARRATIVE, { storage: failing }),
    ).resolves.toBeUndefined();
  });
});

describe('telemetry counters', () => {
  it('increments hits and misses independently', async () => {
    const storage = makeFakeStorage();
    await recordCacheHit({ storage });
    await recordCacheHit({ storage });
    await recordCacheHit({ storage });
    await recordCacheMiss({ storage });
    const t = await readTelemetry({ storage });
    expect(t).toEqual({ hits: 3, misses: 1 });
  });

  it('starts at zero when nothing has been recorded', async () => {
    const storage = makeFakeStorage();
    expect(await readTelemetry({ storage })).toEqual({ hits: 0, misses: 0 });
  });

  it('namespaces telemetry separately from the menu cache counters', async () => {
    const storage = makeFakeStorage();
    await recordCacheHit({ storage });
    expect(Array.from(storage.store.keys())).toContain(
      'ai_weekly_report:telemetry:cache_hits',
    );
    expect(Array.from(storage.store.keys())).not.toContain(
      'ai_menu:telemetry:cache_hits',
    );
  });
});
