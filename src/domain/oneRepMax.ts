// Epley formula: 1RM = weight × (1 + reps / 30). Reps are clamped to 30
// because Epley extrapolates wildly above that — a stale reps=500 typo once
// produced a 1766.7kg "estimate" from a 100kg lift, which is what triggered
// this guard.
export const EPLEY_REPS_CAP = 30;

// Raw (unrounded) Epley estimate used by the PR pipeline so downstream code
// can apply its own rounding policy.
export function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const cappedReps = Math.min(reps, EPLEY_REPS_CAP);
  return weight * (1 + cappedReps / 30);
}

// Convenience wrapper that rounds to 1 decimal — used by the training UI.
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  const cappedReps = Math.min(reps, EPLEY_REPS_CAP);
  return Math.round(weightKg * (1 + cappedReps / 30) * 10) / 10;
}

export function estimateWeightForReps(oneRepMax: number, targetReps: number): number {
  if (targetReps <= 0 || oneRepMax <= 0) return 0;
  if (targetReps === 1) return oneRepMax;
  const cappedReps = Math.min(targetReps, EPLEY_REPS_CAP);
  return Math.round((oneRepMax / (1 + cappedReps / 30)) * 10) / 10;
}
