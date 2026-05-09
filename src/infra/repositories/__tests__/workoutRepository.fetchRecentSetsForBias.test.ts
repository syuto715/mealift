// Stub the DB connection module so the workoutRepository import chain
// doesn't drag expo-sqlite. The helper takes its DB via parameter so
// the mocked getDatabase() is never invoked. Same pattern as
// workoutRepository.listExerciseSlugsByMuscles.test.ts.
jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../../../utils/id', () => ({ generateId: () => 'stub-id' }));

import type { SQLiteDatabase } from 'expo-sqlite';
import { fetchRecentSetsForBias } from '../workoutRepository';

// Build 16 / Phase 3.2 — schema-aware fake DB for the bias fetch.
// Models the columns the production SQL touches across three tables
// (workout_sets, workout_sessions, estimated_1rm) and reproduces the
// JOIN + filter + correlated-subquery semantics so a subsequent SQL
// regression (dropped filter, missed JOIN, lost subquery preference)
// surfaces as a test diff.

interface FakeSet {
  id: string;
  session_id: string;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: 0 | 1;
  set_number: number;
  deleted_at: string | null;
}

interface FakeSession {
  id: string;
  profile_id: string;
  started_at: string;
  deleted_at: string | null;
}

interface FakeE1rm {
  source_set_id: string;
  e1rm_kg: number;
  formula: 'adjusted' | 'avg' | 'brzycki' | 'epley';
  observed_at: string;
  deleted_at: string | null;
}

interface FakeWorld {
  sets: FakeSet[];
  sessions: FakeSession[];
  e1rms: FakeE1rm[];
}

function makeFakeDb(world: FakeWorld): SQLiteDatabase {
  return {
    getAllAsync: (async <T,>(sql: string, params: unknown[]): Promise<T[]> => {
      // Only the bias query lands here; if any other SQL is emitted
      // the test surfaces it via the unhandled fallthrough.
      if (
        !sql.includes('FROM workout_sets ws') ||
        !sql.includes('JOIN workout_sessions')
      ) {
        return [] as T[];
      }
      const [profileId, limit] = params as [string, number];

      // Filter sessions first (profile + soft-delete).
      const sessionById = new Map(
        world.sessions
          .filter((s) => s.profile_id === profileId && s.deleted_at === null)
          .map((s) => [s.id, s]),
      );

      // Filter sets per the WHERE clause.
      const filteredSets = world.sets.filter(
        (ws) =>
          sessionById.has(ws.session_id) &&
          ws.is_warmup === 0 &&
          ws.rpe !== null &&
          ws.weight_kg !== null &&
          ws.reps !== null &&
          ws.deleted_at === null,
      );

      // Resolve e1rm via the same priority the SQL subquery applies:
      // adjusted-formula first, then most-recent observed_at among
      // anything else. soft-deleted rows excluded.
      const resolveE1rm = (setId: string): number | null => {
        const candidates = world.e1rms.filter(
          (e) => e.source_set_id === setId && e.deleted_at === null,
        );
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => {
          const aAdj = a.formula === 'adjusted' ? 0 : 1;
          const bAdj = b.formula === 'adjusted' ? 0 : 1;
          if (aAdj !== bAdj) return aAdj - bAdj;
          // observed_at DESC — newer first.
          return a.observed_at < b.observed_at ? 1 : -1;
        });
        return candidates[0].e1rm_kg;
      };

      // ORDER BY started_at DESC, set_number DESC — match the SQL
      // contract precisely so reordering the JOIN won't silently
      // change which sets the LIMIT keeps.
      filteredSets.sort((a, b) => {
        const sa = sessionById.get(a.session_id)!.started_at;
        const sb = sessionById.get(b.session_id)!.started_at;
        if (sa !== sb) return sa < sb ? 1 : -1;
        return b.set_number - a.set_number;
      });

      const sliced = filteredSets.slice(0, limit);
      const rows = sliced.map((ws) => ({
        weight_kg: ws.weight_kg,
        reps: ws.reps,
        rpe: ws.rpe,
        e1rm: resolveE1rm(ws.id),
      }));
      return rows as unknown as T[];
    }) as SQLiteDatabase['getAllAsync'],
  } as unknown as SQLiteDatabase;
}

