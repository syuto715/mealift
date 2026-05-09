// Same module-stub pattern other repository tests use. Phase 4.0
// repository imports getDatabase + generateId + enqueueRowFromTable;
// stub all three at the module boundary so the real expo-sqlite +
// expo-crypto chain isn't dragged into Jest.
jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));

let mockNextUuid = 0;
jest.mock('../../../utils/id', () => ({
  generateId: () => `uuid-${++mockNextUuid}`,
}));

const mockEnqueue = jest.fn(
  async (_table: string, _id: string, _op: string): Promise<void> => undefined,
);
jest.mock('../syncRepository', () => ({
  enqueueRowFromTable: (table: string, id: string, op: string) =>
    mockEnqueue(table, id, op),
}));

import type { SQLiteDatabase } from 'expo-sqlite';
import {
  createDeloadRecommendation,
  getActiveRecommendations,
  getRecommendationById,
  markApplied,
  markDismissed,
  markCompleted,
} from '../deloadRecommendationRepository';

interface FakeRow {
  id: string;
  profile_id: string;
  detected_at: string;
  source_week_starts: string;
  affected_muscles: string;
  applied_at: string | null;
  applied_routine_id: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// In-memory fake DB modelling the SQL shapes the repository emits.
// Same pattern as userConsentRepository.test.ts — recognize the
// query by substring + keep state in a single rows array.
function makeFakeDb() {
  const rows: FakeRow[] = [];

  const fake = {
    rows,
    async getFirstAsync(sql: string, params: unknown[]) {
      // SELECT id ... by (profile_id, detected_at) — used both for
      // the pre-insert id lookup and the post-insert canonical id
      // re-read.
      if (
        sql.includes('SELECT id FROM deload_recommendations') &&
        sql.includes('detected_at = ?')
      ) {
        const [profileId, detectedAt] = params as [string, string];
        const match = rows.find(
          (r) =>
            r.profile_id === profileId &&
            r.detected_at === detectedAt &&
            r.deleted_at === null,
        );
        return match ? { id: match.id } : null;
      }
      // SELECT * by id — the createDeloadRecommendation re-read for
      // returning the persisted row.
      if (
        sql.includes('SELECT * FROM deload_recommendations') &&
        sql.includes('WHERE id = ?')
      ) {
        const [id, profileId] = params as [string, string?];
        const match = rows.find(
          (r) =>
            r.id === id &&
            (profileId === undefined || r.profile_id === profileId) &&
            r.deleted_at === null,
        );
        return match ?? null;
      }
      return null;
    },
    async getAllAsync(sql: string, params: unknown[]) {
      if (
        sql.includes('SELECT * FROM deload_recommendations') &&
        sql.includes('applied_at IS NULL') &&
        sql.includes('dismissed_at IS NULL')
      ) {
        const [profileId] = params as [string];
        return rows
          .filter(
            (r) =>
              r.profile_id === profileId &&
              r.applied_at === null &&
              r.dismissed_at === null &&
              r.deleted_at === null,
          )
          .sort((a, b) => (a.detected_at < b.detected_at ? 1 : -1));
      }
      return [];
    },
    async runAsync(sql: string, params: unknown[]) {
      if (sql.includes('INSERT INTO deload_recommendations')) {
        const [
          id,
          profileId,
          detectedAt,
          sourceWeekStarts,
          affectedMuscles,
          createdAt,
          updatedAt,
        ] = params as [string, string, string, string, string, string, string];
        // ON CONFLICT(profile_id, detected_at) DO UPDATE — match by
        // the unique key, not by id.
        const existing = rows.find(
          (r) =>
            r.profile_id === profileId &&
            r.detected_at === detectedAt &&
            r.deleted_at === null,
        );
        if (existing) {
          existing.source_week_starts = sourceWeekStarts;
          existing.affected_muscles = affectedMuscles;
          existing.updated_at = updatedAt;
          return { changes: 1, lastInsertRowId: 0 };
        }
        rows.push({
          id,
          profile_id: profileId,
          detected_at: detectedAt,
          source_week_starts: sourceWeekStarts,
          affected_muscles: affectedMuscles,
          applied_at: null,
          applied_routine_id: null,
          completed_at: null,
          dismissed_at: null,
          created_at: createdAt,
          updated_at: updatedAt,
          deleted_at: null,
        });
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (sql.includes('UPDATE deload_recommendations') && sql.includes('SET applied_at')) {
        const [appliedAt, routineId, updatedAt, id, profileId] = params as [
          string,
          string,
          string,
          string,
          string,
        ];
        const target = rows.find(
          (r) =>
            r.id === id &&
            r.profile_id === profileId &&
            r.applied_at === null &&
            r.dismissed_at === null &&
            r.deleted_at === null,
        );
        if (!target) return { changes: 0, lastInsertRowId: 0 };
        target.applied_at = appliedAt;
        target.applied_routine_id = routineId;
        target.updated_at = updatedAt;
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (sql.includes('UPDATE deload_recommendations') && sql.includes('SET dismissed_at')) {
        const [dismissedAt, updatedAt, id, profileId] = params as [
          string,
          string,
          string,
          string,
        ];
        const target = rows.find(
          (r) =>
            r.id === id &&
            r.profile_id === profileId &&
            r.applied_at === null &&
            r.dismissed_at === null &&
            r.deleted_at === null,
        );
        if (!target) return { changes: 0, lastInsertRowId: 0 };
        target.dismissed_at = dismissedAt;
        target.updated_at = updatedAt;
        return { changes: 1, lastInsertRowId: 0 };
      }
      if (sql.includes('UPDATE deload_recommendations') && sql.includes('SET completed_at')) {
        const [completedAt, updatedAt, id, profileId] = params as [
          string,
          string,
          string,
          string,
        ];
        const target = rows.find(
          (r) =>
            r.id === id &&
            r.profile_id === profileId &&
            r.applied_at !== null &&
            r.completed_at === null &&
            // Codex review pass 1 / Important #2 — mirror the
            // production WHERE clause's dismissed_at guard so a
            // corrupt applied+dismissed row stays untouched.
            r.dismissed_at === null &&
            r.deleted_at === null,
        );
        if (!target) return { changes: 0, lastInsertRowId: 0 };
        target.completed_at = completedAt;
        target.updated_at = updatedAt;
        return { changes: 1, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    },
  };
  return fake as unknown as SQLiteDatabase & { rows: FakeRow[] };
}

beforeEach(() => {
  mockEnqueue.mockClear();
  mockNextUuid = 0;
});

describe('createDeloadRecommendation', () => {
  it('inserts a fresh row + enqueues INSERT on first save', async () => {
    const db = makeFakeDb();
    const result = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: ['2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04'],
        affectedMuscles: ['chest', 'biceps'],
      },
      db,
    );
    expect(result.id).toBe('uuid-1');
    expect(result.profileId).toBe('p1');
    expect(result.sourceWeekStarts).toEqual([
      '2026-04-13',
      '2026-04-20',
      '2026-04-27',
      '2026-05-04',
    ]);
    expect(result.affectedMuscles).toEqual(['chest', 'biceps']);
    expect(result.appliedAt).toBeNull();
    expect(result.dismissedAt).toBeNull();
    expect(mockEnqueue).toHaveBeenCalledWith(
      'deload_recommendations',
      'uuid-1',
      'INSERT',
    );
  });

  it('reuses the existing row id on a re-run with the same (profile, detected_at) — Phase 1.1 race-fix pattern', async () => {
    const db = makeFakeDb();
    await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: ['2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04'],
        affectedMuscles: ['chest'],
      },
      db,
    );
    const second = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: ['2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04'],
        // Updated muscle set; the row should merge in place under
        // the same id.
        affectedMuscles: ['chest', 'biceps'],
      },
      db,
    );
    expect(db.rows).toHaveLength(1);
    expect(second.id).toBe('uuid-1'); // not 'uuid-2'
    expect(second.affectedMuscles).toEqual(['chest', 'biceps']);
    expect(mockEnqueue).toHaveBeenLastCalledWith(
      'deload_recommendations',
      'uuid-1',
      'UPDATE',
    );
  });

