import { personalRecordSync } from '../personalRecordSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: personalRecordSync,
  validLocalPayload: {
    id: 'pr-1',
    exercise_id: 'ex-bench',
    record_type: 'estimated_1rm',
    value: 100,
    weight_kg: 90,
    reps: 5,
    achieved_at: '2026-05-06T10:00:00Z',
    session_id: 'sess-1',
  },
  validServerRow: {
    id: 'pr-1',
    user_id: 'u-1',
    exercise_id: 'ex-bench',
    record_type: 'estimated_1rm',
    value: 100,
    weight_kg: 90,
    reps: 5,
    achieved_at: '2026-05-06T10:00:00Z',
    session_id: 'sess-1',
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_personal_records',
  expectedLocalTable: 'personal_records',
});
