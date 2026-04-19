import { UUID, ISODateTimeString } from './common';

export type AdaptiveGoalStatus = 'pending' | 'approved' | 'dismissed';
export type AdaptiveGoalConfidence = 'high' | 'medium' | 'low';

export interface AdaptiveGoalSuggestion {
  id: UUID;
  currentCalorieTarget: number;
  suggestedCalorieTarget: number;
  currentTdee: number;
  estimatedActualTdee: number;
  expectedWeeklyChange: number;
  actualWeeklyChange: number;
  deviation: number;
  reason: string;
  confidence: AdaptiveGoalConfidence;
  dataPointsUsed: number;
  calculatedAt: ISODateTimeString;
  status: AdaptiveGoalStatus;
}
