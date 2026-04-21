// kcal expenditure for time-based activities.
// Formula: kcal = MET × body_weight_kg × hours
// Reference: 2011 Compendium of Physical Activities.
//
// For null inputs (missing MET on a strength row, zero duration, unknown
// weight), returns null so callers can display a blank instead of 0 — which
// would look like "the activity burned nothing" rather than "we don't know".

export function calculateCaloriesBurned(
  metValue: number | null | undefined,
  bodyWeightKg: number | null | undefined,
  durationMinutes: number | null | undefined,
): number | null {
  if (metValue == null || bodyWeightKg == null || durationMinutes == null) {
    return null;
  }
  if (metValue <= 0 || bodyWeightKg <= 0 || durationMinutes <= 0) {
    return null;
  }
  return metValue * bodyWeightKg * (durationMinutes / 60);
}
