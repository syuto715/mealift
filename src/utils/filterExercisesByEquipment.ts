import type { Exercise } from '../types/workout';
import type { EquipmentKey } from '../constants/equipment';

// Pure post-filter for the training picker equipment chip row (Build 15
// Feature 5-P). Lives outside the SQL refetch loop — chip toggle
// re-derives this in-memory via useMemo. See
// memory/feedback_filter_pipeline_architecture.md.
//
// Empty selection short-circuits to the input array (default = no filter,
// not "match nothing"). Multi-select OR within the chip row.
export function filterExercisesByEquipment(
  exercises: Exercise[],
  selected: readonly EquipmentKey[],
): Exercise[] {
  if (selected.length === 0) return exercises;
  const set = new Set<EquipmentKey>(selected);
  return exercises.filter(
    (ex) =>
      typeof ex.equipment === 'string' && set.has(ex.equipment as EquipmentKey),
  );
}
