import { ACHIEVEMENT_THRESHOLD_KG } from './onboardingCalc';

// v1.3.0 / Onboarding v2 / Phase B-3 — pure helpers for the
// PaceSelector component.
//
// All numeric / string-format / direction-classification logic lives
// here so the component file can stay thin (rendering only) and the
// boundary is jest-testable without RNTL (Build 15+ TODO 12).
//
// Patterns applied:
//   #5  fail-fast on caller misuse — assertPaceSelectorProps throws
//       on empty / duplicate options or non-finite weights.
//   #15 readonly literal arrays via `as const` — DEFAULT_PACE_OPTIONS
//       prevents mutation at the type level.
//   #28 __DEV__ assert + production sanitize hybrid — paired
//       assertPaceSelectorProps + sanitizePaceSelectorProps so dev
//       catches bad calls early and production never crashes.

// === DEFAULT_PACE_OPTIONS ===
//
// Sign-off § Schema 整合: schema CHECK is BETWEEN -1.5 AND 0.5, all
// six values fit. Negative values = lose weight per week (% of body
// weight). 0 = maintain. Positive = gain. The asymmetric range
// (3 negative + 1 zero + 1 positive vs 5 weight-loss spec rates)
// reflects the reality that aggressive bulks are rarer than
// aggressive cuts in the JP fitness audience.
export const DEFAULT_PACE_OPTIONS = [
  -1.0,
  -0.7,
  -0.5,
  -0.25,
  0,
  0.25,
] as const;

export type Direction = 'decrease' | 'maintain' | 'increase';

// === formatPaceLabel ===

// Display string for the upper segment-button label. Sign-off §1
// helper spec pinned:
//   -1.0  → "-1.0%/週"   (1 decimal, trailing zero retained)
//   -0.5  → "-0.5%/週"   (1 decimal already, no trailing zero)
//   -0.25 → "-0.25%/週"  (2 decimals required by precision)
//   0     → "±0%/週"     (special maintain copy)
//   0.25  → "+0.25%/週"  (positive sign explicit)
//
// Decimal count derived from the value's actual precision via
// decimalsForRate, with a floor of 1 for non-zero rates so
// whole-percent options (-1.0) don't render as "-1%/週" — keeps
// the 0.X column visually aligned across the row.
export function formatPaceLabel(rate: number): string {
  if (!Number.isFinite(rate)) return '--';
  if (rate === 0) return '±0%/週';
  const decimals = Math.max(1, decimalsOfRate(rate));
  const formatted = rate.toFixed(decimals);
  if (rate > 0) return `+${formatted}%/週`;
  return `${formatted}%/週`;
}

// Find the natural precision of `rate` (number of digits after the
// decimal point in its canonical decimal representation). Uses
// toFixed(20) + trailing-zero trim to dodge FP noise — same trick
// Phase B-2 weightSliderUtils.decimalsForStep used.
function decimalsOfRate(rate: number): number {
  if (!Number.isFinite(rate) || rate === 0) return 0;
  const trimmed = Math.abs(rate).toFixed(10).replace(/0+$/, '');
  const dot = trimmed.indexOf('.');
  if (dot < 0) return 0;
  return Math.min(10, trimmed.length - dot - 1);
}

// === formatPaceSublabel ===

// Estimated kg/week change derived from current body weight.
// Sign-off §1 helper spec: "Math.abs(currentWeight * rate / 100)、
// 小数点 2 桁". Returns null for rate=0 since "0 kg/week" is
// implicit in the "±0%/週" upper label.
//
// FP defense (Pattern 20): the naive `(currentWeight * rate / 100)
// .toFixed(2)` path gets bitten by IEEE 754 — e.g. 70 × 0.25 = 17.5
// is exact in FP, but /100 yields 0.17499...something which then
// .toFixed(2) rounds DOWN to "0.17" rather than the algebraically
// expected "0.18" (round half to +∞).
//
// Workaround: do the multiplication in 0.01-of-kg units (still
// exact for the {-1.0, -0.7, -0.5, -0.25, 0, 0.25} × {whole-kg
// weights} domain), Math.round the integer cents, then divide by
// 100 only for display.
export function formatPaceSublabel(
  rate: number,
  currentWeight: number,
): string | null {
  if (!Number.isFinite(rate) || !Number.isFinite(currentWeight)) return null;
  if (rate === 0) return null;
  // Math.round(70 × 0.25) = Math.round(17.5) = 18 (ties to +∞);
  // /100 = 0.18. Pre-multiply preserves the exact algebraic
  // intent before FP noise can erode it.
  const cents = Math.round(Math.abs(currentWeight * rate));
  const kgPerWeek = cents / 100;
  const direction = rate > 0 ? '増' : '減';
  return `約 ${kgPerWeek.toFixed(2)} kg/週 ${direction}`;
}

// === getDirection ===

