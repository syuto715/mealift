// Build 16 / Phase 1.1 — narrative helpers + saveWeeklyReport
// hardening (stable id + sync enqueue).
//
// jest.mock pattern matches the rest of the project (loginSyncBootstrap,
// listExerciseSlugsByMuscles): stub the database connection and the
// sync queue at the module boundary so the domain layer's import chain
// doesn't drag expo-sqlite / expo-crypto through Jest's transform.

const mockGetDatabase = jest.fn();
const mockEnqueue = jest.fn(async () => undefined);
let mockNextUuid = 0;

jest.mock('../../infra/database/connection', () => ({
  getDatabase: () => mockGetDatabase(),
}));

jest.mock('../../infra/repositories/syncRepository', () => ({
  enqueueRowFromTable: (...args: unknown[]) => mockEnqueue(...args),
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
        const existing = rows.find((r) => r.id === id);
        if (existing) {
          existing.week_end = weekEnd;
          existing.data_json = dataJson;
          existing.updated_at = updatedAt;
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
});
