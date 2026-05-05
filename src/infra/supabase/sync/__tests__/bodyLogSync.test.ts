import { bodyLogSync } from '../bodyLogSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: bodyLogSync,
  validLocalPayload: {
    id: 'b-1',
    date: '2026-05-06',
    weight_kg: 70,
    body_fat_pct: 18,
    muscle_mass_kg: 50,
    note: null,
  },
  validServerRow: {
    id: 'b-1',
    user_id: 'u-1',
    date: '2026-05-06',
    weight_kg: 70,
    body_fat_pct: 18,
    muscle_mass_kg: 50,
    note: null,
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_body_logs',
  expectedLocalTable: 'body_logs',
});
