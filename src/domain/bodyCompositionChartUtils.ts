import {
  type BodyCompositionForecast,
  DEFAULT_CURRENT_BODY_FAT_PCT,
  forecastBodyComposition,
} from './onboardingCalc';
import { PROTEIN_FACTOR_OPTIONS } from '../types/profile';

// v1.3.0 / Onboarding v2 / Phase B-5 — pure helpers for the
// BodyCompositionChart component.
//
// All numeric / formatting / classification logic lives here so the
// SVG component file can stay render-only. Phase B-5 follows the
// B-3 / B-4 helper-thick precedent because Build 15+ TODO 12 still
// blocks RNTL render tests.
//
// Patterns applied:
//   #5  fail-fast on caller misuse — assertChartProps throws on
//       NaN / Infinity / non-positive weights or out-of-schema rates.
//   #11 color + non-color redundant encoding — chart layer pairs
//       muscle/fat hue with on-bar kg labels (component side).
//   #18 single source of truth — forecastBodyComposition reuses
//       COMPOSITION_BY_PROTEIN_FACTOR via onboardingCalc; the
//       cross-check test (Phase B-5) pins muscleDelta consistency
//       with predictBodyComposition.
//   #25 pure-helper extraction — component owns no logic.
//   #28 __DEV__ assert + production sanitize hybrid.
//   #31 production-only import boundary verified — onboardingCalc
//       transitively pulls workoutRepository → expo-sqlite, but the
//       onboarding screens already pull this chain via
//       suggestProteinFactor on screen [8], so the marginal bundle
//       cost of importing forecastBodyComposition here is zero.
//       (B-4 mealPlanUtils explicitly avoided onboardingCalc; B-5
//       opts in because the chart math is genuine production use,
//       not a test-only cross-check.)

export type ChartData = BodyCompositionForecast;

// === schema CHECK bounds (Pattern 18) ===
//
// Mirror the v30 weekly_rate_pct CHECK so the chart's input
// validation matches the DB constraint without re-importing
// MIGRATION-related types.
export const WEEKLY_RATE_MIN = -1.5;
export const WEEKLY_RATE_MAX = 0.5;

// === Default sane values for production sanitize path ===
//
// Picked so a degenerate-input fallback still renders something
// recognizable (typical adult weight + maintain pace + standard
// 1.6 g/kg protein factor).
const DEFAULT_WEIGHT_KG = 70;
const DEFAULT_PROTEIN_FACTOR = 1.6;
const DEFAULT_WEEKLY_RATE = 0;

// === computeChartData ===
//
// Thin wrapper over forecastBodyComposition. The chart prop signature
// keeps weeklyRatePct alongside the calc inputs because the
// accessibilityLabel mentions pace, but the bar math itself is
// rate-independent (rate drives time-to-target, not composition).
export function computeChartData(input: {
  currentWeight: number;
  targetWeight: number;
  proteinFactor: number;
  currentBodyFatPct?: number;
}): ChartData {
  return forecastBodyComposition(input);
}

// === formatWeightLabel ===
//
// "70.0 kg" — 1 decimal always retained so column-aligned labels
// don't jitter ("70 kg" → "70.5 kg" → "70 kg"). FP-safe because
// toFixed(1) handles the rounding internally.
export function formatWeightLabel(value: number): string {
  if (!Number.isFinite(value)) return '-- kg';
  return `${value.toFixed(1)} kg`;
}

// === formatRateLabel ===
//
// "+0.25%/週" / "-0.5%/週" / "±0%/週" — used inside the chart's
// accessibility label to convey pace context. Lighter than the full
// paceSelectorUtils.formatPaceLabel because the chart only needs
// the screen-reader form, not the visual segment label.
export function formatRateLabel(rate: number): string {
  if (!Number.isFinite(rate)) return '--';
  if (rate === 0) return '±0%/週';
  const decimals = decimalsOfRate(rate);
  const formatted = rate.toFixed(Math.max(1, decimals));
  return rate > 0 ? `+${formatted}%/週` : `${formatted}%/週`;
}

function decimalsOfRate(rate: number): number {
  if (!Number.isFinite(rate) || rate === 0) return 0;
  const trimmed = Math.abs(rate).toFixed(10).replace(/0+$/, '');
  const dot = trimmed.indexOf('.');
  if (dot < 0) return 0;
  return Math.min(10, trimmed.length - dot - 1);
}

