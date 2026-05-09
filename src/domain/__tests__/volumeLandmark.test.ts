// Build 16 / Phase 2.1 — domain layer tests for the MEV/MAV/MRV
// volume-landmark module. Three layers of coverage:
//
//   1. Pure helpers — mapPrimaryMuscleToVolumeGroup + classifyVolume
//      + landmark-table integrity invariants.
//   2. Aggregation — aggregateWeeklySetsByMuscle against a fake DB
//      that mirrors the production SQL contract (week boundary,
//      warmup exclusion, deleted_at exclusion, primary_muscle null
//      filtering).
//   3. summarizeVolumeGroups composition — the helper combining
//      both above + ordering for the UI.

const mockGetDatabase = jest.fn();

jest.mock('../../infra/database/connection', () => ({
  getDatabase: () => mockGetDatabase(),
}));

import {
  VOLUME_GROUPS_ORDER,
  VOLUME_GROUP_LABEL_JA,
  VOLUME_LANDMARKS,
  PRIMARY_MUSCLE_TO_GROUP,
  mapPrimaryMuscleToVolumeGroup,
  classifyVolume,
  aggregateWeeklySetsByMuscle,
  summarizeVolumeGroups,
  type VolumeGroup,
} from '../volumeLandmark';

// ---------------------------------------------------------------------------
// 1. Pure helpers
// ---------------------------------------------------------------------------

describe('VOLUME_LANDMARKS — table integrity', () => {
  it('covers exactly the 9 groups in VOLUME_GROUPS_ORDER', () => {
    expect(VOLUME_GROUPS_ORDER).toHaveLength(9);
    for (const group of VOLUME_GROUPS_ORDER) {
      expect(VOLUME_LANDMARKS[group]).toBeDefined();
      expect(VOLUME_GROUP_LABEL_JA[group]).toBeDefined();
    }
  });

  // Sign-off F3 / Israetel-Hoffmann RP defaults — pin every value
  // so any unintentional edit shows up as a test diff.
  it('matches docs/long-term-strategy.md:390-401 values exactly', () => {
    expect(VOLUME_LANDMARKS.chest).toEqual({ mev: 8, mavMin: 12, mavMax: 18, mrv: 22 });
    expect(VOLUME_LANDMARKS.back).toEqual({ mev: 10, mavMin: 14, mavMax: 22, mrv: 25 });
    expect(VOLUME_LANDMARKS.shoulder_mid).toEqual({ mev: 8, mavMin: 16, mavMax: 22, mrv: 26 });
    expect(VOLUME_LANDMARKS.biceps).toEqual({ mev: 8, mavMin: 14, mavMax: 20, mrv: 24 });
    expect(VOLUME_LANDMARKS.triceps).toEqual({ mev: 6, mavMin: 10, mavMax: 14, mrv: 18 });
    expect(VOLUME_LANDMARKS.quads).toEqual({ mev: 8, mavMin: 12, mavMax: 18, mrv: 20 });
    expect(VOLUME_LANDMARKS.hamstrings).toEqual({ mev: 6, mavMin: 10, mavMax: 16, mrv: 20 });
    expect(VOLUME_LANDMARKS.glutes).toEqual({ mev: 4, mavMin: 8, mavMax: 14, mrv: 16 });
    expect(VOLUME_LANDMARKS.calves).toEqual({ mev: 8, mavMin: 12, mavMax: 16, mrv: 20 });
  });

  it('keeps the landmark numbers monotonic (MEV ≤ mavMin ≤ mavMax ≤ MRV)', () => {
    for (const group of VOLUME_GROUPS_ORDER) {
      const lm = VOLUME_LANDMARKS[group];
      expect(lm.mev).toBeLessThanOrEqual(lm.mavMin);
      expect(lm.mavMin).toBeLessThanOrEqual(lm.mavMax);
      expect(lm.mavMax).toBeLessThanOrEqual(lm.mrv);
    }
  });
});

