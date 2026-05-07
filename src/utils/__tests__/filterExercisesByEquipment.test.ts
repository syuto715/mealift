import type { Exercise } from '../../types/workout';
import type { EquipmentKey } from '../../constants/equipment';
import { filterExercisesByEquipment } from '../filterExercisesByEquipment';

function ex(id: string, equipment: string | null): Exercise {
  return {
    id,
    nameJa: `name-${id}`,
    nameEn: null,
    muscleGroup: 'chest',
    secondaryMuscles: null,
    equipment,
    isCustom: false,
    sortOrder: 0,
    exerciseType: 'strength',
    metValue: null,
    createdAt: '2026-05-07T00:00:00.000Z',
    slug: null,
    primaryMuscle: null,
    movementPattern: null,
    isCompound: false,
    repRangeLow: null,
    repRangeHigh: null,
    formCueJa: null,
    videoUrl: null,
  };
}

const FIXTURES: Exercise[] = [
  ex('barbell-1', 'barbell'),
  ex('barbell-2', 'barbell'),
  ex('dumbbell-1', 'dumbbell'),
  ex('machine-1', 'machine'),
  ex('bodyweight-1', 'bodyweight'),
  ex('null-eq', null),
];

describe('filterExercisesByEquipment', () => {
  it('returns the input unchanged when selection is empty', () => {
    const result = filterExercisesByEquipment(FIXTURES, []);
    expect(result).toBe(FIXTURES);
  });

  it('returns only entries matching a single selected equipment', () => {
    const result = filterExercisesByEquipment(FIXTURES, ['barbell']);
    expect(result.map((e) => e.id)).toEqual(['barbell-1', 'barbell-2']);
  });

  it('OR-joins multiple selected equipments', () => {
    const result = filterExercisesByEquipment(FIXTURES, ['barbell', 'dumbbell']);
    expect(result.map((e) => e.id)).toEqual(['barbell-1', 'barbell-2', 'dumbbell-1']);
  });

  it('returns all known-equipment entries when every category is selected', () => {
    const all: EquipmentKey[] = [
      'barbell',
      'dumbbell',
      'kettlebell',
      'machine',
      'bodyweight',
      'cardio',
      'stretching',
      'other',
    ];
    const result = filterExercisesByEquipment(FIXTURES, all);
    // null-eq should still be excluded — it has no equipment to match against
    expect(result.map((e) => e.id)).toEqual([
      'barbell-1',
      'barbell-2',
      'dumbbell-1',
      'machine-1',
      'bodyweight-1',
    ]);
  });

  it('excludes entries with null equipment when any chip is selected', () => {
    const result = filterExercisesByEquipment(FIXTURES, ['barbell']);
    expect(result.find((e) => e.id === 'null-eq')).toBeUndefined();
  });
});
