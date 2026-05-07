import { create } from 'zustand';
import { MuscleGroup } from '../types/common';
import { ExerciseType, SetPattern, SetType, WorkoutSet } from '../types/workout';
import { generateId } from '../utils/id';

export interface SetInSession {
  id: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  caloriesBurned: number | null;
  perceivedIntensity: number | null;
  completed: boolean;
  // Build 15 / Feature 5-O — per-set role. Defaults to 'working' when
  // the user adds a set; warmup/top/drop/failure are set later via
  // routine pattern auto-fill (Phase 5) or per-set override UI (Phase 5).
  setType: SetType;
}

export interface ExerciseInSession {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  exerciseType: ExerciseType;
  metValue: number | null;
  sets: SetInSession[];
  previousSets: WorkoutSet[];
  // Build 15 / Feature 5-O — pattern preset inherited from the source
  // routine_item. NULL = standard routine; in that case the session
  // renders a flat list of 'working' sets and never cascades weights
  // between rows.
  setPattern: SetPattern | null;
  patternConfig: string | null;
}

interface WorkoutState {
  sessionId: string | null;
  routineId: string | null;
  startedAt: string | null;
  exercises: ExerciseInSession[];
  startSession: (sessionId: string, routineId: string | null) => void;
  endSession: () => void;
  addExercise: (exercise: ExerciseInSession) => void;
  removeExercise: (exerciseId: string) => void;
  addSetToExercise: (exerciseId: string) => void;
  removeSetFromExercise: (exerciseId: string, setId: string) => void;
  updateSet: (
    exerciseId: string,
    setId: string,
    updates: Partial<
      Pick<
        SetInSession,
        | 'weightKg'
        | 'reps'
        | 'rpe'
        | 'durationMinutes'
        | 'distanceKm'
        | 'caloriesBurned'
        | 'perceivedIntensity'
        | 'setType'
      >
    >,
  ) => void;
  completeSet: (exerciseId: string, setId: string) => void;
  copyPreviousSets: (exerciseId: string) => void;
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
  sessionId: null,
  routineId: null,
  startedAt: null,
  exercises: [],

  startSession: (sessionId, routineId) =>
    set({
      sessionId,
      routineId,
      startedAt: new Date().toISOString(),
      exercises: [],
    }),

  endSession: () =>
    set({
      sessionId: null,
      routineId: null,
      startedAt: null,
      exercises: [],
    }),

  addExercise: (exercise) =>
    set((state) => ({
      exercises: [...state.exercises, exercise],
    })),

  removeExercise: (exerciseId) =>
    set((state) => ({
      exercises: state.exercises.filter((e) => e.exerciseId !== exerciseId),
    })),

  addSetToExercise: (exerciseId) =>
    set((state) => ({
      exercises: state.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        const nextNumber = ex.sets.length + 1;
        const lastSet = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : null;
        const newSet: SetInSession = {
          id: generateId(),
          setNumber: nextNumber,
          weightKg: lastSet?.weightKg ?? null,
          reps: lastSet?.reps ?? null,
          rpe: null,
          durationMinutes: lastSet?.durationMinutes ?? null,
          distanceKm: lastSet?.distanceKm ?? null,
          caloriesBurned: null,
          perceivedIntensity: lastSet?.perceivedIntensity ?? null,
          completed: false,
          setType: 'working',
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      }),
    })),

  removeSetFromExercise: (exerciseId, setId) =>
    set((state) => ({
      exercises: state.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        const filtered = ex.sets
          .filter((s) => s.id !== setId)
          .map((s, idx) => ({ ...s, setNumber: idx + 1 }));
        return { ...ex, sets: filtered };
      }),
    })),

  updateSet: (exerciseId, setId, updates) =>
    set((state) => ({
      exercises: state.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...updates } : s)),
        };
      }),
    })),

  completeSet: (exerciseId, setId) =>
    set((state) => ({
      exercises: state.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) =>
            s.id === setId ? { ...s, completed: true } : s,
          ),
        };
      }),
    })),

  copyPreviousSets: (exerciseId) =>
    set((state) => ({
      exercises: state.exercises.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        if (ex.previousSets.length === 0) return ex;

        const newSets: SetInSession[] = ex.previousSets.map((prev, idx) => ({
          id: generateId(),
          setNumber: idx + 1,
          weightKg: prev.weightKg,
          reps: prev.reps,
          rpe: null,
          durationMinutes: prev.durationMinutes ?? null,
          distanceKm: prev.distanceKm ?? null,
          caloriesBurned: null,
          perceivedIntensity: prev.perceivedIntensity ?? null,
          completed: false,
          // Build 15 / Feature 5-O — copy the prior session's per-set
          // role. Pre-v26 rows surface as 'warmup' (when is_warmup=1)
          // or 'working' via rowToSet's fallback.
          setType: prev.setType,
        }));

        return { ...ex, sets: newSets };
      }),
    })),
}));
