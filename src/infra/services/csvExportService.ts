import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { format } from 'date-fns';
import { getDatabase } from '../database/connection';

// UTF-8 BOM for proper Excel/Sheets opening
const BOM = '\uFEFF';

export type ExportType = 'weight' | 'nutrition' | 'training' | 'all';

const FORMULA_PREFIX_RE = /^[\s\u0000-\u001F\u007F]*[=+\-@]/;

export function escapeCsvCell(value: unknown): string {
  if (value == null) return '';
  let text = String(value);
  if (FORMULA_PREFIX_RE.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(values: unknown[]): string {
  return `${values.map(escapeCsvCell).join(',')}\n`;
}

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

async function generateWeightCsv(profileId: string): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT date, weight_kg, body_fat_pct FROM body_logs WHERE profile_id = ? AND deleted_at IS NULL ORDER BY date',
    [profileId],
  );

  let csv = csvRow(['日付', '体重(kg)', '体脂肪率(%)']);
  for (const row of rows) {
    csv += csvRow([row.date, row.weight_kg, row.body_fat_pct]);
  }
  return csv;
}

async function generateNutritionCsv(profileId: string): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ml.date, ml.meal_type, mli.food_name, mli.serving_amount, mli.serving_unit,
            mli.calories, mli.protein_g, mli.fat_g, mli.carb_g
     FROM meal_log_items mli
     JOIN meal_logs ml ON mli.meal_log_id = ml.id
     WHERE ml.profile_id = ? AND ml.deleted_at IS NULL AND mli.deleted_at IS NULL
     ORDER BY ml.date, ml.meal_type`,
    [profileId],
  );

  let csv = csvRow([
    '日付',
    '食事タイプ',
    '食品名',
    '量',
    '単位',
    'カロリー',
    'タンパク質(g)',
    '脂質(g)',
    '炭水化物(g)',
  ]);
  for (const row of rows) {
    csv += csvRow([
      row.date,
      row.meal_type,
      row.food_name,
      row.serving_amount,
      row.serving_unit,
      row.calories,
      row.protein_g,
      row.fat_g,
      row.carb_g,
    ]);
  }
  return csv;
}

async function generateTrainingCsv(profileId: string): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    // workout_sessions has no `date` column (only started_at, a UTC ISO
    // string); the prior `ws.date` here failed statement prep with
    // "no such column: ws.date", so training CSV export always threw. Same
    // audit class as the workoutSuggestion fix (C-06/D-08). Derive the day
    // from started_at via date().
    `SELECT date(ws.started_at) as date, e.name_ja as exercise_name, wss.set_number, wss.weight_kg, wss.reps, wss.rpe
     FROM workout_sets wss
     JOIN workout_sessions ws ON wss.session_id = ws.id
     JOIN exercises e ON wss.exercise_id = e.id
     WHERE ws.profile_id = ? AND ws.deleted_at IS NULL AND wss.deleted_at IS NULL
     ORDER BY ws.started_at`,
    [profileId],
  );

  let csv = csvRow(['日付', '種目', 'セット', '重量(kg)', 'レップ', 'RPE']);
  for (const row of rows) {
    csv += csvRow([
      row.date,
      row.exercise_name,
      row.set_number,
      row.weight_kg,
      row.reps,
      row.rpe,
    ]);
  }
  return csv;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const TYPE_LABELS: Record<ExportType, string> = {
  weight: '体重記録',
  nutrition: '食事記録',
  training: 'トレーニング記録',
  all: '全データ',
};

export async function exportCsv(
  type: ExportType,
  profileId: string,
): Promise<void> {
  const dateStr = format(new Date(), 'yyyyMMdd');
  const fileName = `mealift_${type}_${dateStr}.csv`;

  let content = '';

  if (type === 'all') {
    const [weight, nutrition, training] = await Promise.all([
      generateWeightCsv(profileId),
      generateNutritionCsv(profileId),
      generateTrainingCsv(profileId),
    ]);
    content = `--- 体重記録 ---\n${weight}\n--- 食事記録 ---\n${nutrition}\n--- トレーニング記録 ---\n${training}`;
  } else if (type === 'weight') {
    content = await generateWeightCsv(profileId);
  } else if (type === 'nutrition') {
    content = await generateNutritionCsv(profileId);
  } else {
    content = await generateTrainingCsv(profileId);
  }

  const file = new File(Paths.cache, fileName);
  file.write(BOM + content);

  try {
    await shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: `${TYPE_LABELS[type]}をエクスポート`,
      UTI: 'public.comma-separated-values-text',
    });
  } finally {
    if (file.exists) {
      file.delete();
    }
  }
}
