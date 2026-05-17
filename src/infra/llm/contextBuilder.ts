// v1.5 Stage 1 Phase 1.1 — buildUserContext.
//
// Composes existing repositories (profileRepository,
// nutritionRepository, workoutRepository, bodyLogRepository) into
// the UserContext shape required by §6.2. NO new SQL — every read
// path here delegates to an existing exported helper, so this file
// is a thin assembly layer.
//
// PII minimization (§6.4):
//   - birth_year is converted to a 5-year AgeRange bucket; the
//     exact value never leaves this layer.
//   - display_name / supabase_uid / email are explicitly NOT read.
//   - Top frequent meal names are bounded at 5 to limit raw
//     food-name exposure at the Gemini boundary.
//
// Drafting checklist 99 application: every repository imported
// here lives on the RN/Expo side and depends on expo-sqlite. This
// module is intentionally callable ONLY from the client (RN side);
// the Edge Function receives an already-built UserContext as part
// of the request body, never imports this builder.

import { getProfile } from '../repositories/profileRepository';
import { getDailyNutritionSummary } from '../repositories/nutritionRepository';
import { getRecentSessionCount } from '../repositories/workoutRepository';
import { getBodyLogs } from '../repositories/bodyLogRepository';
import {
  ageRangeFromBirthYear,
  type MealNutrientSummary,
  type MealSummary,
  type ProfileSnapshot,
  type TargetsSnapshot,
  type UserContext,
  type WeightTrendSummary,
  type WorkoutSummary,
} from './types';

const DEFAULT_MEAL_DAYS = 7;
const DEFAULT_WORKOUT_DAYS = 14;
const TOP_FREQUENT_MEAL_LIMIT = 5;
// Per §6.2 the `topFrequentNames` window is intentionally wider
// than the rolling-macro window — 14 days covers a meaningful
// "what does this user actually eat" signal while the 7-day
// average targets recent caloric balance. Codex round 1 / I3 fix
// — separate the two windows so the meal-name scan doesn't get
// truncated when callers pass `mealDays: 7`.
const TOP_FREQUENT_NAMES_DAYS = 14;
const WEIGHT_TREND_DAYS = 14;

export interface BuildContextOptions {
  mealDays?: number;
  workoutDays?: number;
  /** Defaults to `new Date()` — supplied by tests for deterministic
   *  ageRange bucketing + date-window math. */
  now?: Date;
}

export async function buildUserContext(
  // Nit 1 (Codex round 1) — Mealift is a single-profile-per-app
  // model today; `profileId` is required by the meal / workout /
  // body-log repositories but ignored by `getProfile()` (which
  // reads the singleton row). The parameter is kept so the
  // signature already accepts a profileId in case a future
  // multi-profile model lands.
  profileId: string,
  options: BuildContextOptions = {},
): Promise<UserContext> {
  const now = options.now ?? new Date();
  const mealDays = options.mealDays ?? DEFAULT_MEAL_DAYS;
  const workoutDays = options.workoutDays ?? DEFAULT_WORKOUT_DAYS;

  const profile = await getProfile();
  if (!profile) {
    throw new Error(
      '[buildUserContext] no profile row found; cannot build context',
    );
  }

  return {
    profile: buildProfileSnapshot(profile, now),
    targets: buildTargetsSnapshot(profile),
    recentMeals: await buildMealSummary(profileId, mealDays, now),
    recentWorkouts: await buildWorkoutSummary(profileId, workoutDays),
    recentWeightTrend: await buildWeightTrendSummary(profileId, now),
  };
}

// =====================================================================
// Sub-builders (exported for unit tests)
// =====================================================================

export function buildProfileSnapshot(
  profile: {
    gender: 'male' | 'female' | 'other';
    birthYear: number;
    heightCm: number;
    currentWeightKg: number;
    goalType: 'cut' | 'bulk' | 'maintain' | 'recomp';
    activityLevel:
      | 'sedentary'
      | 'light'
      | 'moderate'
      | 'active'
      | 'very_active';
    trainingDaysPerWeek: number;
  },
  now: Date,
): ProfileSnapshot {
  return {
    ageRange: ageRangeFromBirthYear(profile.birthYear, now),
    sex: profile.gender,
    heightCm: profile.heightCm,
    weightKg: profile.currentWeightKg,
    goalType: profile.goalType,
    activityLevel: profile.activityLevel,
    trainingDaysPerWeek: profile.trainingDaysPerWeek,
  };
}

export function buildTargetsSnapshot(profile: {
  targetCalories?: number | null;
  targetProteinG?: number | null;
  targetFatG?: number | null;
  targetCarbG?: number | null;
}): TargetsSnapshot {
  return {
    calories: profile.targetCalories ?? 0,
    proteinG: profile.targetProteinG ?? 0,
    fatG: profile.targetFatG ?? 0,
    carbG: profile.targetCarbG ?? 0,
  };
}

