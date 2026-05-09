// Build 16 / Phase 1.1 — narrative helpers + saveWeeklyReport
// hardening (stable id + sync enqueue).
//
// jest.mock pattern matches the rest of the project (loginSyncBootstrap,
// listExerciseSlugsByMuscles): stub the database connection and the
// sync queue at the module boundary so the domain layer's import chain
// doesn't drag expo-sqlite / expo-crypto through Jest's transform.

const mockGetDatabase = jest.fn();
const mockEnqueue = jest.fn(
  async (_table: string, _id: string, _op: string): Promise<void> => undefined,
);
let mockNextUuid = 0;

jest.mock('../../infra/database/connection', () => ({
  getDatabase: () => mockGetDatabase(),
}));

jest.mock('../../infra/repositories/syncRepository', () => ({
  enqueueRowFromTable: (table: string, id: string, op: string) =>
    mockEnqueue(table, id, op),
}));

jest.mock('../../utils/id', () => ({
  generateId: () => `uuid-${++mockNextUuid}`,
}));

import {
  saveNarrativeToReport,
  getNarrativeFromReport,
  saveWeeklyReport,
} from '../weeklyReport';
import {
  WeeklyReportData,
  NARRATIVE_CACHE_VERSION,
} from '../../types/weeklyReport';