// Classify the user's intent based on the gap between target and
// current. Reuses Phase A-4's ACHIEVEMENT_THRESHOLD_KG so the
// "effectively at target" boundary is consistent across the
// estimateTargetDate calc and the PaceSelector enable logic.
export function getDirection(
  currentWeight: number,
  targetWeight: number,
): Direction {
  if (
    !Number.isFinite(currentWeight) ||
    !Number.isFinite(targetWeight)
  ) {
    return 'maintain';
  }
  const gap = targetWeight - currentWeight;
  if (Math.abs(gap) < ACHIEVEMENT_THRESHOLD_KG) return 'maintain';
  return gap < 0 ? 'decrease' : 'increase';
}

// === isOptionDisabled ===

// True when an option is incompatible with the user's intent
// direction. Disabled options stay visible (visual consistency,
// the user can see which paces exist) but can't be tapped.
//
// decrease: positive rates disabled (you can't lose weight by
//           gaining it). Rate=0 (maintain) is also disabled because
//           the user explicitly asked to lose weight.
// increase: mirror — negative rates AND zero disabled.
// maintain: anything non-zero disabled.
export function isOptionDisabled(
  optionRate: number,
  direction: Direction,
): boolean {
  if (!Number.isFinite(optionRate)) return true;
  switch (direction) {
    case 'decrease':
      return optionRate >= 0;
    case 'increase':
      return optionRate <= 0;
    case 'maintain':
      return optionRate !== 0;
  }
}

// === filterAvailableOptions ===

// Convenience for callers that want only the enabled options
// (e.g. when computing "do we have any usable rates here?" for
// degenerate-input edge cases).
export function filterAvailableOptions(
  options: readonly number[],
  direction: Direction,
): readonly number[] {
  return options.filter((rate) => !isOptionDisabled(rate, direction));
}

// === isValidPace ===

export function isValidPace(
  rate: number,
  options: readonly number[],
): boolean {
  if (!Number.isFinite(rate)) return false;
  return options.includes(rate);
}

// === assertPaceSelectorProps + sanitizePaceSelectorProps ===
//
// Pattern 28 hybrid: __DEV__ throws to surface caller misuse early;
// production sanitizes to keep the user-facing flow alive. The
// component layer wraps both in the conventional `if (__DEV__)`
// guard.

export interface PaceSelectorPropsCore {
  value: number | null;
  options: readonly number[];
  currentWeight: number;
  targetWeight: number;
}

export function assertPaceSelectorProps(input: PaceSelectorPropsCore): void {
  if (input.options.length === 0) {
    throw new Error('PaceSelector: options must not be empty');
  }
  const seen = new Set<number>();
  for (const v of input.options) {
    if (!Number.isFinite(v)) {
      throw new Error(
        `PaceSelector: option ${v} is not finite`,
      );
    }
    if (seen.has(v)) {
      throw new Error(
        `PaceSelector: duplicate option ${v} in options array`,
      );
    }
    seen.add(v);
  }
  if (
    !Number.isFinite(input.currentWeight) ||
    input.currentWeight <= 0
  ) {
    throw new Error(
      `PaceSelector: currentWeight must be finite and positive (got ${input.currentWeight})`,
    );
  }
  if (
    !Number.isFinite(input.targetWeight) ||
    input.targetWeight <= 0
  ) {
    throw new Error(
      `PaceSelector: targetWeight must be finite and positive (got ${input.targetWeight})`,
    );
  }
  if (input.value !== null && !isValidPace(input.value, input.options)) {
    throw new Error(
      `PaceSelector: value ${input.value} is not in options [${input.options.join(', ')}]`,
    );
  }
}

// Production-safe sanitization — degrade gracefully rather than
// crashing. Returns a normalized props core that the component
// can render against:
//   - empty / non-finite-only options → DEFAULT_PACE_OPTIONS
//   - non-finite or non-positive weights → 1 (minimum sane)
//   - value not in (sanitized) options → null (unselected)
//   - duplicates in options are deduped via Set construction
export function sanitizePaceSelectorProps(
  input: PaceSelectorPropsCore,
): PaceSelectorPropsCore {
  const dedupedOptions = Array.from(
    new Set(input.options.filter((v) => Number.isFinite(v))),
  );
  const safeOptions: readonly number[] =
    dedupedOptions.length > 0 ? dedupedOptions : DEFAULT_PACE_OPTIONS;

  const safeCurrentWeight =
    Number.isFinite(input.currentWeight) && input.currentWeight > 0
      ? input.currentWeight
      : 1;
  const safeTargetWeight =
    Number.isFinite(input.targetWeight) && input.targetWeight > 0
      ? input.targetWeight
      : 1;

  const safeValue =
    input.value !== null && isValidPace(input.value, safeOptions)
      ? input.value
      : null;

  return {
    value: safeValue,
    options: safeOptions,
    currentWeight: safeCurrentWeight,
    targetWeight: safeTargetWeight,
  };
}
