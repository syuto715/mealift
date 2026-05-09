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

// Codex review pass 1 / Important #3 — push side must enforce
// "array or empty array" symmetric with the pull side. Non-array
// local TEXT (hand-edited, sync race, future schema gap) must NOT
// reach the server's JSONB column with the wrong shape.
import { makeFakeDb, makeMockClient, makeQueueRow } from './testHelpers';

describe('deloadRecommendationSync — JSON array enforcement (push)', () => {
  const NON_ARRAY_CASES: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['JSON string scalar', '"x"'],
    ['JSON object', '{"chest": true}'],
    ['JSON null literal', 'null'],
    ['malformed JSON', '{not-valid'],
  ];
  for (const [label, raw] of NON_ARRAY_CASES) {
    it(`coerces non-array local source_week_starts (${label}) to [] before push`, async () => {
      const { client, upsertCalls } = makeMockClient({ userId: 'u-1' });
      const { db } = makeFakeDb();
      await deloadRecommendationSync.pushOne(
        client,
        db,
        makeQueueRow({
          table: 'deload_recommendations',
          recordId: 'dr-coerce',
          operation: 'INSERT',
          payload: {
            id: 'dr-coerce',
            profile_id: 'p1',
            detected_at: '2026-05-10T12:00:00.000Z',
            source_week_starts: raw,
            affected_muscles: JSON.stringify(['chest']),
          },
        }),
      );
      expect(upsertCalls).toHaveLength(1);
      const upserted = upsertCalls[0].payload;
      expect(upserted.source_week_starts).toEqual([]);
      // affected_muscles still parses cleanly so the server gets a
      // mixed shape only on the corrupt column.
      expect(upserted.affected_muscles).toEqual(['chest']);
    });
  }
});
