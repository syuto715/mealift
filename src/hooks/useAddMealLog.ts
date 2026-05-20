import { useCallback } from 'react';
import { useNutrition } from './useNutrition';
import { useUIStore } from '../stores/uiStore';
import { searchIndexToMealLogItem } from '../utils/searchIndexToMealLogItem';
import { detectMealTypeByTime } from '../utils/detectMealTypeByTime';
import {
  getDetailByRef,
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
        showToast(`${detail.nameJa} をミールログに追加しました`, 'success');
      } catch (e) {
        showToast('ミールログ追加に失敗しました', 'error');
        if (__DEV__) console.warn('[useAddMealLog]', e);
      }
    },
    [addFood, showToast],
  );
}
