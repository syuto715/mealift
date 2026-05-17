// v1.5 Stage 1 Phase 1.4 — tzPeriod tests.
//
// The implementation lives in
// `supabase/functions/_shared/tzPeriod.ts` (Deno-side EF helper).
// We re-export a Node-compatible copy of the same logic into
// `src/domain/tzPeriod.ts` so the math can be exercised under Jest
// — both runtimes share `Intl.DateTimeFormat`, so the test asserts
// the algorithm, not a Deno-specific quirk.

import { computePeriodStart } from '../tzPeriod';

describe('computePeriodStart', () => {
  // 2026-05-17 (Sunday) at midnight Asia/Tokyo == 2026-05-16 15:00 UTC.
  const SUNDAY_TOKYO = new Date('2026-05-17T00:00:00+09:00');
  // 2026-05-13 (Wednesday) noon Asia/Tokyo.
  const WED_TOKYO = new Date('2026-05-13T12:00:00+09:00');

  describe('daily', () => {
    it('returns the zoned date for Asia/Tokyo', () => {
      expect(computePeriodStart('daily', SUNDAY_TOKYO, 'Asia/Tokyo')).toBe(
        '2026-05-17',
      );
    });

    it('crosses the date line for America/Los_Angeles (-7 from UTC)', () => {
      // Same instant: SUNDAY_TOKYO == 2026-05-16 15:00 UTC == 2026-05-16 08:00 PDT.
      expect(
        computePeriodStart('daily', SUNDAY_TOKYO, 'America/Los_Angeles'),
      ).toBe('2026-05-16');
    });
  });

  describe('weekly', () => {
    it('rolls a Sunday back to the Monday of the same week (ISO week)', () => {
      expect(computePeriodStart('weekly', SUNDAY_TOKYO, 'Asia/Tokyo')).toBe(
        '2026-05-11',
      );
    });

    it('returns Monday unchanged when called on a Monday', () => {
      const MONDAY = new Date('2026-05-11T08:00:00+09:00');
      expect(computePeriodStart('weekly', MONDAY, 'Asia/Tokyo')).toBe(
        '2026-05-11',
      );
    });

    it('rolls a Wednesday back to the same-week Monday', () => {
      expect(computePeriodStart('weekly', WED_TOKYO, 'Asia/Tokyo')).toBe(
        '2026-05-11',
      );
    });

    it('respects timezone when picking the Monday', () => {
      // Just past midnight Tokyo Sunday (2026-05-17 00:30 +09:00) ==
      // Saturday 2026-05-16 15:30 UTC == Saturday 08:30 PDT. In PDT
      // we're still on Saturday, so the same-week Monday is
      // 2026-05-11 in BOTH zones — but the date the call reports
      // for "today" differs by one day.
      const justPastMidnightTokyo = new Date('2026-05-17T00:30:00+09:00');
      expect(
        computePeriodStart('weekly', justPastMidnightTokyo, 'Asia/Tokyo'),
      ).toBe('2026-05-11');
      expect(
        computePeriodStart(
          'weekly',
          justPastMidnightTokyo,
          'America/Los_Angeles',
        ),
      ).toBe('2026-05-11');
    });
  });

  it('falls back to Asia/Tokyo when the timezone is invalid', () => {
    // The implementation catches the Intl.DateTimeFormat throw and
    // retries with 'Asia/Tokyo'. Asserts the fallback is wired.
    expect(
      computePeriodStart('daily', SUNDAY_TOKYO, 'Definitely/Not/A/Zone'),
    ).toBe('2026-05-17');
  });
});
