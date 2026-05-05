import { weeklyReportSync } from '../weeklyReportSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: weeklyReportSync,
  validLocalPayload: {
    id: 'wr-1',
    week_start: '2026-05-04',
    week_end: '2026-05-10',
    data_json: '{"avgCalories":2000}',
  },
  validServerRow: {
    id: 'wr-1',
    user_id: 'u-1',
    week_start: '2026-05-04',
    week_end: '2026-05-10',
    data_json: { avgCalories: 2000 },
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_weekly_reports',
  expectedLocalTable: 'weekly_reports',
});
