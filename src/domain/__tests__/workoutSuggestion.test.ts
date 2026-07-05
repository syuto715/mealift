// Regression coverage for the audit fix (C-06 / D-08): getRecoveryStatuses
// previously selected `ws.date`, a column that does not exist on
// workout_sessions (v1 defines started_at/finished_at only), so SQLite
// failed statement preparation and the whole workout-suggestion feature
// silently threw on every call. These tests pin the fixed SQL shape and
// the recovery computation.
//
// jest.mock pattern matches the rest of src/domain/__tests__ (stub the
// database connection at the module boundary).

const mockGetDatabase = jest.fn();

jest.mock('../../infra/database/connection', () => ({
  getDatabase: () => mockGetDatabase(),
}));

import { getRecoveryStatuses, getWorkoutSuggestion } from '../workoutSuggestion';

interface Captured {
  sql: string;
  params: unknown[];
}

// Fake DB that records every query and refuses to prepare a statement
// referencing the non-existent `ws.date` column — mirroring SQLite's
// "no such column: ws.date" failure the fix eliminates.
function makeFakeDb(
  primaryRows: { muscle_group: string; last_date: string }[],
  secondaryRows: { secondary_muscles: string | null; session_date: string }[] = [],
) {
  const captured: Captured[] = [];
  const db = {
    getAllAsync: async (sql: string, params: unknown[]) => {
      captured.push({ sql, params });
      if (/\bws\.date\b/.test(sql)) {
        throw new Error('no such column: ws.date');
      }
      if (/secondary_muscles/.test(sql)) return secondaryRows;
      return primaryRows;
    },
  };
  return { db, captured };
}

describe('getRecoveryStatuses (audit C-06/D-08 regression)', () => {
  beforeEach(() => mockGetDatabase.mockReset());

  it('does not reference the non-existent ws.date column and resolves', async () => {
    const { db, captured } = makeFakeDb([]);
    mockGetDatabase.mockResolvedValue(db);

    // Must not throw (the old query threw "no such column: ws.date").
    const statuses = await getRecoveryStatuses('p1');

    expect(statuses).toHaveLength(6);
    expect(captured.length).toBeGreaterThan(0);
    for (const c of captured) {
      expect(c.sql).not.toMatch(/\bws\.date\b/);
    }
  });

  it('applies soft-delete and warm-up filters on both queries', async () => {
    const { db, captured } = makeFakeDb([]);
    mockGetDatabase.mockResolvedValue(db);

    await getRecoveryStatuses('p1');

    for (const c of captured) {
      expect(c.sql).toMatch(/ws\.deleted_at IS NULL/);
      expect(c.sql).toMatch(/wss\.deleted_at IS NULL/);
      expect(c.sql).toMatch(/wss\.is_warmup = 0/);
    }
  });

  it('derives lastTrainedDate as the date portion of the ISO started_at', async () => {
    const { db } = makeFakeDb([
      { muscle_group: 'chest', last_date: '2026-07-05T09:30:00.000Z' },
    ]);
    mockGetDatabase.mockResolvedValue(db);

    const statuses = await getRecoveryStatuses('p1');
    const chest = statuses.find((s) => s.muscleGroup === 'chest');

    expect(chest?.lastTrainedDate).toBe('2026-07-05');
    expect(chest?.hoursSinceTraining).not.toBeNull();
  });

  it('reports never-trained muscle groups as fully recovered', async () => {
    const { db } = makeFakeDb([]);
    mockGetDatabase.mockResolvedValue(db);

    const statuses = await getRecoveryStatuses('p1');
    expect(statuses.every((s) => s.recoveryPercent === 100)).toBe(true);
    expect(statuses.every((s) => s.status === 'recovered')).toBe(true);
  });
});

describe('getWorkoutSuggestion (audit C-06/D-08 regression)', () => {
  beforeEach(() => mockGetDatabase.mockReset());

  it('suggests recovered muscle groups instead of throwing', async () => {
    const { db } = makeFakeDb([]);
    mockGetDatabase.mockResolvedValue(db);

    const suggestion = await getWorkoutSuggestion('p1');
    // All groups untrained → recovered → suggests the first two.
    expect(suggestion.suggestedMuscleGroups.length).toBeGreaterThanOrEqual(1);
    expect(suggestion.recoveryStatuses).toHaveLength(6);
    expect(typeof suggestion.reason).toBe('string');
  });
});
