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
//
// Codex review pass 1 / Important #2 — also asserts value is in
// [min, max]. Without this check a parent passing value=250 with
// max=200 would render "250.0 kg" in the label while the native
// slider capped at 200, divergent UX.
//
// Codex review pass 1 / Design call #1 — caller (component) gates
// the throw behind __DEV__ AND sanitizes via sanitizeValue in
// production, so a bad-prop scenario crashes in dev (catch early)
// but degrades gracefully in user-facing builds.
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
  if (input.value < input.min || input.value > input.max) {
    throw new Error(
      `WeightSlider: value must be in [${input.min}, ${input.max}] (got value=${input.value})`,
    );
  }
}

// === sanitizeValue ===

// Production-safe value coercion. Pairs with the __DEV__-gated
// assertSliderProps: dev catches the misuse with a throw; production
// renders a usable widget instead of a crash. Uses clampWeight's
// bounds-clamp; non-finite values fall back to `min`.
export function sanitizeValue(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return min;
  if (min >= max) return min; // degenerate bounds — return min as least-bad
  return clampWeight(value, min, max);
}

// === quantizeToGrid ===

// Min-relative quantization. Codex review pass 1 / Critical — the
// previous `roundToStep(value, step)` anchored to 0 broke for offset
// mins (e.g. min=30.1, step=0.5 → roundToStep(30.1, 0.5) = 30 < min).
// The native slider's step behavior is min-relative, so JS arithmetic
// must match.
//
// Pipeline: clamp → snap-to-grid relative to min → re-clamp (rounding
// could push the upper edge past max).
export function quantizeToGrid(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const clamped = clampWeight(value, min, max);
  const offset = clamped - min;
  const snapped = min + roundToStep(offset, step);
  return clampWeight(snapped, min, max);
}

// === decimalsForStep ===

// Derive display precision from step so the label / modal draft / step
// readout match the granularity. Codex review pass 1 / Important #1 —
// previous hard-coded `step < 1 ? 1 : 0` rendered 72.25 (step=0.25)
// as "72.3", losing 0.05 on every edit-confirm round trip.
//
// step >= 1 → 0 decimals (integer copy)
// 0.1 → 1; 0.5 → 1; 0.25 → 2; 0.01 → 2
// Defensive: non-finite step falls back to 0 (assertSliderProps would
// have already thrown in __DEV__; this is the production path).
export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step >= 1) return 0;
  // toFixed(10) gives the full decimal expansion at the precision
  // limit relevant for slider granularity; trim trailing zeros to
  // collapse FP noise (0.1 → '0.1000000000' → '0.1').
  const trimmed = step.toFixed(10).replace(/0+$/, '');
  const dot = trimmed.indexOf('.');
  if (dot < 0) return 0;
  return Math.min(10, trimmed.length - dot - 1);
}
