import { addDays, format } from 'date-fns';
import { PredictionInput, PredictionResult } from '../types/prediction';
import { GoalType, PaceLabel } from '../types/common';
import { PACE_THRESHOLDS } from '../constants/defaults';

export function calculatePrediction(input: PredictionInput): PredictionResult | null {
  const {
    currentWeightAvg7d,
    weightChange14d,
    targetWeight,
    goalType,
    nutritionCompliance,
    trainingCompliance,
  } = input;

  // Weekly rate from 14-day change
  const weeklyRate = (weightChange14d / 14) * 7;

  // Remaining weight to target
  const remaining = Math.abs(targetWeight - currentWeightAvg7d);

  if (remaining < 0.1) {
    // Already at target
    return {
      optimistic: { days: 0, date: format(new Date(), 'yyyy-MM-dd') },
      standard: { days: 0, date: format(new Date(), 'yyyy-MM-dd') },
      conservative: { days: 0, date: format(new Date(), 'yyyy-MM-dd') },
      weeklyRate,
      paceLabel: 'on_track',
    };
  }

  const absWeeklyRate = Math.abs(weeklyRate);
  if (absWeeklyRate < 0.01) {
    // Rate is too small to predict
    return null;
  }

  // Standard prediction in weeks, then days
  const standardWeeks = remaining / absWeeklyRate;
  const standardDays = Math.round(standardWeeks * 7);

  // Compliance adjustment
  const complianceFactor = nutritionCompliance * 0.6 + trainingCompliance * 0.4;
  const adjustedDays = complianceFactor > 0
    ? Math.round(standardDays / complianceFactor)
    : standardDays * 2;

  const optimisticDays = Math.round(adjustedDays * 0.75);
  const conservativeDays = Math.round(adjustedDays * 1.40);

  const now = new Date();

  // Pace label
  const paceLabel = getPaceLabel(weeklyRate, currentWeightAvg7d, goalType);

  return {
    optimistic: {
      days: optimisticDays,
      date: format(addDays(now, optimisticDays), 'yyyy-MM-dd'),
    },
    standard: {
      days: adjustedDays,
      date: format(addDays(now, adjustedDays), 'yyyy-MM-dd'),
    },
    conservative: {
      days: conservativeDays,
      date: format(addDays(now, conservativeDays), 'yyyy-MM-dd'),
    },
    weeklyRate,
    paceLabel,
  };
}

function getPaceLabel(
  weeklyRate: number,
  currentWeight: number,
  goalType: GoalType
): PaceLabel {
  const thresholds = PACE_THRESHOLDS[goalType];
  const weeklyPct = Math.abs(weeklyRate) / currentWeight;

  if (goalType === 'cut') {
    if (weeklyRate > 0) return 'too_slow'; // Gaining weight on a cut
    if (weeklyPct > thresholds.onTrackMaxPct * 1.5) return 'too_fast';
    if (weeklyPct > thresholds.onTrackMaxPct) return 'fast';
    if (weeklyPct >= thresholds.onTrackMinPct) return 'on_track';
    if (weeklyPct >= thresholds.onTrackMinPct * 0.5) return 'slow';
    return 'too_slow';
  }

  if (goalType === 'bulk') {
    if (weeklyRate < 0) return 'too_slow'; // Losing weight on a bulk
    if (weeklyPct > thresholds.onTrackMaxPct * 1.5) return 'too_fast';
    if (weeklyPct > thresholds.onTrackMaxPct) return 'fast';
    if (weeklyPct >= thresholds.onTrackMinPct) return 'on_track';
    if (weeklyPct >= thresholds.onTrackMinPct * 0.5) return 'slow';
    return 'too_slow';
  }

  // maintain / recomp
  if (weeklyPct <= thresholds.onTrackMaxPct) return 'on_track';
  if (weeklyPct <= thresholds.onTrackMaxPct * 2) return weeklyRate > 0 ? 'fast' : 'slow';
  return weeklyRate > 0 ? 'too_fast' : 'too_slow';
}
