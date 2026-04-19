import { BodyLog } from '../types/bodyLog';
import { Profile } from '../types/profile';
import {
  GoalPrediction,
  GoalPredictionStatus,
  GoalPredictionConfidence,
  TrajectoryPoint,
} from '../types/goalPrediction';
import { getBodyLogs } from '../infra/repositories/bodyLogRepository';
import { addDays, parseISO, differenceInCalendarDays, format, subDays } from 'date-fns';
import { getISODate } from '../utils/format';

const MIN_DAYS_FOR_PREDICTION = 14;
const STALL_THRESHOLD = 0.05;
const DEADLINE_TOLERANCE_DAYS = 7;

export function linearRegressionSlope(logs: BodyLog[]): number {
  const sorted = logs
    .filter((l) => l.weightKg !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return 0;

  const firstDate = parseISO(sorted[0].date);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const log of sorted) {
    const x = differenceInCalendarDays(parseISO(log.date), firstDate);
    xs.push(x);
    ys.push(log.weightKg as number);
  }
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function generateProjectionData(
  currentWeight: number,
  weeklyChangeRate: number,
  days: number = 90,
  startDate: Date = new Date()
): TrajectoryPoint[] {
  const out: TrajectoryPoint[] = [];
  const dailyRate = weeklyChangeRate / 7;
  for (let i = 0; i <= days; i++) {
    const d = addDays(startDate, i);
    out.push({
      date: format(d, 'yyyy-MM-dd'),
      weight: Number((currentWeight + dailyRate * i).toFixed(2)),
      type: 'projected',
    });
  }
  return out;
}

function pickConfidence(dataPoints: number, daySpan: number): GoalPredictionConfidence {
  if (dataPoints >= 21 && daySpan >= 21) return 'high';
  if (dataPoints >= 14 && daySpan >= 14) return 'medium';
  return 'low';
}

function reachedGoal(current: number, target: number, goalType: Profile['goalType']): boolean {
  if (goalType === 'cut') return current <= target;
  if (goalType === 'bulk') return current >= target;
  return Math.abs(current - target) < 0.3;
}

export async function predictGoalArrival(profile: Profile): Promise<GoalPrediction> {
  const rawLogs = await getBodyLogs(profile.id, 90);
  const cutoff = getISODate(subDays(new Date(), 28));
  const recent = rawLogs.filter(
    (l) => l.weightKg !== null && l.date >= cutoff
  );
  const sorted = recent.sort((a, b) => a.date.localeCompare(b.date));

  const daySpan =
    sorted.length >= 2
      ? differenceInCalendarDays(
          parseISO(sorted[sorted.length - 1].date),
          parseISO(sorted[0].date)
        )
      : 0;

  const currentWeight = sorted.length > 0
    ? (sorted[sorted.length - 1].weightKg as number)
    : profile.currentWeightKg;
  const targetWeight = profile.targetWeightKg ?? profile.currentWeightKg;

  const trajectory: TrajectoryPoint[] = sorted.map((l) => ({
    date: l.date,
    weight: l.weightKg as number,
    type: 'actual',
  }));

  if (daySpan < MIN_DAYS_FOR_PREDICTION) {
    return {
      currentWeight,
      targetWeight,
      weeklyChangeRate: 0,
      estimatedArrivalDate: null,
      daysRemaining: null,
      confidence: 'low',
      status: 'insufficient_data',
      trajectory,
      gapFromDeadline: null,
      dataPointsUsed: sorted.length,
      daysNeeded: Math.max(0, MIN_DAYS_FOR_PREDICTION - daySpan),
    };
  }

  const slopePerDay = linearRegressionSlope(sorted);
  const weeklyChangeRate = Number((slopePerDay * 7).toFixed(3));

  // Already at goal
  if (reachedGoal(currentWeight, targetWeight, profile.goalType)) {
    return {
      currentWeight,
      targetWeight,
      weeklyChangeRate,
      estimatedArrivalDate: format(new Date(), 'yyyy-MM-dd'),
      daysRemaining: 0,
      confidence: pickConfidence(sorted.length, daySpan),
      status: 'completed',
      trajectory,
      gapFromDeadline: null,
      dataPointsUsed: sorted.length,
      daysNeeded: 0,
    };
  }

  // Stalled
  if (Math.abs(weeklyChangeRate) < STALL_THRESHOLD) {
    return {
      currentWeight,
      targetWeight,
      weeklyChangeRate,
      estimatedArrivalDate: null,
      daysRemaining: null,
      confidence: pickConfidence(sorted.length, daySpan),
      status: 'stalled',
      trajectory,
      gapFromDeadline: null,
      dataPointsUsed: sorted.length,
      daysNeeded: 0,
    };
  }

  const diff = targetWeight - currentWeight;
  const dailyRate = slopePerDay;
  const daysRemainingRaw = diff / dailyRate;

  // Wrong direction
  if (daysRemainingRaw < 0) {
    return {
      currentWeight,
      targetWeight,
      weeklyChangeRate,
      estimatedArrivalDate: null,
      daysRemaining: null,
      confidence: pickConfidence(sorted.length, daySpan),
      status: 'behind_schedule',
      trajectory: [
        ...trajectory,
        ...generateProjectionData(currentWeight, weeklyChangeRate, 90),
      ],
      gapFromDeadline: null,
      dataPointsUsed: sorted.length,
      daysNeeded: 0,
    };
  }

  const daysRemaining = Math.max(0, Math.round(daysRemainingRaw));
  const estimatedArrivalDate = format(addDays(new Date(), daysRemaining), 'yyyy-MM-dd');

  // Status vs deadline
  let status: GoalPredictionStatus = 'on_track';
  let gapFromDeadline: number | null = null;
  if (profile.targetDate) {
    const deadline = parseISO(profile.targetDate);
    const arrivalDate = parseISO(estimatedArrivalDate);
    const gap = differenceInCalendarDays(arrivalDate, deadline);
    gapFromDeadline = gap;
    if (gap > DEADLINE_TOLERANCE_DAYS) status = 'behind_schedule';
    else if (gap < -DEADLINE_TOLERANCE_DAYS) status = 'ahead_of_schedule';
    else status = 'on_track';
  }

  const projection = generateProjectionData(currentWeight, weeklyChangeRate, Math.min(90, daysRemaining + 30));

  return {
    currentWeight,
    targetWeight,
    weeklyChangeRate,
    estimatedArrivalDate,
    daysRemaining,
    confidence: pickConfidence(sorted.length, daySpan),
    status,
    trajectory: [...trajectory, ...projection],
    gapFromDeadline,
    dataPointsUsed: sorted.length,
    daysNeeded: 0,
  };
}

export function statusMessage(status: GoalPredictionStatus): {
  title: string;
  tone: 'success' | 'warning' | 'error' | 'info';
} {
  switch (status) {
    case 'on_track':
      return { title: '順調です', tone: 'success' };
    case 'behind_schedule':
      return { title: '予定より遅れています', tone: 'warning' };
    case 'ahead_of_schedule':
      return { title: '予定より先行しています', tone: 'info' };
    case 'stalled':
      return { title: '停滞中です', tone: 'warning' };
    case 'completed':
      return { title: '目標達成！', tone: 'success' };
    case 'insufficient_data':
    default:
      return { title: 'データを貯めてください', tone: 'info' };
  }
}