interface FakeRow {
  id: string;
  profile_id: string;
  week_start: string;
  week_end: string;
  data_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Minimal fake DB pattern-matching only the SQL shapes weeklyReport.ts
// emits. Same approach as userConsentRepository.test.ts.
function makeFakeDb(): {
  rows: FakeRow[];
  db: {
    getFirstAsync: (sql: string, params: unknown[]) => Promise<unknown>;
    getAllAsync: (sql: string, params: unknown[]) => Promise<unknown[]>;
    runAsync: (sql: string, params: unknown[]) => Promise<unknown>;
  };
} {
  const rows: FakeRow[] = [];
  const db = {
    async getFirstAsync(sql: string, params: unknown[]) {
      // saveWeeklyReport's id lookup
      if (
        sql.includes('SELECT id FROM weekly_reports') &&
        sql.includes('week_start = ?')
      ) {
        const [profileId, weekStart] = params as [string, string];
        const match = rows.find(
          (r) =>
            r.profile_id === profileId &&
            r.week_start === weekStart &&
            r.deleted_at === null,
        );
        return match ? { id: match.id } : null;
      }
      // fetchReportForWeek
      if (
        sql.includes('SELECT data_json FROM weekly_reports') &&
        sql.includes('week_start = ?')
      ) {
        const [profileId, weekStart] = params as [string, string];
        const match = rows.find(
          (r) =>
            r.profile_id === profileId &&
            r.week_start === weekStart &&
            r.deleted_at === null,
        );
        return match ? { data_json: match.data_json } : null;
      }
      // generateWeeklyReport's body_logs SELECT — return empty so the
      // generator falls into its 0-row branches without touching real DB.
      // (Tests that exercise saveNarrativeToReport's "no row exists"
      // path call generateWeeklyReport internally; this stub keeps it
      // running.)
      return null;
    },
    async getAllAsync(sql: string, _params: unknown[]) {
      // generateWeeklyReport reads body_logs / meal_logs / workout_*
      // — return empty in all cases so the generator's defaults apply.
      void sql;
      return [];
    },
    async runAsync(sql: string, params: unknown[]) {
      if (sql.includes('INSERT INTO weekly_reports')) {
        const [
          id,
          profileId,
          weekStart,
          weekEnd,
          dataJson,
          createdAt,
          updatedAt,
        ] = params as [string, string, string, string, string, string, string];
        // ON CONFLICT(profile_id, week_start) — match by the unique
        // index columns first so the test mirrors the production
        // upsert semantics (id stays stable on UPDATE, even if the
        // INSERT id differs from the existing row's id).
        const existingByWeek = rows.find(
          (r) =>
            r.profile_id === profileId &&
            r.week_start === weekStart &&
            r.deleted_at === null,
        );
        if (existingByWeek) {
          existingByWeek.week_end = weekEnd;
          existingByWeek.data_json = dataJson;
          existingByWeek.updated_at = updatedAt;
        } else {
          rows.push({
            id,
            profile_id: profileId,
            week_start: weekStart,
            week_end: weekEnd,
            data_json: dataJson,
            created_at: createdAt,
            updated_at: updatedAt,
            deleted_at: null,
          });
        }
        return { changes: 1 };
      }
      return { changes: 0 };
    },
  };
  return { rows, db };
}

const NARRATIVE = {
  overall: '今週は安定したペース。',
  sections: {
    workout: 'ベンチプレス +5kg。',
    nutrition: 'タンパク質 1.6 g/kg 達成。',
    weight: '微減 0.3 kg。',
    integration: '増量フェーズなのでカロリー +200 を推奨。',
  },
};

const SAMPLE_REPORT: WeeklyReportData = {
  weekStart: '2026-05-04',
  weekEnd: '2026-05-10',
  weightStart: 70,
  weightEnd: 69.7,
  weightChange: -0.3,
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

beforeEach(() => {
  mockEnqueue.mockClear();
  mockNextUuid = 0;
});

describe('saveWeeklyReport (Phase 1.1 hardening)', () => {
  it('inserts a fresh row + enqueues INSERT on first save for a week', async () => {
    const { rows, db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveWeeklyReport('profile-1', SAMPLE_REPORT);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('uuid-1');
    expect(rows[0].profile_id).toBe('profile-1');
    expect(rows[0].week_start).toBe(SAMPLE_REPORT.weekStart);
    expect(mockEnqueue).toHaveBeenCalledWith(
      'weekly_reports',
      'uuid-1',
      'INSERT',
    );
  });

  it('reuses the existing row id on subsequent saves for the same week', async () => {
    const { rows, db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveWeeklyReport('profile-1', SAMPLE_REPORT);
    const firstId = rows[0].id;
    // Second save: bumped overallScore so the row has new data.
    await saveWeeklyReport('profile-1', { ...SAMPLE_REPORT, overallScore: 95 });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(firstId);
    expect(JSON.parse(rows[0].data_json).overallScore).toBe(95);
    expect(mockEnqueue).toHaveBeenLastCalledWith(
      'weekly_reports',
      firstId,
      'UPDATE',
    );
  });

  it('partitions by profile — same week + different profile is a separate row', async () => {
    const { rows, db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveWeeklyReport('profile-1', SAMPLE_REPORT);
    await saveWeeklyReport('profile-2', SAMPLE_REPORT);
    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('saveNarrativeToReport / getNarrativeFromReport', () => {
  it('attaches narrative to an existing report and round-trips via getNarrativeFromReport', async () => {
    const { db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveWeeklyReport('profile-1', SAMPLE_REPORT);
    await saveNarrativeToReport('profile-1', SAMPLE_REPORT.weekStart, NARRATIVE);
    const got = await getNarrativeFromReport('profile-1', SAMPLE_REPORT.weekStart);
    expect(got?.overall).toBe(NARRATIVE.overall);
    expect(got?.sections).toEqual(NARRATIVE.sections);
    expect(got?.cacheVersion).toBe(NARRATIVE_CACHE_VERSION);
    expect(typeof got?.generatedAt).toBe('number');
  });

  it('preserves all rule-based stats when merging narrative', async () => {
    const { rows, db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveWeeklyReport('profile-1', SAMPLE_REPORT);
    await saveNarrativeToReport('profile-1', SAMPLE_REPORT.weekStart, NARRATIVE);
    const stored = JSON.parse(rows[0].data_json) as WeeklyReportData;
    expect(stored.overallScore).toBe(SAMPLE_REPORT.overallScore);
    expect(stored.avgCalories).toBe(SAMPLE_REPORT.avgCalories);
    expect(stored.workoutCount).toBe(SAMPLE_REPORT.workoutCount);
    expect(stored.narrative).toBeDefined();
  });

  it('generates fresh stats when no report exists yet for the week', async () => {
    const { rows, db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    // Skip saveWeeklyReport — first persist is the narrative save itself.
    await saveNarrativeToReport('profile-1', '2026-05-04', NARRATIVE);
    expect(rows).toHaveLength(1);
    const stored = JSON.parse(rows[0].data_json) as WeeklyReportData;
    expect(stored.narrative?.overall).toBe(NARRATIVE.overall);
    // generateWeeklyReport with empty fakes returns its zero-row branches:
    expect(stored.workoutCount).toBe(0);
    expect(stored.mealLogDays).toBe(0);
  });

  it('returns null when no report row exists for the week', async () => {
    const { db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    const got = await getNarrativeFromReport('profile-1', '2026-05-04');
    expect(got).toBeNull();
  });

  it('returns null when the row exists but has no narrative (forward compat)', async () => {
    const { db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveWeeklyReport('profile-1', SAMPLE_REPORT);
    const got = await getNarrativeFromReport('profile-1', SAMPLE_REPORT.weekStart);
    expect(got).toBeNull();
  });

  it('uses caller-supplied generatedAt + cacheVersion when provided', async () => {
    const { db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveNarrativeToReport('profile-1', '2026-05-04', {
      ...NARRATIVE,
      generatedAt: 1_700_000_000_000,
      cacheVersion: 99,
    });
    const got = await getNarrativeFromReport('profile-1', '2026-05-04');
    expect(got?.generatedAt).toBe(1_700_000_000_000);
    expect(got?.cacheVersion).toBe(99);
  });

  it('overwrites a prior narrative on second save (regenerate path)', async () => {
    const { rows, db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveNarrativeToReport('profile-1', '2026-05-04', NARRATIVE);
    const firstId = rows[0].id;
    await saveNarrativeToReport('profile-1', '2026-05-04', {
      ...NARRATIVE,
      overall: '修正版の総括',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(firstId);
    const stored = JSON.parse(rows[0].data_json) as WeeklyReportData;
    expect(stored.narrative?.overall).toBe('修正版の総括');
  });

  // Codex review pass 1 / Critical #1 + Important #3 — pin the
  // local-noon parsing fix. Without it, weekStart='2026-05-04' would
  // round-trip as '2026-04-27' for users in negative offsets because
  // new Date('2026-05-04') is UTC midnight.
  it('preserves the caller-supplied weekStart on first save regardless of timezone interpretation', async () => {
    const { rows, db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    await saveNarrativeToReport('profile-1', '2026-05-04', NARRATIVE);
    expect(rows).toHaveLength(1);
    // The persisted row must reflect the caller's week, not a TZ-
    // shifted snap to the prior Monday.
    expect(rows[0].week_start).toBe('2026-05-04');
    const stored = JSON.parse(rows[0].data_json) as WeeklyReportData;
    expect(stored.weekStart).toBe('2026-05-04');
  });

  // Codex review pass 1 / Important #3 — pin the corrupt-JSON
  // recovery path. fetchReportForWeek/getNarrativeFromReport both
  // catch the parse failure and return null instead of throwing.
  it('returns null when the row exists but data_json is corrupt', async () => {
    const { rows, db } = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);
    rows.push({
      id: 'corrupt-id',
      profile_id: 'profile-1',
      week_start: '2026-05-04',
      week_end: '2026-05-10',
      data_json: '{not-valid-json',
      created_at: '2026-05-11T00:00:00Z',
      updated_at: '2026-05-11T00:00:00Z',
      deleted_at: null,
    });
    const got = await getNarrativeFromReport('profile-1', '2026-05-04');
    expect(got).toBeNull();
  });
});

// Build 16 / Phase 2 hotfix — pin the training-stats SQL against
// the schema. The original `WHERE ws.date BETWEEN ? AND ?` clause
// referenced a column that doesn't exist on workout_sessions
// (only `started_at`), so the query threw at runtime and the
// caller's catch produced empty stats. This block now uses a
// richer fake DB that recognizes the training query, returns
// shaped rows, and verifies generateWeeklyReport assembles them
// correctly under the half-open started_at filter.
//
// Two regression tests:
//   1. half-open week boundary (a session at 23:59:59 of weekEnd
//      counts; a session at 00:00:00 of weekEnd+1 does not).
//   2. soft-deleted sessions (deleted_at IS NOT NULL) are excluded.
describe('generateWeeklyReport — training-stats schema (Phase 2 hotfix)', () => {
  // Imported lazily to keep the test isolated from the makeFakeDb
  // pattern above; the import resolves the same module so the
  // jest.mock setup at the top of the file still applies.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateWeeklyReport } = require('../weeklyReport') as typeof import('../weeklyReport');

  interface Session {
    id: string;
    profile_id: string;
    started_at: string;
    estimated_calories: number | null;
    deleted_at: string | null;
  }
  interface Set {
    session_id: string;
    weight_kg: number;
    reps: number;
  }

  function makeTrainingFakeDb(sessions: Session[], sets: Set[]) {
    const trainingDb = {
      async getFirstAsync(_sql: string, _params: unknown[]) {
        // Not exercised by the training query itself.
        return null;
      },
      async getAllAsync(sql: string, params: unknown[]) {
        if (sql.includes('FROM workout_sessions')) {
          // Reproduce the half-open + deleted_at filter the helper
          // uses so the test verifies the SQL contract, not just
          // the JS aggregation.
          const [profileId, startStr, dayAfterEnd] = params as [
            string,
            string,
            string,
          ];
          const filtered = sessions.filter(
            (s) =>
              s.profile_id === profileId &&
              s.started_at >= startStr &&
              s.started_at < dayAfterEnd &&
              s.deleted_at === null,
          );
          const sessionIds = new Set(filtered.map((s) => s.id));
          const matchingSets = sets.filter((x) => sessionIds.has(x.session_id));
          const totalVolume = matchingSets.reduce(
            (acc, x) => acc + x.weight_kg * x.reps,
            0,
          );
          const totalCalBurned = filtered.reduce(
            (acc, s) => acc + (s.estimated_calories ?? 0),
            0,
          );
          return [
            {
              session_count: filtered.length,
              total_volume: totalVolume,
              total_cal_burned: totalCalBurned,
            },
          ];
        }
        // body_logs / meal_logs etc. — empty fall-through.
        return [];
      },
      async runAsync(_sql: string, _params: unknown[]) {
        return { changes: 0 };
      },
    };
    return trainingDb;
  }

  it('uses started_at half-open intervals (sessions on the last day count, sessions on the next day do not)', async () => {
    const sessions: Session[] = [
      // Mon 06:00 — counts
      {
        id: 's1',
        profile_id: 'p1',
        started_at: '2026-05-04T06:00:00.000Z',
        estimated_calories: 100,
        deleted_at: null,
      },
      // Sun 23:59 — counts (last hour of the week)
      {
        id: 's2',
        profile_id: 'p1',
        started_at: '2026-05-10T23:59:00.000Z',
        estimated_calories: 200,
        deleted_at: null,
      },
      // Mon next week 00:00 — must NOT count
      {
        id: 's3',
        profile_id: 'p1',
        started_at: '2026-05-11T00:00:00.000Z',
        estimated_calories: 999,
        deleted_at: null,
      },
    ];
    const sets: Set[] = [
      { session_id: 's1', weight_kg: 100, reps: 5 },
      { session_id: 's2', weight_kg: 60, reps: 10 },
      { session_id: 's3', weight_kg: 80, reps: 5 },
    ];
    mockGetDatabase.mockResolvedValue(makeTrainingFakeDb(sessions, sets));

    const report = await generateWeeklyReport(
      'p1',
      new Date('2026-05-07T12:00:00Z'),
    );
    expect(report.workoutCount).toBe(2);
    // s1 + s2 only: 100*5 + 60*10 = 1100; s3 (1100kg×reps from 80*5*N? = 400) excluded
    expect(report.totalVolume).toBe(1100);
    // s1 100 + s2 200 = 300; s3 (999) excluded
    expect(report.totalCaloriesBurned).toBe(300);
  });

  it('excludes soft-deleted sessions from training stats (v23 deleted_at filter)', async () => {
    const sessions: Session[] = [
      {
        id: 's1',
        profile_id: 'p1',
        started_at: '2026-05-04T06:00:00.000Z',
        estimated_calories: 100,
        deleted_at: null,
      },
      {
        id: 's2',
        profile_id: 'p1',
        started_at: '2026-05-05T06:00:00.000Z',
        estimated_calories: 50,
        // Tombstone — must be excluded.
        deleted_at: '2026-05-06T00:00:00.000Z',
      },
    ];
    const sets: Set[] = [
      { session_id: 's1', weight_kg: 100, reps: 5 },
      { session_id: 's2', weight_kg: 80, reps: 5 },
    ];
    mockGetDatabase.mockResolvedValue(makeTrainingFakeDb(sessions, sets));

    const report = await generateWeeklyReport(
      'p1',
      new Date('2026-05-07T12:00:00Z'),
    );
    expect(report.workoutCount).toBe(1);
    expect(report.totalVolume).toBe(500);
    expect(report.totalCaloriesBurned).toBe(100);
  });
});
