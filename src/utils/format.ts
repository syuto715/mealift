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
