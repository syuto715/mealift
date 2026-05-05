import { customExerciseSync } from '../customExerciseSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: customExerciseSync,
  validLocalPayload: {
    id: 'ex-1',
    name_ja: '懸垂',
    name_en: 'Pull-ups',
    muscle_group: 'back',
    secondary_muscles: null,
    equipment: 'bodyweight',
    default_rest_seconds: 120,
    exercise_type: 'strength',
    met_value: 8,
    sort_order: 999,
  },
  validServerRow: {
    id: 'ex-1',
    user_id: 'u-1',
    name_ja: '懸垂',
    name_en: 'Pull-ups',
    muscle_group: 'back',
    secondary_muscles: null,
    equipment: 'bodyweight',
    default_rest_seconds: 120,
    exercise_type: 'strength',
    met_value: 8,
    sort_order: 999,
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_custom_exercises',
  expectedLocalTable: 'exercises',
});
