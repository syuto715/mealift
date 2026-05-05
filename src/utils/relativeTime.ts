// Relative-time formatter used by the sync screen. Pure function so
// the timezone-sensitive logic can be jest-tested without faking the
// system clock. `now` is injected for determinism; production callers
// pass Date.now().

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(
  timestamp: number | null,
  now: number = Date.now(),
): string {
  if (timestamp === null) return '未同期';
  const diff = now - timestamp;
  if (diff < 0) return 'たった今';
  if (diff < MINUTE) return 'たった今';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 時間前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 日前`;
  // Cap at 30 days — older "last sync" implies the sync layer is
  // broken or never ran. UI should re-render this as a strong warning
  // rather than continuing to count up the day count.
  return '30日以上前';
}
