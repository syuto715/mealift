import { addDays, addMonths, endOfMonth, format, startOfWeek } from 'date-fns';

// S2-F — 筋トレカレンダー (自作月間グリッド) の純ロジック。
// 週の開始は月曜 (DateNavigator / history の weekStartsOn: 1 と同じ規則)。

export interface CalendarDay {
  iso: string; // 'yyyy-MM-dd'
  day: number; // 1-31
  inMonth: boolean; // 表示中の月に属するか (前後月の埋めセルは false)
}

/**
 * monthPrefix ('yyyy-MM') の月間グリッドを週ごとの 7 セル配列で返す。
 * 先頭週・末尾週は前後月の日付で埋める (inMonth: false)。
 */
export function buildMonthGrid(monthPrefix: string): CalendarDay[][] {
  const first = new Date(`${monthPrefix}-01T00:00:00`);
  const last = endOfMonth(first);
  let cursor = startOfWeek(first, { weekStartsOn: 1 });
  const weeks: CalendarDay[][] = [];
  while (cursor <= last) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        iso: format(cursor, 'yyyy-MM-dd'),
        day: cursor.getDate(),
        inMonth: format(cursor, 'yyyy-MM') === monthPrefix,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** monthPrefix を delta ヶ月ずらす ('2026-01' + (-1) → '2025-12')。 */
export function shiftMonth(monthPrefix: string, delta: number): string {
  return format(addMonths(new Date(`${monthPrefix}-01T00:00:00`), delta), 'yyyy-MM');
}

/** '2026-07' → '2026年7月' (カレンダーヘッダ表示用)。 */
export function formatMonthLabel(monthPrefix: string): string {
  const [y, m] = monthPrefix.split('-');
  return `${y}年${Number(m)}月`;
}
