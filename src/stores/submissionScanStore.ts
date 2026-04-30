import { create } from 'zustand';
import type { ParsedNutritionLabel } from '../domain/submission/nutritionLabelParser';

// One-shot handoff store for submission-flow capture screens.
//
// expo-router doesn't have a clean "return a value from a child screen"
// primitive: `router.setParams` only updates the current route, and
// `router.replace` to the form re-mounts and loses all form state.
// A tiny Zustand store sidesteps both issues — the scanner sets the
// value, navigates back, and the form picks it up via useEffect on
// mount/focus, then clears it.
//
// Two channels:
//   - pendingBarcode    — the barcode scanner writes here
//   - pendingOcrResult  — the OCR scanner writes here (Part 5)

interface SubmissionScanState {
  pendingBarcode: string | null;
  setPendingBarcode: (value: string) => void;
  // Returns the pending value AND clears it atomically. Designed so
  // the form consumes the value exactly once even if the effect runs
  // twice (StrictMode, fast refresh).
  consumePendingBarcode: () => string | null;

  pendingOcrResult: ParsedNutritionLabel | null;
  setPendingOcrResult: (value: ParsedNutritionLabel) => void;
  consumePendingOcrResult: () => ParsedNutritionLabel | null;
}

export const useSubmissionScanStore = create<SubmissionScanState>((set, get) => ({
  pendingBarcode: null,
  setPendingBarcode: (value) => set({ pendingBarcode: value }),
  consumePendingBarcode: () => {
    const value = get().pendingBarcode;
    if (value !== null) set({ pendingBarcode: null });
    return value;
  },

  pendingOcrResult: null,
  setPendingOcrResult: (value) => set({ pendingOcrResult: value }),
  consumePendingOcrResult: () => {
    const value = get().pendingOcrResult;
    if (value !== null) set({ pendingOcrResult: null });
    return value;
  },
}));
