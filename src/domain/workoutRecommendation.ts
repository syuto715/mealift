// Build 15 / Feature 5-C — recommendation engine.
//
// Pure logic, no DB writes, no LLM. Two independent surfaces:
//   - rirToPctOf1RM: Helms / Reactive Training Systems Tier-1 chart
//     mapping (reps, RIR) → fraction of 1RM. Imported by Phase 3's
//     RPE adjustment hook so the table stays the single source of
//     truth across recommendation + feedback paths.
//   - recommendNextSet: given a current e1rm + target reps + RIR +
//     plate step, returns Easy/Normal/Hard weight triplets.
//   - roundToPlate: shared rounding utility used by both consumers.
//
// Helms/RTS table accuracy: §6.6.6 design risk note acknowledges
// these values are widely cited but not universally agreed. Tunable
// in v2 without UI changes.

// RIR (Reps In Reserve) → fraction of 1RM, indexed by [reps][rir].
// Source: docs/build-15-design.md §6.6.2 (Helms/RTS Tier-1).
//
// Indexed by INTEGER rep counts. Non-key rep targets fall back to
// rirToPctOf1RM[8][2] = 0.745 via the FALLBACK_PCT constant — this
// is the "moderate hypertrophy" anchor that approximates a 8-rep
// working set with 2 reps in reserve.
export const rirToPctOf1RM: Record<number, Record<number, number>> = {
  1: { 0: 1.000, 1: 0.955, 2: 0.922, 3: 0.892, 4: 0.864 },
  3: { 0: 0.940, 1: 0.910, 2: 0.881, 3: 0.853, 4: 0.826 },
  5: { 0: 0.870, 1: 0.840, 2: 0.811, 3: 0.785, 4: 0.760 },
  8: { 0: 0.795, 1: 0.770, 2: 0.745, 3: 0.722, 4: 0.700 },
  10: { 0: 0.745, 1: 0.722, 2: 0.700, 3: 0.679, 4: 0.659 },
  12: { 0: 0.707, 1: 0.685, 2: 0.665, 3: 0.645, 4: 0.626 },
};

// Anchor for non-key (reps × RIR) lookups. Public so Phase 3's RPE
// adjustment can reuse the same fallback semantic.
export const FALLBACK_PCT = rirToPctOf1RM[8][2];

// Round to the nearest multiple of plateStep. Math.round behavior is
// "round half toward +∞" for positive inputs (e.g. 0.5 → 1, 2.5 → 3),
// which matches the design's "nearest" rounding decision (B4 sign-off).
//
// Returns the input unchanged if plateStep is non-positive — defensive
// against pre-v27 rows that may surface with plate_step_kg = 0 during
// the migration race window.
export function roundToPlate(kg: number, plateStep: number): number {
  if (plateStep <= 0) return kg;
  return Math.round(kg / plateStep) * plateStep;
}

export interface SetRecommendation {
  weight: number; // kg, rounded to plateStep
  reps: number; // mirrors repTarget
}

export interface RecommendationTriplet {
  easy: SetRecommendation;
  normal: SetRecommendation;
  hard: SetRecommendation;
}

// Three-chip recommendation for the upcoming set. Each chip nudges the
// table-derived base weight by a small ± fraction so the user can pick
// a difficulty without changing the underlying RIR semantics:
//   easy   = base × 0.95   (≈ -2 plate steps at 50kg / 2.5)
//   normal = base
//   hard   = base × 1.025  (≈ +1 plate step)
//
// Returns null if the inputs aren't sufficient to compute a
// recommendation (no e1rm yet, or no rep target). The session UI
// surfaces a "1セット記録すると次回から推奨されます" hint in that case.
export function recommendNextSet(
  e1rm: number | null,
  repTarget: number | null,
  rir: number = 2,
  plateStep: number = 2.5,
): RecommendationTriplet | null {
  if (e1rm == null || e1rm <= 0) return null;
  if (repTarget == null || repTarget <= 0) return null;

  const pct = rirToPctOf1RM[repTarget]?.[rir] ?? FALLBACK_PCT;
  const baseKg = e1rm * pct;

  return {
    easy: {
      weight: roundToPlate(baseKg * 0.95, plateStep),
      reps: repTarget,
    },
    normal: {
      weight: roundToPlate(baseKg, plateStep),
      reps: repTarget,
    },
    hard: {
      weight: roundToPlate(baseKg * 1.025, plateStep),
      reps: repTarget,
    },
  };
}
