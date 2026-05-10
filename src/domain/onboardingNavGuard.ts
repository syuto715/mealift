// v1.3.0 / Onboarding v2 / Phase A-6 — abandon-dialog gating helper.
//
// Pure logic extracted from ProgressHeader so the boundary is
// testable without rendering. The component imports + uses this
// helper internally; the test imports it directly without dragging
// in react-native (which jest's CJS runtime can't currently parse —
// Build 15+ TODO 12 tracks the missing jest-expo preset).

// Kickoff §A-6 §3 sign-off: at or above 50% progress, back
// navigation switches from immediate to confirm-via-dialog
// (boundary inclusive — the right after the halfway screen submits
// the dialog kicks in). Below this point, the user has invested
// little enough that an accidental tap costs almost nothing to
// redo. Above, the AbandonDialog body promises the in-progress
// data is preserved (Phase A-5 incremental save).
export const ABANDON_THRESHOLD = 0.5;

export function shouldShowAbandonDialog(
  currentStep: number,
  totalSteps: number,
): boolean {
  // Defensive: a degenerate `totalSteps <= 0` (route outside the
  // ONBOARDING_ROUTES table fallback path) shouldn't block back
  // navigation behind a confirm dialog.
  if (totalSteps <= 0) return false;
  return currentStep / totalSteps >= ABANDON_THRESHOLD;
}
