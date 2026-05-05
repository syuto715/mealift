import { mealLogSync } from '../mealLogSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: mealLogSync,
  validLocalPayload: {
    id: 'ml-1',
    date: '2026-05-06',
    meal_type: 'lunch',
  },
  validServerRow: {
    id: 'ml-1',
    user_id: 'u-1',
    date: '2026-05-06',
    meal_type: 'lunch',
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_meal_logs',
  expectedLocalTable: 'meal_logs',
});
