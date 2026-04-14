import { ISODateString, GoalType, PaceLabel } from './common';

export interface PredictionInput {
  currentWeightAvg7d: number;
  weightChange14d: number;
  targetWeight: number;
  goalType: GoalType;
  nutritionCompliance: number;
  trainingCompliance: number;
}

export interface PredictionResult {
  optimistic: { days: number; date: ISODateString };
  standard: { days: number; date: ISODateString };
  conservative: { days: number; date: ISODateString };
  weeklyRate: number;
  paceLabel: PaceLabel;
}

export interface ComplianceData {
  nutritionCompliance: number;
  trainingCompliance: number;
  calorieAdherenceDays: number;
  trainingSessionsCompleted: number;
  trainingSessionsTarget: number;
}
