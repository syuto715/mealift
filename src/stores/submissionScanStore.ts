import { create } from 'zustand';

// One-shot handoff store for the submission flow's barcode scanner.
//
// expo-router doesn't have a clean "return a value from a child screen"
// primitive: `router.setParams` only updates the current route, and
// `router.replace` to the form re-mounts and loses all form state.
// A tiny Zustand store sidesteps both issues — the scanner sets the
// value, navigates back, and the form picks it up via useEffect on
// mount/focus, then clears it.
//
// Scoped to barcode capture only. If OCR or other capture flows need
// the same pattern in the future, generalize then; not preempting now.

interface SubmissionScanState {
  pendingBarcode: string | null;
  setPendingBarcode: (value: string) => void;
  // Returns the pending value AND clears it atomically. Designed so
  // the form consumes the value exactly once even if the effect runs
  // twice (StrictMode, fast refresh).
  consumePendingBarcode: () => string | null;
}

export const useSubmissionScanStore = create<SubmissionScanState>((set, get) => ({
  pendingBarcode: null,
  setPendingBarcode: (value) => set({ pendingBarcode: value }),
  consumePendingBarcode: () => {
    const value = get().pendingBarcode;
    if (value !== null) set({ pendingBarcode: null });
    return value;
  },
}));
