// S4-2 — 週次トレーニングレポートの週定義・データ組み立て。
//
// 週定義はアプリ唯一のカレンダー週規約 (weeklyReport.ts / history.tsx /
// DateNavigator / calendarGrid と同一) に揃える:
//   - local 月曜始まり: startOfWeek(refDate, { weekStartsOn: 1 })
//   - SQL 境界は local 月曜 00:00 → toISOString の UTC instant 半開区間
//     [startIso, endIso)。深夜 0:30 開始のセッションは「その月曜の週」に帰属
//     (weeklyReport.ts / aggregateWeeklySetsByMuscle と同じ意味論)
//
// 回復状態 (getRecoveryStatuses) は「今」の状態しか計算できないため、現在週を
// 表示しているときのみ取得する (過去週の回復状態は誠実に再構成できない)。
// 「今日のおすすめ」(getWorkoutSuggestion) と同一の関数・閾値を使うので、
// 回復マップとおすすめが矛盾することは構造的にない。

import { addDays, format, getWeekOfMonth, startOfWeek } from 'date-fns';
import { getISODate } from '../utils/format';
import { getRecoveryStatuses, MUSCLE_LABELS } from './workoutSuggestion';
import {
  aggregateWeeklySetsByMuscle,
  summarizeVolumeGroups,
  VOLUME_GROUPS_ORDER,
  type VolumeGroup,
  type VolumeGroupSummary,
} from './volumeLandmark';
import {
  getWeeklyMaxE1RMs,
  type WeeklyMaxE1RM,
} from '../infra/repositories/oneRepMaxRepository';
import {
  getWeeklyTrainingTotals,
  type WeeklyTrainingTotals,
} from '../infra/repositories/workoutRepository';
import type { MuscleGroup } from '../types/common';
import type { MuscleRecoveryStatus } from '../types/workoutSuggestion';

// === 週の器 ===

export interface TrainingWeek {
  // local 月曜 00:00 (画面の週送り state はこの Date を持ち回す)
  weekStart: Date;
  // 'yyyy-MM-dd' の local 月曜 — weekly_reports.week_start と同じキー形式
  weekStartKey: string;
  // SQL 半開区間 [startIso, endIso)
  startIso: string;
  endIso: string;
  // 「7月 2週目」— 月は週の月曜が属する月、週番号はその月曜基準 (月曜始まり)
  label: string;
  // 「7/13〜7/19」
  rangeLabel: string;
}

export function buildTrainingWeek(refDate: Date): TrainingWeek {
  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 });
  const nextMonday = addDays(weekStart, 7);
  const sunday = addDays(weekStart, 6);
  return {
    weekStart,
    weekStartKey: format(weekStart, 'yyyy-MM-dd'),
    startIso: weekStart.toISOString(),
    endIso: nextMonday.toISOString(),
    label: `${weekStart.getMonth() + 1}月 ${getWeekOfMonth(weekStart, { weekStartsOn: 1 })}週目`,
    rangeLabel: `${format(weekStart, 'M/d')}〜${format(sunday, 'M/d')}`,
  };
}

// 週送り: delta = -1 (前週) / +1 (翌週)
export function shiftWeek(weekStart: Date, delta: number): Date {
  return startOfWeek(addDays(weekStart, delta * 7), { weekStartsOn: 1 });
}

// 未来週不可 (DateNavigator の canGoNext と同じ意味論)。now は test seam。
export function canGoToNextWeek(weekStart: Date, now: Date = new Date()): boolean {
  return addDays(startOfWeek(weekStart, { weekStartsOn: 1 }), 7).getTime() <= now.getTime();
}

export function isCurrentWeek(weekStart: Date, now: Date = new Date()): boolean {
  return (
    startOfWeek(weekStart, { weekStartsOn: 1 }).getTime() ===
    startOfWeek(now, { weekStartsOn: 1 }).getTime()
  );
}

// === 回復マップ用の 2値+未記録 サマリ (系統A = 今日のおすすめと同源) ===

export type RecoveryMapState = 'recovered' | 'recovering' | 'untrained';

export interface RecoveryMapEntry {
  group: MuscleGroup;
  labelJa: string;
  state: RecoveryMapState;
  // 最終トレからの経過カレンダー日数 (今日=0)。未記録は null
  daysSince: number | null;
}

