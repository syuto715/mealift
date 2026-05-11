import { UUID, ISODateTimeString, ISODateString, GoalType, ActivityLevel, Gender, Equipment } from './common';

export type AdaptiveGoalSensitivity = 'conservative' | 'standard' | 'aggressive';

export type PlanBillingCycle = 'monthly' | 'biannual' | 'annual';

// Build 15 / Feature 5-C — plate rounding granularity. Pinned by the
// server CHECK on profiles.plate_step_kg; client narrows to this union
// so the settings picker can only ever produce a valid value.
export type PlateStep = 0.5 | 1.0 | 1.25 | 2.5;
export const PLATE_STEP_OPTIONS: readonly PlateStep[] = [0.5, 1.0, 1.25, 2.5];

// v1.3.0 / Onboarding v2 (Phase A-1 v30 schema mirror).
//
// Each union type below is pinned by the matching server CHECK in
// supabase/migrations/20260510000001_onboarding_v2_columns.sql.
// SQLite client relies on the union for app-side validation (v26
// convention) since SQLite ALTER TABLE can't add CHECK retroactively.
export type WeeklyRatePct = -1.0 | -0.7 | -0.5 | -0.25 | 0 | 0.25;
export const WEEKLY_RATE_PCT_OPTIONS: readonly WeeklyRatePct[] = [
  -1.0, -0.7, -0.5, -0.25, 0, 0.25,
];

export type MealPlan =
  | 'balanced'
  | 'washoku'
  | 'high_protein'
  | 'low_carb'
  | 'fasting';
export const MEAL_PLAN_OPTIONS: readonly MealPlan[] = [
  'balanced',
  'washoku',
  'high_protein',
  'low_carb',
  'fasting',
];

export type ProteinFactor = 1.0 | 1.6 | 2.2 | 3.0;
export const PROTEIN_FACTOR_OPTIONS: readonly ProteinFactor[] = [
  1.0, 1.6, 2.2, 3.0,
];

// Phase D-3 — meal timing slots. v30 schema stores
// profiles.meal_timings as TEXT (JSON array) with no per-value CHECK
// constraint, so this app-side literal-union is the source of truth.
// Keep ordered chronologically (breakfast..late_night) for display.
export type MealTiming =
  | 'breakfast'
  | 'lunch'
  | 'snack'
  | 'dinner'
  | 'late_night';
export const MEAL_TIMING_OPTIONS: readonly MealTiming[] = [
  'breakfast',
  'lunch',
  'snack',
  'dinner',
  'late_night',
];

export type WeeklyDistribution = 'even' | 'cheat_days';

// PFC keys for the calculated-target cache. Phase 6.1 lesson —
// `Record<MacroKey, V>` enforces full-shape on construction so
// callers can't index by an unrecognized macro and silently get
// undefined.
export type MacroKey = 'protein' | 'fat' | 'carbs';

export interface Profile {
  id: UUID;
  supabaseUid: string | null;
  displayName: string;
  gender: Gender;
  birthYear: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number | null;
  targetBodyFatPct: number | null;
  goalType: GoalType;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  targetDate: ISODateString | null;
  equipment: Equipment;
  targetCalories: number | null;
  targetProteinG: number | null;
  targetFatG: number | null;
  targetCarbG: number | null;
  onboardingCompleted: boolean;
  adaptiveGoalEnabled: boolean;
  adaptiveGoalSensitivity: AdaptiveGoalSensitivity;
  adaptiveGoalLastShownAt: ISODateTimeString | null;
  dailyWaterTargetMl: number;
  onboardingVersion: number;
  trialStartedAt: ISODateTimeString | null;
  planBillingCycle: PlanBillingCycle | null;
  planExpiresAt: ISODateTimeString | null;
  // Build 15 / Feature 3: gates submission-related push notifications
  // (used / approved). Default true; user can opt out via Settings →
  // 通知 → 投稿関連通知. Generic naming so Build 16+ approval
  // notifications can share the same toggle.
  notificationsSubmissionEnabled: boolean;
  // Build 15 / Feature 5-C — plate rounding granularity used by
  // workoutRecommendation.recommendNextSet. Default 2.5 kg; user can
  // pick from PLATE_STEP_OPTIONS in Settings → プレート単位.
  plateStepKg: PlateStep;
  // v1.3.0 / Onboarding v2 (Phase A-1 v30 schema). All optional —
  // populated as the user runs through the new 13-screen flow,
  // remain null for Build 14/15 holdouts. Phase A-5 service layer
  // will read/write these via the repository.
  nickname: string | null;
  weeklyRatePct: WeeklyRatePct | null;
  mealPlan: MealPlan | null;
  // mealTimings: serialized JSON array of meal slots
  // (e.g. ["breakfast", "lunch", "dinner"]). Repository layer
  // parses to/from string[] at the boundary.
  mealTimings: string[] | null;
  proteinFactor: ProteinFactor | null;
  weeklyDistribution: WeeklyDistribution | null;
  // cheatDays: serialized JSON array of weekday indices
  // (0=Sun..6=Sat). Repository layer parses at the boundary.
  cheatDays: number[] | null;
  // 0..13 (or 14 on iOS with HealthKit). 0 = not started.
  // NOT NULL DEFAULT 0 in both DB schemas (Phase A-1 Codex
  // Important #2 fix), so this stays non-null.
  onboardingStep: number;
  onboardingStartedAt: ISODateTimeString | null;
  estimatedTargetDate: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface ProfileInput {
  displayName: string;
  gender: Gender;
  birthYear: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg?: number | null;
  targetBodyFatPct?: number | null;
  goalType: GoalType;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  targetDate?: string | null;
  equipment: Equipment;
}
