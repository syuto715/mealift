import { ISODateString, GoalType, PaceLabel } from './common';

export interface PredictionInput {
  currentWeightAvg7d: number;
  weightChange14d: number;
  targetWeight: number;
  goalType: GoalType;
  nutritionCompliance: number;
  // null = トレーニング目標が未設定(0日)→ 達成率を測れないので予測の
  // complianceFactor に算入しない(N/A)。0 と区別する(0 は「目標ありで未達」)。
  trainingCompliance: number | null;
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
