import { workoutRoutineItemSync } from '../workoutRoutineItemSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: workoutRoutineItemSync,
  validLocalPayload: {
    id: 'ri-1',
    routine_id: 'r-1',
    exercise_id: 'ex-bench',
    target_sets: 3,
    target_reps: '8-10',
    sort_order: 0,
  },
  validServerRow: {
    id: 'ri-1',
    user_id: 'u-1',
    routine_id: 'r-1',
    exercise_id: 'ex-bench',
    target_sets: 3,
    target_reps: '8-10',
    sort_order: 0,
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_workout_routine_items',
  expectedLocalTable: 'workout_routine_items',
});
