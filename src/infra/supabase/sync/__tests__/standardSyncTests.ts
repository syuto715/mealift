import type { ResourceSyncModule } from '../syncOrchestrator';
import {
  makeFakeDb,
  makeMockClient,
  makeQueueRow,
} from './testHelpers';

// Shared T2-shallow test runner (per Phase 5 sign-off question 2).
// Each level-1+ resource module's test file calls this once with a
// fixture set, getting 11 standard tests covering push (5) + pull (5)
// + invariant (1).
//
// Why a shared runner:
//   - 12 resources × 11 tests = 132 cases. Reproducing the same
//     scaffolding in each file is ~150 lines × 12 = 1800 lines of
//     identical code, all of which would have to be kept in sync if
//     the orchestrator contract evolves.
//   - The runner is opinionated about the standard contract every
//     module must honor; deviating modules (profile uses limit(1)
//     instead of limit(500)) keep their own bespoke test file.

export interface StandardSyncTestConfig {
  module: ResourceSyncModule;
  // A fully-formed local row payload that pushOne should accept and
  // turn into a valid server upsert.
  validLocalPayload: Record<string, unknown>;
  // A fully-formed server row that pullBatch should accept and turn
  // into a valid local upsert.
  validServerRow: Record<string, unknown>;
  // Expected table names, asserted as invariants. Catches typos in
  // the module declaration that would silently route writes to the
  // wrong table.
  expectedServerTable: string;
  expectedLocalTable: string;
  // Some resources use a non-default pull limit. Defaults to 500.
  expectedPullLimit?: number;
}

export function runStandardSyncTests(
  config: StandardSyncTestConfig,
): void {
  const {
    module,
    validLocalPayload,
    validServerRow,
    expectedServerTable,
    expectedLocalTable,
    expectedPullLimit = 500,
  } = config;

  describe(`${expectedServerTable} sync (standard)`, () => {
    describe('pushOne', () => {
      it('upserts to the server table with user_id from auth', async () => {
        const { client, upsertCalls } = makeMockClient({ userId: 'u-1' });
        const { db } = makeFakeDb();

        await module.pushOne(
          client,
          db,
          makeQueueRow({
            table: expectedLocalTable,
            recordId: String(validLocalPayload.id ?? 'r-1'),
            payload: validLocalPayload,
          }),
        );

        expect(upsertCalls).toHaveLength(1);
        expect(upsertCalls[0].table).toBe(expectedServerTable);
        expect(upsertCalls[0].payload.user_id).toBe('u-1');
      });

      it('soft-deletes via deleted_at on DELETE operation', async () => {
        const { client, upsertCalls } = makeMockClient({ userId: 'u-1' });
        const { db } = makeFakeDb();

        await module.pushOne(
          client,
          db,
          makeQueueRow({
            table: expectedLocalTable,
            recordId: String(validLocalPayload.id ?? 'r-1'),
            operation: 'DELETE',
            payload: validLocalPayload,
          }),
        );

        expect(upsertCalls).toHaveLength(1);
        expect(upsertCalls[0].payload.deleted_at).toEqual(expect.any(String));
      });

      it('throws when not authenticated', async () => {
        const { client } = makeMockClient({ userId: null });
        const { db } = makeFakeDb();

        await expect(
          module.pushOne(
            client,
            db,
            makeQueueRow({
              table: expectedLocalTable,
              recordId: String(validLocalPayload.id ?? 'r-1'),
              payload: validLocalPayload,
            }),
          ),
        ).rejects.toThrow('not authenticated');
      });

      it('surfaces upsert errors as thrown Errors', async () => {
        const { client } = makeMockClient({
          userId: 'u-1',
          upsertError: { message: 'permission denied' },
        });
        const { db } = makeFakeDb();

        await expect(
          module.pushOne(
            client,
            db,
            makeQueueRow({
              table: expectedLocalTable,
              recordId: String(validLocalPayload.id ?? 'r-1'),
              payload: validLocalPayload,
            }),
          ),
        ).rejects.toThrow(/permission denied/);
      });
    });

    describe('pullBatch', () => {
      it('queries with eq(user_id), gt(updated_at), order asc, limit', async () => {
        const { client, selectCalls } = makeMockClient({
          userId: 'u-1',
          selectData: [],
        });
        const { db } = makeFakeDb();

        await module.pullBatch(client, db, '2026-05-01T00:00:00Z');

        expect(selectCalls).toHaveLength(1);
        expect(selectCalls[0].table).toBe(expectedServerTable);
        expect(selectCalls[0].filters.eq_user_id).toBe('u-1');
        expect(selectCalls[0].filters.gt_updated_at).toBe(
          '2026-05-01T00:00:00Z',
        );
        expect(selectCalls[0].filters.order_updated_at).toBe(true);
        expect(selectCalls[0].limit).toBe(expectedPullLimit);
      });

      it('returns 0 pulled when result is empty', async () => {
        const { client } = makeMockClient({
          userId: 'u-1',
          selectData: [],
        });
        const { db } = makeFakeDb();

        const result = await module.pullBatch(client, db, 'epoch');
        expect(result).toEqual({ pulled: 0, newWatermark: null });
      });

      it('upserts the local row when server row present', async () => {
        const { client } = makeMockClient({
          userId: 'u-1',
          selectData: [validServerRow],
        });
        const { db, runs } = makeFakeDb();

        const result = await module.pullBatch(client, db, 'epoch');

        expect(result.pulled).toBe(1);
        expect(result.newWatermark).toBe(validServerRow.updated_at);
        expect(runs).toHaveLength(1);
        expect(runs[0].sql).toContain(`INSERT INTO ${expectedLocalTable}`);
        expect(runs[0].sql).toContain('ON CONFLICT(id) DO UPDATE');
      });

      it('hard-deletes local row when server row has deleted_at set', async () => {
        const { client } = makeMockClient({
          userId: 'u-1',
          selectData: [
            { ...validServerRow, deleted_at: '2026-05-06T13:00:00Z' },
          ],
        });
        const { db, runs } = makeFakeDb();

        const result = await module.pullBatch(client, db, 'epoch');

        expect(result.pulled).toBe(1);
        expect(runs).toHaveLength(1);
        expect(runs[0].sql).toMatch(
          new RegExp(`^DELETE FROM ${expectedLocalTable} WHERE id = \\?`, 'i'),
        );
      });

      it('throws on select error', async () => {
        const { client } = makeMockClient({
          userId: 'u-1',
          selectError: { message: 'jwt expired' },
        });
        const { db } = makeFakeDb();

        await expect(
          module.pullBatch(client, db, 'epoch'),
        ).rejects.toThrow();
      });

      it('throws when not authenticated', async () => {
        const { client } = makeMockClient({ userId: null });
        const { db } = makeFakeDb();

        await expect(
          module.pullBatch(client, db, 'epoch'),
        ).rejects.toThrow('not authenticated');
      });
    });

    describe('module declaration', () => {
      it('exposes the expected table names', () => {
        expect(module.localTableName).toBe(expectedLocalTable);
        expect(module.serverTableName).toBe(expectedServerTable);
      });
    });
  });
}
