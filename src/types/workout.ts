import { UUID, ISODateTimeString, MuscleGroup } from './common';

export type ExerciseType = 'strength' | 'cardio' | 'sports' | 'other';

// Movement pattern taxonomy (Build 15 / Feature 5-A). Used by the AI
// menu generator (Session 8 / 5-元) to balance push/pull/squat/hinge
// across a workout. NULL allowed for cardio/sports/other rows that
// don't fit the strength-training taxonomy.
export type MovementPattern =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'rotation'
  | 'isolation_curl'
  | 'isolation_extension'
  | 'isolation_raise'
  | 'isolation_fly'
  | 'core_flexion'
  | 'core_anti_extension'
  | 'core_anti_rotation'
  | 'olympic'
  | 'other';

export interface Exercise {
  id: UUID;
  nameJa: string;
  nameEn: string | null;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[] | null;
  equipment: string | null;
  isCustom: boolean;
  sortOrder: number;
  exerciseType: ExerciseType;
  metValue: number | null;
  createdAt: ISODateTimeString;
  // Build 15 / Feature 5-A — exercise DB expansion. All nullable for
  // pre-v25 rows that haven't been re-seeded yet, plus user customs
  // (is_custom=1) which never get auto-populated.
  slug: string | null;
  primaryMuscle: string | null;
  movementPattern: MovementPattern | null;
  isCompound: boolean;
  repRangeLow: number | null;
  repRangeHigh: number | null;
  formCueJa: string | null;
  videoUrl: string | null;
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
  durationMinutes: number | null;
  distanceKm: number | null;
  caloriesBurned: number | null;
  perceivedIntensity: number | null;
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
  durationMinutes?: number | null;
  distanceKm?: number | null;
  caloriesBurned?: number | null;
  perceivedIntensity?: number | null;
}

export interface WorkoutRoutineWithItems extends WorkoutRoutine {
  items: (WorkoutRoutineItem & { exercise: Exercise })[];
}

export interface WorkoutSessionWithSets extends WorkoutSession {
  sets: WorkoutSet[];
}
