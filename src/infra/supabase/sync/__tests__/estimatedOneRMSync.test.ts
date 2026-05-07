import { estimatedOneRMSync } from '../estimatedOneRMSync';
import { runStandardSyncTests } from './standardSyncTests';

// Build 15 / Feature 5-B sync round-trip — covers 'adjusted' formula
// (Phase 3) explicitly so the §7.3 RPE-feedback row class survives
// push + pull through the watermark batch fetch and the server CHECK
// constraint accepts it (extended in migration 20260507000008).
runStandardSyncTests({
  module: estimatedOneRMSync,
  validLocalPayload: {
    id: 'e1rm-1',
    profile_id: 'profile-1',
    exercise_id: 'ex-bench',
    e1rm_kg: 110.5,
    formula: 'adjusted',
    source_set_id: 'set-1',
    observed_at: '2026-05-07T10:00:00Z',
  },
  validServerRow: {
    id: 'e1rm-1',
    user_id: 'u-1',
    exercise_id: 'ex-bench',
    e1rm_kg: 110.5,
    formula: 'adjusted',
    source_set_id: 'set-1',
    observed_at: '2026-05-07T10:00:00Z',
    updated_at: '2026-05-07T10:00:00Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_estimated_1rm',
  expectedLocalTable: 'estimated_1rm',
});
