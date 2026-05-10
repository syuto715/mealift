// v1.3.0 / Onboarding v2 / Phase B-2 — pure-helper tests for the
// WeightSlider component. Render tests deferred per Build 15+
// TODO 12 (missing jest-expo preset blocks RNTL); the boundary
// logic that would normally be tested via RNTL fireEvent is covered
// here through the extracted helpers.

import {
  clampWeight,
  roundToStep,
  formatWeight,
  isValidWeight,
  assertSliderProps,
  sanitizeValue,
  quantizeToGrid,
  decimalsForStep,
} from '../weightSliderUtils';

// ---------------------------------------------------------------------------
// clampWeight
// ---------------------------------------------------------------------------

describe('clampWeight', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampWeight(70, 30, 200)).toBe(70);
    expect(clampWeight(30, 30, 200)).toBe(30); // lower boundary
    expect(clampWeight(200, 30, 200)).toBe(200); // upper boundary
  });

  it('clamps to min when below', () => {
    expect(clampWeight(20, 30, 200)).toBe(30);
    expect(clampWeight(-5, 30, 200)).toBe(30);
  });

  it('clamps to max when above', () => {
    expect(clampWeight(250, 30, 200)).toBe(200);
    expect(clampWeight(1000, 30, 200)).toBe(200);
  });

  it('throws when min >= max (caller-misuse fail-fast, Pattern 5)', () => {
    expect(() => clampWeight(70, 200, 30)).toThrow(/invalid bounds/);
    expect(() => clampWeight(70, 100, 100)).toThrow(/invalid bounds/);
  });
});

// ---------------------------------------------------------------------------
// roundToStep — Pattern 20 FP precision defense
// ---------------------------------------------------------------------------

describe('roundToStep', () => {
  it('step=0.1 dodges IEEE 754 noise (Pattern 20)', () => {
    // Slider drag yields values like 72.30000000000001; without the
    // integer-arithmetic path the naive Math.round(v / 0.1) * 0.1
    // would propagate the noise. Pin the clean output.
    expect(roundToStep(72.30000000000001, 0.1)).toBe(72.3);
    expect(roundToStep(72.5, 0.1)).toBe(72.5);
    expect(roundToStep(72.55, 0.1)).toBe(72.6); // round half toward +∞
  });

  it('step=0.5 quantizes via integer arithmetic', () => {
    expect(roundToStep(72.7, 0.5)).toBe(72.5);
    expect(roundToStep(72.75, 0.5)).toBe(73);
    expect(roundToStep(72.0, 0.5)).toBe(72);
  });

  it('step=1 rounds to integer', () => {
    expect(roundToStep(72.6, 1)).toBe(73);
    expect(roundToStep(72.4, 1)).toBe(72);
    expect(roundToStep(72.5, 1)).toBe(73); // tie toward +∞
  });

  it('generic fallback for non-special steps', () => {
    expect(roundToStep(72.6, 0.25)).toBe(72.5);
    expect(roundToStep(72.7, 0.25)).toBe(72.75);
  });

  it('throws on non-positive step (caller-misuse fail-fast)', () => {
    expect(() => roundToStep(72, 0)).toThrow(/invalid step/);
    expect(() => roundToStep(72, -0.1)).toThrow(/invalid step/);
  });
});

// ---------------------------------------------------------------------------
// formatWeight
// ---------------------------------------------------------------------------

describe('formatWeight', () => {
  it('default 1-decimal "{n} kg" format', () => {
    expect(formatWeight(72.5)).toBe('72.5 kg');
    expect(formatWeight(72)).toBe('72.0 kg');
  });

  it('decimals=0 produces integer copy', () => {
    expect(formatWeight(72.5, 0)).toBe('73 kg'); // rounds via toFixed
    expect(formatWeight(72, 0)).toBe('72 kg');
  });

  it('falls back to "-- kg" for non-finite input (defensive)', () => {
    expect(formatWeight(NaN)).toBe('-- kg');
    expect(formatWeight(Infinity)).toBe('-- kg');
    expect(formatWeight(-Infinity)).toBe('-- kg');
  });
});

// ---------------------------------------------------------------------------
// isValidWeight
// ---------------------------------------------------------------------------

