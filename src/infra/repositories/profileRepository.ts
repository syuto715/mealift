import { getDatabase } from '../database/connection';
import {
  Profile,
  ProfileInput,
  AdaptiveGoalSensitivity,
  PlanBillingCycle,
  PlateStep,
  PLATE_STEP_OPTIONS,
  WeeklyRatePct,
  WEEKLY_RATE_PCT_OPTIONS,
  MealPlan,
  MEAL_PLAN_OPTIONS,
  ProteinFactor,
  PROTEIN_FACTOR_OPTIONS,
  WeeklyDistribution,
} from '../../types/profile';
import { generateId } from '../../utils/id';
import { enqueueRowFromTable } from './syncRepository';

// v1.3.0 / Onboarding v2 / Phase A-3 — narrow row → typed value
// helpers for the v30 onboarding columns. Same defensive-narrow
// pattern Phase 6.1 established for safeParseVolumeGroups: if the
// raw row value is outside the literal union (corrupt sync, manual
// DB edit), return null rather than letting an invalid value
// propagate into the UI.
function narrowWeeklyRatePct(raw: unknown): WeeklyRatePct | null {
  if (typeof raw !== 'number') return null;
  return (WEEKLY_RATE_PCT_OPTIONS as readonly number[]).includes(raw)
    ? (raw as WeeklyRatePct)
    : null;
}

function narrowMealPlan(raw: unknown): MealPlan | null {
  if (typeof raw !== 'string') return null;
  return (MEAL_PLAN_OPTIONS as readonly string[]).includes(raw)
    ? (raw as MealPlan)
    : null;
}

function narrowProteinFactor(raw: unknown): ProteinFactor | null {
  if (typeof raw !== 'number') return null;
  return (PROTEIN_FACTOR_OPTIONS as readonly number[]).includes(raw)
    ? (raw as ProteinFactor)
    : null;
}

function narrowWeeklyDistribution(raw: unknown): WeeklyDistribution | null {
  if (raw === 'even' || raw === 'cheat_days') return raw;
  return null;
}

// JSON-array columns (meal_timings, cheat_days). Phase 4.1 + 6.1
// safeParseArray pattern — return [] on parse failure / non-array.
// null when the column itself is null (un-set onboarding step).
function parseJsonArrayOrNull<T>(
  raw: unknown,
  itemPredicate: (x: unknown) => x is T,
): T[] | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(itemPredicate);
  } catch {
    return null;
  }
}

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    supabaseUid: row.supabase_uid as string | null,
    displayName: row.display_name as string,
    gender: row.gender as Profile['gender'],
    birthYear: row.birth_year as number,
    heightCm: row.height_cm as number,
    currentWeightKg: row.current_weight_kg as number,
    targetWeightKg: row.target_weight_kg as number | null,
    targetBodyFatPct: row.target_body_fat_pct as number | null,
    goalType: row.goal_type as Profile['goalType'],
    activityLevel: row.activity_level as Profile['activityLevel'],
    trainingDaysPerWeek: row.training_days_per_week as number,
    targetDate: row.target_date as string | null,
    equipment: row.equipment as Profile['equipment'],
    targetCalories: row.target_calories as number | null,
    targetProteinG: row.target_protein_g as number | null,
    targetFatG: row.target_fat_g as number | null,
    targetCarbG: row.target_carb_g as number | null,
    onboardingCompleted: Boolean(row.onboarding_completed),
    adaptiveGoalEnabled: row.adaptive_goal_enabled == null ? true : Boolean(row.adaptive_goal_enabled),
    adaptiveGoalSensitivity: ((row.adaptive_goal_sensitivity as string) ?? 'standard') as AdaptiveGoalSensitivity,
    adaptiveGoalLastShownAt: (row.adaptive_goal_last_shown_at as string | null) ?? null,
    dailyWaterTargetMl: (row.daily_water_target_ml as number | null) ?? 2500,
    onboardingVersion: (row.onboarding_version as number | null) ?? 1,
    trialStartedAt: (row.trial_started_at as string | null) ?? null,
    planBillingCycle: (row.plan_billing_cycle as PlanBillingCycle | null) ?? null,
    planExpiresAt: (row.plan_expires_at as string | null) ?? null,
    // notifications_submission_enabled: stored as INTEGER 0/1 in SQLite
    // (Build 15 v24); coerce to boolean. Default true preserves the
    // server-side default semantics for old rows that pre-date v24.
    notificationsSubmissionEnabled:
      row.notifications_submission_enabled == null
        ? true
        : Boolean(row.notifications_submission_enabled),
    // plate_step_kg: Build 15 v27. Defensive coerce — pre-v27 rows
    // surface as 2.5 (matches DEFAULT) and the union narrows any
    // non-enum server value to 2.5 too.
    plateStepKg: ((): PlateStep => {
      const raw = row.plate_step_kg;
      if (typeof raw !== 'number') return 2.5;
      return PLATE_STEP_OPTIONS.includes(raw as PlateStep)
        ? (raw as PlateStep)
        : 2.5;
    })(),
    // v1.3.0 / Onboarding v2 / Phase A-3 — v30 column reads. Each
    // narrows through the matching literal-union helper above so an
    // out-of-domain server value can't poison the typed Profile.
    nickname: (row.nickname as string | null) ?? null,
    weeklyRatePct: narrowWeeklyRatePct(row.weekly_rate_pct),
    mealPlan: narrowMealPlan(row.meal_plan),
    mealTimings: parseJsonArrayOrNull(
      row.meal_timings,
      (x): x is string => typeof x === 'string',
    ),
    proteinFactor: narrowProteinFactor(row.protein_factor),
    weeklyDistribution: narrowWeeklyDistribution(row.weekly_distribution),
    cheatDays: parseJsonArrayOrNull(
      row.cheat_days,
      (x): x is number =>
        typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 6,
    ),
    onboardingStep: (row.onboarding_step as number | null) ?? 0,
    onboardingStartedAt: (row.onboarding_started_at as string | null) ?? null,
    estimatedTargetDate: (row.estimated_target_date as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM profiles WHERE deleted_at IS NULL LIMIT 1',
  );
  return row ? rowToProfile(row) : null;
}

