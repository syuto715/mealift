import { useWorkoutStore } from '../stores/workoutStore';

export function useWorkout() {
  const store = useWorkoutStore();
  return {
    sessionId: store.sessionId,
    routineId: store.routineId,
    startedAt: store.startedAt,
    exercises: store.exercises,
    startSession: store.startSession,
    endSession: store.endSession,
    addExercise: store.addExercise,
    removeExercise: store.removeExercise,
    addSetToExercise: store.addSetToExercise,
    updateSet: store.updateSet,
    completeSet: store.completeSet,
    copyPreviousSets: store.copyPreviousSets,
    isInSession: store.sessionId !== null,
  };
}