// 'yyyy-MM-dd' → local noon Date (UTC-midnight parse バグ回避 —
// volumeLandmark.parseISODateAsLocalNoon と同じ手法)
function parseLocalDateAsNoon(localDate: string): Date {
  const [y, m, d] = localDate.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function daysBetweenLocalDates(fromLocal: string, toLocal: string): number {
  const from = parseLocalDateAsNoon(fromLocal);
  const to = parseLocalDateAsNoon(toLocal);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

// statuses は getRecoveryStatuses の 6 部位出力。todayLocal は test seam
// (production は getISODate())。
// 3値 status → マップの 2値: recovered はそのまま、recovering / fatigued は
// 「回復中」に統合 (3-3 semantic token 規約: 回復系に赤禁止・責めないトーン)。
// 未トレ部位は getRecoveryStatuses が status='recovered' で返すため、
// lastTrainedDate === null で「記録なし」に振り分ける。
export function summarizeRecoveryForMap(
  statuses: MuscleRecoveryStatus[],
  todayLocal: string = getISODate(),
): RecoveryMapEntry[] {
  return statuses.map((s) => {
    if (s.lastTrainedDate === null) {
      return {
        group: s.muscleGroup,
        labelJa: MUSCLE_LABELS[s.muscleGroup],
        state: 'untrained' as const,
        daysSince: null,
      };
    }
    return {
      group: s.muscleGroup,
      labelJa: MUSCLE_LABELS[s.muscleGroup],
      state: s.status === 'recovered' ? ('recovered' as const) : ('recovering' as const),
      daysSince: Math.max(0, daysBetweenLocalDates(s.lastTrainedDate, todayLocal)),
    };
  });
}

// === 部位別週間セット数 (9値 VolumeGroup + MEV/MAV/MRV) ===

export interface VolumeRow extends VolumeGroupSummary {
  prevWeekSets: number;
  // 「3/15 セット」の分母 = MAV 中点 (VolumeLandmarkChart の既存表示と整合)
  targetSets: number;
}

export function buildVolumeRows(
  current: Record<VolumeGroup, number>,
  previous: Record<VolumeGroup, number>,
): VolumeRow[] {
  return summarizeVolumeGroups(current).map((summary) => ({
    ...summary,
    prevWeekSets: previous[summary.group] ?? 0,
    targetSets: Math.round((summary.landmark.mavMin + summary.landmark.mavMax) / 2),
  }));
}

// === e1RM 週次ハイライト ===

export interface E1RMHighlight {
  exerciseId: string;
  exerciseNameJa: string;
  currentKg: number;
  // 前週に観測が無い種目は null (「初記録」扱い)
  prevKg: number | null;
  diffKg: number | null;
}

// 今週の種目別ベストを前週と突き合わせ、伸びた種目 (diff 降順) → 初記録
// (current 降順) → その他 (current 降順) の順で limit 件返す。
export function buildE1RMHighlights(
  current: WeeklyMaxE1RM[],
  previous: WeeklyMaxE1RM[],
  limit: number = 3,
): E1RMHighlight[] {
  const prevByExercise = new Map(previous.map((p) => [p.exerciseId, p.maxE1rmKg]));
  const rows: E1RMHighlight[] = current.map((c) => {
    const prevKg = prevByExercise.get(c.exerciseId) ?? null;
    return {
      exerciseId: c.exerciseId,
      exerciseNameJa: c.exerciseNameJa,
      currentKg: c.maxE1rmKg,
      prevKg,
      diffKg: prevKg === null ? null : c.maxE1rmKg - prevKg,
    };
  });

  const improved = rows
    .filter((r) => r.diffKg !== null && r.diffKg > 0)
    .sort((a, b) => (b.diffKg as number) - (a.diffKg as number));
  const firstRecords = rows
    .filter((r) => r.prevKg === null)
    .sort((a, b) => b.currentKg - a.currentKg);
  const rest = rows
    .filter((r) => r.diffKg !== null && r.diffKg <= 0)
    .sort((a, b) => b.currentKg - a.currentKg);

  return [...improved, ...firstRecords, ...rest].slice(0, limit);
}

// === レポート組み立て ===

export interface WeeklyTrainingReportData {
  week: TrainingWeek;
  isCurrentWeek: boolean;
  // 現在週のみ非 null (過去週の回復状態は再構成不可)
  recovery: RecoveryMapEntry[] | null;
  volumeRows: VolumeRow[];
  hasAnyVolume: boolean;
  e1rmHighlights: E1RMHighlight[];
  totals: WeeklyTrainingTotals;
  prevTotals: WeeklyTrainingTotals;
}

export async function generateWeeklyTrainingReport(
  profileId: string,
  refDate: Date = new Date(),
): Promise<WeeklyTrainingReportData> {
  const week = buildTrainingWeek(refDate);
  const prevWeek = buildTrainingWeek(shiftWeek(week.weekStart, -1));
  const current = isCurrentWeek(week.weekStart);

  const [recoveryStatuses, currentSets, prevSets, currentE1rms, prevE1rms, totals, prevTotals] =
    await Promise.all([
      current ? getRecoveryStatuses(profileId) : Promise.resolve(null),
      aggregateWeeklySetsByMuscle(profileId, week.weekStart),
      aggregateWeeklySetsByMuscle(profileId, prevWeek.weekStart),
      getWeeklyMaxE1RMs(profileId, week.startIso, week.endIso),
      getWeeklyMaxE1RMs(profileId, prevWeek.startIso, prevWeek.endIso),
      getWeeklyTrainingTotals(profileId, week.startIso, week.endIso),
      getWeeklyTrainingTotals(profileId, prevWeek.startIso, prevWeek.endIso),
    ]);

  const volumeRows = buildVolumeRows(currentSets, prevSets);
  const hasAnyVolume = VOLUME_GROUPS_ORDER.some((g) => (currentSets[g] ?? 0) > 0);

  return {
    week,
    isCurrentWeek: current,
    recovery: recoveryStatuses ? summarizeRecoveryForMap(recoveryStatuses) : null,
    volumeRows,
    hasAnyVolume,
    e1rmHighlights: buildE1RMHighlights(currentE1rms, prevE1rms),
    totals,
    prevTotals,
  };
}
