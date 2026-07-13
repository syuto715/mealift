// S3-2b-D — widgetService 修復の回帰テスト。
// 旧実装は workout COUNT が存在しない `date` 列を参照して常に throw し
// (呼び出し側 .catch で無音)、widget_data は一度も書かれていなかった。
// 修復後のクエリ意味論 (date(started_at) + finished/deleted ガード、
// meal/body の deleted_at ガード) をピン留めする。

import { generateWidgetData } from '../widgetService';
import { getDatabase } from '../../database/connection';
import { getISODate, localDayUtcRange } from '../../../utils/format';

jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
}));
jest.mock('expo-notifications', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const mockGetDatabase = getDatabase as jest.Mock;

function makeFakeDb() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const fake = {
    calls,
    async getFirstAsync(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      if (sql.includes('FROM meal_logs')) {
        return { total_cal: 1500, total_p: 100.25, total_f: 40.5, total_c: 180 };
      }
      if (sql.includes('FROM profiles')) {
        return { target_calories: 2200 };
      }
      if (sql.includes('FROM body_logs')) {
        return { weight_kg: 70.5 };
      }
      if (sql.includes('FROM workout_sessions')) {
        return { count: 1 };
      }
      throw new Error(`unexpected getFirstAsync: ${sql}`);
    },
  };
  return fake;
}

describe('generateWidgetData (S3-2b-D 修復)', () => {
  it('throw せずに WidgetData を組み立てる (旧: date 列参照で常時 throw)', async () => {
    const db = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);

    const data = await generateWidgetData('profile-1');

    expect(data.caloriesConsumed).toBe(1500);
    expect(data.caloriesTarget).toBe(2200);
    expect(data.proteinG).toBe(100.3); // 小数1桁丸め
    expect(data.weightKg).toBe(70.5);
    expect(data.workoutsDone).toBe(1);
  });

  it('workout COUNT は local 今日の UTC instant 半開区間 + finished/deleted ガードの規約に従う (Sprint TZ)', async () => {
    const db = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);

    await generateWidgetData('profile-1');

    const workoutCall = db.calls.find((c) => c.sql.includes('FROM workout_sessions'))!;
    expect(workoutCall.sql).toContain('started_at >= ? AND started_at < ?');
    expect(workoutCall.sql).not.toContain('date(started_at)');
    expect(workoutCall.sql).toContain('finished_at IS NOT NULL');
    expect(workoutCall.sql).toContain('deleted_at IS NULL');
    expect(workoutCall.sql).not.toMatch(/AND date = \?/);
    // params は [profileId, local今日のUTC区間開始, 区間終了] (ISO instant)
    expect(workoutCall.params[0]).toBe('profile-1');
    const { startIso, endIso } = localDayUtcRange(getISODate());
    expect(workoutCall.params[1]).toBe(startIso);
    expect(workoutCall.params[2]).toBe(endIso);
  });

  it('meal/body クエリにも deleted_at ガードがある (tombstone 済み行の混入防止)', async () => {
    const db = makeFakeDb();
    mockGetDatabase.mockResolvedValue(db);

    await generateWidgetData('profile-1');

    const mealCall = db.calls.find((c) => c.sql.includes('FROM meal_logs'))!;
    expect(mealCall.sql).toContain('ml.deleted_at IS NULL');
    expect(mealCall.sql).toContain('mli.deleted_at IS NULL');
    const bodyCall = db.calls.find((c) => c.sql.includes('FROM body_logs'))!;
    expect(bodyCall.sql).toContain('deleted_at IS NULL');
  });
});
