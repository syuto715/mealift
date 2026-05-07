import { userEquipmentSync } from '../userEquipmentSync';
import { makeFakeDb, makeMockClient, makeQueueRow } from './testHelpers';

// Bespoke test suite — userEquipmentSync deviates from runStandardSyncTests
// in three places (composite-key onConflict on push, ON CONFLICT
// (profile_id, equipment_key) on pull insert, composite-key DELETE on
// tombstone) so the standard suite's id-keyed assertions don't apply.
//
// Same shape as runStandardSyncTests for symmetry: 5 push + 5 pull +
// 1 invariant + 3 module-specific composite-key checks.

const VALID_LOCAL = {
  id: 'local-eq-1',
  profile_id: 'profile-1',
  equipment_key: 'barbell',
  available: 1,
  notes: null,
};

const VALID_SERVER = {
  id: 'server-eq-1',
  user_id: 'profile-1',
  equipment_key: 'barbell',
  available: true,
  notes: null,
  updated_at: '2026-05-08T10:00:00Z',
  deleted_at: null,
};

describe('user_equipment sync (bespoke — composite-key matching)', () => {
  describe('pushOne', () => {
    it('upserts to user_equipment with user_id from auth', async () => {
      const { client, upsertCalls } = makeMockClient({ userId: 'u-1' });
      const { db } = makeFakeDb();

      await userEquipmentSync.pushOne(
        client,
        db,
        makeQueueRow({
          table: 'user_equipment',
          recordId: VALID_LOCAL.id,
          payload: VALID_LOCAL,
        }),
      );

      expect(upsertCalls).toHaveLength(1);
      expect(upsertCalls[0].table).toBe('user_equipment');
      expect(upsertCalls[0].payload.user_id).toBe('u-1');
      expect(upsertCalls[0].payload.equipment_key).toBe('barbell');
    });

    it('uses composite-key onConflict (user_id, equipment_key)', async () => {
      const { client, upsertCalls } = makeMockClient({ userId: 'u-1' });
      const { db } = makeFakeDb();

      await userEquipmentSync.pushOne(
        client,
        db,
        makeQueueRow({
          table: 'user_equipment',
          recordId: VALID_LOCAL.id,
          payload: VALID_LOCAL,
        }),
      );

      // Deviation from the id-default: composite key resolves the local
      // ↔ server backfill id divergence at upsert time.
      expect(upsertCalls[0].onConflict).toBe('user_id,equipment_key');
    });

    it('converts available 1 → boolean true on push', async () => {
      const { client, upsertCalls } = makeMockClient({ userId: 'u-1' });
      const { db } = makeFakeDb();

      await userEquipmentSync.pushOne(
        client,
        db,
        makeQueueRow({
          table: 'user_equipment',
          recordId: VALID_LOCAL.id,
          payload: { ...VALID_LOCAL, available: 1 },
        }),
      );

      expect(upsertCalls[0].payload.available).toBe(true);
    });

    it('converts available 0 → boolean false on push', async () => {
      const { client, upsertCalls } = makeMockClient({ userId: 'u-1' });
      const { db } = makeFakeDb();

      await userEquipmentSync.pushOne(
        client,
        db,
        makeQueueRow({
          table: 'user_equipment',
          recordId: VALID_LOCAL.id,
          payload: { ...VALID_LOCAL, available: 0 },
        }),
      );

      expect(upsertCalls[0].payload.available).toBe(false);
    });

    it('soft-deletes via deleted_at on DELETE operation', async () => {
      const { client, upsertCalls } = makeMockClient({ userId: 'u-1' });
      const { db } = makeFakeDb();

      await userEquipmentSync.pushOne(
        client,
        db,
        makeQueueRow({
          table: 'user_equipment',
          recordId: VALID_LOCAL.id,
          operation: 'DELETE',
          payload: VALID_LOCAL,
        }),
      );

      expect(upsertCalls[0].payload.deleted_at).toEqual(expect.any(String));
    });

    it('throws when not authenticated', async () => {
      const { client } = makeMockClient({ userId: null });
      const { db } = makeFakeDb();

      await expect(
        userEquipmentSync.pushOne(
          client,
          db,
          makeQueueRow({
            table: 'user_equipment',
            recordId: VALID_LOCAL.id,
            payload: VALID_LOCAL,
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
        userEquipmentSync.pushOne(
          client,
          db,
          makeQueueRow({
            table: 'user_equipment',
            recordId: VALID_LOCAL.id,
            payload: VALID_LOCAL,
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

      await userEquipmentSync.pullBatch(client, db, '2026-05-01T00:00:00Z');

      expect(selectCalls[0].table).toBe('user_equipment');
      expect(selectCalls[0].filters.eq_user_id).toBe('u-1');
      expect(selectCalls[0].filters.gt_updated_at).toBe('2026-05-01T00:00:00Z');
      expect(selectCalls[0].limit).toBe(500);
    });

    it('returns 0 pulled when result is empty', async () => {
      const { client } = makeMockClient({ userId: 'u-1', selectData: [] });
      const { db } = makeFakeDb();
      const result = await userEquipmentSync.pullBatch(client, db, 'epoch');
      expect(result).toEqual({ pulled: 0, newWatermark: null });
    });

    it('upserts via composite-key conflict (profile_id, equipment_key)', async () => {
      const { client } = makeMockClient({
        userId: 'u-1',
        selectData: [VALID_SERVER],
      });
      const { db, runs } = makeFakeDb();

      const result = await userEquipmentSync.pullBatch(client, db, 'epoch');

      expect(result.pulled).toBe(1);
      expect(result.newWatermark).toBe(VALID_SERVER.updated_at);
      expect(runs).toHaveLength(1);
      expect(runs[0].sql).toContain('INSERT INTO user_equipment');
      // Deviation from runStandardSyncTests's ON CONFLICT(id) — we
      // merge by natural identity instead.
      expect(runs[0].sql).toContain(
        'ON CONFLICT(profile_id, equipment_key) DO UPDATE',
      );
    });

    it('converts server boolean true → SQLite INTEGER 1 on pull', async () => {
      const { client } = makeMockClient({
        userId: 'u-1',
        selectData: [{ ...VALID_SERVER, available: true }],
      });
      const { db, runs } = makeFakeDb();
      await userEquipmentSync.pullBatch(client, db, 'epoch');
      // Position in INSERT VALUES: id, profile_id, equipment_key, available, ...
      expect(runs[0].params[3]).toBe(1);
    });

    it('hard-deletes by composite key when server tombstone arrives', async () => {
      const { client } = makeMockClient({
        userId: 'u-1',
        selectData: [
          { ...VALID_SERVER, deleted_at: '2026-05-08T11:00:00Z' },
        ],
      });
      const { db, runs } = makeFakeDb();

      await userEquipmentSync.pullBatch(client, db, 'epoch');

      expect(runs).toHaveLength(1);
      // Composite-key DELETE — id-based DELETE wouldn't catch divergent
      // backfill rows.
      expect(runs[0].sql).toMatch(
        /DELETE FROM user_equipment\s+WHERE profile_id = \? AND equipment_key = \?/,
      );
      expect(runs[0].params).toEqual([VALID_SERVER.user_id, VALID_SERVER.equipment_key]);
    });

    it('throws on select error', async () => {
      const { client } = makeMockClient({
        userId: 'u-1',
        selectError: { message: 'jwt expired' },
      });
      const { db } = makeFakeDb();
      await expect(userEquipmentSync.pullBatch(client, db, 'epoch')).rejects.toThrow();
    });

    it('throws when not authenticated', async () => {
      const { client } = makeMockClient({ userId: null });
      const { db } = makeFakeDb();
      await expect(userEquipmentSync.pullBatch(client, db, 'epoch')).rejects.toThrow(
        'not authenticated',
      );
    });
  });

  describe('module declaration', () => {
    it('exposes the expected table names', () => {
      expect(userEquipmentSync.localTableName).toBe('user_equipment');
      expect(userEquipmentSync.serverTableName).toBe('user_equipment');
    });
  });
});
