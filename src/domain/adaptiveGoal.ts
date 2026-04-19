import { BodyLog } from '../types/bodyLog';
import { Profile, AdaptiveGoalSensitivity } from '../types/profile';
import { AdaptiveGoalSuggestion, AdaptiveGoalConfidence } from '../types/adaptiveGoal';
import { getBodyLogs } from '../infra/repositories/bodyLogRepository';
import { getDailyCalories } from '../infra/repositories/nutritionRepository';
import { updateProfile as updateProfileRepo } from '../infra/repositories/profileRepository';
import {
  saveSuggestion,
  markSuggestionStatus,
} from '../infra/repositories/adaptiveGoalRepository';
import { calculateAllCalories } from './calories';
import { generateId } from '../utils/id';
import { getISODate } from '../utils/format';
import { subDays, parseISO, differenceInCalendarDays } from 'date-fns';

const CALORIES_PER_KG_FAT = 7700;

// --- Public helpers ---------------------------------------------------------

export async function getWeightHistoryLast14Days(profileId: string): Promise<BodyLog[]> {
  const all = await getBodyLogs(profileId, 30);
  const cutoff = getISODate(subDays(new Date(), 14));
  return all.filter((l) => l.weightKg !== null && l.date >= cutoff);
}

export async function getAvgDailyCalorieIntakeLast14Days(profileId: string): Promise<number | null> {
  const today = new Date();
  const totals: number[] = [];
  for (let i = 1; i <= 14; i++) {
    const day = getISODate(subDays(today, i));
    const cal = await getDailyCalories(profileId, day);
    if (cal > 0) totals.push(cal);
  }
  if (totals.length < 7) return null;
  return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
}

// --- Pure math ---------------------------------------------------------------