describe('mapPrimaryMuscleToVolumeGroup', () => {
  // Build 16 / Phase 2 sign-off F7 — the strict-派 mapping. Pin
  // every primary_muscle so adding a new value in the seed forces
  // a deliberate decision here.
  const EXPECTED: Array<[string, VolumeGroup | null]> = [
    ['chest_upper', 'chest'],
    ['chest_mid', 'chest'],
    ['chest_lower', 'chest'],
    ['back_lat', 'back'],
    ['back_mid', null],
    ['back_lower', null],
    ['back_traps', null],
    ['shoulder_mid', 'shoulder_mid'],
    ['shoulder_front', null],
    ['shoulder_rear', null],
    ['arms_biceps', 'biceps'],
    ['arms_triceps', 'triceps'],
    ['arms_forearm', null],
    ['legs_quad', 'quads'],
    ['legs_ham', 'hamstrings'],
    ['legs_glute', 'glutes'],
    ['legs_calf', 'calves'],
    ['legs_adductor', null],
    ['core_abs', null],
    ['core_obliques', null],
  ];

  for (const [primaryMuscle, expected] of EXPECTED) {
    it(`maps '${primaryMuscle}' to ${expected ?? 'null (hidden)'}`, () => {
      expect(mapPrimaryMuscleToVolumeGroup(primaryMuscle)).toBe(expected);
    });
  }

  it('returns null for null/undefined/empty input', () => {
    expect(mapPrimaryMuscleToVolumeGroup(null)).toBeNull();
    expect(mapPrimaryMuscleToVolumeGroup(undefined)).toBeNull();
    expect(mapPrimaryMuscleToVolumeGroup('')).toBeNull();
  });

  it('returns null for unknown primary_muscle values', () => {
    expect(mapPrimaryMuscleToVolumeGroup('not_a_real_muscle')).toBeNull();
  });

  it('exports the lookup table covering exactly the seed values', () => {
    // Sanity check — the hardcoded 20-entry table matches the
    // seed-side primary_muscle catalog. If the seed grows a new
    // value, this test fails so the developer adds the mapping.
    expect(Object.keys(PRIMARY_MUSCLE_TO_GROUP)).toHaveLength(20);
  });
});

describe('classifyVolume', () => {
  // Use chest's landmarks {8, 12, 18, 22} as the canonical example.
  // Every boundary covered.
  it('returns below_mev when sets is strictly less than MEV', () => {
    expect(classifyVolume(0, 'chest')).toBe('below_mev');
    expect(classifyVolume(7, 'chest')).toBe('below_mev');
  });

  it('returns mev_to_mav when sets is in [MEV, mavMin)', () => {
    expect(classifyVolume(8, 'chest')).toBe('mev_to_mav');
    expect(classifyVolume(11, 'chest')).toBe('mev_to_mav');
  });

  it('returns mav_to_mrv across the optimal/overreaching span [mavMin, MRV]', () => {
    expect(classifyVolume(12, 'chest')).toBe('mav_to_mrv');
    expect(classifyVolume(15, 'chest')).toBe('mav_to_mrv');
    expect(classifyVolume(22, 'chest')).toBe('mav_to_mrv');
  });

  it('returns above_mrv when sets exceed MRV', () => {
    expect(classifyVolume(23, 'chest')).toBe('above_mrv');
    expect(classifyVolume(99, 'chest')).toBe('above_mrv');
  });

  it('handles glutes (lowest thresholds) at every boundary', () => {
    // glutes = { mev:4, mavMin:8, mavMax:14, mrv:16 }
    expect(classifyVolume(3, 'glutes')).toBe('below_mev');
    expect(classifyVolume(4, 'glutes')).toBe('mev_to_mav');
    expect(classifyVolume(8, 'glutes')).toBe('mav_to_mrv');
    expect(classifyVolume(16, 'glutes')).toBe('mav_to_mrv');
    expect(classifyVolume(17, 'glutes')).toBe('above_mrv');
  });
});

// ---------------------------------------------------------------------------
// 2. Aggregation
// ---------------------------------------------------------------------------

interface FakeRow {
  primary_muscle: string | null;
  set_count: number;
}

interface FakeSessionSetExercise {
  // Test fixtures: each entry represents the joined row a single
  // hard set would yield (one row per set, with its session's
  // started_at + deleted_at attached). The fake aggregator
  // reproduces the GROUP BY primary_muscle the production SQL
  // does, after applying the same filters.
  session_started_at: string;
  session_profile_id: string;
  session_deleted_at: string | null;
  set_is_warmup: 0 | 1;
  set_deleted_at: string | null;
  exercise_deleted_at: string | null;
  exercise_primary_muscle: string | null;
}

