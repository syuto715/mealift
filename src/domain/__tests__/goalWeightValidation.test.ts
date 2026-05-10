// v1.3.0 / Onboarding v2 / Phase C-5 — pure-helper tests for the
// [5] goal-weight + pace screen.
//
// goalWeightValidation imports onboardingCalc which transitively
// pulls workoutRepository → expo-sqlite. Mock the DB-side imports
// same as B-3 / B-4 / B-5 / C-1 / C-2 test files.
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn(),
}));
jest.mock('../../utils/id', () => ({ generateId: () => 'stub-id' }));

import {
  GOAL_TYPE_OPTIONS,
  TARGET_WEIGHT_KG_MAX,
  TARGET_WEIGHT_KG_MIN,
  calculateGoalSummary,
  filterPaceOptionsForGoalType,
  formatGoalSummary,
  getDirection,
  getGoalTypeDescription,
  getGoalTypeLabel,
  isAllInputsValidForC5,
  isGoalTypeConsistent,
  isValidGoalType,
  validateTargetWeightKg,
} from '../goalWeightValidation';
import { DEFAULT_PACE_OPTIONS } from '../paceSelectorUtils';
import { ACHIEVEMENT_THRESHOLD_KG } from '../onboardingCalc';

// ---------------------------------------------------------------------------
// GOAL_TYPE_OPTIONS — sign-off pin
// ---------------------------------------------------------------------------

describe('GOAL_TYPE_OPTIONS', () => {
  it('orders cut / maintain / bulk / recomp per sign-off § C-5 §1', () => {
    expect([...GOAL_TYPE_OPTIONS]).toEqual([
      'cut',
      'maintain',
      'bulk',
      'recomp',
    ]);
  });
});

// ---------------------------------------------------------------------------
// isValidGoalType + labels
// ---------------------------------------------------------------------------

