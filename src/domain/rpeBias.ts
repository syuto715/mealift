import { rirToPctOf1RM } from './workoutRecommendation';

// Build 16 / Phase 3 (Feature D) / Phase 3.1 — RPE/RIR auto-regressive
// adjustment domain layer.
//
// Pure logic. No DB writes, no LLM. Three responsibilities:
//
//   1. backDeriveRpeFromWeight — given a logged set's weight + reps +
//      e1RM, infer what RPE the model would have predicted using the
//      Helms/RTS rirToPctOf1RM table (Phase 5-C). The drift between
//      this and the user's reported RPE is the "bias signal".
//
//   2. computeRpeBias — average the per-set drifts over a sliding
//      window, clamp to ±1.0 RPE, then apply a cold-start gradient
//      so a 3-set sample doesn't fully steer recommendations yet.
//
//   3. applyBiasToRir — fold the bias into the baseline RIR that
//      session.tsx (Phase 3.2) hands to recommendNextSet, with a
//      [0, 5] clamp so a runaway bias can't yield an out-of-table
//      RIR.
//
// Sign convention (set in stone by Phase 3 sign-off):
//   bias = computed_rpe - actual_rpe   (per-sample drift)
//   bias > 0   → user reported the set as easier than the model
//                predicted → user is stronger → adjustedRir LOWER
//                → recommendation HEAVIER.
//   bias < 0   → user reported the set as harder than predicted →
//                user is weaker → adjustedRir HIGHER → recommendation
//                LIGHTER.
//   adjustedRir = baselineRir - bias
//
// Coexistence with Phase 9.1's computeRpeAdjustmentFactor:
// computeRpeAdjustmentFactor bumps the stored e1RM by ±0.5-1% per
// set (instantaneous accuracy). computeRpeBias builds the user's
// long-running RIR perception drift on top of an already-bumped
// e1RM (the caller passes the latest adjusted e1RM into each
// sample). Different time scales, complementary directions of
// correction. Phase 3 sign-off F12 explicitly accepts this layering.

// === Constants — sign-off F2 / F3 / F5 ===

// Last-N hard sets fed into the SMA. Phase 3.2's repository helper
// is responsible for slicing to this size in SQL.
export const BIAS_WINDOW_SIZE = 10;

// Symmetric clamp on the bias output (Phase 3 sign-off F3). One full
// RPE point is enough to absorb meaningful skill differences without
// letting a misreported set push recommendations too far.
export const BIAS_CLAMP_MAX = 1.0;

// Cold-start gradient bounds (Phase 3 sign-off F5). Below MIN, the
// bias is suppressed entirely. Between MIN and FULL it linearly
// blends in. At FULL or above, the clamped value is applied verbatim.
export const COLD_START_MIN_SAMPLES = 5;
export const COLD_START_FULL_SAMPLES = 10;

// === Types ===

export interface RpeBiasSample {
  // kg, the weight actually lifted on the recorded set.
  weight: number;
  reps: number;
  // The user-reported RPE for the set. 0-10 scale (0.5 step).
  actualRpe: number;
  // The latest e1RM at the time of the recorded set. Per Phase 3
  // sign-off, callers pass the already-adjusted e1RM (Phase 9.1's
  // 'adjusted' formula row when present) so this layer sits on top
  // of the per-set accuracy refinement.
  e1rm: number;
}

// 'cold_start': N < MIN, bias is forced to 0.
// 'partial':    MIN ≤ N < FULL, bias is the clamped mean blended
//               linearly into 0.
// 'full':       N ≥ FULL, bias is the clamped mean as-is.
export type BiasConfidence = 'cold_start' | 'partial' | 'full';

export interface RpeBiasResult {
  bias: number;
  sampleCount: number;
  confidence: BiasConfidence;
}

// === Helpers ===

// Reps the Helms/RTS table covers explicitly. Off-grid rep counts
// snap to the nearest entry — Phase 3 sign-off chose this over
// linear interpolation because the table is already published as a
// 0.5-RPE-step grid and interpolation buys little accuracy at the
// cost of more obscure boundaries.
const TABLE_REPS = [1, 3, 5, 8, 10, 12] as const;
const TABLE_RIRS = [0, 1, 2, 3, 4] as const;

function nearestTableReps(reps: number): number {
  let best: number = TABLE_REPS[0];
  let bestDiff = Math.abs(reps - best);
  for (const r of TABLE_REPS) {
    const d = Math.abs(reps - r);
    if (d < bestDiff) {
      best = r;
      bestDiff = d;
    }
  }
  return best;
}

