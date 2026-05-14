import { create } from 'zustand';
import type { ParsedNutritionLabel } from '../domain/submission/nutritionLabelParser';

// v1.4 ステージ 4 Phase 4D — meal-logging OCR handoff store.
//
// `submissionScanStore` (community-DB submission flow) と同型の軽量
// store、 但し独立 channel。 scan-label screen が OCR + parser を
// 実行 → pendingResult set → router.back → add.tsx (OCR tab) が
// consume + ServingQuantityModal pre-fill。
//
// submission flow と meal-logging flow を分離する理由:
//   1. 動作分岐: submission = community DB contribution、 meal-logging =
//      個人 meal_log_items insert。 副作用先が違う。
//   2. consume timing: submission は form fill だけ、 meal-logging は
//      ServingQuantityModal 経由で per-meal insert。 consume の trigger
//      タイミング違う。
//   3. concurrency: 同時 OCR 利用シナリオ (submission flow 中 + meal-
//      logging flow 中) で互いに影響しない設計。
//
// consume = atomic read + clear、 StrictMode / fast refresh で 1 度
// しか参照しない invariant 確保 (submissionScanStore.consumePending*
// と同 pattern)。
//
// Patterns:
//   #18 SSoT — meal-logging OCR の handoff path 一元
//   #25 helper-thick — Zustand store、 React 依存なし、 jest 1-zone
//       で完全 testable

interface MealLoggingOcrState {
  pendingResult: ParsedNutritionLabel | null;
  setPendingResult: (value: ParsedNutritionLabel) => void;
  // Returns the pending value AND clears it atomically.
  consumePendingResult: () => ParsedNutritionLabel | null;
  clearPendingResult: () => void;
}

export const useMealLoggingOcrStore = create<MealLoggingOcrState>(
  (set, get) => ({
    pendingResult: null,
    setPendingResult: (value) => set({ pendingResult: value }),
    consumePendingResult: () => {
      const value = get().pendingResult;
      if (value !== null) set({ pendingResult: null });
      return value;
    },
    clearPendingResult: () => set({ pendingResult: null }),
  }),
);
