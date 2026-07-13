// S4-2 — 週次トレーニングレポート domain のテスト。
// fixture は local Date コンストラクタ由来で TZ 非依存 (3-zone 契約:
// TZ=UTC / Asia/Tokyo / America/Los_Angeles のどれでも通る)。
// SQL 側の半開区間の実挙動は weeklyTrainingQueries.sqlite.test.ts が担い、
// ここでは週定義 (境界 instant の生成)・ラベル・純関数・組み立てを検証する。

import {
  buildTrainingWeek,
  shiftWeek,
  canGoToNextWeek,
  isCurrentWeek,
  daysBetweenLocalDates,
  summarizeRecoveryForMap,
  buildVolumeRows,
  buildE1RMHighlights,
  generateWeeklyTrainingReport,
} from '../weeklyTrainingReport';
import { getRecoveryStatuses } from '../workoutSuggestion';
import { aggregateWeeklySetsByMuscle, VOLUME_GROUPS_ORDER, type VolumeGroup } from '../volumeLandmark';
import { getWeeklyMaxE1RMs } from '../../infra/repositories/oneRepMaxRepository';
import { getWeeklyTrainingTotals } from '../../infra/repositories/workoutRepository';
import type { MuscleRecoveryStatus } from '../../types/workoutSuggestion';

// jest.mock は babel-jest が import より上へ hoist する (import/first 対応で
// 記述位置のみ import 後)
jest.mock('../../infra/database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../workoutSuggestion', () => {
  const actual = jest.requireActual('../workoutSuggestion');
  return { ...actual, getRecoveryStatuses: jest.fn() };
});
jest.mock('../volumeLandmark', () => {
  const actual = jest.requireActual('../volumeLandmark');
  return { ...actual, aggregateWeeklySetsByMuscle: jest.fn() };
});
jest.mock('../../infra/repositories/oneRepMaxRepository', () => ({
  getWeeklyMaxE1RMs: jest.fn(),
}));
jest.mock('../../infra/repositories/workoutRepository', () => ({
  getWeeklyTrainingTotals: jest.fn(),
}));

const mockGetRecoveryStatuses = getRecoveryStatuses as jest.Mock;
const mockAggregate = aggregateWeeklySetsByMuscle as jest.Mock;
const mockGetWeeklyMaxE1RMs = getWeeklyMaxE1RMs as jest.Mock;
const mockGetWeeklyTrainingTotals = getWeeklyTrainingTotals as jest.Mock;

const zeroSets = (): Record<VolumeGroup, number> =>
  Object.fromEntries(VOLUME_GROUPS_ORDER.map((g) => [g, 0])) as Record<VolumeGroup, number>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRecoveryStatuses.mockResolvedValue([]);
  mockAggregate.mockResolvedValue(zeroSets());
  mockGetWeeklyMaxE1RMs.mockResolvedValue([]);
  mockGetWeeklyTrainingTotals.mockResolvedValue({ sessionCount: 0, totalDurationSeconds: 0 });
});

// ---------------------------------------------------------------------------
// 週定義
// ---------------------------------------------------------------------------

describe('buildTrainingWeek', () => {
  it('週の途中 (水曜) からでも local 月曜始まりの週を返す', () => {
    const week = buildTrainingWeek(new Date(2026, 6, 15, 14, 30)); // 水曜 7/15
    expect(week.weekStartKey).toBe('2026-07-13');
    expect(week.weekStart.getTime()).toBe(new Date(2026, 6, 13).getTime());
    expect(week.startIso).toBe(new Date(2026, 6, 13).toISOString());
    expect(week.endIso).toBe(new Date(2026, 6, 20).toISOString());
    expect(week.rangeLabel).toBe('7/13〜7/19');
  });

  it('深夜 0:30 開始の instant は startIso 以上 endIso 未満 = その週に帰属 (前週日曜 23:30 は外)', () => {
    const week = buildTrainingWeek(new Date(2026, 6, 13));
    const monday0030 = new Date(2026, 6, 13, 0, 30).toISOString();
    const prevSunday2330 = new Date(2026, 6, 12, 23, 30).toISOString();
    const nextMonday0030 = new Date(2026, 6, 20, 0, 30).toISOString();
    // canonical toISOString 同士は字句比較 = 時系列比較
    expect(monday0030 >= week.startIso).toBe(true);
    expect(monday0030 < week.endIso).toBe(true);
    expect(prevSunday2330 < week.startIso).toBe(true);
    expect(nextMonday0030 >= week.endIso).toBe(true);
  });

  it('ラベルは「月曜が属する月 + 月曜基準の月内週番号」(7/13 → 7月 3週目)', () => {
    expect(buildTrainingWeek(new Date(2026, 6, 13)).label).toBe('7月 3週目');
  });

  it('月跨ぎ週は月曜側の月でラベルする (2026-06-29 週に 7/1 が含まれても 6月)', () => {
    const week = buildTrainingWeek(new Date(2026, 6, 1)); // 水曜 7/1 → 週の月曜は 6/29
    expect(week.weekStartKey).toBe('2026-06-29');
    expect(week.label).toBe('6月 5週目');
    expect(week.rangeLabel).toBe('6/29〜7/5');
  });
});

