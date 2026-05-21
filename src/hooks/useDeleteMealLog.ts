import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../stores/uiStore';
import { removeMealLogItem } from '../infra/repositories/nutritionRepository';

// v1.5 Phase 2.4 Sprint 2.4.5 — meal-log row delete (soft).
//
// Wraps the existing repository soft-delete (`deleted_at`
// timestamp + sync tombstone) and invalidates the timeline cache.
//
// Drafting 168 alignment: deletes do NOT decrement
// `search_index.use_count`. `use_count` is a monotonic popularity
// counter — once an item has surfaced as "used" we keep the rank
// signal even if the user later removes the snapshot row.

export function useDeleteMealLog() {
  const queryClient = useQueryClient();
  const showToast = useUIStore((s) => s.showToast);

  return useCallback(
    async (itemId: string) => {
      try {
        await removeMealLogItem(itemId);
        void queryClient.invalidateQueries({ queryKey: ['mealLogTimeline'] });
        showToast('削除しました', 'success');
      } catch (e) {
        showToast('削除に失敗しました', 'error');
        if (__DEV__) console.warn('[useDeleteMealLog]', e);
      }
    },
    [queryClient, showToast],
  );
}
