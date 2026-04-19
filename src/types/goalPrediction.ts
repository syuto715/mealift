import { ISODateString } from './common';

export type GoalPredictionStatus =
  | 'on_track'
  | 'behind_schedule'
  | 'ahead_of_schedule'
  | 'stalled'
  | 'insufficient_data'
  | 'completed';

export type GoalPredictionConfidence = 'high' | 'medium' | 'low';

export interface TrajectoryPoint {
  date: ISODateString;
  weight: number;
  type: 'actual' | 'projected';
}

export interface GoalPrediction {
  currentWeight: number;
  targetWeight: number;
  weeklyChangeRate: number;
  estimatedArrivalDate: ISODateString | null;
  daysRemaining: number | null;
  confidence: GoalPredictionConfidence;
  status: GoalPredictionStatus;
  trajectory: TrajectoryPoint[];
  gapFromDeadline: number | null;
  dataPointsUsed: number;
  daysNeeded: number;
}
