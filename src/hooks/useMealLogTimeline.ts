import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useProfileStore } from '../stores/profileStore';
import {
  mealLogTimelineDates,
  type TimelineScope,
} from '../utils/mealLogTimelineRange';
import { getDailyNutritionSummary } from '../infra/repositories/nutritionRepository';
import type { DailyNutritionSummary } from '../types/nutrition';

// v1.5 Phase 2.4 Sprint 2.4.4 — meal-log timeline read hook.
//
// Wraps `nutritionRepository.getDailyNutritionSummary` for the
// timeline-scoped read path (today / yesterday / week). The
// repository call already aggregates one day's PFC + extended
// nutrients + per-meal grouping; the hook fans out to N dates for
// the week scope and returns the per-day list in chronological
// order so the UI can render daily cards without further sorting.
//
// `enabled` is gated on `profile.id` so the hook is safe to mount
// before profile bootstrap completes. `staleTime` 60s keeps the
// view responsive without re-running the SQLite query on every
// re-render; `useAddMealLog` already invalidates this key after a
// snapshot insert so freshness is preserved on user writes.

export const MEAL_LOG_TIMELINE_QUERY_KEY = 'mealLogTimeline' as const;

export interface UseMealLogTimelineResult {
  summaries: DailyNutritionSummary[];
  dates: string[];
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  query: UseQueryResult<DailyNutritionSummary[]>;
}

export function useMealLogTimeline(
  scope: TimelineScope = 'today',
): UseMealLogTimelineResult {
  const profileId = useProfileStore((s) => s.profile?.id ?? null);
  const dates = mealLogTimelineDates(scope);

  const tanstackQuery = useQuery({
    queryKey: [MEAL_LOG_TIMELINE_QUERY_KEY, profileId, scope, dates] as const,
    queryFn: async () => {
      if (!profileId) return [];
      const summaries = await Promise.all(
        dates.map((date) => getDailyNutritionSummary(profileId, date)),
      );
      return summaries;
    },
    enabled: profileId != null,
    staleTime: 60 * 1000,
  });

  return {
    summaries: tanstackQuery.data ?? [],
    dates,
    isFetching: tanstackQuery.isFetching,
    isError: tanstackQuery.isError,
    error: tanstackQuery.error,
    refetch: () => { void tanstackQuery.refetch(); },
    query: tanstackQuery,
  };
}
