// v1.5 Stage 1 Phase 1.5 — coach-routine generated JSON schema.
//
// Hand-written validator (no Zod; deno_std doesn't ship a JSON-schema
// runtime). Follows the existing `generate-workout-menu/index.ts`
// `validateGeneratedProgram` pattern, but shaped for a single
// routine applicable to the client's workout_routines /
// workout_routine_items tables (NOT a multi-week program — that's
// the older generate-workout-menu EF).
//
// Drafting 105 application: this helper lives in `_shared/` so the
// future `coach-diagnostic` EF (Phase 1.3) can re-use the same
// shape contract when its wizard hands off to coach-routine.

export interface GeneratedRoutineItem {
  exerciseSlug: string;
  targetSets: number;
  targetReps: string;
  /** Optional — currently unused on the client side (workout_routine_items
   *  doesn't carry a notes column), kept for future surfaces + audit. */
  notes?: string;
}

export interface GeneratedRoutine {
  routineName: string;
  items: GeneratedRoutineItem[];
}

const ROUTINE_NAME_MAX = 80;
const ITEMS_MAX = 30;
const ITEM_NOTES_MAX = 200;
const SLUG_MAX = 80;
const TARGET_REPS_MAX = 16;
const TARGET_SETS_MIN = 1;
const TARGET_SETS_MAX = 12;

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Returns null when valid, error string otherwise. */
export function validateGeneratedRoutine(raw: unknown): string | null {
  if (!isPlainObject(raw)) return 'response is not an object';
  if (
    typeof raw.routineName !== 'string' ||
    raw.routineName.length === 0 ||
    raw.routineName.length > ROUTINE_NAME_MAX
  ) {
    return `routineName missing or out of [1, ${ROUTINE_NAME_MAX}]`;
  }
  if (
    !Array.isArray(raw.items) ||
    raw.items.length === 0 ||
    raw.items.length > ITEMS_MAX
  ) {
    return `items must be a non-empty array of length 1-${ITEMS_MAX}`;
  }
  for (let i = 0; i < raw.items.length; i++) {
    const item = raw.items[i];
    if (!isPlainObject(item)) return `items[${i}] is not an object`;
    if (
      typeof item.exerciseSlug !== 'string' ||
      item.exerciseSlug.length === 0 ||
      item.exerciseSlug.length > SLUG_MAX
    ) {
      return `items[${i}].exerciseSlug missing or out of [1, ${SLUG_MAX}]`;
    }
    if (
      typeof item.targetSets !== 'number' ||
      !Number.isInteger(item.targetSets) ||
      item.targetSets < TARGET_SETS_MIN ||
      item.targetSets > TARGET_SETS_MAX
    ) {
      return `items[${i}].targetSets out of [${TARGET_SETS_MIN}, ${TARGET_SETS_MAX}]`;
    }
    if (
      typeof item.targetReps !== 'string' ||
      item.targetReps.length === 0 ||
      item.targetReps.length > TARGET_REPS_MAX
    ) {
      return `items[${i}].targetReps missing or out of [1, ${TARGET_REPS_MAX}]`;
    }
    if (item.notes !== undefined) {
      if (typeof item.notes !== 'string' || item.notes.length > ITEM_NOTES_MAX) {
        return `items[${i}].notes out of [0, ${ITEM_NOTES_MAX}]`;
      }
    }
  }
  return null;
}

/** Defensive projection: takes the validator's accepted shape and
 *  returns a plain object stripped of any extra fields a hostile
 *  Gemini response might smuggle in. */
export function projectGeneratedRoutine(raw: unknown): GeneratedRoutine {
  const r = raw as { routineName: string; items: GeneratedRoutineItem[] };
  return {
    routineName: r.routineName,
    items: r.items.map((it) => {
      const projected: GeneratedRoutineItem = {
        exerciseSlug: it.exerciseSlug,
        targetSets: it.targetSets,
        targetReps: it.targetReps,
      };
      if (typeof it.notes === 'string' && it.notes.length > 0) {
        projected.notes = it.notes;
      }
      return projected;
    }),
  };
}