  // Codex review pass 1 / Important #1 — partial UNIQUE INDEX
  // (WHERE deleted_at IS NULL). A soft-deleted row at the same
  // (profile, detected_at) must NOT block a fresh insert: the
  // detector might re-flag the same trigger after the user
  // dismissed it.
  it('allows re-create at the same (profile, detected_at) after soft-delete', async () => {
    const db = makeFakeDb();
    const first = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['chest'],
      },
      db,
    );
    // Tombstone the original row directly.
    const target = db.rows.find((r) => r.id === first.id)!;
    target.deleted_at = '2026-05-11T00:00:00.000Z';

    // Re-create at the same key — should succeed under the partial
    // unique index, leaving the tombstone behind and creating a new
    // live row.
    const second = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['back'],
      },
      db,
    );
    expect(second.id).not.toBe(first.id);
    expect(db.rows).toHaveLength(2);
    const liveRows = db.rows.filter((r) => r.deleted_at === null);
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0].id).toBe(second.id);
    expect(liveRows[0].affected_muscles).toBe(JSON.stringify(['back']));
  });

  it('partitions by profile — same detected_at + different profile is a separate row', async () => {
    const db = makeFakeDb();
    await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    await createDeloadRecommendation(
      {
        profileId: 'p2',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    expect(db.rows).toHaveLength(2);
    expect(new Set(db.rows.map((r) => r.id)).size).toBe(2);
  });
});

