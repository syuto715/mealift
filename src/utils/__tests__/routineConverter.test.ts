import { convertToRoutineDraft } from '../routineConverter';
import type {
  GeneratedProgram,
  WorkoutBlock,
} from '../../infra/services/aiWorkoutService';
import type { SlugResolution } from '../../infra/services/slugResolver';
import type { Exercise } from '../../types/workout';

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

function block(slug: string, overrides: Partial<WorkoutBlock> = {}): WorkoutBlock {
  return {
    exerciseSlug: slug,
    sets: 3,
    repRangeMin: 5,
    repRangeMax: 8,
    targetRPE: 8,
    restSeconds: 180,
    notes: null,
    ...overrides,
  };
}

const BASE_PROGRAM: GeneratedProgram = {
  programName: 'プッシュプル 4週',
  durationWeeks: 4,
  splitType: 'upper_lower',
  weeks: [
    {
      weekIndex: 1,
      deload: false,
      days: [
        {
          dayLabel: '月曜日',
          blocks: [
            block('bench_press_barbell'),
            block('lat_pulldown_machine', { sets: 4, repRangeMin: 8, repRangeMax: 12 }),
          ],
        },
      ],
    },
  ],
};

describe('convertToRoutineDraft', () => {
  it('builds a draft with the design-mandated name format', () => {
    const found = exerciseFixture('bench_press_barbell');
    const resolutions = new Map<string, SlugResolution>([
      ['bench_press_barbell', { kind: 'matched', exercise: found }],
      ['lat_pulldown_machine', { kind: 'needs_custom', slug: 'lat_pulldown_machine' }],
    ]);
    const result = convertToRoutineDraft(BASE_PROGRAM, 0, 0, resolutions);
    expect(result?.draft.name).toBe('AI生成: プッシュプル 4週 (月曜日)');
  });

  it('formats target_reps as "min-max" when range', () => {
    const found = exerciseFixture('bench_press_barbell');
    const resolutions = new Map<string, SlugResolution>([
      ['bench_press_barbell', { kind: 'matched', exercise: found }],
    ]);
    const result = convertToRoutineDraft(
      {
        ...BASE_PROGRAM,
        weeks: [
          {
            ...BASE_PROGRAM.weeks[0],
            days: [
              {
                dayLabel: '月曜日',
                blocks: [block('bench_press_barbell', { repRangeMin: 5, repRangeMax: 8 })],
              },
            ],
          },
        ],
      },
      0,
      0,
      resolutions,
    );
    expect(result?.draft.items[0].targetReps).toBe('5-8');
  });

  it('collapses equal-bound rep range to a single number', () => {
    const found = exerciseFixture('bench_press_barbell');
    const resolutions = new Map<string, SlugResolution>([
      ['bench_press_barbell', { kind: 'matched', exercise: found }],
    ]);
    const result = convertToRoutineDraft(
      {
        ...BASE_PROGRAM,
        weeks: [
          {
            ...BASE_PROGRAM.weeks[0],
            days: [
              {
                dayLabel: '月曜日',
                blocks: [block('bench_press_barbell', { repRangeMin: 5, repRangeMax: 5 })],
              },
            ],
          },
        ],
      },
      0,
      0,
      resolutions,
    );
    expect(result?.draft.items[0].targetReps).toBe('5');
  });

  it('drops blocks whose slugs are needs_custom and reports them in unresolvedSlugs', () => {
    const found = exerciseFixture('bench_press_barbell');
    const resolutions = new Map<string, SlugResolution>([
      ['bench_press_barbell', { kind: 'matched', exercise: found }],
      ['lat_pulldown_machine', { kind: 'needs_custom', slug: 'lat_pulldown_machine' }],
    ]);
    const result = convertToRoutineDraft(BASE_PROGRAM, 0, 0, resolutions);
    expect(result?.draft.items).toHaveLength(1);
    expect(result?.draft.items[0].exercise.slug).toBe('bench_press_barbell');
    expect(result?.unresolvedSlugs).toEqual(['lat_pulldown_machine']);
  });

  it('returns null when weekIndex / dayIndex is out of range', () => {
    const resolutions = new Map<string, SlugResolution>();
    expect(convertToRoutineDraft(BASE_PROGRAM, 5, 0, resolutions)).toBeNull();
    expect(convertToRoutineDraft(BASE_PROGRAM, 0, 5, resolutions)).toBeNull();
  });

  it('initializes setPattern + patternConfig as null (v1 — no AI auto-pattern)', () => {
    const found = exerciseFixture('bench_press_barbell');
    const resolutions = new Map<string, SlugResolution>([
      ['bench_press_barbell', { kind: 'matched', exercise: found }],
    ]);
    const result = convertToRoutineDraft(
      {
        ...BASE_PROGRAM,
        weeks: [
          {
            ...BASE_PROGRAM.weeks[0],
            days: [
              {
                dayLabel: '月曜日',
                blocks: [block('bench_press_barbell')],
              },
            ],
          },
        ],
      },
      0,
      0,
      resolutions,
    );
    expect(result?.draft.items[0].setPattern).toBeNull();
    expect(result?.draft.items[0].patternConfig).toBeNull();
  });
});
