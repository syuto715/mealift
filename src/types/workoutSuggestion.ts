import { MuscleGroup } from './common';

export interface MuscleRecoveryStatus {
  muscleGroup: MuscleGroup;
  lastTrainedDate: string | null;
  hoursSinceTraining: number | null;
  recoveryPercent: number; // 0-100, 100 = fully recovered
  status: 'recovered' | 'recovering' | 'fatigued';
}

export interface WorkoutSuggestion {
  suggestedMuscleGroups: MuscleGroup[];
  reason: string;
  recoveryStatuses: MuscleRecoveryStatus[];
}
