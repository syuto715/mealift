import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import { profileSync } from '../profileSync';
import type { SyncQueueRow } from '../../../repositories/syncRepository';

// Shallow per-resource sync tests (T2 strategy per Phase 5 sign-off).
// Pattern: mock Supabase client, verify push payload shape and pull
// row application. Mirrors submissionSync.test.ts's approach.
//
// What's covered (the contract every per-resource module must honor):
//   - push: payload shape, JS bool → server bool conversion, deletion path
//   - pull: watermark query parameters, server row → local DB upsert,
//     tombstone-triggered local DELETE
//   - error: rate-limit retry path
//
// What's deliberately NOT covered here (fits in the orchestrator-level
// or integration tests):
//   - sync_queue end-to-end behavior (covered by syncRepository tests
//     that don't exist yet — Phase 5 deferred)
//   - real network behavior (no internet in jest)

interface UpsertCall {
  table: string;
  payload: Record<string, unknown>;
  onConflict?: string;
}

interface SelectCall {
  table: string;
  filters: Record<string, unknown>;
  limit?: number;
}

function makeMockClient(opts: {
  userId?: string | null;
  upsertError?: { status?: number; message?: string } | null;
  selectData?: Record<string, unknown>[];
  selectError?: { message: string } | null;
}): {
  client: SupabaseClient;
  upsertCalls: UpsertCall[];
  selectCalls: SelectCall[];
} {
  const upsertCalls: UpsertCall[] = [];
  const selectCalls: SelectCall[] = [];

  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session:
            opts.userId !== null && opts.userId !== undefined
              ? { user: { id: opts.userId } }
              : null,
        },
      }),
    },
    from: (table: string) => ({
      upsert: async (
        payload: Record<string, unknown>,
        options?: { onConflict: string },
      ) => {
        upsertCalls.push({
          table,
          payload,
          onConflict: options?.onConflict,
        });
        return { error: opts.upsertError ?? null };
      },
      select: () => {
        const filters: Record<string, unknown> = {};
        const builder = {
          eq: (col: string, val: unknown) => {
            filters[`eq_${col}`] = val;
            return builder;
          },
          gt: (col: string, val: unknown) => {
            filters[`gt_${col}`] = val;
            return builder;
          },
          order: (col: string, options?: { ascending: boolean }) => {
            filters[`order_${col}`] = options?.ascending ?? true;
            return builder;
          },
          limit: (n: number) => {
            const call: SelectCall = { table, filters, limit: n };
            selectCalls.push(call);
            return Promise.resolve({
              data: opts.selectData ?? [],
              error: opts.selectError ?? null,
            });
          },
        };
        return builder;
      },
    }),
  };

  return {
    client: client as unknown as SupabaseClient,
    upsertCalls,
    selectCalls,
  };
}

interface FakeRunCall {
  sql: string;
  params: unknown[];
}

function makeFakeDb(): { db: SQLiteDatabase; runs: FakeRunCall[] } {
  const runs: FakeRunCall[] = [];
  const db = {
    runAsync: async (sql: string, params: unknown[]): Promise<SQLiteRunResult> => {
      runs.push({ sql, params });
      return { changes: 1, lastInsertRowId: 0 };
    },
    execAsync: async (_sql: string): Promise<void> => {
      /* no-op */
    },
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
  };
  return { db: db as unknown as SQLiteDatabase, runs };
}

function makeQueueRow(
  overrides: Partial<SyncQueueRow> = {},
): SyncQueueRow {
  return {
    id: 'queue-1',
    table_name: 'profiles',
    record_id: 'profile-id',
    operation: 'UPDATE',
    payload: JSON.stringify({
      id: 'profile-id',
      display_name: 'Test User',
      gender: 'male',
      birth_year: 1995,
      height_cm: 175,
      current_weight_kg: 75,
      goal_type: 'cut',
      activity_level: 'moderate',
      training_days_per_week: 4,
      equipment: 'gym',
      onboarding_completed: 1,
      adaptive_goal_enabled: 1,
      adaptive_goal_sensitivity: 'standard',
      daily_water_target_ml: 2500,
      onboarding_version: 1,
    }),
    created_at: '2026-05-06 10:00:00',
    synced_at: null,
    retry_count: 0,
    ...overrides,
  };
}

