import { WorkoutSet } from '../types/workout';

export function calculateSetVolume(weightKg: number, reps: number): number {
  return weightKg * reps;
}

export function calculateExerciseVolume(sets: WorkoutSet[]): number {
  return sets
    .filter((s) => !s.isWarmup)
    .reduce((total, s) => total + calculateSetVolume(s.weightKg ?? 0, s.reps ?? 0), 0);
}

export function calculateSessionVolume(sets: WorkoutSet[]): number {
  return sets
    .filter((s) => !s.isWarmup)
    .reduce((total, s) => total + calculateSetVolume(s.weightKg ?? 0, s.reps ?? 0), 0);
}

export function calculateWorkingSets(sets: WorkoutSet[]): number {
  return sets.filter((s) => !s.isWarmup).length;
}
