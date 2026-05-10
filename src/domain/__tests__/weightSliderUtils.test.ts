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
});