function makeFakeDb(records: FakeSessionSetExercise[]) {
  return {
    async getAllAsync(_sql: string, params: unknown[]): Promise<FakeRow[]> {
      const [profileId, startStr, dayAfterEnd] = params as [
        string,
        string,
        string,
      ];
      const filtered = records.filter(
        (r) =>
          r.session_profile_id === profileId &&
          r.session_started_at >= startStr &&
          r.session_started_at < dayAfterEnd &&
          r.session_deleted_at === null &&
          r.set_is_warmup === 0 &&
          r.set_deleted_at === null &&
          r.exercise_deleted_at === null,
      );
      // GROUP BY primary_muscle.
      const counts = new Map<string | null, number>();
      for (const r of filtered) {
        const key = r.exercise_primary_muscle;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const rows: FakeRow[] = [];
      for (const [primary_muscle, set_count] of counts) {
        rows.push({ primary_muscle, set_count });
      }
      return rows;
    },
    async getFirstAsync() {
      return null;
    },
    async runAsync() {
      return { changes: 0 };
    },
  };
}

function setRecord(
  primaryMuscle: string | null,
  startedAt: string,
  overrides: Partial<FakeSessionSetExercise> = {},
): FakeSessionSetExercise {
  return {
    session_started_at: startedAt,
    session_profile_id: 'p1',
    session_deleted_at: null,
    set_is_warmup: 0,
    set_deleted_at: null,
    exercise_deleted_at: null,
    exercise_primary_muscle: primaryMuscle,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetDatabase.mockReset();
});

describe('aggregateWeeklySetsByMuscle', () => {
  it('returns all-zero result when no sets exist', async () => {
    const db = makeFakeDb([]);
    mockGetDatabase.mockResolvedValue(db);
    const out = await aggregateWeeklySetsByMuscle('p1', '2026-05-04');
    expect(out).toEqual({
      chest: 0,
      back: 0,
      shoulder_mid: 0,
      biceps: 0,
      triceps: 0,
      quads: 0,
      hamstrings: 0,
      glutes: 0,
      calves: 0,
    });
  });

  it('counts hard sets and groups them by VolumeGroup', async () => {
    // Simulate a Push/Pull/Legs week:
    //   Mon — bench press (chest_mid x4) + tricep pushdown (arms_triceps x3)
    //   Wed — pull up (back_lat x4) + barbell curl (arms_biceps x3)
    //   Fri — squat (legs_quad x5) + RDL (legs_ham x3) + calf raise x2
    const records: FakeSessionSetExercise[] = [];
    for (let i = 0; i < 4; i++)
      records.push(setRecord('chest_mid', '2026-05-04T10:00:00.000Z'));
    for (let i = 0; i < 3; i++)
      records.push(setRecord('arms_triceps', '2026-05-04T10:00:00.000Z'));
    for (let i = 0; i < 4; i++)
      records.push(setRecord('back_lat', '2026-05-06T10:00:00.000Z'));
    for (let i = 0; i < 3; i++)
      records.push(setRecord('arms_biceps', '2026-05-06T10:00:00.000Z'));
    for (let i = 0; i < 5; i++)
      records.push(setRecord('legs_quad', '2026-05-08T10:00:00.000Z'));
    for (let i = 0; i < 3; i++)
      records.push(setRecord('legs_ham', '2026-05-08T10:00:00.000Z'));
    for (let i = 0; i < 2; i++)
      records.push(setRecord('legs_calf', '2026-05-08T10:00:00.000Z'));

    const db = makeFakeDb(records);
    mockGetDatabase.mockResolvedValue(db);
    const out = await aggregateWeeklySetsByMuscle('p1', '2026-05-04');

    expect(out.chest).toBe(4);
    expect(out.triceps).toBe(3);
    expect(out.back).toBe(4);
    expect(out.biceps).toBe(3);
    expect(out.quads).toBe(5);
    expect(out.hamstrings).toBe(3);
    expect(out.calves).toBe(2);
    // Untouched groups stay 0.
    expect(out.shoulder_mid).toBe(0);
    expect(out.glutes).toBe(0);
  });

  it('rolls all 3 chest sub-areas (chest_upper / mid / lower) into the chest group', async () => {
    const records: FakeSessionSetExercise[] = [
      ...Array.from({ length: 3 }, () =>
        setRecord('chest_upper', '2026-05-04T10:00:00.000Z'),
      ),
      ...Array.from({ length: 4 }, () =>
        setRecord('chest_mid', '2026-05-04T10:00:00.000Z'),
      ),
      ...Array.from({ length: 2 }, () =>
        setRecord('chest_lower', '2026-05-04T10:00:00.000Z'),
      ),
    ];
    const db = makeFakeDb(records);
    mockGetDatabase.mockResolvedValue(db);
    const out = await aggregateWeeklySetsByMuscle('p1', '2026-05-04');
    expect(out.chest).toBe(9);
  });

  it('drops primary_muscle values that map to null (back_mid / shoulder_front / core_abs)', async () => {
    const records: FakeSessionSetExercise[] = [
      ...Array.from({ length: 5 }, () =>
        setRecord('back_mid', '2026-05-04T10:00:00.000Z'),
      ),
      ...Array.from({ length: 4 }, () =>
        setRecord('shoulder_front', '2026-05-04T10:00:00.000Z'),
      ),
      ...Array.from({ length: 3 }, () =>
        setRecord('core_abs', '2026-05-04T10:00:00.000Z'),
      ),
      // One legitimate chest set so we can confirm the result isn't
      // simply empty.
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z'),
    ];
    const db = makeFakeDb(records);
    mockGetDatabase.mockResolvedValue(db);
    const out = await aggregateWeeklySetsByMuscle('p1', '2026-05-04');
    expect(out.chest).toBe(1);
    expect(out.back).toBe(0);
    expect(out.shoulder_mid).toBe(0);
  });

  it('drops sets attached to exercises with null primary_muscle (legacy / custom rows)', async () => {
    const records: FakeSessionSetExercise[] = [
      ...Array.from({ length: 5 }, () =>
        setRecord(null, '2026-05-04T10:00:00.000Z'),
      ),
    ];
    const db = makeFakeDb(records);
    mockGetDatabase.mockResolvedValue(db);
    const out = await aggregateWeeklySetsByMuscle('p1', '2026-05-04');
    expect(out.chest).toBe(0);
  });

  it('respects the half-open week boundary (Sun 23:59 counts, Mon 00:00 next week does not)', async () => {
    const records: FakeSessionSetExercise[] = [
      // Mon morning (week 2026-05-04) — counts.
      setRecord('chest_mid', '2026-05-04T06:00:00.000Z'),
      // Sun late evening (last day of the week) — counts.
      setRecord('chest_mid', '2026-05-10T23:59:00.000Z'),
      // Mon next week 00:00 — must NOT count.
      setRecord('chest_mid', '2026-05-11T00:00:00.000Z'),
    ];
    const db = makeFakeDb(records);
    mockGetDatabase.mockResolvedValue(db);
    const out = await aggregateWeeklySetsByMuscle('p1', '2026-05-07');
    expect(out.chest).toBe(2);
  });

  it('excludes warmup sets (is_warmup=1)', async () => {
    const records: FakeSessionSetExercise[] = [
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z'),
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z', { set_is_warmup: 1 }),
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z', { set_is_warmup: 1 }),
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z'),
    ];
    const db = makeFakeDb(records);
    mockGetDatabase.mockResolvedValue(db);
    const out = await aggregateWeeklySetsByMuscle('p1', '2026-05-04');
    expect(out.chest).toBe(2);
  });

  it('excludes soft-deleted sessions / sets / exercises', async () => {
    const records: FakeSessionSetExercise[] = [
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z'),
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z', {
        session_deleted_at: '2026-05-05T00:00:00.000Z',
      }),
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z', {
        set_deleted_at: '2026-05-05T00:00:00.000Z',
      }),
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z', {
        exercise_deleted_at: '2026-05-05T00:00:00.000Z',
      }),
    ];
    const db = makeFakeDb(records);
    mockGetDatabase.mockResolvedValue(db);
    const out = await aggregateWeeklySetsByMuscle('p1', '2026-05-04');
    expect(out.chest).toBe(1);
  });

  it('partitions by profile (a different profile is a separate aggregation)', async () => {
    const records: FakeSessionSetExercise[] = [
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z'),
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z', {
        session_profile_id: 'p2',
      }),
    ];
    const db = makeFakeDb(records);
    mockGetDatabase.mockResolvedValue(db);

    const p1 = await aggregateWeeklySetsByMuscle('p1', '2026-05-04');
    const p2 = await aggregateWeeklySetsByMuscle('p2', '2026-05-04');
    expect(p1.chest).toBe(1);
    expect(p2.chest).toBe(1);
  });

  // Phase 1.1 Codex pass 1 / Critical #1 lesson — pin the local-noon
  // parsing so a negative-offset user can't shift into the previous
  // calendar week.
  it('uses local-noon parsing on YYYY-MM-DD strings to dodge UTC-midnight TZ bug', async () => {
    let observedStartStr = '';
    const db = {
      async getAllAsync(_sql: string, params: unknown[]) {
        observedStartStr = params[1] as string;
        return [] as FakeRow[];
      },
      async getFirstAsync() {
        return null;
      },
      async runAsync() {
        return { changes: 0 };
      },
    };
    mockGetDatabase.mockResolvedValue(db);
    // 2026-05-04 is a Monday — startOfWeek(Monday-noon, weekStartsOn:1)
    // must yield the same Monday, regardless of timezone. This would
    // fail under the naive `new Date('2026-05-04')` approach in
    // negative offsets because UTC midnight resolves to the previous
    // Sunday.
    await aggregateWeeklySetsByMuscle('p1', '2026-05-04');
    expect(observedStartStr).toBe('2026-05-04');
  });

  it('accepts a Date directly for the reference week', async () => {
    let observedStartStr = '';
    const db = {
      async getAllAsync(_sql: string, params: unknown[]) {
        observedStartStr = params[1] as string;
        return [] as FakeRow[];
      },
      async getFirstAsync() {
        return null;
      },
      async runAsync() {
        return { changes: 0 };
      },
    };
    mockGetDatabase.mockResolvedValue(db);
    // Reference: Wed 2026-05-06; week starts Mon 2026-05-04.
    await aggregateWeeklySetsByMuscle(
      'p1',
      new Date(2026, 4, 6, 12, 0, 0, 0),
    );
    expect(observedStartStr).toBe('2026-05-04');
  });

  it('accepts a dbOverride for tests (DI pattern)', async () => {
    // Pass the fake DB explicitly; getDatabase must not be called.
    const fake = makeFakeDb([
      setRecord('chest_mid', '2026-05-04T10:00:00.000Z'),
    ]);
    const out = await aggregateWeeklySetsByMuscle(
      'p1',
      '2026-05-04',
      fake as unknown as Parameters<typeof aggregateWeeklySetsByMuscle>[2],
    );
    expect(out.chest).toBe(1);
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. summarizeVolumeGroups
// ---------------------------------------------------------------------------

describe('summarizeVolumeGroups', () => {
  it('returns 9 entries in VOLUME_GROUPS_ORDER sequence', () => {
    const summaries = summarizeVolumeGroups({
      chest: 14,
      back: 0,
      shoulder_mid: 0,
      biceps: 0,
      triceps: 0,
      quads: 0,
      hamstrings: 0,
      glutes: 0,
      calves: 0,
    });
    expect(summaries.map((s) => s.group)).toEqual([...VOLUME_GROUPS_ORDER]);
  });

  it('classifies each group by its own thresholds + attaches the landmark for UI band rendering', () => {
    const summaries = summarizeVolumeGroups({
      chest: 14, // mavMin=12, mavMax=18 → mav_to_mrv
      back: 5, // MEV=10 → below_mev
      shoulder_mid: 0,
      biceps: 9, // MEV=8, mavMin=14 → mev_to_mav
      triceps: 19, // MRV=18 → above_mrv
      quads: 0,
      hamstrings: 0,
      glutes: 0,
      calves: 0,
    });
    const byGroup = new Map(summaries.map((s) => [s.group, s]));
    expect(byGroup.get('chest')?.zone).toBe('mav_to_mrv');
    expect(byGroup.get('back')?.zone).toBe('below_mev');
    expect(byGroup.get('biceps')?.zone).toBe('mev_to_mav');
    expect(byGroup.get('triceps')?.zone).toBe('above_mrv');
    // Landmark passthrough for chart band rendering.
    expect(byGroup.get('chest')?.landmark.mev).toBe(8);
    expect(byGroup.get('chest')?.landmark.mrv).toBe(22);
  });

  it('attaches the Japanese label for each group', () => {
    const summaries = summarizeVolumeGroups({
      chest: 0,
      back: 0,
      shoulder_mid: 0,
      biceps: 0,
      triceps: 0,
      quads: 0,
      hamstrings: 0,
      glutes: 0,
      calves: 0,
    });
    const byGroup = new Map(summaries.map((s) => [s.group, s.labelJa]));
    expect(byGroup.get('chest')).toBe('大胸筋');
    expect(byGroup.get('back')).toBe('広背筋');
    expect(byGroup.get('shoulder_mid')).toBe('三角筋(中部)');
    expect(byGroup.get('hamstrings')).toBe('ハムストリングス');
    expect(byGroup.get('glutes')).toBe('大臀筋');
  });

  it('treats missing keys in the input as zero (defensive null-safe)', () => {
    const summaries = summarizeVolumeGroups({
      chest: 5,
      // The rest intentionally omitted via cast — the helper should
      // treat undefined like 0, not throw or produce NaN.
    } as Record<VolumeGroup, number>);
    const byGroup = new Map(summaries.map((s) => [s.group, s]));
    expect(byGroup.get('back')?.weeklySets).toBe(0);
    expect(byGroup.get('back')?.zone).toBe('below_mev');
  });
});
