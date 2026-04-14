// Epley formula: 1RM = weight × (1 + reps / 30)
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function estimateWeightForReps(oneRepMax: number, targetReps: number): number {
  if (targetReps <= 0 || oneRepMax <= 0) return 0;
  if (targetReps === 1) return oneRepMax;
  return Math.round((oneRepMax / (1 + targetReps / 30)) * 10) / 10;
}
