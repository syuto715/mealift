import { deloadRecommendationSync } from '../deloadRecommendationSync';
import { runStandardSyncTests } from './standardSyncTests';

// Build 16 / Phase 4.0 / Feature F sync test. Reuses the standard
// 11-case suite from Phase 5 (push contract + pull contract +
// invariants); module-specific edge cases land below if needed.

runStandardSyncTests({
  module: deloadRecommendationSync,
  validLocalPayload: {
    id: 'dr-1',
    profile_id: 'p1',
    detected_at: '2026-05-10T12:00:00.000Z',
    source_week_starts: JSON.stringify([
      '2026-04-13',
      '2026-04-20',
      '2026-04-27',
      '2026-05-04',
    ]),
    affected_muscles: JSON.stringify(['chest', 'biceps']),
    applied_at: null,
    applied_routine_id: null,
    completed_at: null,
    dismissed_at: null,
  },
  validServerRow: {
    id: 'dr-1',
    user_id: 'u-1',
    detected_at: '2026-05-10T12:00:00.000Z',
    source_week_starts: ['2026-04-13', '2026-04-20', '2026-04-27', '2026-05-04'],
    affected_muscles: ['chest', 'biceps'],
    applied_at: null,
    applied_routine_id: null,
    completed_at: null,
    dismissed_at: null,
    updated_at: '2026-05-10T12:00:00.000Z',
    deleted_at: null,
  },
  expectedServerTable: 'user_deload_recommendations',
  expectedLocalTable: 'deload_recommendations',
});
