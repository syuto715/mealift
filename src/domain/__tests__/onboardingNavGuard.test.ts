// v1.3.0 / Onboarding v2 / Phase A-6 — pure-helper tests for the
// abandon-dialog gating logic.

import {
  shouldShowAbandonDialog,
  ABANDON_THRESHOLD,
} from '../onboardingNavGuard';

describe('shouldShowAbandonDialog', () => {
  it('exposes ABANDON_THRESHOLD as 0.5 (kickoff §A-6 §3)', () => {
    expect(ABANDON_THRESHOLD).toBe(0.5);
  });

  it('returns false below the 50% threshold (early-flow exit, no confirm)', () => {
    expect(shouldShowAbandonDialog(1, 14)).toBe(false); // 7%
    expect(shouldShowAbandonDialog(3, 14)).toBe(false); // 21%
    expect(shouldShowAbandonDialog(6, 14)).toBe(false); // 43%
  });

  it('returns true at exactly 50% (boundary inclusive)', () => {
    expect(shouldShowAbandonDialog(7, 14)).toBe(true); // 50%
    expect(shouldShowAbandonDialog(5, 10)).toBe(true);
  });

  it('returns true above the 50% threshold (mid/late flow guards data)', () => {
    expect(shouldShowAbandonDialog(8, 14)).toBe(true); // 57%
    expect(shouldShowAbandonDialog(13, 14)).toBe(true); // 93%
  });

  it('handles iOS 15-step total without drift', () => {
    expect(shouldShowAbandonDialog(7, 15)).toBe(false); // 47%
    expect(shouldShowAbandonDialog(8, 15)).toBe(true); // 53%
    expect(shouldShowAbandonDialog(15, 15)).toBe(true);
  });

  it('returns false defensively when totalSteps is 0 or negative', () => {
    // Degenerate inputs (currentRoute outside the table → step=1
    // fallback in _layout.tsx + a future bug that miscomputes total).
    // Should NOT block back navigation behind a confirm dialog.
    expect(shouldShowAbandonDialog(1, 0)).toBe(false);
    expect(shouldShowAbandonDialog(5, -3)).toBe(false);
  });
});
