import { noteSync } from '../noteSync';
import { runStandardSyncTests } from './standardSyncTests';

runStandardSyncTests({
  module: noteSync,
  validLocalPayload: {
    id: 'n-1',
    date: '2026-05-06',
    category: 'training',
    content: 'good session',
  },
  validServerRow: {
    id: 'n-1',
    user_id: 'u-1',
    date: '2026-05-06',
    category: 'training',
    content: 'good session',
    updated_at: '2026-05-06T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_notes',
  expectedLocalTable: 'notes',
});
