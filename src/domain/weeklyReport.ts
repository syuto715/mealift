import { getDatabase } from '../infra/database/connection';
import { WeeklyReportData } from '../types/weeklyReport';
import { startOfWeek, endOfWeek, format, subWeeks } from 'date-fns';

// ---------------------------------------------------------------------------
// Generate a weekly report from raw DB data
// ---------------------------------------------------------------------------

export async function generateWeeklyReport(
  profileId: string,
  weekDate?: Date,
): Promise<WeeklyReportData> {
  const db = await getDatabase();

  const refDate = weekDate ?? new Date();
  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(refDate, { weekStartsOn: 1 }); // Sunday
  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(weekEnd, 'yyyy-MM-dd');

  // --- Weight ---
  const weightRows = await db.getAllAsync<{ date: string; weight_kg: number }>(
    'SELECT date, weight_kg FROM body_logs WHERE profile_id = ? AND date BETWEEN ? AND ? ORDER BY date',
    [profileId, startStr, endStr],
  );

  const weightStart = weightRows.length > 0 ? weightRows[0].weight_kg : null;
  const weightEnd = weightRows.length > 0 ? weightRows[weightRows.length - 1].weight_kg : null;
  const weightChange =
    weightStart !== null && weightEnd !== null
      ? Math.round((weightEnd - weightStart) * 100) / 100
      : null;

  // --- Nutrition ---
  const nutritionRows = await db.getAllAsync<{
    date: string;
    total_cal: number;
    total_p: number;
    total_f: number;
    total_c: number;
  }>(
    `SELECT ml.date,
            SUM(mli.calories) as total_cal,
            SUM(mli.protein_g) as total_p,
            SUM(mli.fat_g) as total_f,
            SUM(mli.carb_g) as total_c
     FROM meal_logs ml
     JOIN meal_log_items mli ON mli.meal_log_id = ml.id
     WHERE ml.profile_id = ? AND ml.date BETWEEN ? AND ?
     GROUP BY ml.date`,
    [profileId, startStr, endStr],
  );

  const mealLogDays = nutritionRows.length;
  const avgCalories =
    mealLogDays > 0
      ? Math.round(nutritionRows.reduce((s, r) => s + r.total_cal, 0) / mealLogDays)
      : 0;
  const avgProtein =
    mealLogDays > 0
      ? Math.round((nutritionRows.reduce((s, r) => s + r.total_p, 0) / mealLogDays) * 10) / 10
      : 0;
  const avgFat =
    mealLogDays > 0
      ? Math.round((nutritionRows.reduce((s, r) => s + r.total_f, 0) / mealLogDays) * 10) / 10
      : 0;
  const avgCarb =
    mealLogDays > 0
      ? Math.round((nutritionRows.reduce((s, r) => s + r.total_c, 0) / mealLogDays) * 10) / 10
      : 0;

  // --- Training ---
  const trainingRows = await db.getAllAsync<{
    session_count: number;
    total_volume: number;
    total_cal_burned: number;
  }>(
    `SELECT
       COUNT(DISTINCT ws.id) as session_count,
       COALESCE(SUM(wss.weight_kg * wss.reps), 0) as total_volume,
       COALESCE(SUM(ws.estimated_calories), 0) as total_cal_burned
     FROM workout_sessions ws
     LEFT JOIN workout_sets wss ON wss.session_id = ws.id
     WHERE ws.profile_id = ? AND ws.date BETWEEN ? AND ?`,
    [profileId, startStr, endStr],
  );

  const training = trainingRows[0] ?? { session_count: 0, total_volume: 0, total_cal_burned: 0 };

  // --- Scores ---
  // Consistency: how many of 7 days had weight or meal logged
  const weightLogDays = weightRows.length;
  const loggedDays = Math.max(weightLogDays, mealLogDays);
  const consistencyScore = Math.min(100, Math.round((loggedDays / 7) * 100));

  // Nutrition: based on meal log days out of 7
  const nutritionScore = Math.min(100, Math.round((mealLogDays / 7) * 100));

  // Training: 3+ workouts/week = 100, scale linearly
  const trainingScore = Math.min(100, Math.round((training.session_count / 3) * 100));

  // Overall: weighted average
  const overallScore = Math.round(
    consistencyScore * 0.3 + nutritionScore * 0.35 + trainingScore * 0.35,
  );

  return {
    weekStart: startStr,
    weekEnd: endStr,
    weightStart,
    weightEnd,
    weightChange,
    avgCalories,
    avgProtein,
    avgFat,
    avgCarb,
    mealLogDays,
    workoutCount: training.session_count,
    totalVolume: Math.round(training.total_volume),
    totalCaloriesBurned: Math.round(training.total_cal_burned),
    consistencyScore,
    nutritionScore,
    trainingScore,
    overallScore,
  };
}

/** Get the most recent week's report (generate if missing) */
export async function getOrGenerateCurrentReport(
  profileId: string,
): Promise<WeeklyReportData> {
  const db = await getDatabase();
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const existing = await db.getFirstAsync<{ data_json: string }>(
    'SELECT data_json FROM weekly_reports WHERE profile_id = ? AND week_start = ?',
    [profileId, weekStart],
  );

  if (existing) {
    return JSON.parse(existing.data_json) as WeeklyReportData;
  }

  // Generate fresh
  const report = await generateWeeklyReport(profileId);
  return report;
}

/** Save a report to the DB */
export async function saveWeeklyReport(
  profileId: string,
  report: WeeklyReportData,
): Promise<void> {
  const db = await getDatabase();
  const { generateId } = await import('../utils/id');
  const id = generateId();

  await db.runAsync(
    `INSERT OR REPLACE INTO weekly_reports (id, profile_id, week_start, week_end, data_json)
     VALUES (?, ?, ?, ?, ?)`,
    [id, profileId, report.weekStart, report.weekEnd, JSON.stringify(report)],
  );
}

/** Get past N weeks of reports */
export async function getPastReports(
  profileId: string,
  weeks: number = 8,
): Promise<WeeklyReportData[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ data_json: string }>(
    'SELECT data_json FROM weekly_reports WHERE profile_id = ? ORDER BY week_start DESC LIMIT ?',
    [profileId, weeks],
  );
  return rows.map((r) => JSON.parse(r.data_json) as WeeklyReportData);
}
