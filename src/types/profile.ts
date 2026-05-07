import { UUID, ISODateTimeString, ISODateString, GoalType, ActivityLevel, Gender, Equipment } from './common';

export type AdaptiveGoalSensitivity = 'conservative' | 'standard' | 'aggressive';

export type PlanBillingCycle = 'monthly' | 'biannual' | 'annual';

// Build 15 / Feature 5-C — plate rounding granularity. Pinned by the
// server CHECK on profiles.plate_step_kg; client narrows to this union
// so the settings picker can only ever produce a valid value.
export type PlateStep = 0.5 | 1.0 | 1.25 | 2.5;
export const PLATE_STEP_OPTIONS: readonly PlateStep[] = [0.5, 1.0, 1.25, 2.5];

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
