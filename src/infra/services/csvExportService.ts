import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { format } from 'date-fns';
import { getDatabase } from '../database/connection';

// UTF-8 BOM for proper Excel/Sheets opening
const BOM = '\uFEFF';

export type ExportType = 'weight' | 'nutrition' | 'training' | 'all';

// ---------------------------------------------------------------------------
// Individual generators
// ---------------------------------------------------------------------------

async function generateWeightCsv(profileId: string): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT date, weight_kg, body_fat_pct FROM body_logs WHERE profile_id = ? ORDER BY date',
    [profileId],
  );

  let csv = '日付,体重(kg),体脂肪率(%)\n';
  for (const row of rows) {
    csv += `${row.date},${row.weight_kg ?? ''},${row.body_fat_pct ?? ''}\n`;
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
     WHERE ml.profile_id = ?
     ORDER BY ml.date, ml.meal_type`,
    [profileId],
  );

  let csv = '日付,食事タイプ,食品名,量,単位,カロリー,タンパク質(g),脂質(g),炭水化物(g)\n';
  for (const row of rows) {
    const foodName = String(row.food_name ?? '').replace(/,/g, '、');
    csv += `${row.date},${row.meal_type},${foodName},${row.serving_amount},${row.serving_unit},${row.calories},${row.protein_g},${row.fat_g},${row.carb_g}\n`;
  }
  return csv;
}

async function generateTrainingCsv(profileId: string): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ws.date, e.name_ja as exercise_name, wss.set_number, wss.weight_kg, wss.reps, wss.rpe
     FROM workout_sets wss
     JOIN workout_sessions ws ON wss.session_id = ws.id
     JOIN exercises e ON wss.exercise_id = e.id
     WHERE ws.profile_id = ?
     ORDER BY ws.date`,
    [profileId],
  );

  let csv = '日付,種目,セット,重量(kg),レップ,RPE\n';
  for (const row of rows) {
    const name = String(row.exercise_name ?? '').replace(/,/g, '、');
    csv += `${row.date},${name},${row.set_number},${row.weight_kg ?? ''},${row.reps ?? ''},${row.rpe ?? ''}\n`;
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

  await shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: `${TYPE_LABELS[type]}をエクスポート`,
    UTI: 'public.comma-separated-values-text',
  });
}
