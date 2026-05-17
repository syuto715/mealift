// v1.5 Stage 1 Phase 1.5 — routineGenerationRepository tests.

interface FakeRow extends Record<string, unknown> {}

class FakeDb {
  rows: FakeRow[] = [];

  async getAllAsync<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (sql.includes('FROM routine_generations_local')) {
      if (sql.includes("status = 'draft'")) {
        const [userId] = params as [string];
        return this.rows
          .filter((r) => r.user_id === userId && r.status === 'draft')
          .sort(
            (a, b) =>
              String(b.created_at).localeCompare(String(a.created_at)),
          ) as unknown as T[];
      }
      const [userId] = params as [string];
      return this.rows.filter((r) => r.user_id === userId) as unknown as T[];
    }
    return [];
  }

  async getFirstAsync<T>(sql: string, params: unknown[]): Promise<T | null> {
    if (sql.includes('FROM routine_generations_local')) {
      const [id] = params as [string];
      return (this.rows.find((r) => r.id === id) ?? null) as unknown as T;
    }
    return null;
  }

  async runAsync(sql: string, params: unknown[]): Promise<void> {
    if (sql.startsWith('INSERT INTO routine_generations_local')) {
      const [
        id,
        user_id,
        prompt_context_json,
        generated_routine_json,
        status,
        applied_routine_id,
        created_at,
        applied_at,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        string,
        string | null,
      ];
      const existing = this.rows.find((r) => r.id === id);
      const row: FakeRow = {
        id,
        user_id,
        prompt_context_json,
        generated_routine_json,
        status,
        applied_routine_id,
        created_at,
        applied_at,
      };
      if (existing) Object.assign(existing, row);
      else this.rows.push(row);
      return;
    }
    if (sql.startsWith('UPDATE routine_generations_local')) {
      const [status, applied_routine_id, applied_at, id] = params as [
        string,
        string | null,
        string | null,
        string,
      ];
      const found = this.rows.find((r) => r.id === id);
      if (found) {
        found.status = status;
        if (applied_routine_id !== null)
          found.applied_routine_id = applied_routine_id;
        if (applied_at !== null) found.applied_at = applied_at;
      }
      return;
    }
    if (sql.startsWith('DELETE FROM routine_generations_local')) {
      const [id] = params as [string];
      this.rows = this.rows.filter((r) => r.id !== id);
      return;
    }
  }
}

const mockFakeDb = new FakeDb();
jest.mock('../../database/connection', () => ({
  getDatabase: jest.fn(async () => mockFakeDb),
}));

const mockSupabaseRef: { value: unknown } = { value: null };
jest.mock('../../supabase/client', () => ({
  get supabase() {
    return mockSupabaseRef.value;
  },
}));

import {
  getGenerationById,
  listDraftsByUser,
  syncGenerationsFromSupabase,
  updateGenerationStatus,
  upsertGeneration,
} from '../routineGenerationRepository';
import type { LocalRoutineGeneration } from '../../../types/routineGeneration';

function makeGeneration(
  overrides: Partial<LocalRoutineGeneration> = {},
): LocalRoutineGeneration {
  return {
    id: 'g-1',
    userId: 'u-1',
    promptContext: { intentText: '胸の日', exerciseSlugs: ['bench-press'] },
    generatedRoutine: {
      routineName: 'プッシュ日',
      items: [
        { exerciseSlug: 'bench-press', targetSets: 3, targetReps: '8-12' },
      ],
    },
    status: 'draft',
    appliedRoutineId: null,
    createdAt: '2026-05-17T10:00:00.000Z',
    appliedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockFakeDb.rows = [];
  mockSupabaseRef.value = null;
});

describe('routineGenerationRepository', () => {
  it('upsertGeneration + getGenerationById roundtrip parses the JSON payloads', async () => {
    await upsertGeneration(makeGeneration({ id: 'g-1' }));
    const fetched = await getGenerationById('g-1');
    expect(fetched?.id).toBe('g-1');
    expect(fetched?.generatedRoutine.routineName).toBe('プッシュ日');
    expect(fetched?.generatedRoutine.items[0].exerciseSlug).toBe(
      'bench-press',
    );
  });

  it('listDraftsByUser returns only status=draft rows in DESC order', async () => {
    await upsertGeneration(
      makeGeneration({
        id: 'g-applied',
        status: 'applied',
        appliedRoutineId: 'r-1',
        createdAt: '2026-05-15T10:00:00.000Z',
      }),
    );
    await upsertGeneration(
      makeGeneration({
        id: 'g-draft-old',
        status: 'draft',
        createdAt: '2026-05-16T10:00:00.000Z',
      }),
    );
    await upsertGeneration(
      makeGeneration({
        id: 'g-draft-new',
        status: 'draft',
        createdAt: '2026-05-17T10:00:00.000Z',
      }),
    );
    const drafts = await listDraftsByUser('u-1');
    expect(drafts.map((d) => d.id)).toEqual(['g-draft-new', 'g-draft-old']);
  });

  it('updateGenerationStatus returns ok=false when supabase=null (offline)', async () => {
    await upsertGeneration(makeGeneration({ id: 'g-off' }));
    mockSupabaseRef.value = null;
    const result = await updateGenerationStatus('u-1', 'g-off', {
      status: 'applied',
      appliedRoutineId: 'r-1',
      appliedAt: '2026-05-17T11:00:00.000Z',
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/オフライン/);
    // Local row is NOT touched when supabase fails — the in-memory
    // state stays at 'draft' so the user can retry.
    const found = await getGenerationById('g-off');
    expect(found?.status).toBe('draft');
  });

  it('updateGenerationStatus transitions local mirror when Supabase write succeeds (Codex round 1 Critical #2 fix)', async () => {
    await upsertGeneration(makeGeneration({ id: 'g-up' }));
    mockSupabaseRef.value = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      }),
    };
    const result = await updateGenerationStatus('u-1', 'g-up', {
      status: 'applied',
      appliedRoutineId: 'r-1',
      appliedAt: '2026-05-17T11:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    const found = await getGenerationById('g-up');
    expect(found?.status).toBe('applied');
    expect(found?.appliedRoutineId).toBe('r-1');
    mockSupabaseRef.value = null;
  });

  it('syncGenerationsFromSupabase prunes local rows missing on the server', async () => {
    await upsertGeneration(makeGeneration({ id: 'keep' }));
    await upsertGeneration(makeGeneration({ id: 'stale' }));
    mockSupabaseRef.value = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: [
                  {
                    id: 'keep',
                    user_id: 'u-1',
                    prompt_context_json: { intentText: 'x' },
                    generated_routine_json: {
                      routineName: 'プッシュ日',
                      items: [],
                    },
                    status: 'draft',
                    applied_routine_id: null,
                    created_at: '2026-05-17T10:00:00.000Z',
                    applied_at: null,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
    await syncGenerationsFromSupabase('u-1');
    const ids = mockFakeDb.rows.map((r) => r.id).sort();
    expect(ids).toEqual(['keep']);
    mockSupabaseRef.value = null;
  });
});
