import { getDatabase } from '../infra/database/connection';
import { enqueueRowFromTable } from '../infra/repositories/syncRepository';
import {
  WeeklyReportData,
  WeeklyNarrative,
  NARRATIVE_CACHE_VERSION,
} from '../types/weeklyReport';
import { generateId } from '../utils/id';
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

/**
 * Save a report to the DB.
 *
 * Build 16 / Phase 1.1 — opportunistic correctness fix while wiring
 * the AI narrative helpers below. Two issues the original version had:
 *
 *   1. Used `INSERT OR REPLACE` with a fresh generateId() every call,
 *      so the unique (profile_id, week_start) index would delete the
 *      prior local row and insert a new id. Cloud sync would then
 *      orphan the previous server row instead of updating it.
 *      → Now: ON CONFLICT(profile_id, week_start) DO UPDATE so the
 *      existing row's id is preserved regardless of which writer
 *      raced first.
 *
 *   2. Did not enqueue the write into sync_queue, so weekly reports
 *      never reached the cloud. The check-enqueue-sync audit doesn't
 *      catch this because it scans `src/infra/repositories/` only,
 *      and saveWeeklyReport lives in `src/domain/`.
 *      → Now: post-write SELECT for the canonical id, then enqueue
 *      with that id so two concurrent first-saves both land on the
 *      same row and both push the same id (Codex review pass 1
 *      Critical #2 — the lookup-then-INSERT version was racy).
 *
 * The pre-existing function was effectively dead code (only called
 * by the new saveNarrativeToReport below), so this fix doesn't
 * disturb any live call site.
 */
export async function saveWeeklyReport(
  profileId: string,
  report: WeeklyReportData,
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const preExisting = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM weekly_reports
       WHERE profile_id = ? AND week_start = ? AND deleted_at IS NULL`,
    [profileId, report.weekStart],
  );
  // Best-guess id for the INSERT path. If a concurrent writer beat
  // us in between this read and the write below, the ON CONFLICT
  // handler keeps the existing row intact and we'll re-read the
  // canonical id afterwards.
  const insertId = preExisting?.id ?? generateId();

  await db.runAsync(
    `INSERT INTO weekly_reports
       (id, profile_id, week_start, week_end, data_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, week_start) DO UPDATE SET
       week_end = excluded.week_end,
       data_json = excluded.data_json,
       updated_at = excluded.updated_at`,
    [
      insertId,
      profileId,
      report.weekStart,
      report.weekEnd,
      JSON.stringify(report),
      now,
      now,
    ],
  );

  // Re-read so the enqueue id matches whatever actually persisted.
  // Under no contention this returns insertId; under contention this
  // returns the winning concurrent writer's id.
  const stored = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM weekly_reports
       WHERE profile_id = ? AND week_start = ? AND deleted_at IS NULL`,
    [profileId, report.weekStart],
  );
  const storedId = stored?.id ?? insertId;
  await enqueueRowFromTable(
    'weekly_reports',
    storedId,
    preExisting ? 'UPDATE' : 'INSERT',
  );
}

// ---------------------------------------------------------------------------
// Build 16 / Phase 1.1 — AI narrative helpers
// ---------------------------------------------------------------------------

// Codex review pass 1 / Critical #1 — `new Date('YYYY-MM-DD')` parses
// as UTC midnight per the ISO 8601 spec, so users in negative offsets
// (Americas) end up on the previous local day. generateWeeklyReport's
// startOfWeek then snaps to the prior Monday and the narrative
// attaches to the wrong week entirely. JST users (UTC+9) wouldn't
// notice this, which is why it slipped past development.
//
// Fix: build a local-time Date at noon. Noon is well clear of DST
// transitions in every commonly-used zone, so even on the rare day a
// region shifts its clock the local Date stays inside the intended
// calendar day.
function parseISODateAsLocalNoon(weekStart: string): Date {
  const [y, m, d] = weekStart.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// Fetch the persisted report row for an exact week. Distinct from
// getOrGenerateCurrentReport (which only handles "this week" and has
// fallback compute-on-miss semantics) — this one returns null when no
// row exists, leaving the merge / fresh-generate decision to the caller.
async function fetchReportForWeek(
  profileId: string,
  weekStart: string,
): Promise<WeeklyReportData | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ data_json: string }>(
    `SELECT data_json FROM weekly_reports
       WHERE profile_id = ? AND week_start = ? AND deleted_at IS NULL`,
    [profileId, weekStart],
  );
  if (!row) return null;
  try {
    return JSON.parse(row.data_json) as WeeklyReportData;
  } catch {
    return null;
  }
}

/**
 * Attach an AI narrative to the persisted report for a given week.
 *
 * Flow:
 *   1. Look up the existing report row. If none exists yet (first
 *      narrative generation for that week), compute the rule-based
 *      stats fresh via generateWeeklyReport so the narrative attaches
 *      to a complete WeeklyReportData payload.
 *   2. Merge: spread existing + overwrite the `narrative` field. All
 *      other fields are preserved.
 *   3. Persist via saveWeeklyReport (which now enqueues sync — see
 *      that function's comment above).
 *
 * `weekStart` is the canonical Monday-anchored ISO date. Callers are
 * expected to use the same week-boundary convention as
 * generateWeeklyReport (Monday start). The narrative includes a
 * generatedAt millis timestamp + cacheVersion stamped by this helper,
 * so callers can pass a partial WeeklyNarrative if they want.
 */
export async function saveNarrativeToReport(
  profileId: string,
  weekStart: string,
  narrative: Omit<WeeklyNarrative, 'generatedAt' | 'cacheVersion'> &
    Partial<Pick<WeeklyNarrative, 'generatedAt' | 'cacheVersion'>>,
): Promise<void> {
  let report = await fetchReportForWeek(profileId, weekStart);
  if (!report) {
    // First narrative for this week — generate fresh stats so the
    // saved row is self-contained instead of having a narrative
    // attached to placeholder zeros. Use local-noon parsing to dodge
    // the UTC-midnight timezone bug (see parseISODateAsLocalNoon).
    report = await generateWeeklyReport(
      profileId,
      parseISODateAsLocalNoon(weekStart),
    );
  }
  const stamped: WeeklyNarrative = {
    overall: narrative.overall,
    sections: narrative.sections,
    generatedAt: narrative.generatedAt ?? Date.now(),
    cacheVersion: narrative.cacheVersion ?? NARRATIVE_CACHE_VERSION,
  };
  await saveWeeklyReport(profileId, { ...report, narrative: stamped });
}

/**
 * Read the AI narrative attached to a saved report row.
 *
 * Returns null when:
 *   - no row exists for that week
 *   - the row exists but has no narrative field (rule-based-only)
 *   - the row's data_json fails to parse (corrupt write — extremely
 *     rare, would have failed validation upstream)
 */
export async function getNarrativeFromReport(
  profileId: string,
  weekStart: string,
): Promise<WeeklyNarrative | null> {
  const report = await fetchReportForWeek(profileId, weekStart);
  return report?.narrative ?? null;
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
