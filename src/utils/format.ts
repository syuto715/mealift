import { format, formatDistanceToNow, isToday, isYesterday, parseISO, subDays } from 'date-fns';
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

// S4.6-C — 日本語の表示フォーマッタ (表示専用の追加。getISODate /
// localDateOf 等の TZ 規約ユーティリティ・データキーには触れない)。
// 当年は年を省略する (「8月17日」/「2025年12月31日」)。now はテスト注入用。

/** 日付の日本語表示。'yyyy-MM-dd' 文字列 (parseISO = local midnight、
 *  new Date('yyyy-MM-dd') の UTC midnight 事故を避ける) と Date を受ける。
 *  不正な文字列は入力をそのまま返す防御。 */
export function formatDateJa(
  date: string | Date,
  now: Date = new Date(),
): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (Number.isNaN(d.getTime())) {
    return typeof date === 'string' ? date : '';
  }
  const pattern =
    d.getFullYear() === now.getFullYear() ? 'M月d日' : 'yyyy年M月d日';
  return format(d, pattern, { locale: ja });
}

/** UTC timestamp の日本語日時表示 (秒なし)。DB 由来の表記は 'Z'・'+00:00'・
 *  naive space 形式が混在し得るため、localDateOf と同じ規約で TZ 指定なし
 *  入力を UTC として正規化してから local 表示する。不正形式は入力を
 *  そのまま返す防御。 */
export function formatDateTimeJa(
  utcIso: string,
  now: Date = new Date(),
): string {
  const trimmed = utcIso.trim();
  const hasTz = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const normalized = hasTz ? trimmed : `${trimmed.replace(' ', 'T')}Z`;
  const d = parseISO(normalized);
  if (Number.isNaN(d.getTime())) return trimmed;
  const pattern =
    d.getFullYear() === now.getFullYear()
      ? 'M月d日 HH:mm'
      : 'yyyy年M月d日 HH:mm';
  return format(d, pattern, { locale: ja });
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
//     localMonthUtcRange の UTC instant 半開区間で比較する (weeklyReport /
//     volumeLandmark で確立済みのパターン。localtime 修飾子には依存しない)
//   - timestamp 列との比較・ORDER BY は `datetime(col)` で正規化する —
//     sync pull 由来の行は '+00:00'・naive space 形式等が混在し得て、生の字句
//     比較では時系列順にならない。datetime() は index range を使えないが、
//     個人スケールのテーブルでは正しさを優先する (日次系は旧 date() も
//     非 index。rolling 窓のみ raw 比較からの perf トレードだが許容)
// ---------------------------------------------------------------------------

/** UTC ISO timestamp → その instant の local 'yyyy-MM-dd'。
 *  DB の timestamp は全て UTC 意図 (toISOString / datetime('now') / server
 *  timestamptz)。ただし表記は 'Z'・'+00:00'・naive space 形式が混在し得る —
 *  naive 形式を parseISO に直接渡すと **local time として誤解釈**されるため、
 *  timezone 指定のない入力は UTC として正規化してから parse する。
 *  不正形式は UTC date 部への fallback (throw で画面を壊さない防御)。 */
export function localDateOf(utcIso: string): string {
  const trimmed = utcIso.trim();
  // 'Z' またはオフセット (+09:00 / +0000) が無ければ UTC の naive 表記とみなす
  const hasTz = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const normalized = hasTz ? trimmed : `${trimmed.replace(' ', 'T')}Z`;
  const d = parseISO(normalized);
  if (Number.isNaN(d.getTime())) {
    return trimmed.slice(0, 10);
  }
  return format(d, 'yyyy-MM-dd');
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

/** 「直近 N 日」(今日を含む N 個の local 日) の窓開始 instant。
 *  cutoff 日の local 0:00 起点 — date 列パスの `date >= getISODate(subDays(...))`
 *  と同じカレンダー日意味論 (境界日を丸ごと含む) に揃える。 */
export function localDaysAgoStartIso(days: number, now: Date = new Date()): string {
  return localDayUtcRange(getISODate(subDays(now, days))).startIso;
}
