// v1.5 Stage 1 Phase 1.4 — coachAdviceRepository tests.

interface FakeRow extends Record<string, unknown> {}

class FakeDb {
  advice: FakeRow[] = [];

  async getAllAsync<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (sql.includes('FROM coach_advice_local')) {
      if (sql.includes('SELECT id FROM')) {
        const [userId, scope] = params as [string, string];
        return this.advice.filter(
          (r) => r.user_id === userId && r.scope === scope,
        ) as unknown as T[];
      }
      const [userId, scope] = params as [string, string];
      return this.advice
        .filter((r) => r.user_id === userId && r.scope === scope)
        .sort(
          (a, b) =>
            String(b.period_start).localeCompare(String(a.period_start)),
        ) as unknown as T[];
    }
    return [];
  }

  async getFirstAsync<T>(sql: string, params: unknown[]): Promise<T | null> {
    if (sql.includes('FROM coach_advice_local')) {
      const [userId, scope, periodStart] = params as [string, string, string];
      const found = this.advice.find(
        (r) =>
          r.user_id === userId &&
          r.scope === scope &&
          r.period_start === periodStart,
      );
      return (found ?? null) as unknown as T;
    }
    return null;
  }

  async runAsync(sql: string, params: unknown[]): Promise<void> {
    if (sql.startsWith('INSERT INTO coach_advice_local')) {
      const [
        id,
        user_id,
        scope,
        period_start,
        content,
        generated_at,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const existing = this.advice.find(
        (r) =>
          r.user_id === user_id &&
          r.scope === scope &&
          r.period_start === period_start,
      );
      const row: FakeRow = {
        id,
        user_id,
        scope,
        period_start,
        content,
        generated_at,
        cached_at: generated_at,
      };
      if (existing) Object.assign(existing, row);
      else this.advice.push(row);
      return;
    }
    if (sql.startsWith('DELETE FROM coach_advice_local')) {
      const [id] = params as [string];
      this.advice = this.advice.filter((r) => r.id !== id);
      return;
    }
  }
}

const mockFakeDb = new FakeDb();
jest.mock('../../database/connection', () => ({
  getDatabase: jest.fn(async () => mockFakeDb),
}));

// Mutable holder so the prune test can inject a fake supabase
// client (getter-style live binding workaround documented in
// `chatRepository.test.ts`).
const mockSupabaseRef: { value: unknown } = { value: null };
jest.mock('../../supabase/client', () => ({
  get supabase() {
    return mockSupabaseRef.value;
  },
}));

import {
  getAdviceByBucket,
  listAdviceByScope,
  syncAdviceFromSupabase,
  upsertAdvice,
} from '../coachAdviceRepository';
import type { LocalCoachAdvice } from '../../../types/coachAdvice';

function makeAdvice(
  overrides: Partial<LocalCoachAdvice> = {},
): LocalCoachAdvice {
  return {
    id: 'a-1',
    userId: 'u-1',
    scope: 'weekly',
    periodStart: '2026-05-11',
    content: '今週のアドバイス',
    generatedAt: '2026-05-17T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockFakeDb.advice = [];
  mockSupabaseRef.value = null;
});

describe('coachAdviceRepository', () => {
  it('upsertAdvice + listAdviceByScope roundtrip (DESC by period_start)', async () => {
    await upsertAdvice(makeAdvice({ id: 'a-old', periodStart: '2026-05-04' }));
    await upsertAdvice(makeAdvice({ id: 'a-new', periodStart: '2026-05-11' }));
    const rows = await listAdviceByScope('u-1', 'weekly');
    expect(rows.map((r) => r.id)).toEqual(['a-new', 'a-old']);
  });

  it('upsertAdvice on same bucket UPDATEs content (Drafting 100 unique key)', async () => {
    await upsertAdvice(makeAdvice({ id: 'a-1', content: 'old' }));
    await upsertAdvice(makeAdvice({ id: 'a-1', content: 'new' }));
    expect(mockFakeDb.advice).toHaveLength(1);
    expect(mockFakeDb.advice[0].content).toBe('new');
  });

  it('getAdviceByBucket returns null when no row', async () => {
    const row = await getAdviceByBucket('u-1', 'weekly', '2026-05-11');
    expect(row).toBeNull();
  });

  it('getAdviceByBucket returns the matching row', async () => {
    await upsertAdvice(makeAdvice({ id: 'hit', periodStart: '2026-05-11' }));
    await upsertAdvice(makeAdvice({ id: 'miss', periodStart: '2026-05-04' }));
    const row = await getAdviceByBucket('u-1', 'weekly', '2026-05-11');
    expect(row?.id).toBe('hit');
  });

  it('syncAdviceFromSupabase silently no-ops when offline (preserves cache)', async () => {
    await upsertAdvice(makeAdvice({ id: 'cached', periodStart: '2026-05-11' }));
    mockSupabaseRef.value = null;
    await syncAdviceFromSupabase('u-1', 'weekly');
    expect(mockFakeDb.advice).toHaveLength(1);
  });

  it('syncAdviceFromSupabase prunes local rows missing from the server', async () => {
    await upsertAdvice(makeAdvice({ id: 'a-keep', periodStart: '2026-05-11' }));
    await upsertAdvice(makeAdvice({ id: 'a-stale', periodStart: '2026-05-04' }));

    mockSupabaseRef.value = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: 'a-keep',
                      user_id: 'u-1',
                      scope: 'weekly',
                      period_start: '2026-05-11',
                      content: '今週',
                      generated_at: '2026-05-17T10:00:00.000Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    await syncAdviceFromSupabase('u-1', 'weekly');
    const ids = mockFakeDb.advice.map((r) => r.id).sort();
    expect(ids).toEqual(['a-keep']);
    mockSupabaseRef.value = null;
  });
});
