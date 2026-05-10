// v1.3.0 / Onboarding v2 / Phase B-2 — pure helpers for the
// WeightSlider component.
//
// Five small functions extracted so the boundary is jest-testable
// without dragging react-native through the runtime (Build 15+
// TODO 12 — missing jest-expo preset). The component imports +
// uses these helpers internally; tests import them directly.
//
// Patterns applied:
//   #5  fail-fast on caller misuse — invalid bounds throw rather
//       than silently degrading
//   #20 pre-compute composite ratios — common steps (0.1 / 0.5 / 1)
//       use exact integer arithmetic to dodge IEEE 754 noise that
//       would otherwise make slider drag produce values like
//       72.30000000000001

// === clampWeight ===

export function clampWeight(
  value: number,
  min: number,
  max: number,
): number {
  if (min >= max) {
    throw new Error(
      `clampWeight: invalid bounds (min=${min}, max=${max}); min must be < max`,
    );
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// === roundToStep ===

// Quantize a slider's raw value to a clean multiple of `step`.
// Special-cased for the common Mealift granularities (0.1 / 0.5 /
// 1) using integer arithmetic to dodge FP noise:
//   Math.round(72.3000000001 / 0.1) * 0.1 → 72.30000000000001
//   Math.round(72.3000000001 * 10) / 10  → 72.3 (clean)
// The generic fallback handles arbitrary steps but doesn't promise
// FP cleanliness for them.
export function roundToStep(value: number, step: number): number {
  if (step <= 0) {
    throw new Error(`roundToStep: invalid step=${step}; must be > 0`);
  }
  if (step === 0.1) return Math.round(value * 10) / 10;
  if (step === 0.5) return Math.round(value * 2) / 2;
  if (step === 1) return Math.round(value);
  // Generic fallback — exact for whole-number steps, FP-noisy for
  // arbitrary fractional steps. Callers using non-{0.1, 0.5, 1}
  // accept that noise.
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

// === formatWeight ===

// "72.5 kg" / "73 kg" — drives the large numeric label above the
// slider track + the accessibility text for screen readers.
//
// Defensive on bad input: NaN / Infinity render as "-- kg" so a
// rendering bug doesn't surface garbage to the user.
export function formatWeight(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '-- kg';
  return `${value.toFixed(decimals)} kg`;
}

// === isValidWeight ===

export function isValidWeight(
  value: number,
  min: number,
  max: number,
): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < min || value > max) return false;
  return true;
}

// === assertSliderProps (caller-misuse fail-fast) ===

// Convenience for the WeightSlider component to surface programming
// errors immediately at mount rather than silently degrading. Pure
// so the helper test exercises the bounds-validation logic.
export function assertSliderProps(input: {
  value: number;
  min: number;
  max: number;
  step: number;
}): void {
  if (input.min >= input.max) {
    throw new Error(
      `WeightSlider: min must be < max (got min=${input.min}, max=${input.max})`,
    );
  }
  if (input.step <= 0) {
    throw new Error(
      `WeightSlider: step must be > 0 (got step=${input.step})`,
    );
  }
  if (!Number.isFinite(input.value)) {
    throw new Error(
      `WeightSlider: value must be finite (got value=${input.value})`,
    );
  }
}
