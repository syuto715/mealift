// v1.3.0 / Onboarding v2 / Phase D-4 — pure-helper tests for the
// [8] protein-target screen.
//
// proteinTargetUtils imports from types/profile (no SQLite chain),
// so no DB-mock shim required.

import {
  PROTEIN_FACTOR_OPTIONS,
  formatProteinFactorAccessibilityLabel,
  getProteinFactorDescription,
  getProteinFactorLabel,
  getRecommendationLabel,
  isAllInputsValidForD4,
  isValidProteinFactor,
} from '../proteinTargetUtils';

// ---------------------------------------------------------------------------
// PROTEIN_FACTOR_OPTIONS — sign-off pin
// ---------------------------------------------------------------------------

describe('PROTEIN_FACTOR_OPTIONS', () => {
  it('exposes 4 values 1.0 / 1.6 / 2.2 / 3.0 in ascending order', () => {
    expect([...PROTEIN_FACTOR_OPTIONS]).toEqual([1.0, 1.6, 2.2, 3.0]);
  });
});

// ---------------------------------------------------------------------------
// isValidProteinFactor — Pattern 18 補強 canonical-value gate
// ---------------------------------------------------------------------------

describe('isValidProteinFactor', () => {
  it('returns true for each of the 4 exact literal values', () => {
    for (const f of PROTEIN_FACTOR_OPTIONS) {
      expect(isValidProteinFactor(f)).toBe(true);
    }
  });

  it('rejects nearby floats (canonical-value defense)', () => {
    // A corrupted persisted value (e.g., 1.5999... from a JSON
    // serialization round-trip in another schema) should NOT
    // pass — only exact 1.0 / 1.6 / 2.2 / 3.0 valid.
    expect(isValidProteinFactor(1.5)).toBe(false);
    expect(isValidProteinFactor(1.7)).toBe(false);
    expect(isValidProteinFactor(0.5)).toBe(false);
    expect(isValidProteinFactor(4.0)).toBe(false);
  });

  it('rejects non-finite numbers', () => {
    expect(isValidProteinFactor(NaN)).toBe(false);
    expect(isValidProteinFactor(Infinity)).toBe(false);
    expect(isValidProteinFactor(-Infinity)).toBe(false);
  });

  it('rejects non-number inputs', () => {
    expect(isValidProteinFactor('1.6')).toBe(false);
    expect(isValidProteinFactor(null)).toBe(false);
    expect(isValidProteinFactor(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getProteinFactorLabel / Description
// ---------------------------------------------------------------------------

describe('getProteinFactorLabel / Description', () => {
  it('returns non-empty JP strings for every factor', () => {
    for (const f of PROTEIN_FACTOR_OPTIONS) {
      expect(getProteinFactorLabel(f).length).toBeGreaterThan(0);
      expect(getProteinFactorDescription(f).length).toBeGreaterThan(0);
    }
  });

  it('label is canonical "{factor} g/kg" form', () => {
    expect(getProteinFactorLabel(1.0)).toBe('1.0 g/kg');
    expect(getProteinFactorLabel(1.6)).toBe('1.6 g/kg');
    expect(getProteinFactorLabel(2.2)).toBe('2.2 g/kg');
    expect(getProteinFactorLabel(3.0)).toBe('3.0 g/kg');
  });

  it('descriptions distinct (no copy-paste collisions)', () => {
    const descs = PROTEIN_FACTOR_OPTIONS.map(getProteinFactorDescription);
    expect(new Set(descs).size).toBe(descs.length);
  });
});

// ---------------------------------------------------------------------------
// getRecommendationLabel
// ---------------------------------------------------------------------------

describe('getRecommendationLabel', () => {
  it('null → fallback prompt', () => {
    expect(getRecommendationLabel(null)).toBe('選択してください');
  });

  it('value → formatted recommendation line', () => {
    expect(getRecommendationLabel(1.6)).toBe(
      'あなたの運動量から: 1.6 g/kg がおすすめです',
    );
    expect(getRecommendationLabel(2.2)).toContain('2.2 g/kg');
  });
});

// ---------------------------------------------------------------------------
// isAllInputsValidForD4
// ---------------------------------------------------------------------------

describe('isAllInputsValidForD4', () => {
  it('null → false', () => {
    expect(isAllInputsValidForD4(null)).toBe(false);
  });

  it('each valid factor → true', () => {
    for (const f of PROTEIN_FACTOR_OPTIONS) {
      expect(isAllInputsValidForD4(f)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// formatProteinFactorAccessibilityLabel
// ---------------------------------------------------------------------------

describe('formatProteinFactorAccessibilityLabel', () => {
  it('combines label + description', () => {
    const out = formatProteinFactorAccessibilityLabel(1.6);
    expect(out).toContain('1.6 g/kg');
    expect(out).toContain(getProteinFactorDescription(1.6));
  });

  it('every factor produces non-empty content', () => {
    for (const f of PROTEIN_FACTOR_OPTIONS) {
      expect(formatProteinFactorAccessibilityLabel(f).length).toBeGreaterThan(
        0,
      );
    }
  });
});
