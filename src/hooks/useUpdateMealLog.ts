import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../stores/uiStore';
import { updateMealLogItem } from '../infra/repositories/nutritionRepository';
import { scaleMealLogItemPortion } from '../utils/scaleMealLogItemNutrition';
import type { MealLogItem } from '../types/nutrition';

// v1.5 Phase 2.4 Sprint 2.4.5 — meal-log row portion edit.
//
// Wraps `nutritionRepository.updateMealLogItem` (existing
// production API, signature unchanged — Drafting 161) with the
// portion re-scale and the meal-log cache invalidation.
//
// Drafting 166 alignment: scaling the snapshot is a user edit,
// not a master-update propagation; the immutability invariant
// covers external refreshes, not the user's own corrections.
//
// Drafting 168 alignment: this hook does NOT bump
// `search_index.use_count`. Edits aren't fresh selections, and
// the counter is monotonic by design (deletes also don't
// decrement). The first selection from search bumps once via
// `useAddMealLog`; subsequent edits / deletes leave the metric
// alone so a popular item doesn't lose rank when the user
// corrects a typo.

export function useUpdateMealLogPortion() {
  const queryClient = useQueryClient();
  const showToast = useUIStore((s) => s.showToast);

  return useCallback(
    async (item: MealLogItem, newServingAmount: number) => {
      try {
        if (!Number.isFinite(newServingAmount) || newServingAmount <= 0) {
          showToast('量は 0 より大きい値を入力してください', 'error');
          return;
        }
        const scaled = scaleMealLogItemPortion(item, newServingAmount);
        await updateMealLogItem(item.id, scaled);
        void queryClient.invalidateQueries({ queryKey: ['mealLogTimeline'] });
        showToast('数量を更新しました', 'success');
      } catch (e) {
        showToast('更新に失敗しました', 'error');
        if (__DEV__) console.warn('[useUpdateMealLogPortion]', e);
      }
    },
    [queryClient, showToast],
  );
}
