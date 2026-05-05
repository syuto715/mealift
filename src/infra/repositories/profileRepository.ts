import { getDatabase } from '../database/connection';
import { Profile, ProfileInput, AdaptiveGoalSensitivity, PlanBillingCycle } from '../../types/profile';
import { generateId } from '../../utils/id';
import { enqueueRowFromTable } from './syncRepository';

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
  };

  const BOOL_KEYS = new Set(['onboardingCompleted', 'adaptiveGoalEnabled']);
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

