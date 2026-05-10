import type { VolumeGroup } from './volumeLandmark';

// Build 16 / Phase 6 (Muscle Recovery Heatmap) / Phase 6.1 — recovery
// state domain layer.
//
// Pure logic. No DB / no IO. Two responsibilities:
//
//   1. computeRecoveryState — given a per-muscle last-trained timestamp,
//      the current time, and that muscle's MUSCLE_RECOVERY_HOURS value,
//      produce { hoursSinceLastTrained, recoveryPct, state }. Phase 6
//      recon §B2 sign-off chose the (α) Linear formula:
//        recoveryPct = min(100, max(0, hoursSince / recoveryHours × 100))
//      Linear keeps the math transparent — explainable to the user,
//      auditable in tests, no curve-fitting parameters to tune.
//
//   2. summarizeRecovery — wraps computeRecoveryState across all 9
//      VolumeGroups. UI layer (Phase 6.2/6.3) consumes the result to
//      paint the body diagram and render per-muscle copy.
//
// State 4-zone classification (Phase 6 recon §C9 / §B2):
//   'unstimulated' — never trained (lastTrained === null). The muscle
//                    is technically "fully recovered" by the formula
//                    but the UI surfaces it as "未刺激" / gray-band.
//   'recovering'   — recoveryPct < 50. Heavy fatigue, retraining now
//                    likely cumulative.
//   'partial'      — 50 <= recoveryPct < 100. Adequate for non-overlap
//                    work but not at peak.
//   'recovered'    — recoveryPct >= 100. Ready for hard volume.
//
// Edge-case contracts (caller defensive):
//   - lastTrained === null → 'unstimulated' / 100% / null
//   - recoveryHours <= 0 → 'recovered' / 100% (treat as no recovery
//                            time needed; defensive against future
//                            constant-table drift)
//   - clock skew (now < lastTrained) → 'recovering' / 0% / 0h
//                            (treat as just-trained; don't propagate
//                            negative hours into UI copy)

export type RecoveryStateLabel =
  | 'unstimulated'
  | 'recovering'
  | 'partial'
  | 'recovered';

export interface RecoveryState {
  // null when the muscle has never been trained. Otherwise the elapsed
  // hours since the last working set, clamped to >= 0 (clock-skew
  // guard).
  hoursSinceLastTrained: number | null;
  // 0-100 inclusive. Linear ramp from 0 (just trained) to 100
  // (recoveryHours fully elapsed). Clamped at the upper bound so a
  // muscle that hasn't been hit in weeks reads as 100, not 800.
  recoveryPct: number;
  state: RecoveryStateLabel;
}

const HOUR_MS = 3_600_000;

// === Pure: per-muscle ===

export function computeRecoveryState(
  lastTrained: Date | null,
  now: Date,
  recoveryHours: number,
): RecoveryState {
  // Untrained muscle — keep recoveryPct at 100 (the formula would
  // technically yield "infinite hours / Nh = ∞%" so the answer is
  // also 100, but the path is special-cased to short-circuit and
  // surface the dedicated 'unstimulated' label rather than blending
  // into 'recovered'.
  if (lastTrained === null) {
    return {
      hoursSinceLastTrained: null,
      recoveryPct: 100,
      state: 'unstimulated',
    };
  }

  const diffMs = now.getTime() - lastTrained.getTime();
  // Clock-skew guard: a future-dated lastTrained (sync race / device
  // clock drift) would otherwise produce a negative recoveryPct that
  // clamps weirdly. Floor to 0 hours = "just trained" — the most
  // conservative reading.
  const hoursSince = diffMs <= 0 ? 0 : diffMs / HOUR_MS;

  // Codex review pass 1 / Important #1 — defensive recoveryHours≤0
  // path now preserves the real elapsed hours rather than stamping
  // 0. The previous branch was hiding the actual time-since-last-
  // trained from the UI ("120時間前" copy would show "0時間前" for
  // a muscle that just happened to lose its recovery-window value).
  // recoveryPct still locks at 100 because the formula would divide
  // by zero; only the displayed elapsed-hours value is corrected.
  if (recoveryHours <= 0) {
    return {
      hoursSinceLastTrained: hoursSince,
      recoveryPct: 100,
      state: 'recovered',
    };
  }

  const recoveryPct = Math.min(100, Math.max(0, (hoursSince / recoveryHours) * 100));

  let state: RecoveryStateLabel;
  if (recoveryPct >= 100) state = 'recovered';
  else if (recoveryPct >= 50) state = 'partial';
  else state = 'recovering';

  return {
    hoursSinceLastTrained: hoursSince,
    recoveryPct,
    state,
  };
}

// === Pure: 9-muscle aggregator ===

// Wraps computeRecoveryState across every VolumeGroup. The output
// has all 9 keys populated regardless of input completeness — a
// caller that passes a partial `lastTrainedByMuscle` (e.g. a fresh
// user with no training history at all → fetchLastTrainedByMuscle
// returns 9× null) still gets a fully-shaped result.
export function summarizeRecovery(
  lastTrainedByMuscle: Record<VolumeGroup, Date | null>,
  now: Date,
  recoveryHoursTable: Record<VolumeGroup, number>,
): Record<VolumeGroup, RecoveryState> {
  const groups: VolumeGroup[] = [
    'chest',
    'back',
    'shoulder_mid',
    'biceps',
    'triceps',
    'quads',
    'hamstrings',
    'glutes',
    'calves',
  ];
  const out = {} as Record<VolumeGroup, RecoveryState>;
  for (const group of groups) {
    out[group] = computeRecoveryState(
      lastTrainedByMuscle[group] ?? null,
      now,
      recoveryHoursTable[group] ?? 0,
    );
  }
  return out;
}
