import { waterLogSync } from '../waterLogSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: waterLogSync,
  validLocalPayload: {
    id: 'w-1',
    amount_ml: 250,
    logged_at: '2026-05-06T10:00:00Z',
  },
  validServerRow: {
    id: 'w-1',
    user_id: 'u-1',
    amount_ml: 250,
    logged_at: '2026-05-06T10:00:00Z',
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_water_logs',
  expectedLocalTable: 'water_logs',
});
