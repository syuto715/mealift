// v1.5 Stage 1 Phase 1.4 — shared Deno-side PII projection helper.
//
// Extracted from `coach-chat/index.ts` so multiple coach EFs
// (`coach-chat`, `coach-advice`, the upcoming `coach-routine`)
// share the same projection logic without duplicating constants /
// type guards / cardinality bounds.
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_1_ai_chat_epic.md §5.1.1 + §6.4
//     (persisted snapshot + Gemini-boundary PII rule).
//   - Drafting checklist 101 (per-field type guards + cardinality
//     bounds; nested-object smuggling is the Round 2 lesson).
//   - Drafting checklist 99 (cross-runtime reuse — Deno-to-Deno
//     within `_shared/` is the safe case; never imports from
//     `src/` which is RN/Expo-only).
//
// Mirror of the server-authoritative UserContext shape declared in
// `src/infra/llm/types.ts`. Keep them in lockstep when adding new
// fields — the EF treats the client's wire payload as untrusted,
// so the projection is the SINGLE place where the boundary type
// is enforced.

export const AGE_RANGES = new Set<string>([
  'under-10',
  '10-14',
  '15-19',
  '20-24',
  '25-29',
  '30-34',
  '35-39',
  '40-44',
  '45-49',
  '50-54',
  '55-59',
  '60-64',
  '65-69',
  '70-74',
  '75-79',
  '80-84',
  '85-plus',
]);
export const SEXES = new Set<string>(['male', 'female', 'other']);
export const GOAL_TYPES = new Set<string>([
  'cut',
  'bulk',
  'maintain',
  'recomp',
]);
export const ACTIVITY_LEVELS = new Set<string>([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]);

export const TOP_FREQUENT_NAMES_MAX = 5;
export const FOOD_NAME_MAX_LEN = 60;
export const ROUTINE_NAMES_MAX = 10;
export const ROUTINE_NAME_MAX_LEN = 60;
export const MUSCLE_KEY_MAX_LEN = 40;
export const WEEKLY_VOLUME_MAX_KEYS = 20;

export function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function asEnum<T extends string>(
  value: unknown,
  set: Set<string>,
): T | undefined {
  return typeof value === 'string' && set.has(value)
    ? (value as T)
    : undefined;
}

export function asBoundedString(
  value: unknown,
  max: number,
): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    ? value
    : undefined;
}

export function projectNutrientSummary(
  value: unknown,
):
  | { calories: number; proteinG: number; fatG: number; carbG: number }
  | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const calories = asFiniteNumber(v.calories);
  const proteinG = asFiniteNumber(v.proteinG);
  const fatG = asFiniteNumber(v.fatG);
  const carbG = asFiniteNumber(v.carbG);
  if (
    calories === undefined ||
    proteinG === undefined ||
    fatG === undefined ||
    carbG === undefined
  ) {
    return undefined;
  }
  return { calories, proteinG, fatG, carbG };
}

export function projectContextSafeSubset(
  input: unknown,
): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const i = input as Record<string, unknown>;

  // ---- profile ------------------------------------------------------
  const rawProfile = (i.profile ?? {}) as Record<string, unknown>;
  const profile = {
    ageRange: asEnum<string>(rawProfile.ageRange, AGE_RANGES),
    sex: asEnum<string>(rawProfile.sex, SEXES),
    heightCm: asFiniteNumber(rawProfile.heightCm),
    weightKg: asFiniteNumber(rawProfile.weightKg),
    goalType: asEnum<string>(rawProfile.goalType, GOAL_TYPES),
    activityLevel: asEnum<string>(rawProfile.activityLevel, ACTIVITY_LEVELS),
    trainingDaysPerWeek: asFiniteNumber(rawProfile.trainingDaysPerWeek),
  };

  // ---- targets ------------------------------------------------------
  const rawTargets = (i.targets ?? {}) as Record<string, unknown>;
  const targets = {
    calories: asFiniteNumber(rawTargets.calories) ?? 0,
    proteinG: asFiniteNumber(rawTargets.proteinG) ?? 0,
    fatG: asFiniteNumber(rawTargets.fatG) ?? 0,
    carbG: asFiniteNumber(rawTargets.carbG) ?? 0,
  };

  // ---- recentMeals --------------------------------------------------
  const rawMeals = (i.recentMeals ?? {}) as Record<string, unknown>;
  const topFrequentNamesIn = Array.isArray(rawMeals.topFrequentNames)
    ? (rawMeals.topFrequentNames as unknown[])
    : [];
  const topFrequentNames: string[] = [];
  for (const candidate of topFrequentNamesIn) {
    const bounded = asBoundedString(candidate, FOOD_NAME_MAX_LEN);
    if (bounded === undefined) continue;
    topFrequentNames.push(bounded);
    if (topFrequentNames.length >= TOP_FREQUENT_NAMES_MAX) break;
  }
  const recentMeals = {
    last7DaysAverage: projectNutrientSummary(rawMeals.last7DaysAverage) ?? {
      calories: 0,
      proteinG: 0,
      fatG: 0,
      carbG: 0,
    },
    todaySoFar: projectNutrientSummary(rawMeals.todaySoFar),
    topFrequentNames,
  };

  // ---- recentWorkouts ----------------------------------------------
  const rawWorkouts = (i.recentWorkouts ?? {}) as Record<string, unknown>;
  const routineNamesIn = Array.isArray(rawWorkouts.routineNames)
    ? (rawWorkouts.routineNames as unknown[])
    : [];
  const routineNames: string[] = [];
  for (const candidate of routineNamesIn) {
    const bounded = asBoundedString(candidate, ROUTINE_NAME_MAX_LEN);
    if (bounded !== undefined) {
      routineNames.push(bounded);
      if (routineNames.length >= ROUTINE_NAMES_MAX) break;
    }
  }
  let weeklyVolumeKgRepsByMuscle: Record<string, number> | undefined;
  if (
    rawWorkouts.weeklyVolumeKgRepsByMuscle !== undefined &&
    rawWorkouts.weeklyVolumeKgRepsByMuscle !== null &&
    typeof rawWorkouts.weeklyVolumeKgRepsByMuscle === 'object' &&
    !Array.isArray(rawWorkouts.weeklyVolumeKgRepsByMuscle)
  ) {
    const out: Record<string, number> = {};
    let kept = 0;
    for (const [k, v] of Object.entries(
      rawWorkouts.weeklyVolumeKgRepsByMuscle as Record<string, unknown>,
    )) {
      const keyOk = asBoundedString(k, MUSCLE_KEY_MAX_LEN);
      const valueOk = asFiniteNumber(v);
      if (keyOk !== undefined && valueOk !== undefined) {
        out[keyOk] = valueOk;
        kept++;
        if (kept >= WEEKLY_VOLUME_MAX_KEYS) break;
      }
    }
    weeklyVolumeKgRepsByMuscle = out;
  }
  const recentWorkouts = {
    last14DaysSessions:
      asFiniteNumber(rawWorkouts.last14DaysSessions) ?? 0,
    routineNames,
    weeklyVolumeKgRepsByMuscle,
  };

  // ---- recentWeightTrend -------------------------------------------
  const rawTrend = (i.recentWeightTrend ?? {}) as Record<string, unknown>;
  const recentWeightTrend = {
    last14DaysKgChange: asFiniteNumber(rawTrend.last14DaysKgChange) ?? 0,
  };

  return {
    profile,
    targets,
    recentMeals,
    recentWorkouts,
    recentWeightTrend,
  };
}
