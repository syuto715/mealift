// v1.3.0 / Onboarding v2 / Phase D-9 — pure-helper tests for the
// [12.5] tier-preview promotional screen.

import {
  PLUS_FEATURES,
  TRIAL_DURATION_DAYS,
  getTrialCopy,
  getTrialSubcopy,
} from '../tierPreviewUtils';

// ---------------------------------------------------------------------------
// PLUS_FEATURES — sign-off content pin
// ---------------------------------------------------------------------------

describe('PLUS_FEATURES', () => {
  it('exposes 4 feature highlights (single-screen fit on iPhone SE)', () => {
    expect(PLUS_FEATURES.length).toBe(4);
  });

  it('every feature has non-empty title + description + icon', () => {
    for (const feature of PLUS_FEATURES) {
      expect(feature.title.length).toBeGreaterThan(0);
      expect(feature.description.length).toBeGreaterThan(0);
      expect(feature.icon.length).toBeGreaterThan(0);
    }
  });

  it('titles are distinct (no copy-paste collisions)', () => {
    const titles = PLUS_FEATURES.map((f) => f.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('descriptions are distinct', () => {
    const descs = PLUS_FEATURES.map((f) => f.description);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it('icons drawn from the curated Ionicons palette', () => {
    // Pattern 11 redundant encoding — icons must be in the
    // sanctioned set so the JP-only marketing copy never
    // surfaces a UI bug from a missing glyph.
    const allowedIcons = [
      'sparkles-outline',
      'nutrition-outline',
      'barbell-outline',
      'trending-up-outline',
    ];
    for (const feature of PLUS_FEATURES) {
      expect(allowedIcons).toContain(feature.icon);
    }
  });
});

// ---------------------------------------------------------------------------
// getTrialCopy + getTrialSubcopy
// ---------------------------------------------------------------------------

describe('getTrialCopy', () => {
  it('references the TRIAL_DURATION_DAYS canonical constant', () => {
    // Pattern 18 SSoT — same constant subscriptionService.
    // derivePlanSnapshot uses for trial-end-date math. Pin so a
    // promotional 14-day push that updates the constant updates
    // the screen copy automatically.
    expect(getTrialCopy()).toMatch(String(TRIAL_DURATION_DAYS));
    expect(getTrialCopy()).toMatch(/日間無料トライアル/);
  });

  it('TRIAL_DURATION_DAYS = 7 (pinned by sign-off § Phase D-9)', () => {
    expect(TRIAL_DURATION_DAYS).toBe(7);
  });
});

describe('getTrialSubcopy', () => {
  it('mentions cancellable trait (explicit opt-in copy)', () => {
    // User-memory contract: trial must NEVER auto-grant; copy
    // surfaces the cancellable commitment shape before the user
    // taps the Plus CTA.
    const sub = getTrialSubcopy();
    expect(sub.length).toBeGreaterThan(0);
    expect(sub).toMatch(/キャンセル|いつでも/);
  });
});
