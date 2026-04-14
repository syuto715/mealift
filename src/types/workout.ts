import { UUID, ISODateTimeString, MuscleGroup } from './common';

export interface Exercise {
  id: UUID;
  nameJa: string;
  nameEn: string | null;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[] | null;
  equipment: string | null;
  isCustom: boolean;
  sortOrder: number;
  createdAt: ISODateTimeString;
}

export interface WorkoutRoutine {
  id: UUID;
  profileId: UUID;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface WorkoutRoutineItem {
  id: UUID;
  routineId: UUID;
  exerciseId: UUID;
  targetSets: number;
  targetReps: string | null;
  sortOrder: number;
}

export interface WorkoutSession {
  id: UUID;
  profileId: UUID;
  routineId: UUID | null;
  startedAt: ISODateTimeString;
  finishedAt: ISODateTimeString | null;
  durationSeconds: number | null;
  estimatedCalories: number | null;
  note: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface WorkoutSet {
  id: UUID;
  sessionId: UUID;
  exerciseId: UUID;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  isWarmup: boolean;
  note: string | null;
  createdAt: ISODateTimeString;
}

export interface WorkoutSetInput {
  exerciseId: UUID;
  setNumber: number;
  weightKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  rir?: number | null;
  isWarmup?: boolean;
  note?: string | null;
}

export interface WorkoutRoutineWithItems extends WorkoutRoutine {
  items: (WorkoutRoutineItem & { exercise: Exercise })[];
}

export interface WorkoutSessionWithSets extends WorkoutSession {
  sets: WorkoutSet[];
}