export async function buildMealSummary(
  profileId: string,
  mealDays: number,
  now: Date,
): Promise<MealSummary> {
  // Rolling average uses `mealDays` (default 7). The meal-name
  // frequency scan uses TOP_FREQUENT_NAMES_DAYS (14) so a 7-day
  // average caller still gets a 14-day name signal — §6.2 spec.
  const macros = { calories: 0, proteinG: 0, fatG: 0, carbG: 0 };
  const nameCounts = new Map<string, number>();

  const dayMs = 24 * 60 * 60 * 1000;
  let daysWithData = 0;
  const namesWindow = Math.max(mealDays, TOP_FREQUENT_NAMES_DAYS);

  for (let i = 0; i < namesWindow; i++) {
    const dayDate = new Date(now.getTime() - i * dayMs);
    const isoDate = isoLocalDate(dayDate);
    const summary = await getDailyNutritionSummary(profileId, isoDate);
    if (i < mealDays) {
      // Only the rolling-average window contributes to the macro
      // totals; the wider names window just collects food names.
      if (
        summary.totalCalories > 0 ||
        summary.totalProteinG > 0 ||
        summary.totalFatG > 0 ||
        summary.totalCarbG > 0
      ) {
        daysWithData++;
        macros.calories += summary.totalCalories;
        macros.proteinG += summary.totalProteinG;
        macros.fatG += summary.totalFatG;
        macros.carbG += summary.totalCarbG;
      }
    }
    for (const meal of summary.meals) {
      for (const item of meal.items) {
        nameCounts.set(
          item.foodName,
          (nameCounts.get(item.foodName) ?? 0) + 1,
        );
      }
    }
  }

  const last7DaysAverage: MealNutrientSummary =
    daysWithData > 0
      ? {
          calories: Math.round(macros.calories / daysWithData),
          proteinG: Math.round((macros.proteinG / daysWithData) * 10) / 10,
          fatG: Math.round((macros.fatG / daysWithData) * 10) / 10,
          carbG: Math.round((macros.carbG / daysWithData) * 10) / 10,
        }
      : { calories: 0, proteinG: 0, fatG: 0, carbG: 0 };

  const todaySummary = await getDailyNutritionSummary(
    profileId,
    isoLocalDate(now),
  );
  const todaySoFar: MealNutrientSummary | undefined =
    todaySummary.totalCalories > 0 ||
    todaySummary.totalProteinG > 0 ||
    todaySummary.totalFatG > 0 ||
    todaySummary.totalCarbG > 0
      ? {
          calories: todaySummary.totalCalories,
          proteinG: todaySummary.totalProteinG,
          fatG: todaySummary.totalFatG,
          carbG: todaySummary.totalCarbG,
        }
      : undefined;

  const topFrequentNames = Array.from(nameCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_FREQUENT_MEAL_LIMIT)
    .map(([name]) => name);

  return { last7DaysAverage, todaySoFar, topFrequentNames };
}

export async function buildWorkoutSummary(
  profileId: string,
  workoutDays: number,
): Promise<WorkoutSummary> {
  const sessionCount = await getRecentSessionCount(profileId, workoutDays);
  // routineNames is plumbed in via the call-site that owns the
  // selected routines; v1.5 Phase 1.2+ will inject it from the
  // routine store. For Phase 1.1 we return an empty list so the
  // shape stays stable.
  return {
    last14DaysSessions: sessionCount,
    routineNames: [],
  };
}

export async function buildWeightTrendSummary(
  profileId: string,
  _now: Date,
): Promise<WeightTrendSummary> {
  // getBodyLogs returns rows ordered by date DESC, clamped to the
  // last N days via the historyWindowDays arg.
  const logs = await getBodyLogs(profileId, 90, WEIGHT_TREND_DAYS);
  if (logs.length < 2) {
    return { last14DaysKgChange: 0 };
  }

  // DESC: logs[0] is the most recent; the last element is the
  // oldest in the window.
  const newest = logs[0];
  const oldest = logs[logs.length - 1];
  const change = (newest.weightKg ?? 0) - (oldest.weightKg ?? 0);
  return { last14DaysKgChange: Math.round(change * 10) / 10 };
}

// =====================================================================
// Local helpers
// =====================================================================

/** YYYY-MM-DD in the device's local time zone. The existing
 *  nutritionRepository helpers expect local-date strings; we don't
 *  need a profile-tz read here (S1 resolution is about advice
 *  bucketing, not chat context). */
function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
