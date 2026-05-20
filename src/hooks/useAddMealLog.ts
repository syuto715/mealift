import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNutrition } from './useNutrition';
import { useUIStore } from '../stores/uiStore';
import { searchIndexToMealLogItem } from '../utils/searchIndexToMealLogItem';
import { detectMealTypeByTime } from '../utils/detectMealTypeByTime';
import {
  getDetailByRef,
  incrementSearchIndexUseCount,
  type SearchIndexHit,
} from '../infra/repositories/searchIndexRepository';
import type { MealType } from '../types/common';

// v1.5 Phase 2.4 Sprint 2.4.1 — quick-log writer.
//
// Wraps `useNutrition.addFood` (the established production-stable
// meal-log entry point — signature unchanged in this sprint) with
// the search-result → snapshot adapter so a `/nutrition/search-v2`
// row tap can land directly in today's meal log without touching
// the v1 schema.
//
// Drafting 161 (production safety + dev preview parallel): the
// underlying `useNutrition` hook is the same one production
// `nutrition/search.tsx` already uses. We only add a new caller
// path, never modify the contract.
//
// Drafting 166 (point-in-time snapshot): the nutrition values
// embedded in `meal_log_items` come from the search_index row's
// `nutrition_json` at selection time; a future re-seed of the
// index never mutates past entries.

interface AddMealLogOptions {
  mealType?: MealType;
  servingAmount?: number;
  note?: string | null;
}

export function useAddMealLog() {
  const { addFood } = useNutrition();
  const showToast = useUIStore((s) => s.showToast);
  const queryClient = useQueryClient();

  return useCallback(
    async (hit: SearchIndexHit, options: AddMealLogOptions = {}) => {
      try {
        const detail = await getDetailByRef(hit.sourceType, hit.sourceId);
        if (!detail) {
          showToast('該当する栄養データが見つかりませんでした', 'error');
          return;
        }
        const item = searchIndexToMealLogItem(detail, {
          servingAmount: options.servingAmount,
          note: options.note,
        });
        const mealType = options.mealType ?? detectMealTypeByTime();
        await addFood(mealType, item);

        // Sprint 2.4.3 — best-effort use_count bump for the
        // 'use_count_desc' sort axis (Drafting 162). Failures here
        // are deliberately non-fatal: the meal log already landed,
        // and the sort metric is a soft hint, not a correctness
        // invariant. We still log in dev so drift is visible.
        try {
          await incrementSearchIndexUseCount(hit.sourceType, hit.sourceId);
          // Invalidate the unified search list so the next render
          // reflects the new use_count (the dedicated favorite query
          // is untouched; only the bm25-or-use_count-sorted list
          // benefits from refetch).
          void queryClient.invalidateQueries({ queryKey: ['searchFoodItems'] });
        } catch (incErr) {
          if (__DEV__) console.warn('[useAddMealLog] use_count bump failed', incErr);
        }

        // Sprint 2.4.4 — invalidate the meal-log timeline read path
        // so the new snapshot row surfaces on the timeline screen
        // without a manual refresh. Independent of the use_count
        // bump above (the snapshot insert is the strict event).
        void queryClient.invalidateQueries({ queryKey: ['mealLogTimeline'] });

        showToast(`${detail.nameJa} をミールログに追加しました`, 'success');
      } catch (e) {
        showToast('ミールログ追加に失敗しました', 'error');
        if (__DEV__) console.warn('[useAddMealLog]', e);
      }
    },
    [addFood, showToast, queryClient],
  );
}