// === formatChartAccessibilityLabel ===
//
// VoiceOver / TalkBack target. The chart's stacked bars are visual-
// only without this — Codex pass 1 / Phase B-4 Important #1 set the
// precedent that JP screen-reader UX needs full-spelled labels (not
// abbreviated "P:F:C" forms).
//
// Three branches: maintain (no change), decrease, increase. The
// thresholds match estimateTargetDate / paceSelectorUtils.getDirection
// (ACHIEVEMENT_THRESHOLD_KG semantics, kept implicit here — chart
// data already has rounded weights, so direct equality is fine).
export function formatChartAccessibilityLabel(
  data: ChartData,
  weeklyRatePct: number,
): string {
  const currentLabel =
    `現在 ${formatWeightLabel(data.current.weightKg)} ` +
    `(筋肉 ${formatWeightLabel(data.current.muscleKg)} / ` +
    `脂肪 ${formatWeightLabel(data.current.fatKg)})`;
  const targetLabel =
    `目標 ${formatWeightLabel(data.target.weightKg)} ` +
    `(筋肉 ${formatWeightLabel(data.target.muscleKg)} / ` +
    `脂肪 ${formatWeightLabel(data.target.fatKg)})`;

  const direction =
    data.target.weightKg < data.current.weightKg
      ? '減量'
      : data.target.weightKg > data.current.weightKg
        ? '増量'
        : '維持';

  if (direction === '維持') {
    return `${currentLabel}、${formatRateLabel(weeklyRatePct)}で維持`;
  }
  return `${currentLabel} から ${targetLabel} へ ${direction}、${formatRateLabel(weeklyRatePct)}ペース`;
}

// === assertChartProps + sanitizeChartProps ===

export interface ChartPropsCore {
  currentWeight: number;
  targetWeight: number;
  proteinFactor: number;
  weeklyRatePct: number;
  currentBodyFatPct?: number;
}

export function assertChartProps(input: ChartPropsCore): void {
  if (!Number.isFinite(input.currentWeight) || input.currentWeight <= 0) {
    throw new Error(
      `BodyCompositionChart: currentWeight must be finite and positive (got ${input.currentWeight})`,
    );
  }
  if (!Number.isFinite(input.targetWeight) || input.targetWeight <= 0) {
    throw new Error(
      `BodyCompositionChart: targetWeight must be finite and positive (got ${input.targetWeight})`,
    );
  }
  if (!isValidProteinFactor(input.proteinFactor)) {
    throw new Error(
      `BodyCompositionChart: proteinFactor ${input.proteinFactor} is not in PROTEIN_FACTOR_OPTIONS [${PROTEIN_FACTOR_OPTIONS.join(', ')}]`,
    );
  }
  if (
    !Number.isFinite(input.weeklyRatePct) ||
    input.weeklyRatePct < WEEKLY_RATE_MIN ||
    input.weeklyRatePct > WEEKLY_RATE_MAX
  ) {
    throw new Error(
      `BodyCompositionChart: weeklyRatePct must be in [${WEEKLY_RATE_MIN}, ${WEEKLY_RATE_MAX}] (got ${input.weeklyRatePct})`,
    );
  }
  if (input.currentBodyFatPct !== undefined) {
    if (
      !Number.isFinite(input.currentBodyFatPct) ||
      input.currentBodyFatPct <= 0 ||
      input.currentBodyFatPct >= 100
    ) {
      throw new Error(
        `BodyCompositionChart: currentBodyFatPct must be in (0, 100) (got ${input.currentBodyFatPct})`,
      );
    }
  }
}

function isValidProteinFactor(value: number): boolean {
  return (PROTEIN_FACTOR_OPTIONS as readonly number[]).includes(value);
}

// Production-safe sanitization. Caller misuse is __DEV__-only fatal;
// in production we degrade to a recognizable default chart so the
// onboarding flow doesn't crash on unexpected input.
export function sanitizeChartProps(input: ChartPropsCore): ChartPropsCore {
  const safeCurrentWeight =
    Number.isFinite(input.currentWeight) && input.currentWeight > 0
      ? input.currentWeight
      : DEFAULT_WEIGHT_KG;
  const safeTargetWeight =
    Number.isFinite(input.targetWeight) && input.targetWeight > 0
      ? input.targetWeight
      : DEFAULT_WEIGHT_KG;
  const safeProteinFactor = isValidProteinFactor(input.proteinFactor)
    ? input.proteinFactor
    : DEFAULT_PROTEIN_FACTOR;
  const safeWeeklyRate =
    Number.isFinite(input.weeklyRatePct) &&
    input.weeklyRatePct >= WEEKLY_RATE_MIN &&
    input.weeklyRatePct <= WEEKLY_RATE_MAX
      ? input.weeklyRatePct
      : DEFAULT_WEEKLY_RATE;
  const safeBfPct =
    input.currentBodyFatPct !== undefined &&
    Number.isFinite(input.currentBodyFatPct) &&
    input.currentBodyFatPct > 0 &&
    input.currentBodyFatPct < 100
      ? input.currentBodyFatPct
      : undefined;

  return {
    currentWeight: safeCurrentWeight,
    targetWeight: safeTargetWeight,
    proteinFactor: safeProteinFactor,
    weeklyRatePct: safeWeeklyRate,
    currentBodyFatPct: safeBfPct,
  };
}

// === clampNonNegative ===
//
// Defense-in-depth for chart rendering: even with valid inputs, an
// extreme combination (e.g., 70→30 kg with proteinFactor=1.0) can
// drive targetFatKg or targetMuscleKg negative. The bar segments
// must clamp at 0 so the SVG doesn't render width=-N pixels.
export function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

// Re-export so the component can pull every chart helper from one
// module without importing onboardingCalc directly.
export { DEFAULT_CURRENT_BODY_FAT_PCT };
