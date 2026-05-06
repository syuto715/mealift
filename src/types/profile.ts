import { UUID, ISODateTimeString, ISODateString, GoalType, ActivityLevel, Gender, Equipment } from './common';

export type AdaptiveGoalSensitivity = 'conservative' | 'standard' | 'aggressive';

export type PlanBillingCycle = 'monthly' | 'biannual' | 'annual';

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
