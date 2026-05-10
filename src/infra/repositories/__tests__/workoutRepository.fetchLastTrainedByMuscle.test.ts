// Build 16 / Phase 6.1 — repository test for the recovery-heatmap's
// per-muscle last-trained query. Mirrors the schema-aware fake-DB
// pattern from workoutRepository.fetchRecentSetsForBias.test.ts and
// volumeLandmark.test.ts: model the columns the SQL touches across
// the three joined tables, reproduce the WHERE / GROUP BY semantics
// in JS, and pin both the contract (no cross-profile leak, soft-delete
// honored, warmup excluded, primary_muscle null filtered) and the
// JS-side reduce that folds chest_upper / chest_mid / chest_lower
// into chest.

jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../../../utils/id', () => ({ generateId: () => 'stub-id' }));

import type { SQLiteDatabase } from 'expo-sqlite';
import { fetchLastTrainedByMuscle } from '../workoutRepository';

interface FakeSet {
  id: string;
  session_id: string;
  exercise_id: string;
  is_warmup: 0 | 1;
  deleted_at: string | null;
}

interface FakeSession {
  id: string;
  profile_id: string;
  started_at: string;
  deleted_at: string | null;
}

interface FakeExercise {
  id: string;
  primary_muscle: string | null;
  deleted_at: string | null;
}

interface FakeWorld {
  sets: FakeSet[];
  sessions: FakeSession[];
  exercises: FakeExercise[];
}

function makeFakeDb(world: FakeWorld): SQLiteDatabase {
  return {
    getAllAsync: (async <T,>(sql: string, params: unknown[]): Promise<T[]> => {
      // Recognise only the heatmap query; other SQL coming through
      // means the test is exercising a code path it shouldn't.
      if (
        !sql.includes('FROM workout_sets ws') ||
        !sql.includes('JOIN workout_sessions') ||
        !sql.includes('GROUP BY e.primary_muscle')
      ) {
        throw new Error(`unexpected SQL: ${sql.slice(0, 100)}`);
      }
      const [profileId] = params as [string];

      const sessionById = new Map(
        world.sessions
          .filter((s) => s.profile_id === profileId && s.deleted_at === null)
          .map((s) => [s.id, s]),
      );
      const exerciseById = new Map(
        world.exercises
          .filter((e) => e.deleted_at === null && e.primary_muscle !== null)
          .map((e) => [e.id, e]),
      );

      const filteredSets = world.sets.filter(
        (ws) =>
          sessionById.has(ws.session_id) &&
          exerciseById.has(ws.exercise_id) &&
          ws.is_warmup === 0 &&
          ws.deleted_at === null,
      );

      // GROUP BY primary_muscle, MAX(started_at).
      const maxBy = new Map<string, string>();
      for (const ws of filteredSets) {
        const ses = sessionById.get(ws.session_id)!;
        const ex = exerciseById.get(ws.exercise_id)!;
        const key = ex.primary_muscle as string;
        const cur = maxBy.get(key);
        if (!cur || ses.started_at > cur) {
          maxBy.set(key, ses.started_at);
        }
      }
      const out: { primary_muscle: string; last_iso: string }[] = [];
      for (const [primary_muscle, last_iso] of maxBy) {
        out.push({ primary_muscle, last_iso });
      }
      return out as T[];
    }) as SQLiteDatabase['getAllAsync'],
    // Unused in this test surface — return harmless stubs.
    getFirstAsync: (async () => null) as SQLiteDatabase['getFirstAsync'],
    runAsync: (async () => ({
      changes: 0,
      lastInsertRowId: 0,
    })) as SQLiteDatabase['runAsync'],
  } as unknown as SQLiteDatabase;
}

