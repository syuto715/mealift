import { adaptiveGoalSync } from '../adaptiveGoalSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: adaptiveGoalSync,
  validLocalPayload: {
    id: 'ag-1',
    suggestion_json: '{"calories":2200}',
    status: 'pending',
  },
  validServerRow: {
    id: 'ag-1',
    user_id: 'u-1',
    suggestion_json: { calories: 2200 },
    status: 'pending',
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_adaptive_goal_suggestions',
  expectedLocalTable: 'adaptive_goal_suggestions',
});
