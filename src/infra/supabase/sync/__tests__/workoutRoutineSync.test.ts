import { workoutRoutineSync } from '../workoutRoutineSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: workoutRoutineSync,
  validLocalPayload: {
    id: 'r-1',
    name: 'Push Day',
    description: 'chest + tri',
    sort_order: 0,
  },
  validServerRow: {
    id: 'r-1',
    user_id: 'u-1',
    name: 'Push Day',
    description: 'chest + tri',
    sort_order: 0,
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_workout_routines',
  expectedLocalTable: 'workout_routines',
});