describe('isValidWeight', () => {
  it('returns true for finite values within bounds', () => {
    expect(isValidWeight(70, 30, 200)).toBe(true);
    expect(isValidWeight(30, 30, 200)).toBe(true); // boundary
    expect(isValidWeight(200, 30, 200)).toBe(true);
  });

  it('returns false for non-finite values', () => {
    expect(isValidWeight(NaN, 30, 200)).toBe(false);
    expect(isValidWeight(Infinity, 30, 200)).toBe(false);
    expect(isValidWeight(-Infinity, 30, 200)).toBe(false);
  });

  it('returns false for out-of-range values', () => {
    expect(isValidWeight(20, 30, 200)).toBe(false);
    expect(isValidWeight(250, 30, 200)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertSliderProps — caller-misuse fail-fast
// ---------------------------------------------------------------------------

describe('assertSliderProps', () => {
  const validInput = { value: 70, min: 30, max: 200, step: 0.1 };

  it('passes through for valid props', () => {
    expect(() => assertSliderProps(validInput)).not.toThrow();
  });

  it('throws on min >= max', () => {
    expect(() =>
      assertSliderProps({ ...validInput, min: 200, max: 30 }),
    ).toThrow(/min must be < max/);
    expect(() =>
      assertSliderProps({ ...validInput, min: 100, max: 100 }),
    ).toThrow(/min must be < max/);
  });

  it('throws on step <= 0', () => {
    expect(() =>
      assertSliderProps({ ...validInput, step: 0 }),
    ).toThrow(/step must be > 0/);
    expect(() =>
      assertSliderProps({ ...validInput, step: -0.1 }),
    ).toThrow(/step must be > 0/);
  });

  it('throws on non-finite value', () => {
    expect(() =>
      assertSliderProps({ ...validInput, value: NaN }),
    ).toThrow(/value must be finite/);
    expect(() =>
      assertSliderProps({ ...validInput, value: Infinity }),
    ).toThrow(/value must be finite/);
  });

  // Codex review pass 1 / Important #2 — also asserts value range.
  // Previously a parent could pass value=250 with max=200 and the
  // component would happily render "250.0 kg" while the native
  // slider capped at 200.
  it('throws on value below min', () => {
    expect(() =>
      assertSliderProps({ ...validInput, value: 20 }),
    ).toThrow(/value must be in/);
  });

  it('throws on value above max', () => {
    expect(() =>
      assertSliderProps({ ...validInput, value: 250 }),
    ).toThrow(/value must be in/);
  });
});

// ---------------------------------------------------------------------------
// sanitizeValue — production-safe coercion (Codex pass 1 design call #1)
// ---------------------------------------------------------------------------

describe('sanitizeValue', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(sanitizeValue(70, 30, 200)).toBe(70);
  });

  it('clamps out-of-range values', () => {
    expect(sanitizeValue(20, 30, 200)).toBe(30);
    expect(sanitizeValue(250, 30, 200)).toBe(200);
  });

  it('falls back to min for non-finite values (any sign)', () => {
    // sanitizeValue short-circuits on !Number.isFinite, so both
    // Infinity and -Infinity collapse to min (not to max). NaN
    // also returns min. The fallback choice is "least bad" —
    // assertSliderProps would have already thrown in __DEV__.
    expect(sanitizeValue(NaN, 30, 200)).toBe(30);
    expect(sanitizeValue(Infinity, 30, 200)).toBe(30);
    expect(sanitizeValue(-Infinity, 30, 200)).toBe(30);
  });

  it('returns min as least-bad fallback for degenerate bounds', () => {
    // min >= max would throw in clampWeight; sanitizeValue
    // pre-empts and returns min directly so production doesn't
    // crash on a __DEV__-only-detected misuse.
    expect(sanitizeValue(70, 100, 100)).toBe(100);
    expect(sanitizeValue(70, 200, 30)).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// quantizeToGrid — Codex pass 1 / Critical (min-relative quantization)
// ---------------------------------------------------------------------------

describe('quantizeToGrid', () => {
  it('snaps to grid relative to min, not 0', () => {
    // Critical fix: previously roundToStep(30.1, 0.5) = 30 < min.
    // quantizeToGrid quantizes the offset (raw - min), so 30.1 stays
    // at 30.1 (it IS the min, on the grid).
    expect(quantizeToGrid(30.1, 30.1, 100, 0.5)).toBe(30.1);
    // 30.4 → offset 0.3 → snap to 0.5 → 30.6
    expect(quantizeToGrid(30.4, 30.1, 100, 0.5)).toBeCloseTo(30.6, 5);
    // 30.2 → offset 0.1 → snap to 0 → 30.1 (back at min)
    expect(quantizeToGrid(30.2, 30.1, 100, 0.5)).toBeCloseTo(30.1, 5);
  });

  it('clamps to bounds after snap (upper edge regression)', () => {
    // step=0.5 max=100; raw=99.9 → offset 99.9 → snap to 100 → over max
    // Re-clamp brings it back to 100.
    expect(quantizeToGrid(99.9, 30, 100, 0.5)).toBe(100);
    // raw above max clamps first: clampWeight(150, 30, 100) = 100, snap=100, clamp=100
    expect(quantizeToGrid(150, 30, 100, 0.5)).toBe(100);
  });

  it('clamps to min for raw below min', () => {
    expect(quantizeToGrid(20, 30, 100, 0.5)).toBe(30);
  });

  it('integer-step grid behaves identically to roundToStep at min=0', () => {
    expect(quantizeToGrid(72.7, 0, 100, 1)).toBe(73);
    expect(quantizeToGrid(72.4, 0, 100, 1)).toBe(72);
  });

  it('preserves FP-clean output for the common 0.1 step', () => {
    expect(quantizeToGrid(72.30000000000001, 30, 200, 0.1)).toBe(72.3);
  });
});

// ---------------------------------------------------------------------------
// decimalsForStep — Codex pass 1 / Important #1
// ---------------------------------------------------------------------------

describe('decimalsForStep', () => {
  it('common Mealift granularities', () => {
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(0.5)).toBe(1);
    expect(decimalsForStep(0.1)).toBe(1);
    expect(decimalsForStep(0.25)).toBe(2);
    expect(decimalsForStep(0.01)).toBe(2);
  });

  it('returns 0 for step >= 1 (integer copy)', () => {
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(2)).toBe(0);
    expect(decimalsForStep(5)).toBe(0);
  });

  it('caps at 10 decimals for sub-precision steps', () => {
    expect(decimalsForStep(0.0000000001)).toBe(10);
  });

  it('returns 0 for non-finite step (defensive)', () => {
    expect(decimalsForStep(NaN)).toBe(0);
    expect(decimalsForStep(Infinity)).toBe(0);
  });
});