describe('isValidGoalType', () => {
  it('returns true for the 4 valid options', () => {
    for (const g of GOAL_TYPE_OPTIONS) {
      expect(isValidGoalType(g)).toBe(true);
    }
  });

  it('returns false for invalid strings', () => {
    expect(isValidGoalType('extreme')).toBe(false);
    expect(isValidGoalType('Cut')).toBe(false);
    expect(isValidGoalType('')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(isValidGoalType(null)).toBe(false);
    expect(isValidGoalType(undefined)).toBe(false);
    expect(isValidGoalType(1)).toBe(false);
  });
});

describe('getGoalTypeLabel / Description', () => {
  it('returns non-empty JP strings for each goalType', () => {
    for (const g of GOAL_TYPE_OPTIONS) {
      expect(getGoalTypeLabel(g).length).toBeGreaterThan(0);
      expect(getGoalTypeDescription(g).length).toBeGreaterThan(0);
    }
  });

  it('labels are distinct', () => {
    const labels = GOAL_TYPE_OPTIONS.map(getGoalTypeLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ---------------------------------------------------------------------------
// validateTargetWeightKg
// ---------------------------------------------------------------------------

describe('validateTargetWeightKg', () => {
  it('accepts in-range values', () => {
    expect(validateTargetWeightKg(70)).toEqual({
      valid: true,
      sanitized: 70,
    });
  });

  it('accepts boundaries inclusively', () => {
    expect(validateTargetWeightKg(TARGET_WEIGHT_KG_MIN).valid).toBe(true);
    expect(validateTargetWeightKg(TARGET_WEIGHT_KG_MAX).valid).toBe(true);
  });

  it('rejects out-of-range values', () => {
    expect(validateTargetWeightKg(20)).toEqual({
      valid: false,
      reason: 'too_light',
    });
    expect(validateTargetWeightKg(250)).toEqual({
      valid: false,
      reason: 'too_heavy',
    });
  });

  it('rejects non-finite', () => {
    expect(validateTargetWeightKg(NaN)).toEqual({
      valid: false,
      reason: 'not_finite',
    });
  });
});

// ---------------------------------------------------------------------------
// getDirection — Pattern 18 SSoT boundary
// ---------------------------------------------------------------------------

describe('getDirection', () => {
  it('|gap| > ACHIEVEMENT_THRESHOLD_KG with target < current → cut', () => {
    expect(getDirection(70, 65)).toBe('cut');
    expect(getDirection(70, 69.4)).toBe('cut'); // gap 0.6 > 0.5
  });

  it('|gap| > ACHIEVEMENT_THRESHOLD_KG with target > current → bulk', () => {
    expect(getDirection(65, 70)).toBe('bulk');
    expect(getDirection(70, 70.6)).toBe('bulk');
  });

  it('|gap| <= ACHIEVEMENT_THRESHOLD_KG (inclusive) → maintain', () => {
    expect(getDirection(70, 70)).toBe('maintain');
    expect(getDirection(70, 70.5)).toBe('maintain');
    expect(getDirection(70, 69.5)).toBe('maintain');
  });

  it('ACHIEVEMENT_THRESHOLD_KG constant pin (cross-screen consistency)', () => {
    expect(ACHIEVEMENT_THRESHOLD_KG).toBe(0.5);
  });

  it('non-finite collapses to maintain (safest fallback)', () => {
    expect(getDirection(NaN, 70)).toBe('maintain');
    expect(getDirection(70, Infinity)).toBe('maintain');
  });
});

// ---------------------------------------------------------------------------
// isGoalTypeConsistent — cross-field check
// ---------------------------------------------------------------------------

describe('isGoalTypeConsistent', () => {
  it('cut: direction=cut + rate<0 → true', () => {
    expect(isGoalTypeConsistent('cut', 70, 65, -0.5)).toBe(true);
  });

  it('cut: direction=cut + rate=0 → false (no progress)', () => {
    expect(isGoalTypeConsistent('cut', 70, 65, 0)).toBe(false);
  });

  it('cut: direction=cut + rate>0 → false (wrong sign)', () => {
    expect(isGoalTypeConsistent('cut', 70, 65, 0.25)).toBe(false);
  });

  it('cut: direction=bulk + rate<0 → false (direction mismatch)', () => {
    expect(isGoalTypeConsistent('cut', 65, 70, -0.5)).toBe(false);
  });

  it('bulk: direction=bulk + rate>0 → true', () => {
    expect(isGoalTypeConsistent('bulk', 65, 70, 0.25)).toBe(true);
  });

  it('bulk: direction=bulk + rate=0 → false', () => {
    expect(isGoalTypeConsistent('bulk', 65, 70, 0)).toBe(false);
  });

  it('maintain: direction=maintain + rate=0 → true', () => {
    expect(isGoalTypeConsistent('maintain', 70, 70, 0)).toBe(true);
  });

  it('maintain: direction=maintain + non-zero rate → false', () => {
    expect(isGoalTypeConsistent('maintain', 70, 70, -0.25)).toBe(false);
  });

  it('recomp: direction=maintain + rate ∈ [-0.25, 0.25] → true', () => {
    expect(isGoalTypeConsistent('recomp', 70, 70, -0.25)).toBe(true);
    expect(isGoalTypeConsistent('recomp', 70, 70, 0)).toBe(true);
    expect(isGoalTypeConsistent('recomp', 70, 70, 0.25)).toBe(true);
  });

  it('recomp: |rate| > 0.25 → false', () => {
    expect(isGoalTypeConsistent('recomp', 70, 70, -0.5)).toBe(false);
    expect(isGoalTypeConsistent('recomp', 70, 70, 0.5)).toBe(false);
  });

  it('recomp: direction != maintain → false', () => {
    // recomp implies target ≈ current; if user set a non-trivial
    // gap they should pick cut/bulk instead.
    expect(isGoalTypeConsistent('recomp', 70, 65, 0)).toBe(false);
    expect(isGoalTypeConsistent('recomp', 65, 70, 0)).toBe(false);
  });

  it('non-finite rate → false (defensive)', () => {
    expect(isGoalTypeConsistent('cut', 70, 65, NaN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterPaceOptionsForGoalType
// ---------------------------------------------------------------------------

describe('filterPaceOptionsForGoalType', () => {
  it('cut → negative subset of DEFAULT_PACE_OPTIONS', () => {
    expect(filterPaceOptionsForGoalType('cut')).toEqual(
      DEFAULT_PACE_OPTIONS.filter((r) => r < 0),
    );
  });

  it('bulk → positive subset', () => {
    expect(filterPaceOptionsForGoalType('bulk')).toEqual(
      DEFAULT_PACE_OPTIONS.filter((r) => r > 0),
    );
  });

  it('maintain → [0]', () => {
    expect(filterPaceOptionsForGoalType('maintain')).toEqual([0]);
  });

  it('recomp → [-0.25, 0, 0.25]', () => {
    expect(filterPaceOptionsForGoalType('recomp')).toEqual([
      -0.25,
      0,
      0.25,
    ]);
  });
});

// ---------------------------------------------------------------------------
// calculateGoalSummary — Pattern 18 SSoT cross-check
// ---------------------------------------------------------------------------

describe('calculateGoalSummary', () => {
  const now = new Date(2026, 4, 11);

  it('cut 70→65 at -0.5%/週 returns date + weeks', () => {
    const out = calculateGoalSummary(70, 65, -0.5, now);
    expect(out).not.toBeNull();
    expect(out!.weeksToGoal).toBeGreaterThan(0);
    expect(out!.targetDate.getTime()).toBeGreaterThan(now.getTime());
  });

  it('bulk 65→70 at +0.25%/週 returns reachable summary', () => {
    const out = calculateGoalSummary(65, 70, 0.25, now);
    expect(out).not.toBeNull();
    expect(out!.weeksToGoal).toBeGreaterThan(0);
  });

  it('maintain (target ≈ current) returns null', () => {
    expect(calculateGoalSummary(70, 70, 0, now)).toBeNull();
    expect(calculateGoalSummary(70, 70.3, 0, now)).toBeNull();
  });

  it('rate=0 with non-trivial gap returns null (would never converge)', () => {
    expect(calculateGoalSummary(70, 65, 0, now)).toBeNull();
  });

  it('any invalid input → null', () => {
    expect(calculateGoalSummary(NaN, 65, -0.5, now)).toBeNull();
    expect(calculateGoalSummary(70, 250, -0.5, now)).toBeNull();
    expect(calculateGoalSummary(70, 65, NaN, now)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatGoalSummary
// ---------------------------------------------------------------------------

describe('formatGoalSummary', () => {
  it('returns empty string for null summary', () => {
    expect(formatGoalSummary(null)).toBe('');
  });

  it('formats with JP locale date + week count', () => {
    const summary = {
      targetDate: new Date(2026, 7, 15),
      weeksToGoal: 14,
    };
    const out = formatGoalSummary(summary);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/8/); // month (toLocaleDateString form varies)
    expect(out).toMatch(/15/);
    expect(out).toMatch(/14/); // weeks
    expect(out).toMatch(/週/);
  });
});

// ---------------------------------------------------------------------------
// isAllInputsValidForC5 — composite gate
// ---------------------------------------------------------------------------

describe('isAllInputsValidForC5', () => {
  it('cut: all 3 valid + consistent → true', () => {
    expect(isAllInputsValidForC5('cut', 65, -0.5, 70)).toBe(true);
  });

  it('any null field → false', () => {
    expect(isAllInputsValidForC5(null, 65, -0.5, 70)).toBe(false);
    expect(isAllInputsValidForC5('cut', null, -0.5, 70)).toBe(false);
    expect(isAllInputsValidForC5('cut', 65, null, 70)).toBe(false);
  });

  it('inconsistent combo (cut + bulk direction) → false', () => {
    expect(isAllInputsValidForC5('cut', 75, -0.5, 70)).toBe(false);
  });

  it('invalid targetWeight → false', () => {
    expect(isAllInputsValidForC5('cut', 20, -0.5, 70)).toBe(false);
  });

  it('NaN currentWeight → false (rare back-nav corruption)', () => {
    expect(isAllInputsValidForC5('cut', 65, -0.5, NaN)).toBe(false);
  });
});
