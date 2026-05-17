// v1.5 Stage 1 Phase 1.4 — period_start computation in the user's
// profile timezone (S1 resolution, §5.1.2).
//
// The `coach_advice` table keys advice rows by (user_id, scope,
// period_start). `period_start` is a DATE column whose value is
// computed in the user's profile timezone:
//   - 'daily'  → today's date in profile tz
//   - 'weekly' → Monday-of-week date in profile tz
//
// Deno provides `Intl.DateTimeFormat` with `timeZone` option; we
// use the 'en-CA' locale because it formats as YYYY-MM-DD which
// matches Postgres's DATE literal exactly.

export type AdviceScope = 'daily' | 'weekly';

interface Parts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: string; // 'Mon', 'Tue', ...
}

function getZonedParts(now: Date, timezone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  let year = 0;
  let month = 0;
  let day = 0;
  let weekday = 'Mon';
  for (const p of parts) {
    if (p.type === 'year') year = Number.parseInt(p.value, 10);
    else if (p.type === 'month') month = Number.parseInt(p.value, 10);
    else if (p.type === 'day') day = Number.parseInt(p.value, 10);
    else if (p.type === 'weekday') weekday = p.value;
  }
  return { year, month, day, weekday };
}

function isoDate(parts: { year: number; month: number; day: number }): string {
  const yyyy = String(parts.year).padStart(4, '0');
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Weekday short-name → ISO weekday index (Mon=1, Sun=7). The
// Intl.DateTimeFormat with locale 'en-CA' emits English short
// names so this map is stable.
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Compute `period_start` (YYYY-MM-DD in profile tz) for the given
 *  scope at the given moment. Falls back to the device's local
 *  date if `timezone` is unknown (rare; profiles default to
 *  'Asia/Tokyo'). */
export function computePeriodStart(
  scope: AdviceScope,
  now: Date,
  timezone: string,
): string {
  let parts: Parts;
  try {
    parts = getZonedParts(now, timezone);
  } catch {
    // Invalid timezone — fall back to Asia/Tokyo so the EF still
    // returns a deterministic bucket key. Mirrors the SQLite v31
    // migration's default.
    parts = getZonedParts(now, 'Asia/Tokyo');
  }

  if (scope === 'daily') {
    return isoDate(parts);
  }

  // Weekly: roll back to the most recent Monday in the same tz.
  // The `weekday` field is the day-of-week AT the zoned date; we
  // subtract (weekdayIndex - 1) days. Subtracting in UTC ms is
  // safe because we're moving by 24h multiples — DST transitions
  // affect wall-clock midnight but not the calendar day count
  // between two dates in the same tz.
  const weekdayIndex = WEEKDAY_TO_INDEX[parts.weekday] ?? 1;
  const daysBack = weekdayIndex - 1;
  if (daysBack === 0) return isoDate(parts);

  // Build a UTC midnight from the zoned date, then subtract the
  // day delta, then convert back to the zoned date.
  const zonedNoon = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const back = new Date(zonedNoon - daysBack * DAY_MS);
  const backParts = getZonedParts(back, timezone);
  return isoDate(backParts);
}
