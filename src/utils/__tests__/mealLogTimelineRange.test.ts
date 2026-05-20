import { mealLogTimelineDates } from '../mealLogTimelineRange';

const ANCHOR = new Date('2026-05-21T12:00:00+09:00');

describe('mealLogTimelineDates (Sprint 2.4.4)', () => {
  it("returns a single ISO date for 'today'", () => {
    const out = mealLogTimelineDates('today', ANCHOR);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns yesterday's date for 'yesterday'", () => {
    const today = mealLogTimelineDates('today', ANCHOR)[0];
    const yesterday = mealLogTimelineDates('yesterday', ANCHOR)[0];
    expect(yesterday).not.toBe(today);
    // chronological — yesterday < today as ISO strings
    expect(yesterday < today).toBe(true);
  });

  it("returns 7 dates ending at today for 'week'", () => {
    const week = mealLogTimelineDates('week', ANCHOR);
    expect(week).toHaveLength(7);
    expect(week[week.length - 1]).toBe(mealLogTimelineDates('today', ANCHOR)[0]);
  });

  it('week list is sorted oldest → newest', () => {
    const week = mealLogTimelineDates('week', ANCHOR);
    for (let i = 1; i < week.length; i += 1) {
      expect(week[i - 1] <= week[i]).toBe(true);
    }
  });

  it('handles month boundary correctly for yesterday', () => {
    const firstOfMonth = new Date('2026-06-01T12:00:00+09:00');
    const yesterday = mealLogTimelineDates('yesterday', firstOfMonth)[0];
    expect(yesterday).toMatch(/^2026-05-3\d$/);
  });
});
