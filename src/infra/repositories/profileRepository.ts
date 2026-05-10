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
// Codex review pass 1 / Important #3 — narrow helpers exported
// for direct unit testing (uncovered before this fix). The actual
// Profile shaping path still goes through rowToProfile.
export function narrowWeeklyRatePct(raw: unknown): WeeklyRatePct | null {
  if (typeof raw !== 'number') return null;
  return (WEEKLY_RATE_PCT_OPTIONS as readonly number[]).includes(raw)
    ? (raw as WeeklyRatePct)
    : null;
}

export function narrowMealPlan(raw: unknown): MealPlan | null {
  if (typeof raw !== 'string') return null;
  return (MEAL_PLAN_OPTIONS as readonly string[]).includes(raw)
    ? (raw as MealPlan)
    : null;
}

export function narrowProteinFactor(raw: unknown): ProteinFactor | null {
  if (typeof raw !== 'number') return null;
  return (PROTEIN_FACTOR_OPTIONS as readonly number[]).includes(raw)
    ? (raw as ProteinFactor)
    : null;
}

export function narrowWeeklyDistribution(raw: unknown): WeeklyDistribution | null {
  if (raw === 'even' || raw === 'cheat_days') return raw;
  return null;
}

// JSON-array columns (meal_timings, cheat_days). Phase 4.1 + 4.2 +
// 6.1 safeParseArray pattern — return null when the column itself
// is null (un-set onboarding step), null on parse failure / non-
// array, and FILTER (not reject) item-level corruption.
//
// Codex review pass 1 / Important #2 (REJECT, design choice):
// Filter-vs-reject for item-level corruption is the existing
// codebase convention (Phase 4.2 safeParseVolumeGroups,
// Phase 4.0 safeParseArray). Trade-off:
//   - Filter (current): partially-valid array → user sees the valid
//     items, can re-pick the missing ones. Sync poison drops one
//     muscle / meal slot, the rest survive.
//   - Reject (rejected here): one bad item → return null → user
//     re-picks the entire field. Forces them to redo their work
//     on every sync drift.
// Filter wins on UX cost; the silent-drop concern is mitigated by
// the surrounding *_OPTIONS validation Codex flagged separately
// (any out-of-domain literal-union value is dropped at the typed
// narrow* helpers above, not here).
export function parseJsonArrayOrNull<T>(
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
    // v1.3.0 / Onboarding v2 / Phase A-3 Codex pass 1 / Critical —
    // every v30 column wired into the write path. Without these
    // entries, Profile's typed v2 fields could be passed through
    // updateProfile and silently dropped at the SQL layer (the
    // type system says writable, the runtime persists nothing).
    nickname: 'nickname',
    weeklyRatePct: 'weekly_rate_pct',
    mealPlan: 'meal_plan',
    mealTimings: 'meal_timings',
    proteinFactor: 'protein_factor',
    weeklyDistribution: 'weekly_distribution',
    cheatDays: 'cheat_days',
    onboardingStep: 'onboarding_step',
    onboardingStartedAt: 'onboarding_started_at',
    estimatedTargetDate: 'estimated_target_date',
  };

  const BOOL_KEYS = new Set([
    'onboardingCompleted',
    'adaptiveGoalEnabled',
    'notificationsSubmissionEnabled',
  ]);
  // JSON-array columns serialize back to TEXT for storage. The
  // narrow*-then-parse pair on the read side (rowToProfile) plus
  // JSON.stringify here keeps the SQLite TEXT ↔ Postgres jsonb
  // boundary consistent.
  const JSON_ARRAY_KEYS = new Set(['mealTimings', 'cheatDays']);
  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in updates) {
      fields.push(`${column} = ?`);
      const val = (updates as Record<string, unknown>)[key];
      if (BOOL_KEYS.has(key)) {
        values.push(val ? 1 : 0);
      } else if (JSON_ARRAY_KEYS.has(key)) {
        values.push(val == null ? null : JSON.stringify(val));
      } else {
        values.push(val as string | number | null);
      }
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

