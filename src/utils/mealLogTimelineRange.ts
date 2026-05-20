import { getISODate } from './format';

// v1.5 Phase 2.4 Sprint 2.4.4 — timeline-scope → ISO-date list.
//
// `today` / `yesterday` return a single-element list; `week` returns
// the rolling last-7-days set (oldest → newest) so the timeline view
// can iterate them in chronological order. Pure helper so jest can
// pin the range arithmetic without spinning up TanStack Query.

export type TimelineScope = 'today' | 'yesterday' | 'week';

export function mealLogTimelineDates(
  scope: TimelineScope,
  now: Date = new Date(),
): string[] {
  switch (scope) {
    case 'today':
      return [getISODate(now)];
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return [getISODate(yesterday)];
    }
    case 'week': {
      // 7 days inclusive of today, oldest first
      const out: string[] = [];
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        out.push(getISODate(d));
      }
      return out;
    }
  }
}
