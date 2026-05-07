import {
  resolveSlugToExercise,
  resolveSlugsBulk,
} from '../slugResolver';
import type { Exercise } from '../../../types/workout';

function exerciseFixture(slug: string): Exercise {
  return {
    id: 'ex_' + slug,
    nameJa: 'name-' + slug,
    nameEn: null,
    muscleGroup: 'chest',
    secondaryMuscles: null,
    equipment: 'barbell',
    isCustom: false,
    sortOrder: 0,
    exerciseType: 'strength',
    metValue: null,
    createdAt: '2026-05-08T00:00:00.000Z',
    slug,
    primaryMuscle: 'chest_upper',
    movementPattern: 'horizontal_push',
    isCompound: true,
    repRangeLow: 5,
    repRangeHigh: 8,
    formCueJa: null,
    videoUrl: null,
  };
}

describe('resolveSlugToExercise', () => {
  it('returns matched on exact slug hit (Tier 1)', async () => {
    const found = exerciseFixture('bench_press_barbell');
    const result = await resolveSlugToExercise(
      'bench_press_barbell',
      async () => found,
    );
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.exercise.slug).toBe('bench_press_barbell');
    }
  });

  it('returns needs_custom when no slug match', async () => {
    const result = await resolveSlugToExercise(
      'invented_exercise_xyz',
      async () => null,
    );
    expect(result).toEqual({
      kind: 'needs_custom',
      slug: 'invented_exercise_xyz',
    });
  });

  it('returns needs_custom for empty / whitespace slug', async () => {
    const findBySlug = jest.fn(async () => null);
    const result = await resolveSlugToExercise('   ', findBySlug);
    expect(result.kind).toBe('needs_custom');
    expect(findBySlug).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace before lookup', async () => {
    const found = exerciseFixture('squat_barbell');
    const findBySlug = jest.fn(async (s: string) =>
      s === 'squat_barbell' ? found : null,
    );
    const result = await resolveSlugToExercise('  squat_barbell  ', findBySlug);
    expect(result.kind).toBe('matched');
    expect(findBySlug).toHaveBeenCalledWith('squat_barbell');
  });
});

describe('resolveSlugsBulk', () => {
  it('resolves a mixed list with deduplication', async () => {
    const found = exerciseFixture('bench_press_barbell');
    const findBySlug = jest.fn(async (s: string) =>
      s === 'bench_press_barbell' ? found : null,
    );
    const result = await resolveSlugsBulk(
      ['bench_press_barbell', 'unknown_x', 'bench_press_barbell'],
      findBySlug,
    );
    // 2 unique slugs after dedup
    expect(result.size).toBe(2);
    expect(result.get('bench_press_barbell')?.kind).toBe('matched');
    expect(result.get('unknown_x')?.kind).toBe('needs_custom');
    // findBySlug invoked once per unique slug
    expect(findBySlug).toHaveBeenCalledTimes(2);
  });

  it('returns an empty map for an empty input', async () => {
    const result = await resolveSlugsBulk([], async () => null);
    expect(result.size).toBe(0);
  });
});
