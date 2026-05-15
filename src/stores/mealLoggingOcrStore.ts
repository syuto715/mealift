import { create } from 'zustand';
import type { ParsedNutritionLabel } from '../domain/submission/nutritionLabelParser';
import type { RecipeDecomposition } from '../infra/services/aiNutritionService';

// v1.4 ステージ 4 Phase 4D + 4E-1 — meal-logging OCR + Vision handoff store.
//
// Two independent channels:
//   - `pendingResult`        ParsedNutritionLabel | null  (OCR, Phase 4D)
//   - `pendingVisionResult`  RecipeDecomposition | null   (Vision, Phase 4E-1)
//
// The channels are kept separate (judgment α in Turn 2 recon) because
// the source shapes do not converge cleanly:
//   - ParsedNutritionLabel = nutrient values + perBasis (OCR semantics)
//   - RecipeDecomposition  = dishName + servingDescription + ingredients
//                            (Vision semantics, no native nutrient values
//                             in v1.4 scaffold)
// Mapping Vision into ParsedNutritionLabel would drop dishName /
// ingredients / servingDescription on the floor, so we keep both
// shapes alive and let `add.tsx` discriminate on which channel fired.
//
// Why both live on the same store rather than two parallel zustand
// instances (judgment β rejected): atomic consume semantics. If OCR
// and Vision were in different stores, a stale producer on one side
// could survive across a focus cycle that consumed the other.
// Co-located clear lets add.tsx's useFocusEffect drain both in one
// pass without coordinating two consumers.
//
// consume = atomic read + clear, StrictMode / fast refresh safe.
//
// Patterns:
//   #18 SSoT — meal-logging handoff path 一元 (OCR + Vision 共通 channel)
//   #25 helper-thick — Zustand store、 React 依存なし、 jest 1-zone testable

interface MealLoggingOcrState {
  pendingResult: ParsedNutritionLabel | null;
  setPendingResult: (value: ParsedNutritionLabel) => void;
  consumePendingResult: () => ParsedNutritionLabel | null;
  clearPendingResult: () => void;
  // Vision channel (Phase 4E-1).
  pendingVisionResult: RecipeDecomposition | null;
  setPendingVisionResult: (value: RecipeDecomposition) => void;
  consumePendingVisionResult: () => RecipeDecomposition | null;
  clearPendingVisionResult: () => void;
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
    pendingVisionResult: null,
    setPendingVisionResult: (value) => set({ pendingVisionResult: value }),
    consumePendingVisionResult: () => {
      const value = get().pendingVisionResult;
      if (value !== null) set({ pendingVisionResult: null });
      return value;
    },
    clearPendingVisionResult: () => set({ pendingVisionResult: null }),
  }),
);