// Reverse lookup: given the user's actual lift (weight + reps) and
// their current e1RM, infer what RPE the model would predict.
//
// Method: pct = weight / e1rm. Find the row in rirToPctOf1RM at the
// nearest reps grid point, then the RIR whose tabulated pct is
// closest to the input pct. Convert RIR → RPE via RPE = 10 - RIR.
//
// Returns null on non-finite / non-positive inputs so the caller can
// drop the sample instead of feeding garbage into the average. Above-
// 1RM percentages cap at RPE 10; way-below-table percentages cap at
// RPE 6 (= RIR 4 floor) — both are deliberate to keep extremes from
// dragging the bias estimate.
export function backDeriveRpeFromWeight(
  weight: number,
  reps: number,
  e1rm: number,
): number | null {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (!Number.isFinite(reps) || reps <= 0) return null;
  if (!Number.isFinite(e1rm) || e1rm <= 0) return null;

  const pct = weight / e1rm;
  // pct at or above 1RM → max effort (RIR 0 / RPE 10). Saves a row
  // scan and avoids an "infinity" ambiguity in the search.
  if (pct >= 1.0) return 10;

  const tableReps = nearestTableReps(reps);
  const row = rirToPctOf1RM[tableReps];

  let bestRir: number = TABLE_RIRS[0];
  let bestDiff = Infinity;
  for (const rir of TABLE_RIRS) {
    const tablePct = row[rir];
    const diff = Math.abs(pct - tablePct);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestRir = rir;
    }
  }
  return 10 - bestRir;
}

// === Main aggregator ===

// Mean drift across samples, clamped to ±BIAS_CLAMP_MAX, then
// blended for cold-start confidence.
//
// Samples with non-finite inputs (NaN actualRpe, e1rm=0, etc.) are
// dropped silently so a corrupt row can't poison the SMA. The
// effective N for the cold-start gradient is the count of *valid*
// samples, not the input length.
export function computeRpeBias(samples: RpeBiasSample[]): RpeBiasResult {
  if (!samples || samples.length === 0) {
    return { bias: 0, sampleCount: 0, confidence: 'cold_start' };
  }

  // Defensive cap. Phase 3.2's SQL is supposed to LIMIT to the
  // window size already, but trim again here so the contract holds
  // even if a caller bypasses the repository helper.
  const window = samples.slice(-BIAS_WINDOW_SIZE);

  let driftSum = 0;
  let validCount = 0;
  for (const s of window) {
    if (!Number.isFinite(s.actualRpe)) continue;
    const computedRpe = backDeriveRpeFromWeight(s.weight, s.reps, s.e1rm);
    if (computedRpe === null) continue;
    // Sign convention: positive drift = user reported easier than
    // the model expected → user is stronger.
    driftSum += computedRpe - s.actualRpe;
    validCount += 1;
  }

  if (validCount === 0) {
    return { bias: 0, sampleCount: 0, confidence: 'cold_start' };
  }

  const meanDrift = driftSum / validCount;
  const clamped = Math.max(
    -BIAS_CLAMP_MAX,
    Math.min(BIAS_CLAMP_MAX, meanDrift),
  );

  let bias: number;
  let confidence: BiasConfidence;
  if (validCount < COLD_START_MIN_SAMPLES) {
    bias = 0;
    confidence = 'cold_start';
  } else if (validCount < COLD_START_FULL_SAMPLES) {
    const range = COLD_START_FULL_SAMPLES - COLD_START_MIN_SAMPLES;
    const blend = (validCount - COLD_START_MIN_SAMPLES) / range;
    bias = clamped * blend;
    confidence = 'partial';
  } else {
    bias = clamped;
    confidence = 'full';
  }

  return { bias, sampleCount: validCount, confidence };
}

// === Caller-side helper ===

// Fold bias into the RIR session.tsx hands recommendNextSet.
// adjustedRir = baselineRir - bias (sign-off F7).
// Clamped to [0, 5] so the value stays within rirToPctOf1RM's
// indexed range plus a safety margin (RIR > 4 requires a row
// extension; 5 is a safe cap that snaps back to 4 in the table
// lookup).
export function applyBiasToRir(baselineRir: number, bias: number): number {
  const adjusted = baselineRir - bias;
  return Math.max(0, Math.min(5, adjusted));
}
