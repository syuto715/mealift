// Stub the database connection layer so the workoutRepository import
// chain doesn't drag expo-sqlite (an ESM native module) through Jest's
// CJS transform. The helper under test takes its DB via parameter, so
// the mocked getDatabase() is never actually invoked.
jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
// generateId() pulls expo-crypto via ../../utils/id; mock the named
// export so the import chain stops at the boundary.
jest.mock('../../../utils/id', () => ({ generateId: () => 'stub-id' }));

import type { SQLiteDatabase } from 'expo-sqlite';
import { listExerciseSlugsByMuscles } from '../workoutRepository';
import type { MuscleGroup } from '../../../types/common';

// Build 15 / Session 8 / Phase 6 — Pattern C slug list builder.
//
// Tests run against a focused fake DB that pattern-matches the two
// SQL shapes the helper emits (primary filter + top-up). Same approach
// as userConsentRepository.test.ts — keep the fake small and keyed on
// the actual SQL the unit emits, not a generic engine.

interface FakeRow {
  slug: string;
  muscle_group: MuscleGroup;
  secondary_muscles: string | null;
  is_compound: 0 | 1;
  sort_order: number;
  deleted_at: string | null;
}

const ALL_ROWS: FakeRow[] = [
  // Chest — 3 rows, two with secondary_muscles populated
  { slug: 'bench_press_barbell', muscle_group: 'chest', secondary_muscles: '["shoulders","arms"]', is_compound: 1, sort_order: 1, deleted_at: null },
  { slug: 'incline_bench_press_barbell', muscle_group: 'chest', secondary_muscles: '["shoulders","arms"]', is_compound: 1, sort_order: 2, deleted_at: null },
  { slug: 'dumbbell_fly', muscle_group: 'chest', secondary_muscles: null, is_compound: 0, sort_order: 3, deleted_at: null },
  // Back — 2 rows
  { slug: 'deadlift_barbell', muscle_group: 'back', secondary_muscles: '["legs","core"]', is_compound: 1, sort_order: 10, deleted_at: null },
  { slug: 'lat_pulldown_machine', muscle_group: 'back', secondary_muscles: '["arms"]', is_compound: 1, sort_order: 11, deleted_at: null },
  // Shoulders — 2 rows
  { slug: 'overhead_press_barbell', muscle_group: 'shoulders', secondary_muscles: '["arms","core"]', is_compound: 1, sort_order: 20, deleted_at: null },
  { slug: 'lateral_raise_dumbbell', muscle_group: 'shoulders', secondary_muscles: null, is_compound: 0, sort_order: 21, deleted_at: null },
  // Arms — 2 rows
  { slug: 'barbell_curl', muscle_group: 'arms', secondary_muscles: null, is_compound: 0, sort_order: 30, deleted_at: null },
  { slug: 'tricep_pushdown', muscle_group: 'arms', secondary_muscles: null, is_compound: 0, sort_order: 31, deleted_at: null },
  // Legs — 2 rows
  { slug: 'squat_barbell', muscle_group: 'legs', secondary_muscles: '["core"]', is_compound: 1, sort_order: 40, deleted_at: null },
  { slug: 'leg_press_machine', muscle_group: 'legs', secondary_muscles: null, is_compound: 1, sort_order: 41, deleted_at: null },
  // Core — 2 rows
  { slug: 'plank', muscle_group: 'core', secondary_muscles: null, is_compound: 0, sort_order: 50, deleted_at: null },
  { slug: 'hanging_leg_raise', muscle_group: 'core', secondary_muscles: null, is_compound: 0, sort_order: 51, deleted_at: null },
  // Full body — 1 row, compound (always included)
  { slug: 'clean_and_press', muscle_group: 'full_body', secondary_muscles: '["legs","back","shoulders"]', is_compound: 1, sort_order: 60, deleted_at: null },
  // Soft-deleted row — never returned
  { slug: 'old_chest_thing', muscle_group: 'chest', secondary_muscles: null, is_compound: 0, sort_order: 99, deleted_at: '2026-01-01T00:00:00Z' },
];

function makeFakeDb(rows: FakeRow[] = ALL_ROWS): SQLiteDatabase {
  // Match the two SQL shapes the helper emits. Both shapes filter on
  // slug IS NOT NULL + deleted_at IS NULL, then differ in their main
  // predicate. The fake recognizes shape via substring matches on the
  // actual SQL strings the helper writes.
  const fake = {
    getAllAsync: async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const live = rows.filter(
        (r) => r.slug !== null && r.deleted_at === null,
      );

      // Empty-muscles fallback path: just slug IS NOT NULL + deleted_at + ORDER BY.
      // Distinguished by absence of muscle_group / is_compound predicates.
      if (
        !sql.includes('muscle_group') &&
        !sql.includes('is_compound')
      ) {
        return live
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
          .map((r) => ({ slug: r.slug })) as T[];
      }

      // Top-up path (is_compound = 1, optional NOT IN, LIMIT). Distinguished
      // by is_compound predicate + LIMIT clause.
      if (sql.includes('is_compound = 1') && sql.includes('LIMIT')) {
        const limit = params[params.length - 1] as number;
        const exclude = new Set(
          params.slice(0, params.length - 1) as string[],
        );
        return live
          .filter((r) => r.is_compound === 1 && !exclude.has(r.slug))
          .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
          .slice(0, limit)
          .map((r) => ({ slug: r.slug })) as T[];
      }

      // Primary path: muscle_group IN (...) OR muscle_group = 'full_body'
      // OR (secondary_muscles IS NOT NULL AND (... LIKE ...)).
      // Params layout: [...muscles, ...likeParams] where likeParams are
      // '%"chest"%' style.
      const likeStartIdx = params.findIndex(
        (p) => typeof p === 'string' && p.startsWith('%"'),
      );
      const muscles = (likeStartIdx === -1
        ? params
        : params.slice(0, likeStartIdx)) as MuscleGroup[];
      const likeParams = (likeStartIdx === -1
        ? []
        : params.slice(likeStartIdx)) as string[];

      const muscleSet = new Set(muscles);
      const filtered = live.filter((r) => {
        if (muscleSet.has(r.muscle_group)) return true;
        if (r.muscle_group === 'full_body') return true;
        if (r.secondary_muscles) {
          for (const lp of likeParams) {
            // '%"chest"%' → contains '"chest"'
            const needle = lp.slice(1, lp.length - 1);
            if (r.secondary_muscles.includes(needle)) return true;
          }
        }
        return false;
      });
      return filtered
        .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
        .map((r) => ({ slug: r.slug })) as T[];
    },
  };
  return fake as unknown as SQLiteDatabase;
}

