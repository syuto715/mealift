import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export function formatDate(date: string | Date, pattern: string = 'yyyy/MM/dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern, { locale: ja });
}

export function formatDateRelative(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (isToday(d)) return '今日';
  if (isYesterday(d)) return '昨日';
  return format(d, 'M/d (E)', { locale: ja });
}

export function formatTimeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: ja });
}

export function formatNumber(value: number, decimals: number = 0): string {
  return value.toFixed(decimals);
}

export function formatWeight(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

export function formatCalories(kcal: number): string {
  return `${Math.round(kcal)} kcal`;
}

export function formatMacro(grams: number): string {
  return `${grams.toFixed(1)} g`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s > 0 ? `${s}秒` : ''}`;
  return `${s}秒`;
}

export function formatTimerDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'こんばんは';
  if (hour < 11) return 'おはようございます';
  if (hour < 17) return 'こんにちは';
  return 'こんばんは';
}

export function getISODate(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// Sprint TZ — local 日付規約のユーティリティ
//
// 規約: DB の timestamp (started_at / logged_at / achieved_at 等) は常に
// UTC ISO (toISOString) で**保存**し、「今日」「その日」の判定・集計・表示は
// 常に**ユーザーの local 日付**で行う。
//   - 「今日」の唯一の定義 = getISODate() (local)
//   - UTC ISO → 日付化は localDateOf() (toISOString().slice(0,10) は UTC 日付に
//     なるため禁止 — JST では 00:00-08:59 が前日にズレる)
//   - SQL で「その local 日 / 月」に絞る場合は localDayUtcRange /
//     localMonthUtcRange の UTC instant 半開区間を ISO-to-ISO で比較する
//     (weeklyReport / volumeLandmark で確立済みのパターン。SQLite の
//     date()/localtime には依存しない — index も効く)
// ---------------------------------------------------------------------------

/** UTC ISO timestamp → その instant の local 'yyyy-MM-dd'。 */
export function localDateOf(utcIso: string): string {
  return format(parseISO(utcIso), 'yyyy-MM-dd');
}

export interface UtcRange {
  /** 区間開始 (含む) の UTC ISO */
  startIso: string;
  /** 区間終了 (含まない) の UTC ISO */
  endIso: string;
}

/** local 'yyyy-MM-dd' の1日を UTC instant の半開区間 [start, end) で返す。 */
export function localDayUtcRange(localDate: string): UtcRange {
  // 'T00:00:00' (Z なし) は JS Date 仕様で local midnight として解釈される
  const start = new Date(`${localDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** local 'yyyy-MM' の1ヶ月を UTC instant の半開区間 [start, end) で返す。 */
export function localMonthUtcRange(monthPrefix: string): UtcRange {
  const start = new Date(`${monthPrefix}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
