import { mealTemplateSync } from '../mealTemplateSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: mealTemplateSync,
  validLocalPayload: {
    id: 'mt-1',
    name: 'Sample Lunch',
    meal_type: 'lunch',
    items: '[{"foodName":"chicken","servingAmount":100}]',
    use_count: 3,
    description: null,
    last_used_at: null,
  },
  validServerRow: {
    id: 'mt-1',
    user_id: 'u-1',
    name: 'Sample Lunch',
    meal_type: 'lunch',
    items: [{ foodName: 'chicken', servingAmount: 100 }],
    use_count: 3,
    description: null,
    last_used_at: null,
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_meal_templates',
  expectedLocalTable: 'meal_templates',
});
