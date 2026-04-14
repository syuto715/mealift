import { getDatabase } from '../infra/database/connection';
import { MuscleGroup } from '../types/common';
import { MuscleRecoveryStatus, WorkoutSuggestion } from '../types/workoutSuggestion';
import { differenceInHours } from 'date-fns';

// Recovery time per muscle group in hours
const RECOVERY_HOURS: Record<MuscleGroup, number> = {
  chest: 48,
  back: 48,
  shoulders: 48,
  legs: 72,
  arms: 36,
  core: 24,
  full_body: 48,
};

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: '胸',
  back: '背中',
  shoulders: '肩',
  legs: '脚',
  arms: '腕',
  core: '体幹',
  full_body: '全身',
};

const ALL_GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'legs', 'arms', 'core'];

/**
 * Compute recovery status for each muscle group based on recent workout history.
 */
export async function getRecoveryStatuses(
  profileId: string,
): Promise<MuscleRecoveryStatus[]> {
  const db = await getDatabase();
  const now = new Date();

  // Get the most recent training date per muscle group (primary + secondary)
  // We need to join workout_sets → exercises to get muscle groups
  const rows = await db.getAllAsync<{
    muscle_group: string;
    last_date: string;
  }>(
    `SELECT e.muscle_group, MAX(ws.date || ' ' || COALESCE(ws.started_at, '00:00:00')) as last_date
     FROM workout_sets wss
     JOIN workout_sessions ws ON wss.session_id = ws.id
     JOIN exercises e ON wss.exercise_id = e.id
     WHERE ws.profile_id = ?
     GROUP BY e.muscle_group`,
    [profileId],
  );

  const lastTrainedMap = new Map<string, string>();
  for (const row of rows) {
    lastTrainedMap.set(row.muscle_group, row.last_date);
  }

  // Also account for secondary muscles from recent sessions (last 7 days)
  const secondaryRows = await db.getAllAsync<{
    secondary_muscles: string | null;
    session_date: string;
  }>(
    `SELECT e.secondary_muscles, MAX(ws.date || ' ' || COALESCE(ws.started_at, '00:00:00')) as session_date
     FROM workout_sets wss
     JOIN workout_sessions ws ON wss.session_id = ws.id
     JOIN exercises e ON wss.exercise_id = e.id
     WHERE ws.profile_id = ? AND e.secondary_muscles IS NOT NULL
     GROUP BY e.secondary_muscles`,
    [profileId],
  );

  for (const row of secondaryRows) {
    if (!row.secondary_muscles) continue;
    try {
      const secondaries: string[] = JSON.parse(row.secondary_muscles);
      for (const muscle of secondaries) {
        const existing = lastTrainedMap.get(muscle);
        if (!existing || row.session_date > existing) {
          lastTrainedMap.set(muscle, row.session_date);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return ALL_GROUPS.map((group) => {
    const lastStr = lastTrainedMap.get(group) ?? null;
    if (!lastStr) {
      return {
        muscleGroup: group,
        lastTrainedDate: null,
        hoursSinceTraining: null,
        recoveryPercent: 100,
        status: 'recovered' as const,
      };
    }

    const lastDate = new Date(lastStr);
    const hours = differenceInHours(now, lastDate);
    const requiredHours = RECOVERY_HOURS[group];
    const recoveryPercent = Math.min(100, Math.round((hours / requiredHours) * 100));

    let status: 'recovered' | 'recovering' | 'fatigued';
    if (recoveryPercent >= 90) {
      status = 'recovered';
    } else if (recoveryPercent >= 50) {
      status = 'recovering';
    } else {
      status = 'fatigued';
    }

    return {
      muscleGroup: group,
      lastTrainedDate: lastStr.split(' ')[0],
      hoursSinceTraining: hours,
      recoveryPercent,
      status,
    };
  });
}

/**
 * Generate a workout suggestion based on recovery status.
 */
export async function getWorkoutSuggestion(
  profileId: string,
): Promise<WorkoutSuggestion> {
  const statuses = await getRecoveryStatuses(profileId);

  const recovered = statuses.filter((s) => s.status === 'recovered');
  const recovering = statuses.filter((s) => s.status === 'recovering');

  // Priority: suggest muscle groups that are fully recovered
  // If multiple are recovered, prefer those not trained the longest
  const sortedRecovered = recovered.sort((a, b) => {
    // null (never trained) comes first
    if (a.hoursSinceTraining === null) return -1;
    if (b.hoursSinceTraining === null) return 1;
    return b.hoursSinceTraining - a.hoursSinceTraining;
  });

  let suggestedGroups: MuscleGroup[];
  let reason: string;

  if (sortedRecovered.length >= 2) {
    // Suggest top 2 recovered groups (typical split)
    suggestedGroups = sortedRecovered.slice(0, 2).map((s) => s.muscleGroup);
    const labels = suggestedGroups.map((g) => MUSCLE_LABELS[g]).join('・');
    reason = `${labels}が十分に回復しています`;
  } else if (sortedRecovered.length === 1) {
    suggestedGroups = [sortedRecovered[0].muscleGroup];
    reason = `${MUSCLE_LABELS[sortedRecovered[0].muscleGroup]}が回復しています`;
  } else if (recovering.length > 0) {
    // All fatigued or recovering — suggest the most recovered
    const bestRecovering = recovering.sort((a, b) => b.recoveryPercent - a.recoveryPercent);
    suggestedGroups = [bestRecovering[0].muscleGroup];
    reason = `${MUSCLE_LABELS[bestRecovering[0].muscleGroup]}が回復中ですが、軽めのトレーニングが可能です`;
  } else {
    // All recently trained
    suggestedGroups = [];
    reason = '全身が疲労中です。休息日にしましょう';
  }

  return {
    suggestedMuscleGroups: suggestedGroups,
    reason,
    recoveryStatuses: statuses,
  };
}

export { MUSCLE_LABELS };
