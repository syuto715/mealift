import { workoutSessionSync } from '../workoutSessionSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: workoutSessionSync,
  validLocalPayload: {
    id: 'sess-1',
    routine_id: 'r-1',
    started_at: '2026-05-06T09:00:00Z',
    finished_at: '2026-05-06T10:00:00Z',
    duration_seconds: 3600,
    estimated_calories: 250,
    note: null,
  },
  validServerRow: {
    id: 'sess-1',
    user_id: 'u-1',
    routine_id: 'r-1',
    started_at: '2026-05-06T09:00:00Z',
    finished_at: '2026-05-06T10:00:00Z',
    duration_seconds: 3600,
    estimated_calories: 250,
    note: null,
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_workout_sessions',
  expectedLocalTable: 'workout_sessions',
});
