import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import {
  getWatermark,
  setWatermark,
  SYNC_WATERMARK_KEYS,
} from '../syncWatermarkRepository';

// Tiny fake DB modelling the upsert semantics of the sync_watermarks
// table. The real repo emits two SQL shapes: SELECT by resource and
// upsert via ON CONFLICT. The fake matches both.
interface WatermarkRow {
  resource: string;
  last_pulled_at: string;
  updated_at: string;
}

function makeFakeDb(): SQLiteDatabase {
  const rows: WatermarkRow[] = [];
  let clock = 0;
  const tick = () => {
    clock += 1;
    return `2026-04-26T00:00:00.${String(clock).padStart(6, '0')}Z`;
  };

  const fake = {
    runAsync: async (
      sql: string,
      params: unknown[],
    ): Promise<SQLiteRunResult> => {
      if (/^\s*INSERT INTO sync_watermarks/i.test(sql)) {
        const [resource, lastPulledAt] = params as [string, string];
        const existing = rows.find((r) => r.resource === resource);
        if (existing) {
          existing.last_pulled_at = lastPulledAt;
          existing.updated_at = tick();
        } else {
          rows.push({
            resource,
            last_pulled_at: lastPulledAt,
            updated_at: tick(),
          });
        }
        return { lastInsertRowId: 0, changes: 1 };
      }
      throw new Error(`fake DB: unhandled runAsync SQL: ${sql}`);
    },
    getFirstAsync: async <T,>(
      sql: string,
      params: unknown[],
    ): Promise<T | null> => {
      if (/FROM sync_watermarks WHERE resource = \?/i.test(sql)) {
        const [resource] = params as [string];
        const row = rows.find((r) => r.resource === resource);
        return row ? ({ last_pulled_at: row.last_pulled_at } as unknown as T) : null;
      }
      throw new Error(`fake DB: unhandled getFirstAsync SQL: ${sql}`);
    },
    getAllAsync: async <T,>(_sql: string, _params: unknown[]): Promise<T[]> => {
      throw new Error('fake DB: getAllAsync not used');
    },
  };

  return fake as unknown as SQLiteDatabase;
}

describe('syncWatermarkRepository', () => {
  it('returns null when no watermark has been set', async () => {
    const db = makeFakeDb();
    const value = await getWatermark(db, SYNC_WATERMARK_KEYS.publicFoodsApproved);
    expect(value).toBeNull();
  });

  it('stores and retrieves a watermark', async () => {
    const db = makeFakeDb();
    const ts = '2026-04-26T12:00:00Z';
    await setWatermark(db, SYNC_WATERMARK_KEYS.publicFoodsApproved, ts);
    expect(
      await getWatermark(db, SYNC_WATERMARK_KEYS.publicFoodsApproved),
    ).toBe(ts);
  });

  it('upserts on a second set call (does not throw on duplicate key)', async () => {
    const db = makeFakeDb();
    await setWatermark(db, SYNC_WATERMARK_KEYS.publicFoodsApproved, '2026-04-01T00:00:00Z');
    await setWatermark(db, SYNC_WATERMARK_KEYS.publicFoodsApproved, '2026-04-26T00:00:00Z');
    expect(
      await getWatermark(db, SYNC_WATERMARK_KEYS.publicFoodsApproved),
    ).toBe('2026-04-26T00:00:00Z');
  });

  it('keeps watermarks for different resources isolated', async () => {
    const db = makeFakeDb();
    await setWatermark(db, 'resource_a', '2026-04-01T00:00:00Z');
    await setWatermark(db, 'resource_b', '2026-04-26T00:00:00Z');
    expect(await getWatermark(db, 'resource_a')).toBe('2026-04-01T00:00:00Z');
    expect(await getWatermark(db, 'resource_b')).toBe('2026-04-26T00:00:00Z');
  });

  it('exports a stable key for the public_foods approved pull', () => {
    expect(SYNC_WATERMARK_KEYS.publicFoodsApproved).toBe('public_foods_approved');
  });
});