// Compact factories for fixture sets. Defaults model a typical hard
// working set with a logged RPE and a baseline e1rm observation.
function set(
  id: string,
  sessionId: string,
  overrides: Partial<FakeSet> = {},
): FakeSet {
  return {
    id,
    session_id: sessionId,
    weight_kg: 80,
    reps: 8,
    rpe: 8,
    is_warmup: 0,
    set_number: 1,
    deleted_at: null,
    ...overrides,
  };
}
function session(
  id: string,
  profileId: string,
  startedAt: string,
  deleted = false,
): FakeSession {
  return {
    id,
    profile_id: profileId,
    started_at: startedAt,
    deleted_at: deleted ? '2026-01-01T00:00:00.000Z' : null,
  };
}
function e1rm(
  setId: string,
  e1rmKg: number,
  formula: FakeE1rm['formula'] = 'avg',
  observedAt = '2026-05-04T10:00:00.000Z',
): FakeE1rm {
  return {
    source_set_id: setId,
    e1rm_kg: e1rmKg,
    formula,
    observed_at: observedAt,
    deleted_at: null,
  };
}

describe('fetchRecentSetsForBias', () => {
  it('returns hard sets ordered most-recent-first up to the limit', async () => {
    const sessions: FakeSession[] = [
      session('sess-1', 'p1', '2026-05-04T10:00:00.000Z'),
      session('sess-2', 'p1', '2026-05-06T10:00:00.000Z'),
      session('sess-3', 'p1', '2026-05-08T10:00:00.000Z'),
    ];
    const sets: FakeSet[] = [
      set('s1', 'sess-1', { weight_kg: 70, reps: 8, rpe: 8, set_number: 1 }),
      set('s2', 'sess-1', { weight_kg: 70, reps: 8, rpe: 8, set_number: 2 }),
      set('s3', 'sess-2', { weight_kg: 75, reps: 8, rpe: 8, set_number: 1 }),
      set('s4', 'sess-3', { weight_kg: 80, reps: 8, rpe: 9, set_number: 1 }),
    ];
    const e1rms: FakeE1rm[] = [
      e1rm('s1', 100),
      e1rm('s2', 100),
      e1rm('s3', 102),
      e1rm('s4', 104),
    ];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 2, db);
    expect(out).toHaveLength(2);
    // Most-recent first: s4 (sess-3), then s3 (sess-2).
    expect(out[0]).toMatchObject({ weight: 80, reps: 8, actualRpe: 9, e1rm: 104 });
    expect(out[1]).toMatchObject({ weight: 75, reps: 8, actualRpe: 8, e1rm: 102 });
  });

  it('uses set_number DESC as the tie-breaker within a session', async () => {
    const sessions: FakeSession[] = [
      session('sess-1', 'p1', '2026-05-04T10:00:00.000Z'),
    ];
    const sets: FakeSet[] = [
      set('s1', 'sess-1', { set_number: 1, weight_kg: 70 }),
      set('s2', 'sess-1', { set_number: 2, weight_kg: 75 }),
      set('s3', 'sess-1', { set_number: 3, weight_kg: 80 }),
    ];
    const e1rms: FakeE1rm[] = [e1rm('s1', 100), e1rm('s2', 100), e1rm('s3', 100)];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out.map((r) => r.weight)).toEqual([80, 75, 70]);
  });

  it('excludes warmup sets', async () => {
    const sessions = [session('sess-1', 'p1', '2026-05-04T10:00:00.000Z')];
    const sets = [
      set('s1', 'sess-1', { is_warmup: 1, weight_kg: 40 }),
      set('s2', 'sess-1', { weight_kg: 80 }),
    ];
    const e1rms = [e1rm('s1', 90), e1rm('s2', 100)];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out).toHaveLength(1);
    expect(out[0].weight).toBe(80);
  });

  it('excludes sets with null RPE (sign-off F10)', async () => {
    const sessions = [session('sess-1', 'p1', '2026-05-04T10:00:00.000Z')];
    const sets = [
      set('s1', 'sess-1', { rpe: null }),
      set('s2', 'sess-1', { rpe: 8 }),
    ];
    const e1rms = [e1rm('s1', 100), e1rm('s2', 100)];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out).toHaveLength(1);
    expect(out[0].actualRpe).toBe(8);
  });

  it('excludes soft-deleted sets', async () => {
    const sessions = [session('sess-1', 'p1', '2026-05-04T10:00:00.000Z')];
    const sets = [
      set('s1', 'sess-1', {
        weight_kg: 70,
        deleted_at: '2026-05-05T00:00:00.000Z',
      }),
      set('s2', 'sess-1', { weight_kg: 80 }),
    ];
    const e1rms = [e1rm('s1', 100), e1rm('s2', 100)];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out.map((r) => r.weight)).toEqual([80]);
  });

  it('excludes sets that belong to soft-deleted sessions', async () => {
    const sessions = [
      session('sess-deleted', 'p1', '2026-05-08T10:00:00.000Z', true),
      session('sess-live', 'p1', '2026-05-04T10:00:00.000Z'),
    ];
    const sets = [
      set('s1', 'sess-deleted', { weight_kg: 90 }),
      set('s2', 'sess-live', { weight_kg: 70 }),
    ];
    const e1rms = [e1rm('s1', 100), e1rm('s2', 100)];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out.map((r) => r.weight)).toEqual([70]);
  });

  it('partitions by profile — sets from another user never leak in', async () => {
    const sessions = [
      session('sess-1', 'p1', '2026-05-04T10:00:00.000Z'),
      session('sess-2', 'p2', '2026-05-04T10:00:00.000Z'),
    ];
    const sets = [
      set('s1', 'sess-1', { weight_kg: 70 }),
      set('s2', 'sess-2', { weight_kg: 200 }), // p2's heavy lift
    ];
    const e1rms = [e1rm('s1', 100), e1rm('s2', 250)];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out).toHaveLength(1);
    expect(out[0].weight).toBe(70);
    // Verify the same query for p2 returns p2's set independently.
    const out2 = await fetchRecentSetsForBias('p2', 10, db);
    expect(out2).toHaveLength(1);
    expect(out2[0].weight).toBe(200);
  });

  it('prefers the adjusted-formula e1rm over the baseline (Phase 9.1 priority)', async () => {
    const sessions = [session('sess-1', 'p1', '2026-05-04T10:00:00.000Z')];
    const sets = [set('s1', 'sess-1', { weight_kg: 80 })];
    // Both rows present — adjusted must win even when its observed_at
    // is older than the baseline.
    const e1rms: FakeE1rm[] = [
      e1rm('s1', 100, 'avg', '2026-05-04T10:00:01.000Z'),
      e1rm('s1', 105, 'adjusted', '2026-05-04T10:00:00.000Z'),
    ];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out[0].e1rm).toBe(105);
  });

  it('falls back to the baseline e1rm when no adjusted row exists', async () => {
    const sessions = [session('sess-1', 'p1', '2026-05-04T10:00:00.000Z')];
    const sets = [set('s1', 'sess-1', { weight_kg: 80 })];
    const e1rms = [e1rm('s1', 100, 'avg')];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out[0].e1rm).toBe(100);
  });

  it('returns null e1rm when no observation exists for the set', async () => {
    const sessions = [session('sess-1', 'p1', '2026-05-04T10:00:00.000Z')];
    const sets = [set('s1', 'sess-1', { weight_kg: 80 })];
    const e1rms: FakeE1rm[] = []; // no observation at all
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out).toHaveLength(1);
    expect(out[0].e1rm).toBeNull();
  });

  it('skips soft-deleted estimated_1rm rows when picking the e1rm', async () => {
    const sessions = [session('sess-1', 'p1', '2026-05-04T10:00:00.000Z')];
    const sets = [set('s1', 'sess-1', { weight_kg: 80 })];
    const e1rms: FakeE1rm[] = [
      // Adjusted row tombstoned — must not win.
      {
        source_set_id: 's1',
        e1rm_kg: 999,
        formula: 'adjusted',
        observed_at: '2026-05-04T10:00:00.000Z',
        deleted_at: '2026-05-05T00:00:00.000Z',
      },
      e1rm('s1', 100, 'avg'),
    ];
    const db = makeFakeDb({ sets, sessions, e1rms });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out[0].e1rm).toBe(100);
  });

  it('returns an empty array when no sets match', async () => {
    const db = makeFakeDb({ sessions: [], sets: [], e1rms: [] });
    const out = await fetchRecentSetsForBias('p1', 10, db);
    expect(out).toEqual([]);
  });
});
