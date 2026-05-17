// v1.5 Stage 1 Phase 1.4 — Node-side mirror of the Deno EF helper.
//
// The authoritative implementation lives at
// `supabase/functions/_shared/tzPeriod.ts` (Deno-side, called by
// the coach-advice EF). This file is a byte-for-byte copy so the
// algorithm can be exercised by Jest — both runtimes share
// `Intl.DateTimeFormat`, so the math is identical.
//
// When updating either copy, keep them in lockstep. A doc comment
// at the top of the Deno file points future maintainers here.

export type AdviceScope = 'daily' | 'weekly';

interface Parts {
  year: number;
  month: number;
  day: number;
  weekday: string;
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

export function computePeriodStart(
  scope: AdviceScope,
  now: Date,
  timezone: string,
): string {
  let parts: Parts;
  try {
    parts = getZonedParts(now, timezone);
  } catch {
    parts = getZonedParts(now, 'Asia/Tokyo');
  }

  if (scope === 'daily') {
    return isoDate(parts);
  }

  const weekdayIndex = WEEKDAY_TO_INDEX[parts.weekday] ?? 1;
  const daysBack = weekdayIndex - 1;
  if (daysBack === 0) return isoDate(parts);

  const zonedNoon = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const back = new Date(zonedNoon - daysBack * DAY_MS);
  const backParts = getZonedParts(back, timezone);
  return isoDate(backParts);
}
