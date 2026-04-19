import { UUID, ISODateTimeString, ISODateString, GoalType, ActivityLevel, Gender, Equipment } from './common';

export type AdaptiveGoalSensitivity = 'conservative' | 'standard' | 'aggressive';

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