export async function createProfile(input: ProfileInput): Promise<Profile> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO profiles (id, display_name, gender, birth_year, height_cm, current_weight_kg, target_weight_kg, target_body_fat_pct, goal_type, activity_level, training_days_per_week, target_date, equipment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.displayName, input.gender, input.birthYear, input.heightCm, input.currentWeightKg, input.targetWeightKg ?? null, input.targetBodyFatPct ?? null, input.goalType, input.activityLevel, input.trainingDaysPerWeek, input.targetDate ?? null, input.equipment, now, now]
  );
  await enqueueRowFromTable('profiles', id, 'INSERT');

  const profile = await getProfile();
  return profile!;
}

export async function updateProfile(id: string, updates: Partial<Profile>): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const fieldMap: Record<string, string> = {
    displayName: 'display_name',
    gender: 'gender',
    birthYear: 'birth_year',
    heightCm: 'height_cm',
    currentWeightKg: 'current_weight_kg',
    targetWeightKg: 'target_weight_kg',
    targetBodyFatPct: 'target_body_fat_pct',
    goalType: 'goal_type',
    activityLevel: 'activity_level',
    trainingDaysPerWeek: 'training_days_per_week',
    targetDate: 'target_date',
    equipment: 'equipment',
    targetCalories: 'target_calories',
    targetProteinG: 'target_protein_g',
    targetFatG: 'target_fat_g',
    targetCarbG: 'target_carb_g',
    onboardingCompleted: 'onboarding_completed',
    adaptiveGoalEnabled: 'adaptive_goal_enabled',
    adaptiveGoalSensitivity: 'adaptive_goal_sensitivity',
    adaptiveGoalLastShownAt: 'adaptive_goal_last_shown_at',
    dailyWaterTargetMl: 'daily_water_target_ml',
    onboardingVersion: 'onboarding_version',
    trialStartedAt: 'trial_started_at',
    planBillingCycle: 'plan_billing_cycle',
    planExpiresAt: 'plan_expires_at',
    notificationsSubmissionEnabled: 'notifications_submission_enabled',
    plateStepKg: 'plate_step_kg',
  };

  const BOOL_KEYS = new Set([
    'onboardingCompleted',
    'adaptiveGoalEnabled',
    'notificationsSubmissionEnabled',
  ]);
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in updates) {
      fields.push(`${column} = ?`);
      const val = (updates as Record<string, unknown>)[key];
      values.push(BOOL_KEYS.has(key) ? (val ? 1 : 0) : (val as string | number | null));
    }
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db.runAsync(
    `UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  await enqueueRowFromTable('profiles', id, 'UPDATE');
}

export async function startTrial(id: string, startedAt: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE profiles
     SET trial_started_at = ?, updated_at = datetime('now')
     WHERE id = ? AND trial_started_at IS NULL`,
    [startedAt, id],
  );
  await enqueueRowFromTable('profiles', id, 'UPDATE');
}