describe('fetchLastTrainedByMuscle', () => {
  it('returns all 9 VolumeGroup keys with null for un-trained muscles', async () => {
    const out = await fetchLastTrainedByMuscle(
      'p1',
      makeFakeDb({ sets: [], sessions: [], exercises: [] }),
    );
    expect(Object.keys(out).sort()).toEqual([
      'back',
      'biceps',
      'calves',
      'chest',
      'glutes',
      'hamstrings',
      'quads',
      'shoulder_mid',
      'triceps',
    ]);
    for (const v of Object.values(out)) {
      expect(v).toBeNull();
    }
  });

  it('returns the MAX started_at per muscle as a Date', async () => {
    const world: FakeWorld = {
      sets: [
        { id: 's1', session_id: 'sess-1', exercise_id: 'ex-bench', is_warmup: 0, deleted_at: null },
        { id: 's2', session_id: 'sess-2', exercise_id: 'ex-bench', is_warmup: 0, deleted_at: null },
      ],
      sessions: [
        { id: 'sess-1', profile_id: 'p1', started_at: '2026-05-01T10:00:00.000Z', deleted_at: null },
        { id: 'sess-2', profile_id: 'p1', started_at: '2026-05-09T10:00:00.000Z', deleted_at: null },
      ],
      exercises: [
        { id: 'ex-bench', primary_muscle: 'chest_mid', deleted_at: null },
      ],
    };
    const out = await fetchLastTrainedByMuscle('p1', makeFakeDb(world));
    expect(out.chest).toEqual(new Date('2026-05-09T10:00:00.000Z'));
  });

  it('folds sub-area primary_muscles (chest_upper / chest_mid / chest_lower) into chest', async () => {
    const world: FakeWorld = {
      sets: [
        { id: 's1', session_id: 'sess-1', exercise_id: 'ex-incline', is_warmup: 0, deleted_at: null },
        { id: 's2', session_id: 'sess-2', exercise_id: 'ex-flat', is_warmup: 0, deleted_at: null },
        { id: 's3', session_id: 'sess-3', exercise_id: 'ex-decline', is_warmup: 0, deleted_at: null },
      ],
      sessions: [
        { id: 'sess-1', profile_id: 'p1', started_at: '2026-05-01T10:00:00.000Z', deleted_at: null },
        { id: 'sess-2', profile_id: 'p1', started_at: '2026-05-08T10:00:00.000Z', deleted_at: null },
        { id: 'sess-3', profile_id: 'p1', started_at: '2026-05-05T10:00:00.000Z', deleted_at: null },
      ],
      exercises: [
        { id: 'ex-incline', primary_muscle: 'chest_upper', deleted_at: null },
        { id: 'ex-flat', primary_muscle: 'chest_mid', deleted_at: null },
        { id: 'ex-decline', primary_muscle: 'chest_lower', deleted_at: null },
      ],
    };
    const out = await fetchLastTrainedByMuscle('p1', makeFakeDb(world));
    // The three sub-area sessions roll up to chest; MAX is sess-2 on May 8.
    expect(out.chest).toEqual(new Date('2026-05-08T10:00:00.000Z'));
  });

  it('drops primary_muscles that map to null (back_mid / shoulder_front / core_abs etc.)', async () => {
    const world: FakeWorld = {
      sets: [
        { id: 's1', session_id: 'sess-1', exercise_id: 'ex-row', is_warmup: 0, deleted_at: null },
        { id: 's2', session_id: 'sess-2', exercise_id: 'ex-side-raise', is_warmup: 0, deleted_at: null },
        { id: 's3', session_id: 'sess-3', exercise_id: 'ex-crunch', is_warmup: 0, deleted_at: null },
      ],
      sessions: [
        { id: 'sess-1', profile_id: 'p1', started_at: '2026-05-08T10:00:00.000Z', deleted_at: null },
        { id: 'sess-2', profile_id: 'p1', started_at: '2026-05-08T10:00:00.000Z', deleted_at: null },
        { id: 'sess-3', profile_id: 'p1', started_at: '2026-05-08T10:00:00.000Z', deleted_at: null },
      ],
      exercises: [
        { id: 'ex-row', primary_muscle: 'back_mid', deleted_at: null }, // null mapping
        { id: 'ex-side-raise', primary_muscle: 'shoulder_front', deleted_at: null }, // null mapping
        { id: 'ex-crunch', primary_muscle: 'core_abs', deleted_at: null }, // null mapping
      ],
    };
    const out = await fetchLastTrainedByMuscle('p1', makeFakeDb(world));
    // None of the sub-muscles fold into a 9-group, so all are null.
    for (const v of Object.values(out)) {
      expect(v).toBeNull();
    }
  });

  it('does NOT leak across profiles (Phase 3.2 cross-profile pattern)', async () => {
    const world: FakeWorld = {
      sets: [
        { id: 's1', session_id: 'sess-1', exercise_id: 'ex-bench', is_warmup: 0, deleted_at: null },
      ],
      sessions: [
        { id: 'sess-1', profile_id: 'p2', started_at: '2026-05-08T10:00:00.000Z', deleted_at: null },
      ],
      exercises: [
        { id: 'ex-bench', primary_muscle: 'chest_mid', deleted_at: null },
      ],
    };
    const out = await fetchLastTrainedByMuscle('p1', makeFakeDb(world));
    expect(out.chest).toBeNull();
    const out2 = await fetchLastTrainedByMuscle('p2', makeFakeDb(world));
    expect(out2.chest).toEqual(new Date('2026-05-08T10:00:00.000Z'));
  });

  it('excludes warmup sets (is_warmup=1)', async () => {
    const world: FakeWorld = {
      sets: [
        { id: 's1', session_id: 'sess-1', exercise_id: 'ex-bench', is_warmup: 1, deleted_at: null },
        { id: 's2', session_id: 'sess-2', exercise_id: 'ex-bench', is_warmup: 1, deleted_at: null },
      ],
      sessions: [
        { id: 'sess-1', profile_id: 'p1', started_at: '2026-05-08T10:00:00.000Z', deleted_at: null },
        { id: 'sess-2', profile_id: 'p1', started_at: '2026-05-09T10:00:00.000Z', deleted_at: null },
      ],
      exercises: [
        { id: 'ex-bench', primary_muscle: 'chest_mid', deleted_at: null },
      ],
    };
    const out = await fetchLastTrainedByMuscle('p1', makeFakeDb(world));
    // All sets are warmup → no qualifying chest workload.
    expect(out.chest).toBeNull();
  });

  it('excludes soft-deleted sessions / sets / exercises', async () => {
    const world: FakeWorld = {
      sets: [
        { id: 's1', session_id: 'sess-1', exercise_id: 'ex-bench', is_warmup: 0, deleted_at: null },
        { id: 's2', session_id: 'sess-2', exercise_id: 'ex-bench', is_warmup: 0, deleted_at: '2026-05-09T11:00:00.000Z' },
        { id: 's3', session_id: 'sess-3', exercise_id: 'ex-bench', is_warmup: 0, deleted_at: null },
        { id: 's4', session_id: 'sess-4', exercise_id: 'ex-deleted-bench', is_warmup: 0, deleted_at: null },
      ],
      sessions: [
        { id: 'sess-1', profile_id: 'p1', started_at: '2026-05-05T10:00:00.000Z', deleted_at: null },
        { id: 'sess-2', profile_id: 'p1', started_at: '2026-05-09T10:00:00.000Z', deleted_at: null }, // set soft-deleted
        { id: 'sess-3', profile_id: 'p1', started_at: '2026-05-08T10:00:00.000Z', deleted_at: '2026-05-08T11:00:00.000Z' }, // session soft-deleted
        { id: 'sess-4', profile_id: 'p1', started_at: '2026-05-09T10:00:00.000Z', deleted_at: null },
      ],
      exercises: [
        { id: 'ex-bench', primary_muscle: 'chest_mid', deleted_at: null },
        { id: 'ex-deleted-bench', primary_muscle: 'chest_mid', deleted_at: '2026-04-30T00:00:00.000Z' }, // exercise soft-deleted
      ],
    };
    const out = await fetchLastTrainedByMuscle('p1', makeFakeDb(world));
    // Only sess-1 / s1 survives all 3 soft-delete filters.
    expect(out.chest).toEqual(new Date('2026-05-05T10:00:00.000Z'));
  });

  it('drops exercises with NULL primary_muscle (legacy / custom rows)', async () => {
    const world: FakeWorld = {
      sets: [
        { id: 's1', session_id: 'sess-1', exercise_id: 'ex-orphan', is_warmup: 0, deleted_at: null },
      ],
      sessions: [
        { id: 'sess-1', profile_id: 'p1', started_at: '2026-05-08T10:00:00.000Z', deleted_at: null },
      ],
      exercises: [
        { id: 'ex-orphan', primary_muscle: null, deleted_at: null },
      ],
    };
    const out = await fetchLastTrainedByMuscle('p1', makeFakeDb(world));
    for (const v of Object.values(out)) {
      expect(v).toBeNull();
    }
  });

  it('emits SQL with the documented JOIN + filter + GROUP BY + soft-delete clauses', async () => {
    const sqls: string[] = [];
    const captureDb = {
      getAllAsync: (async <T,>(sql: string): Promise<T[]> => {
        sqls.push(sql);
        return [] as T[];
      }) as SQLiteDatabase['getAllAsync'],
    } as unknown as SQLiteDatabase;
    await fetchLastTrainedByMuscle('p1', captureDb);
    expect(sqls).toHaveLength(1);
    const sql = sqls[0];
    expect(sql).toMatch(/JOIN workout_sessions/);
    expect(sql).toMatch(/JOIN exercises/);
    expect(sql).toMatch(/s\.profile_id\s*=\s*\?/);
    expect(sql).toMatch(/is_warmup\s*=\s*0/);
    expect(sql).toMatch(/e\.primary_muscle\s+IS\s+NOT\s+NULL/);
    expect(sql).toMatch(/MAX\(s\.started_at\)/);
    expect(sql).toMatch(/GROUP\s+BY\s+e\.primary_muscle/i);
    // Three deleted_at filters (session, set, exercise).
    expect(sql.match(/deleted_at\s+IS\s+NULL/g)?.length ?? 0).toBe(3);
  });

  it('handles a malformed last_iso row defensively (drops, does not throw)', async () => {
    // Defensive contract: if the SQLite layer returns a non-parseable
    // ISO string for some reason (sync corruption, manual DB edit),
    // skip the row rather than crashing the heatmap fetch.
    const malformedDb = {
      getAllAsync: (async <T,>(): Promise<T[]> => {
        return [
          { primary_muscle: 'chest_mid', last_iso: 'not-an-iso' },
          { primary_muscle: 'arms_biceps', last_iso: '2026-05-09T10:00:00.000Z' },
        ] as T[];
      }) as SQLiteDatabase['getAllAsync'],
    } as unknown as SQLiteDatabase;
    const out = await fetchLastTrainedByMuscle('p1', malformedDb);
    expect(out.chest).toBeNull();
    expect(out.biceps).toEqual(new Date('2026-05-09T10:00:00.000Z'));
  });
});