describe('getActiveRecommendations', () => {
  it('returns only un-applied, un-dismissed, un-deleted rows for the requested profile', async () => {
    const db = makeFakeDb();
    // Seed three rows in mixed states.
    await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['chest'],
      },
      db,
    );
    await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-03T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['back'],
      },
      db,
    );
    await markApplied('p1', 'uuid-2', 'routine-99', db);

    // Cross-profile row that must NOT leak.
    await createDeloadRecommendation(
      {
        profileId: 'p2',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['legs_quad'],
      },
      db,
    );

    const active = await getActiveRecommendations('p1', db);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('uuid-1');
    expect(active[0].affectedMuscles).toEqual(['chest']);
  });

  it('returns rows sorted by detected_at DESC', async () => {
    const db = makeFakeDb();
    await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-04-12T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['chest'],
      },
      db,
    );
    await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['back'],
      },
      db,
    );
    await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-04-26T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['biceps'],
      },
      db,
    );
    const active = await getActiveRecommendations('p1', db);
    expect(active.map((r) => r.detectedAt)).toEqual([
      '2026-05-10T12:00:00.000Z',
      '2026-04-26T12:00:00.000Z',
      '2026-04-12T12:00:00.000Z',
    ]);
  });
});

describe('getRecommendationById', () => {
  it('returns the row when both id and profile match', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['chest'],
      },
      db,
    );
    const got = await getRecommendationById('p1', created.id, db);
    expect(got?.id).toBe(created.id);
  });

  it('refuses to return a row when the profile_id mismatches (cross-profile leak guard)', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: ['chest'],
      },
      db,
    );
    const got = await getRecommendationById('p2', created.id, db);
    expect(got).toBeNull();
  });
});

describe('markApplied / markDismissed / markCompleted', () => {
  it('moves detected → applied + enqueues UPDATE', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    mockEnqueue.mockClear();
    await markApplied('p1', created.id, 'routine-42', db);
    const got = await getRecommendationById('p1', created.id, db);
    expect(got?.appliedAt).not.toBeNull();
    expect(got?.appliedRoutineId).toBe('routine-42');
    expect(mockEnqueue).toHaveBeenCalledWith(
      'deload_recommendations',
      created.id,
      'UPDATE',
    );
  });

  it('refuses to apply a row that is already applied (state machine guard)', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    await markApplied('p1', created.id, 'routine-1', db);
    mockEnqueue.mockClear();
    // Second apply attempt — must be a no-op (no enqueue).
    await markApplied('p1', created.id, 'routine-2', db);
    const got = await getRecommendationById('p1', created.id, db);
    expect(got?.appliedRoutineId).toBe('routine-1');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('refuses to apply a row that is already dismissed (mutually exclusive)', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    await markDismissed('p1', created.id, db);
    await markApplied('p1', created.id, 'routine-x', db);
    const got = await getRecommendationById('p1', created.id, db);
    expect(got?.appliedAt).toBeNull();
    expect(got?.dismissedAt).not.toBeNull();
  });

  it('refuses to dismiss a row that is already applied', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    await markApplied('p1', created.id, 'routine-x', db);
    await markDismissed('p1', created.id, db);
    const got = await getRecommendationById('p1', created.id, db);
    expect(got?.dismissedAt).toBeNull();
  });

  it('moves applied → completed + enqueues UPDATE', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    await markApplied('p1', created.id, 'routine-x', db);
    mockEnqueue.mockClear();
    await markCompleted('p1', created.id, db);
    const got = await getRecommendationById('p1', created.id, db);
    expect(got?.completedAt).not.toBeNull();
    expect(mockEnqueue).toHaveBeenCalledWith(
      'deload_recommendations',
      created.id,
      'UPDATE',
    );
  });

  it('refuses to mark completed a row that has not been applied', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    mockEnqueue.mockClear();
    await markCompleted('p1', created.id, db);
    const got = await getRecommendationById('p1', created.id, db);
    expect(got?.completedAt).toBeNull();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  // Codex review pass 1 / Important #2 — markCompleted must refuse
  // a corrupt row that has both applied_at and dismissed_at set.
  // Such a row violates the helper-enforced invariant; without the
  // dismissed_at guard the helper would happily layer completed_at
  // on top, fixing the corrupt state into the sync stream.
  it('refuses to mark completed a corrupt row that is both applied and dismissed', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    // Manually inject the corrupt state — sync race / hand edit /
    // future schema gap could produce this.
    const target = db.rows.find((r) => r.id === created.id)!;
    target.applied_at = '2026-05-10T13:00:00.000Z';
    target.applied_routine_id = 'routine-corrupt';
    target.dismissed_at = '2026-05-10T13:30:00.000Z';
    mockEnqueue.mockClear();

    await markCompleted('p1', created.id, db);
    expect(target.completed_at).toBeNull();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('refuses any state mutation when the profile_id mismatches', async () => {
    const db = makeFakeDb();
    const created = await createDeloadRecommendation(
      {
        profileId: 'p1',
        detectedAt: '2026-05-10T12:00:00.000Z',
        sourceWeekStarts: [],
        affectedMuscles: [],
      },
      db,
    );
    mockEnqueue.mockClear();
    await markApplied('p2', created.id, 'routine-x', db);
    await markDismissed('p2', created.id, db);
    await markCompleted('p2', created.id, db);
    const got = await getRecommendationById('p1', created.id, db);
    expect(got?.appliedAt).toBeNull();
    expect(got?.dismissedAt).toBeNull();
    expect(got?.completedAt).toBeNull();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
