import { GoalType, ActivityLevel } from '../types/common';

export const DEFAULT_REST_TIMER_SECONDS = 90;
export const DEFAULT_TRAINING_DAYS_PER_WEEK = 3;
export const DEFAULT_TARGET_SETS = 3;
export const DEFAULT_TARGET_REPS = '8-12';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;

export const GOAL_CALORIE_MULTIPLIERS: Record<GoalType, { min: number; max: number }> = {
  cut: { min: 0.80, max: 0.80 },
  bulk: { min: 1.10, max: 1.15 },
  maintain: { min: 1.0, max: 1.0 },
  recomp: { min: 0.95, max: 1.0 },
} as const;

export const PROTEIN_PER_KG = 2.0;
export const FAT_CALORIE_RATIO = 0.25;
export const CALORIES_PER_PROTEIN_G = 4;
export const CALORIES_PER_FAT_G = 9;
export const CALORIES_PER_CARB_G = 4;

export const COMPLIANCE_CALORIE_TOLERANCE = 0.10;
export const PREDICTION_MIN_DAYS = 14;

export const PACE_THRESHOLDS = {
  cut: { onTrackMinPct: 0.005, onTrackMaxPct: 0.01 },
  bulk: { onTrackMinPct: 0.0025, onTrackMaxPct: 0.005 },
  maintain: { onTrackMinPct: 0, onTrackMaxPct: 0.002 },
  recomp: { onTrackMinPct: 0, onTrackMaxPct: 0.003 },
} as const;
