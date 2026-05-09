// Build 16 / Phase 4.1 — domain layer tests for the auto-deload
// detector. Three layers of coverage mirroring Phase 2.1's approach:
//
//   1. detectDeloadRecommendation — pure logic over matrices; cover
//      window-size guards, the boundary at MRV vs MRV+1, multiple
//      affected muscles + ordering, custom detectedAt.
//   2. generateDeloadRoutine — pure transform; cover floor + min-1
//      semantics, generic field passthrough, empty input.
//   3. fetchWeeklyVolumeMatricesForDeload — aggregator wiring; cover
//      week-window selection (4 most-recent COMPLETED weeks, oldest-
//      first), local-date formatting, dbOverride threading.

const mockGetDatabase = jest.fn();

jest.mock('../../infra/database/connection', () => ({
  getDatabase: () => mockGetDatabase(),
}));

import {
  DELOAD_CONSECUTIVE_WEEKS,
  DELOAD_VOLUME_REDUCTION,
  DELOAD_DURATION_WEEKS,
  detectDeloadRecommendation,
  generateDeloadRoutine,
  fetchWeeklyVolumeMatricesForDeload,
  type WeeklyVolumeMatrix,
  type DeloadRoutineItemInput,
} from '../deloadDetection';
import {
  VOLUME_GROUPS_ORDER,
  VOLUME_LANDMARKS,
  type VolumeGroup,
} from '../volumeLandmark';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('deload detection — constants', () => {
  it('matches Phase 4 sign-off F1/F3/F4 values', () => {
    expect(DELOAD_CONSECUTIVE_WEEKS).toBe(4);
    expect(DELOAD_VOLUME_REDUCTION).toBe(0.5);
    expect(DELOAD_DURATION_WEEKS).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyMatrix(weekStart: string): WeeklyVolumeMatrix {
  return {
    weekStart,
    setsByGroup: {
      chest: 0,
      back: 0,
      shoulder_mid: 0,
      biceps: 0,
      triceps: 0,
      quads: 0,
      hamstrings: 0,
      glutes: 0,
      calves: 0,
    },
  };
}

// Build a matrix that puts the named groups N sets above their MRV.
function aboveMrvMatrix(
  weekStart: string,
  groups: VolumeGroup[],
  delta = 1,
): WeeklyVolumeMatrix {
  const m = emptyMatrix(weekStart);
  for (const g of groups) {
    m.setsByGroup[g] = VOLUME_LANDMARKS[g].mrv + delta;
  }
  return m;
}

// ---------------------------------------------------------------------------
// 1. detectDeloadRecommendation
// ---------------------------------------------------------------------------

describe('detectDeloadRecommendation', () => {
  const FOUR_WEEKS = ['2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04'];

  it('returns null when fewer than 4 matrices supplied', () => {
    expect(detectDeloadRecommendation([])).toBeNull();
    expect(
      detectDeloadRecommendation([
        aboveMrvMatrix('2026-04-13', ['chest']),
      ]),
    ).toBeNull();
    expect(
      detectDeloadRecommendation(
        FOUR_WEEKS.slice(0, 3).map((w) => aboveMrvMatrix(w, ['chest'])),
      ),
    ).toBeNull();
  });

  it('returns null when more than 4 matrices supplied', () => {
    const five = [
      ...FOUR_WEEKS,
      '2026-05-11',
    ].map((w) => aboveMrvMatrix(w, ['chest']));
    expect(detectDeloadRecommendation(five)).toBeNull();
  });

  it('returns null when no muscle is above MRV in any week', () => {
    const matrices = FOUR_WEEKS.map((w) => emptyMatrix(w));
    expect(detectDeloadRecommendation(matrices)).toBeNull();
  });

  it('returns null when a muscle exceeds MRV in only 3 of 4 weeks', () => {
    const matrices = [
      aboveMrvMatrix(FOUR_WEEKS[0], ['chest']),
      aboveMrvMatrix(FOUR_WEEKS[1], ['chest']),
      aboveMrvMatrix(FOUR_WEEKS[2], ['chest']),
      emptyMatrix(FOUR_WEEKS[3]), // chest below MRV here
    ];
    expect(detectDeloadRecommendation(matrices)).toBeNull();
  });

  it('returns recommendation when a single muscle is above MRV every week', () => {
    const matrices = FOUR_WEEKS.map((w) => aboveMrvMatrix(w, ['chest']));
    const out = detectDeloadRecommendation(matrices, '2026-05-10T12:00:00.000Z');
    expect(out).not.toBeNull();
    expect(out!.affectedMuscles).toEqual(['chest']);
    expect(out!.sourceWeekStarts).toEqual(FOUR_WEEKS);
    expect(out!.detectedAt).toBe('2026-05-10T12:00:00.000Z');
  });

  it('lists multiple muscles in affectedMuscles, ordered by VOLUME_GROUPS_ORDER', () => {
    // Triceps and chest both above MRV every week; chest comes first
    // in VOLUME_GROUPS_ORDER so it should lead the array.
    const matrices = FOUR_WEEKS.map((w) =>
      aboveMrvMatrix(w, ['triceps', 'chest']),
    );
    const out = detectDeloadRecommendation(matrices);
    expect(out).not.toBeNull();
    expect(out!.affectedMuscles).toEqual(['chest', 'triceps']);
  });

  it('omits muscles that fail the criterion even when others qualify', () => {
    // Chest above MRV every week. Biceps above MRV in 3 of 4 weeks.
    const matrices = [
      aboveMrvMatrix(FOUR_WEEKS[0], ['chest', 'biceps']),
      aboveMrvMatrix(FOUR_WEEKS[1], ['chest', 'biceps']),
      aboveMrvMatrix(FOUR_WEEKS[2], ['chest', 'biceps']),
      aboveMrvMatrix(FOUR_WEEKS[3], ['chest']), // biceps below MRV
    ];
    const out = detectDeloadRecommendation(matrices);
    expect(out).not.toBeNull();
    expect(out!.affectedMuscles).toEqual(['chest']);
  });

  it('treats MRV exactly as NOT above_mrv (boundary inclusive on classifyVolume)', () => {
    // chest MRV = 22; classifyVolume(22) === 'mav_to_mrv' (inclusive).
    // 22 should NOT trigger.
    const matrices = FOUR_WEEKS.map((w) => {
      const m = emptyMatrix(w);
      m.setsByGroup.chest = VOLUME_LANDMARKS.chest.mrv;
      return m;
    });
    expect(detectDeloadRecommendation(matrices)).toBeNull();
  });

  it('treats MRV+1 as above_mrv (fires at the smallest qualifying delta)', () => {
    const matrices = FOUR_WEEKS.map((w) => {
      const m = emptyMatrix(w);
      m.setsByGroup.chest = VOLUME_LANDMARKS.chest.mrv + 1;
      return m;
    });
    const out = detectDeloadRecommendation(matrices);
    expect(out).not.toBeNull();
    expect(out!.affectedMuscles).toEqual(['chest']);
  });

  it('preserves the supplied weekStart order in sourceWeekStarts', () => {
    const matrices = FOUR_WEEKS.map((w) => aboveMrvMatrix(w, ['chest']));
    const out = detectDeloadRecommendation(matrices);
    expect(out!.sourceWeekStarts).toEqual(FOUR_WEEKS);
  });

  it('defaults detectedAt to a fresh ISO instant when not provided', () => {
    const matrices = FOUR_WEEKS.map((w) => aboveMrvMatrix(w, ['chest']));
    const before = Date.now();
    const out = detectDeloadRecommendation(matrices);
    const after = Date.now();
    expect(out).not.toBeNull();
    const ts = Date.parse(out!.detectedAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('handles a missing muscle key in setsByGroup as 0 (below_mev, not above_mrv)', () => {
    // Construct a partial matrix lacking the chest key entirely. Cast
    // around the type — production input always has all 9 keys, but the
    // detector should be defensive against shape drift.
    const partial: WeeklyVolumeMatrix[] = FOUR_WEEKS.map((w) => ({
      weekStart: w,
      setsByGroup: { glutes: 99 } as unknown as Record<VolumeGroup, number>,
    }));
    // glutes = 99 > MRV (16) so glutes still triggers.
    const out = detectDeloadRecommendation(partial);
    expect(out).not.toBeNull();
    expect(out!.affectedMuscles).toEqual(['glutes']);
  });
});

// ---------------------------------------------------------------------------
// 2. generateDeloadRoutine
// ---------------------------------------------------------------------------

describe('generateDeloadRoutine', () => {
  it('halves targetSets via Math.floor', () => {
    const items: DeloadRoutineItemInput[] = [
      { exerciseId: 'e1', targetSets: 4, targetReps: '8-10' },
      { exerciseId: 'e2', targetSets: 6, targetReps: '5' },
    ];
    const out = generateDeloadRoutine(items);
    expect(out[0].targetSets).toBe(2);
    expect(out[1].targetSets).toBe(3);
  });

  it('floors odd numbers (5 → 2, 3 → 1)', () => {
    const items: DeloadRoutineItemInput[] = [
      { exerciseId: 'e1', targetSets: 5, targetReps: '8' },
      { exerciseId: 'e2', targetSets: 3, targetReps: '8' },
    ];
    const out = generateDeloadRoutine(items);
    expect(out[0].targetSets).toBe(2);
    expect(out[1].targetSets).toBe(1);
  });

  it('clamps to a minimum of 1 (1 → 1, 0 → 1)', () => {
    const items: DeloadRoutineItemInput[] = [
      { exerciseId: 'e1', targetSets: 1, targetReps: '8' },
      { exerciseId: 'e2', targetSets: 0, targetReps: '8' },
    ];
    const out = generateDeloadRoutine(items);
    expect(out[0].targetSets).toBe(1);
    expect(out[1].targetSets).toBe(1);
  });

  it('preserves targetReps verbatim', () => {
    const items: DeloadRoutineItemInput[] = [
      { exerciseId: 'e1', targetSets: 4, targetReps: '8-10' },
      { exerciseId: 'e2', targetSets: 4, targetReps: '5' },
      { exerciseId: 'e3', targetSets: 4, targetReps: 'AMRAP' },
    ];
    const out = generateDeloadRoutine(items);
    expect(out.map((i) => i.targetReps)).toEqual(['8-10', '5', 'AMRAP']);
  });

  it('preserves the input order', () => {
    const items: DeloadRoutineItemInput[] = [
      { exerciseId: 'e3', targetSets: 4, targetReps: '8' },
      { exerciseId: 'e1', targetSets: 4, targetReps: '8' },
      { exerciseId: 'e2', targetSets: 4, targetReps: '8' },
    ];
    const out = generateDeloadRoutine(items);
    expect(out.map((i) => i.exerciseId)).toEqual(['e3', 'e1', 'e2']);
  });

  it('passes setPattern + patternConfig through unchanged', () => {
    const items: DeloadRoutineItemInput[] = [
      {
        exerciseId: 'e1',
        targetSets: 4,
        targetReps: '5',
        setPattern: '5x5',
        patternConfig: '{"weight":100}',
      },
    ];
    const out = generateDeloadRoutine(items);
    expect(out[0].setPattern).toBe('5x5');
    expect(out[0].patternConfig).toBe('{"weight":100}');
  });

  it('passes additional caller-defined fields through (generic T)', () => {
    interface ExtendedItem extends DeloadRoutineItemInput {
      exerciseName: string;
    }
    const items: ExtendedItem[] = [
      {
        exerciseId: 'e1',
        targetSets: 4,
        targetReps: '8',
        exerciseName: 'Bench Press',
      },
    ];
    const out = generateDeloadRoutine(items);
    expect(out[0].exerciseName).toBe('Bench Press');
  });

  it('returns an empty array when given an empty array', () => {
    expect(generateDeloadRoutine([])).toEqual([]);
  });

  it('does not mutate the input items', () => {
    const items: DeloadRoutineItemInput[] = [
      { exerciseId: 'e1', targetSets: 4, targetReps: '8' },
    ];
    generateDeloadRoutine(items);
    expect(items[0].targetSets).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 3. fetchWeeklyVolumeMatricesForDeload
// ---------------------------------------------------------------------------

interface FakeRow {
  primary_muscle: string | null;
  set_count: number;
}

// Aggregator-grade fake: records each (startIso, endIso) pair its
// getAllAsync sees so tests can assert the 4-week window selection.
function makeFakeAggregatorDb() {
  const calls: { startIso: string; endIso: string; profileId: string }[] = [];
  const fake = {
    calls,
    async getAllAsync(_sql: string, params: unknown[]): Promise<FakeRow[]> {
      const [profileId, startIso, endIso] = params as [string, string, string];
      calls.push({ profileId, startIso, endIso });
      return [];
    },
    async getFirstAsync() {
      return null;
    },
    async runAsync() {
      return { changes: 0 };
    },
  };
  return fake;
}

beforeEach(() => {
  mockGetDatabase.mockReset();
});

describe('fetchWeeklyVolumeMatricesForDeload', () => {
  it('fetches exactly DELOAD_CONSECUTIVE_WEEKS matrices by default', async () => {
    const db = makeFakeAggregatorDb();
    const out = await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      undefined,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 9, 12, 0, 0, 0), // Sat 2026-05-09
    );
    expect(out).toHaveLength(4);
    expect(db.calls).toHaveLength(4);
  });

  it('fetches the 4 most recent COMPLETED weeks, oldest-first', async () => {
    const db = makeFakeAggregatorDb();
    // Reference: Tue 2026-05-12. Current week's Monday: 2026-05-11.
    // Expected weeks (oldest → newest): Mon 04-13, 04-20, 04-27, 05-04.
    const out = await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      undefined,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 12, 12, 0, 0, 0),
    );
    expect(out.map((m) => m.weekStart)).toEqual([
      '2026-04-13',
      '2026-04-20',
      '2026-04-27',
      '2026-05-04',
    ]);
  });

  it('excludes the current (in-progress) week', async () => {
    const db = makeFakeAggregatorDb();
    // Reference: Mon 2026-05-11 (start of current week). The current
    // week's Monday must NOT appear in the output.
    const out = await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      undefined,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 11, 0, 0, 0, 0),
    );
    const weekStarts = out.map((m) => m.weekStart);
    expect(weekStarts).not.toContain('2026-05-11');
    expect(weekStarts[weekStarts.length - 1]).toBe('2026-05-04');
  });

  it('passes a half-open ISO interval per week to the underlying SQL', async () => {
    const db = makeFakeAggregatorDb();
    await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      undefined,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 12, 12, 0, 0, 0),
    );
    // Each call's [startIso, endIso) must be exactly 7 days apart.
    for (const call of db.calls) {
      const start = Date.parse(call.startIso);
      const end = Date.parse(call.endIso);
      expect(end - start).toBe(7 * 24 * 60 * 60 * 1000);
    }
    // The 4 calls' starts must be sequential 7 days apart, oldest-first.
    for (let i = 1; i < db.calls.length; i++) {
      const prev = Date.parse(db.calls[i - 1].startIso);
      const cur = Date.parse(db.calls[i].startIso);
      expect(cur - prev).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it('honors a custom weeksToCheck parameter', async () => {
    const db = makeFakeAggregatorDb();
    const out = await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      6,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 12, 12, 0, 0, 0),
    );
    expect(out).toHaveLength(6);
    expect(db.calls).toHaveLength(6);
  });

  it('threads dbOverride into aggregateWeeklySetsByMuscle (no real DB connection)', async () => {
    const db = makeFakeAggregatorDb();
    await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      undefined,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 12, 12, 0, 0, 0),
    );
    // dbOverride satisfied all 4 calls — getDatabase must not have been
    // touched.
    expect(mockGetDatabase).not.toHaveBeenCalled();
  });

  it('returns matrices with all 9 VolumeGroup keys present', async () => {
    const db = makeFakeAggregatorDb();
    const out = await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      undefined,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 12, 12, 0, 0, 0),
    );
    for (const matrix of out) {
      for (const group of VOLUME_GROUPS_ORDER) {
        expect(matrix.setsByGroup[group]).toBe(0);
      }
    }
  });

  it('formats weekStart in local TZ (not UTC) — survives JST/PST boundary class', async () => {
    const db = makeFakeAggregatorDb();
    // Reference: arbitrary Wed in May. Whatever TZ jest runs in, the
    // weekStart strings must round-trip through `new Date(y, m-1, d)`
    // (local-midnight) back to the same week's Monday.
    const out = await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      undefined,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 12, 12, 0, 0, 0),
    );
    for (const matrix of out) {
      const [y, m, d] = matrix.weekStart.split('-').map((p) => parseInt(p, 10));
      const localMonday = new Date(y, m - 1, d, 0, 0, 0, 0);
      // Day-of-week 1 = Monday in JS Date.getDay() (0=Sun).
      expect(localMonday.getDay()).toBe(1);
    }
  });

  // Codex review pass 1 / Important #3 — the prior TZ test only proves
  // weekStart parses back to a Monday. It doesn't pin the COUPLING
  // between the formatted weekStart string and the SQL boundary the
  // aggregator emits, which is where the JST/PST boundary class bites.
  // Specifically: weekStart must be the local-date that, when re-parsed
  // as local-midnight and toISOString'd, equals the startIso the
  // aggregator passed to SQL. Holds under any runtime TZ.
  it('couples weekStart string to startIso — local-midnight(weekStart).toISOString() === startIso', async () => {
    const db = makeFakeAggregatorDb();
    const out = await fetchWeeklyVolumeMatricesForDeload(
      'p1',
      undefined,
      db as unknown as Parameters<typeof fetchWeeklyVolumeMatricesForDeload>[2],
      new Date(2026, 4, 12, 12, 0, 0, 0),
    );
    expect(out.length).toBe(db.calls.length);
    for (let i = 0; i < out.length; i++) {
      const ws = out[i].weekStart;
      const [y, m, d] = ws.split('-').map((p) => parseInt(p, 10));
      const expectedStartIso = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
      const expectedEndIso = new Date(y, m - 1, d + 7, 0, 0, 0, 0).toISOString();
      expect(db.calls[i].startIso).toBe(expectedStartIso);
      expect(db.calls[i].endIso).toBe(expectedEndIso);
    }
  });
});