describe('listExerciseSlugsByMuscles', () => {
  it('returns all live slugs when called with empty muscles array', async () => {
    const db = makeFakeDb();
    const result = await listExerciseSlugsByMuscles([], { minCount: 30 }, db);
    // 14 live rows (15 total - 1 soft-deleted).
    expect(result).toHaveLength(14);
    expect(result).not.toContain('old_chest_thing');
  });

  it('includes primary muscle matches and full_body, even when minCount is small', async () => {
    const db = makeFakeDb();
    const result = await listExerciseSlugsByMuscles(['chest'], { minCount: 1 }, db);
    // 3 chest + 1 full_body (clean_and_press always included).
    expect(result).toContain('bench_press_barbell');
    expect(result).toContain('incline_bench_press_barbell');
    expect(result).toContain('dumbbell_fly');
    expect(result).toContain('clean_and_press');
    expect(result).toHaveLength(4);
  });

  it('picks up secondary_muscles JSON LIKE matches for synergist coverage', async () => {
    const db = makeFakeDb();
    // 'shoulders' filter → primary = 2 (overhead_press, lateral_raise);
    // secondary matches = 3 (bench_press_barbell, incline_bench_press_barbell, clean_and_press);
    // full_body = 1 (clean_and_press, dedup with secondary).
    const result = await listExerciseSlugsByMuscles(
      ['shoulders'],
      { minCount: 1 },
      db,
    );
    expect(result).toContain('overhead_press_barbell');
    expect(result).toContain('lateral_raise_dumbbell');
    expect(result).toContain('bench_press_barbell');
    expect(result).toContain('incline_bench_press_barbell');
    expect(result).toContain('clean_and_press');
    // No duplicate even though clean_and_press hits both full_body and
    // the '"shoulders"' substring in its secondary_muscles JSON.
    const counts = new Map<string, number>();
    for (const s of result) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const [, c] of counts) expect(c).toBe(1);
  });

  it('tops up with compound exercises when filter result is below minCount', async () => {
    const db = makeFakeDb();
    // 'core' filter alone hits: 2 core + 1 full_body (clean_and_press) +
    // 0 secondary_muscles matches with '"core"' on this sample = 3 total
    // (some rows do have '"core"' in their secondary — squat_barbell,
    // overhead_press_barbell, deadlift_barbell — so primary actually = 6).
    // Asking for minCount=10 forces the top-up to add compound rows.
    const result = await listExerciseSlugsByMuscles(
      ['core'],
      { minCount: 10 },
      db,
    );
    // Primary: plank, hanging_leg_raise (core) + clean_and_press (full_body)
    // + squat_barbell, overhead_press_barbell, deadlift_barbell (secondary).
    // = 6. Top-up adds is_compound=1 rows not yet included until we hit 10.
    // Compound pool: bench_press_barbell, incline_bench_press_barbell,
    // deadlift_barbell, lat_pulldown_machine, overhead_press_barbell,
    // squat_barbell, leg_press_machine, clean_and_press = 8 total.
    // Of those, 4 already in primary → top-up has 4 candidates, pads up to 10.
    expect(result.length).toBeGreaterThanOrEqual(10);
    expect(result).toContain('plank');
    expect(result).toContain('clean_and_press');
    expect(result).toContain('bench_press_barbell'); // top-up
  });

  it('does NOT trigger top-up when primary result already exceeds minCount', async () => {
    const db = makeFakeDb();
    // Spy via wrapper to count getAllAsync calls.
    const realDb = makeFakeDb();
    let callCount = 0;
    type GetAll = <T>(sql: string, params: unknown[]) => Promise<T[]>;
    const realGetAll = (realDb as unknown as { getAllAsync: GetAll })
      .getAllAsync;
    const spy = {
      getAllAsync: (async (sql: string, params: unknown[]) => {
        callCount++;
        return realGetAll(sql, params);
      }) as GetAll,
    } as unknown as SQLiteDatabase;
    void db;
    // Wide filter (chest+back+shoulders) already yields 7 primary rows
    // + secondary matches; minCount=3 doesn't trigger top-up.
    const result = await listExerciseSlugsByMuscles(
      ['chest', 'back', 'shoulders'],
      { minCount: 3 },
      spy,
    );
    expect(result.length).toBeGreaterThan(3);
    // Only the primary query should have run — no top-up.
    expect(callCount).toBe(1);
  });

  it('excludes soft-deleted rows from every tier', async () => {
    const db = makeFakeDb();
    const result = await listExerciseSlugsByMuscles(
      ['chest'],
      { minCount: 30 },
      db,
    );
    // Forces top-up (only 4 primary rows for chest+full_body in this fixture).
    expect(result).not.toContain('old_chest_thing');
  });
});
