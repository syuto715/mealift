// v1.3.0 / Onboarding v2 / Phase D-6 — pure-helper tests for the
// [10] motivation screen.

import {
  formatAchievementDateLabel,
  getMaintenanceDateLabel,
  getMotivationCopyForGoal,
  getRecompDateLabel,
} from '../motivationCopyResolver';

// ---------------------------------------------------------------------------
// getMotivationCopyForGoal
// ---------------------------------------------------------------------------

describe('getMotivationCopyForGoal', () => {
  it('returns non-empty title + body for each of the 4 goalTypes', () => {
    const goals = ['cut', 'maintain', 'bulk', 'recomp'] as const;
    for (const g of goals) {
      const copy = getMotivationCopyForGoal(g);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });

  it('titles are distinct across goalTypes (no copy-paste collisions)', () => {
    const goals = ['cut', 'maintain', 'bulk', 'recomp'] as const;
    const titles = goals.map((g) => getMotivationCopyForGoal(g).title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('bodies are distinct across goalTypes', () => {
    const goals = ['cut', 'maintain', 'bulk', 'recomp'] as const;
    const bodies = goals.map((g) => getMotivationCopyForGoal(g).body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('cut copy mentions weight-reduction context', () => {
    expect(getMotivationCopyForGoal('cut').body).toMatch(/減量|脂肪|軽く/);
  });

  it('bulk copy mentions muscle-gain context', () => {
    expect(getMotivationCopyForGoal('bulk').body).toMatch(/筋肉|増/);
  });

  it('recomp copy mentions composition shift (muscle + fat together)', () => {
    expect(getMotivationCopyForGoal('recomp').body).toMatch(/筋肉/);
    expect(getMotivationCopyForGoal('recomp').body).toMatch(/脂肪/);
  });
});

// ---------------------------------------------------------------------------
// formatAchievementDateLabel
// ---------------------------------------------------------------------------

describe('formatAchievementDateLabel', () => {
  it('returns JP-formatted date + week count', () => {
    // Use local-time constructor to stay TZ-stable (C-3 precedent).
    const date = new Date(2026, 7, 15);
    const out = formatAchievementDateLabel(date, 14);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/8/); // month (toLocaleDateString form varies)
    expect(out).toMatch(/15/);
    expect(out).toMatch(/14/);
    expect(out).toMatch(/週/);
  });

  it('returns date-only label when weeks <= 0', () => {
    const date = new Date(2026, 7, 15);
    const out = formatAchievementDateLabel(date, 0);
    expect(out).toMatch(/2026/);
    expect(out).not.toMatch(/週/);
  });

  it('returns fallback for invalid Date', () => {
    expect(formatAchievementDateLabel(new Date(NaN), 14)).toBe(
      '達成日 未確定',
    );
  });

  it('returns date-only when weeks is non-finite', () => {
    const date = new Date(2026, 7, 15);
    expect(formatAchievementDateLabel(date, NaN)).not.toMatch(/週/);
  });
});

// ---------------------------------------------------------------------------
// getMaintenanceDateLabel
// ---------------------------------------------------------------------------

describe('getMaintenanceDateLabel', () => {
  it('returns non-empty fallback for maintain goalType (no schedule)', () => {
    const out = getMaintenanceDateLabel();
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/維持|現状/);
  });
});

// ---------------------------------------------------------------------------
// getRecompDateLabel — Codex pass 1 / Important regression
// ---------------------------------------------------------------------------

describe('getRecompDateLabel', () => {
  it('returns non-empty recomp-specific fallback', () => {
    const out = getRecompDateLabel();
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/体組成/);
  });

  // Distinct from maintain copy per the D-1 precedent — both
  // goalTypes have direction='maintain' (target ≈ current) so
  // calculateGoalSummary returns null for both, but the display
  // copy must differentiate. Pin so a future merge can't silently
  // collapse them back together.
  it('is distinct from getMaintenanceDateLabel', () => {
    expect(getRecompDateLabel()).not.toBe(getMaintenanceDateLabel());
  });
});