export function calculateActualWeeklyWeightChange(logs: BodyLog[]): number {
  const logsWithWeight = logs
    .filter((l) => l.weightKg !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (logsWithWeight.length < 2) return 0;

  // Linear regression y = ax + b, where x is days from first log, y is weight.
  const firstDate = parseISO(logsWithWeight[0].date);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const log of logsWithWeight) {
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
  const slopePerDay = den === 0 ? 0 : num / den;
  return Number((slopePerDay * 7).toFixed(3));
}

export function estimateActualTdee(avgIntake: number, actualWeeklyChangeKg: number): number {
  // actualTDEE = avgIntake - (actualWeeklyChange × 7700 / 7)
  // If user is losing weight (change negative), TDEE > intake.
  const caloricDeficitPerDay = (actualWeeklyChangeKg * CALORIES_PER_KG_FAT) / 7;
  return Math.round(avgIntake - caloricDeficitPerDay);
}

function pickConfidence(dataPoints: number): AdaptiveGoalConfidence {
  if (dataPoints >= 14) return 'high';
  if (dataPoints >= 10) return 'medium';
  return 'low';
}

function sensitivityThresholdKgPerWeek(s: AdaptiveGoalSensitivity): number {
  // Smaller threshold = more proposals.
  if (s === 'aggressive') return 0.2;
  if (s === 'conservative') return 0.5;
  return 0.3;
}

// --- Reason text -----------------------------------------------------------

function buildReason(args: {
  goalType: Profile['goalType'];
  actualWeeklyChange: number;
  expectedWeeklyChange: number;
  deviation: number;
  currentTdee: number;
  estimatedActualTdee: number;
}): string {
  const { goalType, actualWeeklyChange, expectedWeeklyChange, currentTdee, estimatedActualTdee } = args;
  const absDev = Math.abs(args.deviation);
  const tdeeDiff = estimatedActualTdee - currentTdee;
  const tdeeWord = tdeeDiff > 0 ? '高い' : '低い';

  if (goalType === 'cut') {
    if (actualWeeklyChange > 0) {
      return `減量目標ですが、体重が増加しています。代謝が想定（${currentTdee}kcal）より${tdeeWord}可能性があります。`;
    }
    if (Math.abs(actualWeeklyChange) < Math.abs(expectedWeeklyChange)) {
      return `想定ペースより${absDev.toFixed(1)}kg/週 減量ペースが遅いです。代謝が想定より${tdeeWord}可能性があります。`;
    }
    return `想定ペースより${absDev.toFixed(1)}kg/週 減量ペースが速いです。安全のため摂取量を少し増やすことを推奨します。`;
  }

  if (goalType === 'bulk') {
    if (actualWeeklyChange < 0) {
      return `増量目標ですが、体重が減少しています。代謝が想定（${currentTdee}kcal）より${tdeeWord}可能性があります。`;
    }
    if (actualWeeklyChange < expectedWeeklyChange) {
      return `想定ペースより${absDev.toFixed(1)}kg/週 増量ペースが遅いです。代謝が想定より${tdeeWord}可能性があります。`;
    }
    return `想定ペースより${absDev.toFixed(1)}kg/週 増量ペースが速いです。体脂肪増加を抑えるため摂取を少し減らすことを推奨します。`;
  }

  // maintain / recomp
  return `体重が${absDev.toFixed(1)}kg/週 変動しており、維持ペースから外れています。代謝が想定より${tdeeWord}可能性があります。`;
}

// --- Main generator --------------------------------------------------------

export async function generateGoalSuggestion(
  profile: Profile
): Promise<AdaptiveGoalSuggestion | null> {
  if (!profile.adaptiveGoalEnabled) return null;
  if (profile.targetCalories == null) return null;

  const logs = await getWeightHistoryLast14Days(profile.id);
  const logsWithWeight = logs.filter((l) => l.weightKg !== null);
  if (logsWithWeight.length < 7) return null;

  const avgIntake = await getAvgDailyCalorieIntakeLast14Days(profile.id);
  if (avgIntake == null) return null;

  const { tdee } = calculateAllCalories(
    profile.currentWeightKg,
    profile.heightCm,
    profile.birthYear,
    profile.gender,
    profile.activityLevel,
    profile.goalType
  );

  const actualWeeklyChange = calculateActualWeeklyWeightChange(logsWithWeight);
  const estimatedActualTdee = estimateActualTdee(avgIntake, actualWeeklyChange);

  // Expected weekly change implied by the current target calories & assumed TDEE.
  // If target = TDEE - deficit, expected daily deficit = TDEE - target.
  // Expected weekly change (kg) = -(deficit × 7) / 7700.
  const dailyDeficit = tdee - profile.targetCalories;
  const expectedWeeklyChange = -((dailyDeficit * 7) / CALORIES_PER_KG_FAT);

  const deviation = actualWeeklyChange - expectedWeeklyChange;
  const threshold = sensitivityThresholdKgPerWeek(profile.adaptiveGoalSensitivity);

  // Decide whether to propose.
  let propose = false;
  if (profile.goalType === 'cut') {
    propose = deviation > threshold;
  } else if (profile.goalType === 'bulk') {
    propose = Math.abs(deviation) > threshold;
  } else {
    propose = Math.abs(deviation) > threshold + 0.2;
  }
  if (!propose) return null;

  // Compute new target: aim for expected weekly change again, using estimatedActualTdee.
  // newTarget = estimatedActualTdee + (expectedWeeklyChange × 7700 / 7)
  const newTargetRaw = estimatedActualTdee + (expectedWeeklyChange * CALORIES_PER_KG_FAT) / 7;
  const suggestedCalorieTarget = Math.round(newTargetRaw / 50) * 50;

  // Sanity clamp: don't propose absurd changes.
  const delta = suggestedCalorieTarget - profile.targetCalories;
  if (Math.abs(delta) < 50) return null;
  const clampedTarget = profile.targetCalories + Math.max(-400, Math.min(400, delta));

  return {
    id: generateId(),
    currentCalorieTarget: profile.targetCalories,
    suggestedCalorieTarget: Math.round(clampedTarget / 50) * 50,
    currentTdee: tdee,
    estimatedActualTdee,
    expectedWeeklyChange: Number(expectedWeeklyChange.toFixed(2)),
    actualWeeklyChange: Number(actualWeeklyChange.toFixed(2)),
    deviation: Number(deviation.toFixed(2)),
    reason: buildReason({
      goalType: profile.goalType,
      actualWeeklyChange,
      expectedWeeklyChange,
      deviation,
      currentTdee: tdee,
      estimatedActualTdee,
    }),
    confidence: pickConfidence(logsWithWeight.length),
    dataPointsUsed: logsWithWeight.length,
    calculatedAt: new Date().toISOString(),
    status: 'pending',
  };
}

// --- Actions --------------------------------------------------------------

export async function applySuggestion(
  profile: Profile,
  suggestion: AdaptiveGoalSuggestion
): Promise<void> {
  await updateProfileRepo(profile.id, {
    targetCalories: suggestion.suggestedCalorieTarget,
    adaptiveGoalLastShownAt: new Date().toISOString(),
  });
  await saveSuggestion(profile.id, { ...suggestion, status: 'approved' });
}

export async function dismissSuggestion(
  profile: Profile,
  suggestion: AdaptiveGoalSuggestion
): Promise<void> {
  await updateProfileRepo(profile.id, {
    adaptiveGoalLastShownAt: new Date().toISOString(),
  });
  await saveSuggestion(profile.id, { ...suggestion, status: 'dismissed' });
}

export async function markLastSuggestion(
  profileId: string,
  suggestionId: string,
  status: 'approved' | 'dismissed'
): Promise<void> {
  await markSuggestionStatus(suggestionId, status);
  await updateProfileRepo(profileId, {
    adaptiveGoalLastShownAt: new Date().toISOString(),
  });
}

export function shouldShowSuggestionNow(profile: Profile): boolean {
  if (!profile.adaptiveGoalEnabled) return false;
  if (!profile.adaptiveGoalLastShownAt) return true;
  const last = parseISO(profile.adaptiveGoalLastShownAt);
  const daysSince = differenceInCalendarDays(new Date(), last);
  return daysSince >= 7;
}