describe('shiftWeek / canGoToNextWeek / isCurrentWeek', () => {
  const monday = new Date(2026, 6, 13);

  it('shiftWeek は ±7日した週の月曜を返す', () => {
    expect(shiftWeek(monday, -1).getTime()).toBe(new Date(2026, 6, 6).getTime());
    expect(shiftWeek(monday, 1).getTime()).toBe(new Date(2026, 6, 20).getTime());
  });

  it('現在週からは翌週に進めない (未来週不可)', () => {
    expect(canGoToNextWeek(monday, new Date(2026, 6, 15))).toBe(false);
  });

  it('過去週からは進める。翌週月曜 0:00 ちょうどの now は進める側', () => {
    expect(canGoToNextWeek(new Date(2026, 6, 6), new Date(2026, 6, 15))).toBe(true);
    expect(canGoToNextWeek(monday, new Date(2026, 6, 20))).toBe(true);
  });

  it('isCurrentWeek は日曜 23:59 まで true、翌月曜 0:00 で false', () => {
    expect(isCurrentWeek(monday, new Date(2026, 6, 19, 23, 59))).toBe(true);
    expect(isCurrentWeek(monday, new Date(2026, 6, 20, 0, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 純関数
// ---------------------------------------------------------------------------

describe('daysBetweenLocalDates', () => {
  it('カレンダー日差を返す (昨日 22時トレ → 今日で 1日)', () => {
    expect(daysBetweenLocalDates('2026-07-12', '2026-07-13')).toBe(1);
    expect(daysBetweenLocalDates('2026-07-13', '2026-07-13')).toBe(0);
  });

  it('DST 跨ぎでもカレンダー日差が保たれる (US 2026-03-08 春時間、noon parse)', () => {
    expect(daysBetweenLocalDates('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetweenLocalDates('2026-10-31', '2026-11-02')).toBe(2); // 秋戻し跨ぎ
  });
});

describe('summarizeRecoveryForMap', () => {
  const status = (over: Partial<MuscleRecoveryStatus>): MuscleRecoveryStatus => ({
    muscleGroup: 'chest',
    lastTrainedDate: '2026-07-10',
    hoursSinceTraining: 72,
    recoveryPercent: 100,
    status: 'recovered',
    ...over,
  });

  it('未トレ部位 (lastTrainedDate null) は status=recovered でも「記録なし」に振り分ける', () => {
    const [entry] = summarizeRecoveryForMap(
      [status({ lastTrainedDate: null, hoursSinceTraining: null })],
      '2026-07-13',
    );
    expect(entry.state).toBe('untrained');
    expect(entry.daysSince).toBeNull();
  });

  it('recovered は回復済み + 経過カレンダー日数、recovering / fatigued は回復中に統合', () => {
    const entries = summarizeRecoveryForMap(
      [
        status({ muscleGroup: 'chest', lastTrainedDate: '2026-07-10' }),
        status({ muscleGroup: 'legs', status: 'recovering', recoveryPercent: 60, lastTrainedDate: '2026-07-12' }),
        status({ muscleGroup: 'back', status: 'fatigued', recoveryPercent: 20, lastTrainedDate: '2026-07-13' }),
      ],
      '2026-07-13',
    );
    expect(entries[0]).toMatchObject({ group: 'chest', labelJa: '胸', state: 'recovered', daysSince: 3 });
    expect(entries[1]).toMatchObject({ group: 'legs', labelJa: '脚', state: 'recovering', daysSince: 1 });
    expect(entries[2]).toMatchObject({ group: 'back', labelJa: '背中', state: 'recovering', daysSince: 0 });
  });

  it('clock skew で lastTrainedDate が未来でも daysSince は 0 に clamp', () => {
    const [entry] = summarizeRecoveryForMap([status({ lastTrainedDate: '2026-07-14' })], '2026-07-13');
    expect(entry.daysSince).toBe(0);
  });
});

describe('buildVolumeRows', () => {
  it('9 部位を VOLUME_GROUPS_ORDER 順で返し、分母は MAV 中点・前週セット数を併記する', () => {
    const current = { ...zeroSets(), chest: 3, quads: 12 };
    const previous = { ...zeroSets(), chest: 8 };

    const rows = buildVolumeRows(current, previous);

    expect(rows.map((r) => r.group)).toEqual([...VOLUME_GROUPS_ORDER]);
    const chest = rows.find((r) => r.group === 'chest');
    expect(chest).toMatchObject({ weeklySets: 3, prevWeekSets: 8, targetSets: 15, zone: 'below_mev' });
    const quads = rows.find((r) => r.group === 'quads');
    expect(quads).toMatchObject({ weeklySets: 12, prevWeekSets: 0, targetSets: 15 });
  });
});

describe('buildE1RMHighlights', () => {
  const row = (exerciseId: string, kg: number) => ({
    exerciseId,
    exerciseNameJa: exerciseId,
    maxE1rmKg: kg,
  });

  it('伸びた種目 (diff 降順) → 初記録 (kg 降順) → その他の順で limit 件', () => {
    const current = [row('bench', 82.5), row('squat', 130), row('dead', 150), row('ohp', 50)];
    const previous = [row('bench', 80), row('squat', 120), row('dead', 155)];

    const highlights = buildE1RMHighlights(current, previous, 3);

    expect(highlights.map((h) => h.exerciseId)).toEqual(['squat', 'bench', 'ohp']);
    expect(highlights[0]).toMatchObject({ currentKg: 130, prevKg: 120, diffKg: 10 });
    expect(highlights[2]).toMatchObject({ currentKg: 50, prevKg: null, diffKg: null });
  });

  it('今週の観測が無ければ空 (前週だけあっても出さない)', () => {
    expect(buildE1RMHighlights([], [row('bench', 80)])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 組み立て
// ---------------------------------------------------------------------------

describe('generateWeeklyTrainingReport', () => {
  it('現在週: 回復状態を取得し、今週/前週の 4 系列を半開区間で引く', async () => {
    mockGetRecoveryStatuses.mockResolvedValue([
      {
        muscleGroup: 'chest',
        lastTrainedDate: null,
        hoursSinceTraining: null,
        recoveryPercent: 100,
        status: 'recovered',
      },
    ]);
    mockGetWeeklyTrainingTotals
      .mockResolvedValueOnce({ sessionCount: 3, totalDurationSeconds: 5400 })
      .mockResolvedValueOnce({ sessionCount: 2, totalDurationSeconds: 3600 });

    const now = new Date();
    const report = await generateWeeklyTrainingReport('p1', now);

    expect(report.isCurrentWeek).toBe(true);
    expect(report.recovery).not.toBeNull();
    expect(report.recovery?.[0].state).toBe('untrained');
    expect(report.totals).toEqual({ sessionCount: 3, totalDurationSeconds: 5400 });
    expect(report.prevTotals).toEqual({ sessionCount: 2, totalDurationSeconds: 3600 });

    const week = buildTrainingWeek(now);
    const prevMonday = shiftWeek(week.weekStart, -1);
    expect(mockGetWeeklyTrainingTotals).toHaveBeenNthCalledWith(1, 'p1', week.startIso, week.endIso);
    expect(mockGetWeeklyTrainingTotals).toHaveBeenNthCalledWith(
      2,
      'p1',
      prevMonday.toISOString(),
      new Date(prevMonday.getFullYear(), prevMonday.getMonth(), prevMonday.getDate() + 7).toISOString(),
    );
    expect(mockGetWeeklyMaxE1RMs).toHaveBeenCalledTimes(2);
    expect(mockAggregate).toHaveBeenNthCalledWith(1, 'p1', week.weekStart);
    expect(mockAggregate).toHaveBeenNthCalledWith(2, 'p1', prevMonday);
  });

  it('過去週: 回復状態は取得しない (recovery = null)', async () => {
    const report = await generateWeeklyTrainingReport('p1', new Date(2020, 0, 8));

    expect(report.isCurrentWeek).toBe(false);
    expect(report.recovery).toBeNull();
    expect(mockGetRecoveryStatuses).not.toHaveBeenCalled();
  });

  it('データゼロ週は hasAnyVolume=false・ハイライト空・合計 0', async () => {
    const report = await generateWeeklyTrainingReport('p1', new Date(2020, 0, 8));

    expect(report.hasAnyVolume).toBe(false);
    expect(report.e1rmHighlights).toEqual([]);
    expect(report.totals).toEqual({ sessionCount: 0, totalDurationSeconds: 0 });
    expect(report.volumeRows).toHaveLength(9);
  });
});
