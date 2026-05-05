import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import type { SyncQueueRow } from '../../../repositories/syncRepository';
import type { SyncOperation } from '../../../../types/common';

// Shared test fixtures for the per-resource sync module test suites.
// Each module's test file imports makeMockClient + makeFakeDb +
// makeQueueRow rather than reproducing the same scaffolding. profileSync's
// test file (Phase 5-A) was inlined; everything from Phase 5-B onward
// reaches for these helpers.
//
// Filename intentionally does not end in `.test.ts` so jest's discovery
// pattern doesn't try to run this file as a test suite.

export interface UpsertCall {
  table: string;
  payload: Record<string, unknown>;
  onConflict?: string;
}

export interface SelectCall {
  table: string;
  filters: Record<string, unknown>;
  limit?: number;
}

export interface MockClientOpts {
  userId?: string | null;
  upsertError?: { status?: number; message?: string } | null;
  selectData?: Record<string, unknown>[];
  selectError?: { message: string } | null;
}

export interface MockClientResult {
  client: SupabaseClient;
  upsertCalls: UpsertCall[];
  selectCalls: SelectCall[];
}

export function makeMockClient(opts: MockClientOpts): MockClientResult {
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

export interface FakeRunCall {
  sql: string;
  params: unknown[];
}

export interface FakeDbResult {
  db: SQLiteDatabase;
  runs: FakeRunCall[];
}

export function makeFakeDb(): FakeDbResult {
  const runs: FakeRunCall[] = [];
  const db = {
    runAsync: async (
      sql: string,
      params: unknown[],
    ): Promise<SQLiteRunResult> => {
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

export interface MakeQueueRowInput {
  table: string;
  recordId: string;
  operation?: SyncOperation;
  payload: Record<string, unknown>;
  retryCount?: number;
}

export function makeQueueRow(input: MakeQueueRowInput): SyncQueueRow {
  return {
    id: 'queue-1',
    table_name: input.table,
    record_id: input.recordId,
    operation: input.operation ?? 'UPDATE',
    payload: JSON.stringify(input.payload),
    created_at: '2026-05-06 10:00:00',
    synced_at: null,
    retry_count: input.retryCount ?? 0,
  };
}
