// Sprint TZ — workoutRepository の local 日付化回帰テスト。
// SQL 形状 (date(started_at) の廃止・ISO 半開区間化) と、JS 側 localDateOf に
// よる日付化を fake DB でピン留めする。字句比較の実挙動は
// utils/__tests__/localDate.sqlite.test.ts (node:sqlite) が担う。

import { localDayUtcRange, localMonthUtcRange, localDateOf } from '../../../utils/format';
import {
  getTodayWorkoutCalories,
  getRecordedSessionDates,
  getSessionMuscleDaysForMonth,
} from '../workoutRepository';
import { getDatabase } from '../../database/connection';

jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../../../utils/id', () => ({ generateId: () => 'stub-id' }));
jest.mock('../syncRepository', () => ({ enqueueRowFromTable: jest.fn() }));

const mockGetDatabase = getDatabase as jest.Mock;

interface Call {
  sql: string;
  params: unknown[];
}

function makeFakeDb(rows: unknown[] = []) {
  const calls: Call[] = [];
  return {
    calls,
    async getFirstAsync(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return { total: 0 };
    },
    async getAllAsync(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return rows;
    },
  };
}

describe('getTodayWorkoutCalories (Sprint TZ)', () => {
  it('local 日付 param を UTC instant 半開区間に変換して比較する (date() 不使用)', async () => {
    const db = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);

    await getTodayWorkoutCalories('p1', '2026-07-13');

    const call = db.calls[0];
    expect(call.sql).toContain('started_at >= ? AND started_at < ?');
    expect(call.sql).not.toContain('date(started_at)');
    const { startIso, endIso } = localDayUtcRange('2026-07-13');
    expect(call.params).toEqual(['p1', startIso, endIso]);
  });
});

describe('getRecordedSessionDates (Sprint TZ)', () => {
  it('local 月範囲で行を取り、JS 側 localDateOf で dedupe した local 日付を返す', async () => {
    // local 7/13 の深夜と昼 (同日 2 セッション) + local 7/1 深夜
    const rows = [
      { started_at: new Date(2026, 6, 1, 0, 30).toISOString() },
      { started_at: new Date(2026, 6, 13, 0, 30).toISOString() },
      { started_at: new Date(2026, 6, 13, 12, 0).toISOString() },
    ];
    const db = makeFakeDb(rows);
    mockGetDatabase.mockResolvedValue(db);

    const dates = await getRecordedSessionDates('p1', '2026-07');

    expect(dates).toEqual(['2026-07-01', '2026-07-13']);
    const call = db.calls[0];
    expect(call.sql).not.toContain('date(started_at)');
    expect(call.sql).not.toContain('LIKE');
    const { startIso, endIso } = localMonthUtcRange('2026-07');
    expect(call.params).toEqual(['p1', startIso, endIso]);
  });

  it('free-tier clamp は ISO instant param (datetime(now) 不使用)', async () => {
    const db = makeFakeDb([]);
    mockGetDatabase.mockResolvedValue(db);

    await getRecordedSessionDates('p1', '2026-07', 30);

    const call = db.calls[0];
    expect(call.sql).not.toContain("datetime('now'");
    expect(call.sql).not.toContain("date('now'");
    expect(call.params).toHaveLength(4);
    // 4つ目 = clamp instant (ISO 形状)
    expect(call.params[3]).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe('getSessionMuscleDaysForMonth (Sprint TZ)', () => {
  it('local 日付で group し、同日複数セッションの部位を dedupe する', async () => {
    const day13Night = new Date(2026, 6, 13, 0, 30).toISOString();
    const day13Noon = new Date(2026, 6, 13, 12, 0).toISOString();
    const rows = [
      { started_at: day13Night, mg: 'chest' },
      { started_at: day13Noon, mg: 'chest' }, // 同日別セッション同部位 → dedupe
      { started_at: day13Noon, mg: 'back' },
    ];
    const db = makeFakeDb(rows);
    mockGetDatabase.mockResolvedValue(db);

    const days = await getSessionMuscleDaysForMonth('p1', '2026-07');

    expect(days).toEqual([
      { date: localDateOf(day13Night), muscleGroups: ['chest', 'back'] },
    ]);
    expect(days[0].date).toBe('2026-07-13');
    expect(db.calls[0].sql).not.toContain('date(s.started_at)');
  });
});