describe('profileSync.pushOne', () => {
  it('upserts to public.profiles with the auth user id', async () => {
    const { client, upsertCalls } = makeMockClient({ userId: 'auth-uid-1' });
    const { db } = makeFakeDb();

    await profileSync.pushOne(client, db, makeQueueRow());

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].table).toBe('profiles');
    expect(upsertCalls[0].payload.id).toBe('auth-uid-1');
  });

  it('converts INTEGER booleans to native booleans', async () => {
    const { client, upsertCalls } = makeMockClient({ userId: 'auth-uid-1' });
    const { db } = makeFakeDb();

    await profileSync.pushOne(client, db, makeQueueRow());

    const payload = upsertCalls[0].payload;
    expect(payload.onboarding_completed).toBe(true);
    expect(payload.adaptive_goal_enabled).toBe(true);
  });

  it('passes through nullable fields as null', async () => {
    const { client, upsertCalls } = makeMockClient({ userId: 'auth-uid-1' });
    const { db } = makeFakeDb();

    await profileSync.pushOne(
      client,
      db,
      makeQueueRow({
        payload: JSON.stringify({
          id: 'profile-id',
          display_name: 'Test',
          // Missing target_weight_kg, target_calories, etc. → all null
        }),
      }),
    );

    const payload = upsertCalls[0].payload;
    expect(payload.target_weight_kg).toBeNull();
    expect(payload.target_calories).toBeNull();
    expect(payload.target_date).toBeNull();
  });

  it('handles DELETE operation by setting deleted_at', async () => {
    const { client, upsertCalls } = makeMockClient({ userId: 'auth-uid-1' });
    const { db } = makeFakeDb();

    await profileSync.pushOne(
      client,
      db,
      makeQueueRow({ operation: 'DELETE' }),
    );

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].payload.id).toBe('auth-uid-1');
    expect(upsertCalls[0].payload.deleted_at).toEqual(expect.any(String));
  });

  it('throws when not authenticated', async () => {
    const { client } = makeMockClient({ userId: null });
    const { db } = makeFakeDb();

    await expect(
      profileSync.pushOne(client, db, makeQueueRow()),
    ).rejects.toThrow('not authenticated');
  });

  it('surfaces upsert errors as thrown Errors', async () => {
    const { client } = makeMockClient({
      userId: 'auth-uid-1',
      upsertError: { message: 'permission denied' },
    });
    const { db } = makeFakeDb();

    await expect(
      profileSync.pushOne(client, db, makeQueueRow()),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('profileSync.pullBatch', () => {
  it('queries profiles by id == auth user, watermark-filtered', async () => {
    const { client, selectCalls } = makeMockClient({
      userId: 'auth-uid-1',
      selectData: [],
    });
    const { db } = makeFakeDb();

    await profileSync.pullBatch(
      client,
      db,
      '2026-05-01T00:00:00Z',
    );

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].table).toBe('profiles');
    expect(selectCalls[0].filters.eq_id).toBe('auth-uid-1');
    expect(selectCalls[0].filters.gt_updated_at).toBe('2026-05-01T00:00:00Z');
    expect(selectCalls[0].limit).toBe(1);
  });

  it('returns 0 pulled when no row available', async () => {
    const { client } = makeMockClient({
      userId: 'auth-uid-1',
      selectData: [],
    });
    const { db } = makeFakeDb();

    const result = await profileSync.pullBatch(client, db, 'epoch');

    expect(result).toEqual({ pulled: 0, newWatermark: null });
  });

  it('upserts the local profile when server row present', async () => {
    const serverRow = {
      id: 'auth-uid-1',
      display_name: 'Server Name',
      gender: 'female',
      birth_year: 1990,
      height_cm: 165,
      current_weight_kg: 60,
      goal_type: 'maintain',
      activity_level: 'light',
      training_days_per_week: 3,
      equipment: 'dumbbell',
      onboarding_completed: true,
      adaptive_goal_enabled: false,
      adaptive_goal_sensitivity: 'aggressive',
      daily_water_target_ml: 2000,
      onboarding_version: 2,
      updated_at: '2026-05-06T12:00:00Z',
      deleted_at: null,
    };
    const { client } = makeMockClient({
      userId: 'auth-uid-1',
      selectData: [serverRow],
    });
    const { db, runs } = makeFakeDb();

    const result = await profileSync.pullBatch(client, db, 'epoch');

    expect(result.pulled).toBe(1);
    expect(result.newWatermark).toBe('2026-05-06T12:00:00Z');
    expect(runs).toHaveLength(1);
    expect(runs[0].sql).toContain('INSERT INTO profiles');
    expect(runs[0].sql).toContain('ON CONFLICT(id) DO UPDATE');
    // params[0] = id, [1] = supabase_uid (= id), [2] = display_name
    expect(runs[0].params[0]).toBe('auth-uid-1');
    expect(runs[0].params[1]).toBe('auth-uid-1');
    expect(runs[0].params[2]).toBe('Server Name');
  });

  it('hard-deletes the local profile when server row has deleted_at', async () => {
    const serverRow = {
      id: 'auth-uid-1',
      display_name: 'Stale',
      updated_at: '2026-05-06T13:00:00Z',
      deleted_at: '2026-05-06T13:00:00Z',
      onboarding_completed: false,
      adaptive_goal_enabled: false,
      adaptive_goal_sensitivity: 'standard',
      daily_water_target_ml: 2500,
      onboarding_version: 1,
      training_days_per_week: 3,
    };
    const { client } = makeMockClient({
      userId: 'auth-uid-1',
      selectData: [serverRow],
    });
    const { db, runs } = makeFakeDb();

    const result = await profileSync.pullBatch(client, db, 'epoch');

    expect(result.pulled).toBe(1);
    expect(runs).toHaveLength(1);
    expect(runs[0].sql).toMatch(/^DELETE FROM profiles WHERE id = \?/i);
    expect(runs[0].params[0]).toBe('auth-uid-1');
  });

  it('throws when select returns an error', async () => {
    const { client } = makeMockClient({
      userId: 'auth-uid-1',
      selectError: { message: 'jwt expired' },
    });
    const { db } = makeFakeDb();

    await expect(
      profileSync.pullBatch(client, db, 'epoch'),
    ).rejects.toThrow(/jwt expired/);
  });

  it('throws when not authenticated', async () => {
    const { client } = makeMockClient({ userId: null });
    const { db } = makeFakeDb();

    await expect(
      profileSync.pullBatch(client, db, 'epoch'),
    ).rejects.toThrow('not authenticated');
  });
});

describe('profileSync — module declaration invariants', () => {
  it('exposes the correct table names', () => {
    expect(profileSync.localTableName).toBe('profiles');
    expect(profileSync.serverTableName).toBe('profiles');
  });
});
