import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { MealType } from '../../types/common';
import {
  MealLog,
  MealLogItem,
  MealLogItemInput,
  MealLogWithItems,
  DailyNutritionSummary,
} from '../../types/nutrition';

function rowToMealLog(row: Record<string, unknown>): MealLog {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    date: row.date as string,
    mealType: row.meal_type as MealType,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMealLogItem(row: Record<string, unknown>): MealLogItem {
  return {
    id: row.id as string,
    mealLogId: row.meal_log_id as string,
    foodId: (row.food_id as string) ?? null,
    foodName: row.food_name as string,
    servingAmount: row.serving_amount as number,
    servingUnit: row.serving_unit as string,
    calories: row.calories as number,
    proteinG: row.protein_g as number,
    fatG: row.fat_g as number,
    carbG: row.carb_g as number,
    fiberG: (row.fiber_g as number) ?? 0,
    sodiumMg: (row.sodium_mg as number) ?? 0,
    calciumMg: (row.calcium_mg as number) ?? 0,
    ironMg: (row.iron_mg as number) ?? 0,
    vitaminAUg: (row.vitamin_a_ug as number) ?? 0,
    vitaminB1Mg: (row.vitamin_b1_mg as number) ?? 0,
    vitaminB2Mg: (row.vitamin_b2_mg as number) ?? 0,
    vitaminCMg: (row.vitamin_c_mg as number) ?? 0,
    vitaminDUg: (row.vitamin_d_ug as number) ?? 0,
    vitaminEMg: (row.vitamin_e_mg as number) ?? 0,
    potassiumMg: (row.potassium_mg as number) ?? 0,
    magnesiumMg: (row.magnesium_mg as number) ?? 0,
    zincMg: (row.zinc_mg as number) ?? 0,
    cholesterolMg: (row.cholesterol_mg as number) ?? 0,
    saturatedFatG: (row.saturated_fat_g as number) ?? 0,
    sugarG: (row.sugar_g as number) ?? 0,
    saltG: (row.salt_g as number) ?? 0,
    note: (row.note as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function getOrCreateMealLog(
  profileId: string,
  date: string,
  mealType: MealType
): Promise<MealLog> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM meal_logs WHERE profile_id = ? AND date = ? AND meal_type = ?',
    [profileId, date, mealType]
  );
  if (existing) {
    return rowToMealLog(existing);
  }
  const id = generateId();
  await db.runAsync(
    `INSERT INTO meal_logs (id, profile_id, date, meal_type) VALUES (?, ?, ?, ?)`,
    [id, profileId, date, mealType]
  );
  const created = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM meal_logs WHERE id = ?',
    [id]
  );
  return rowToMealLog(created!);
}

export async function addMealLogItem(
  mealLogId: string,
  input: MealLogItemInput
): Promise<MealLogItem> {
  const db = await getDatabase();
  const id = generateId();
  await db.runAsync(
    `INSERT INTO meal_log_items (
      id, meal_log_id, food_id, food_name, serving_amount, serving_unit,
      calories, protein_g, fat_g, carb_g,
      fiber_g, sodium_mg, calcium_mg, iron_mg,
      vitamin_a_ug, vitamin_b1_mg, vitamin_b2_mg, vitamin_c_mg,
      vitamin_d_ug, vitamin_e_mg, potassium_mg, magnesium_mg,
      zinc_mg, cholesterol_mg, saturated_fat_g, sugar_g, salt_g,
      note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      mealLogId,
      input.foodId ?? null,
      input.foodName,
      input.servingAmount,
      input.servingUnit,
      input.calories,
      input.proteinG,
      input.fatG,
      input.carbG,
      input.fiberG ?? 0,
      input.sodiumMg ?? 0,
      input.calciumMg ?? 0,
      input.ironMg ?? 0,
      input.vitaminAUg ?? 0,
      input.vitaminB1Mg ?? 0,
      input.vitaminB2Mg ?? 0,
      input.vitaminCMg ?? 0,
      input.vitaminDUg ?? 0,
      input.vitaminEMg ?? 0,
      input.potassiumMg ?? 0,
      input.magnesiumMg ?? 0,
      input.zincMg ?? 0,
      input.cholesterolMg ?? 0,
      input.saturatedFatG ?? 0,
      input.sugarG ?? 0,
      input.saltG ?? 0,
      input.note ?? null,
    ]
  );
  const created = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM meal_log_items WHERE id = ?',
    [id]
  );
  return rowToMealLogItem(created!);
}

export async function updateMealLogItem(
  itemId: string,
  updates: {
    servingAmount: number;
    servingUnit: string;
    calories: number;
    proteinG: number;
    fatG: number;
    carbG: number;
  }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE meal_log_items
     SET serving_amount = ?, serving_unit = ?, calories = ?, protein_g = ?, fat_g = ?, carb_g = ?
     WHERE id = ?`,
    [
      updates.servingAmount,
      updates.servingUnit,
      updates.calories,
      updates.proteinG,
      updates.fatG,
      updates.carbG,
      itemId,
    ]
  );
}

export async function removeMealLogItem(itemId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM meal_log_items WHERE id = ?', [itemId]);
}

export async function getDailyNutritionSummary(
  profileId: string,
  date: string
): Promise<DailyNutritionSummary> {
  const db = await getDatabase();

  const mealRows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM meal_logs WHERE profile_id = ? AND date = ? ORDER BY created_at',
    [profileId, date]
  );

  const meals: MealLogWithItems[] = [];
  let totalCalories = 0;
  let totalProteinG = 0;
  let totalFatG = 0;
  let totalCarbG = 0;
  const ext = {
    fiberG: 0, saltG: 0, calciumMg: 0, ironMg: 0,
    vitaminAUg: 0, vitaminB1Mg: 0, vitaminB2Mg: 0, vitaminCMg: 0,
    vitaminDUg: 0, vitaminEMg: 0, potassiumMg: 0, magnesiumMg: 0,
    zincMg: 0, cholesterolMg: 0, saturatedFatG: 0, sugarG: 0, sodiumMg: 0,
  };

  for (const mealRow of mealRows) {
    const mealLog = rowToMealLog(mealRow);
    const itemRows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM meal_log_items WHERE meal_log_id = ? ORDER BY created_at',
      [mealLog.id]
    );
    const items = itemRows.map(rowToMealLogItem);

    for (const item of items) {
      totalCalories += item.calories;
      totalProteinG += item.proteinG;
      totalFatG += item.fatG;
      totalCarbG += item.carbG;
      ext.fiberG += item.fiberG;
      ext.saltG += item.saltG;
      ext.calciumMg += item.calciumMg;
      ext.ironMg += item.ironMg;
      ext.vitaminAUg += item.vitaminAUg;
      ext.vitaminB1Mg += item.vitaminB1Mg;
      ext.vitaminB2Mg += item.vitaminB2Mg;
      ext.vitaminCMg += item.vitaminCMg;
      ext.vitaminDUg += item.vitaminDUg;
      ext.vitaminEMg += item.vitaminEMg;
      ext.potassiumMg += item.potassiumMg;
      ext.magnesiumMg += item.magnesiumMg;
      ext.zincMg += item.zincMg;
      ext.cholesterolMg += item.cholesterolMg;
      ext.saturatedFatG += item.saturatedFatG;
      ext.sugarG += item.sugarG;
      ext.sodiumMg += item.sodiumMg;
    }

    meals.push({ ...mealLog, items });
  }

  return {
    date,
    totalCalories: Math.round(totalCalories),
    totalProteinG: Math.round(totalProteinG * 10) / 10,
    totalFatG: Math.round(totalFatG * 10) / 10,
    totalCarbG: Math.round(totalCarbG * 10) / 10,
    extended: {
      fiberG: Math.round(ext.fiberG * 10) / 10,
      saltG: Math.round(ext.saltG * 10) / 10,
      calciumMg: Math.round(ext.calciumMg),
      ironMg: Math.round(ext.ironMg * 10) / 10,
      vitaminAUg: Math.round(ext.vitaminAUg),
      vitaminB1Mg: Math.round(ext.vitaminB1Mg * 100) / 100,
      vitaminB2Mg: Math.round(ext.vitaminB2Mg * 100) / 100,
      vitaminCMg: Math.round(ext.vitaminCMg),
      vitaminDUg: Math.round(ext.vitaminDUg * 10) / 10,
      vitaminEMg: Math.round(ext.vitaminEMg * 10) / 10,
      potassiumMg: Math.round(ext.potassiumMg),
      magnesiumMg: Math.round(ext.magnesiumMg),
      zincMg: Math.round(ext.zincMg * 10) / 10,
      cholesterolMg: Math.round(ext.cholesterolMg),
      saturatedFatG: Math.round(ext.saturatedFatG * 10) / 10,
      sugarG: Math.round(ext.sugarG * 10) / 10,
      sodiumMg: Math.round(ext.sodiumMg),
    },
    meals,
  };
}

export async function getDailyCalories(
  profileId: string,
  date: string
): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(mli.calories), 0) as total
     FROM meal_log_items mli
     JOIN meal_logs ml ON mli.meal_log_id = ml.id
     WHERE ml.profile_id = ? AND ml.date = ?`,
    [profileId, date]
  );
  return result?.total ?? 0;
}

export async function getRecordedNutritionDates(
  profileId: string,
  monthPrefix: string
): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM meal_logs
     WHERE profile_id = ? AND date LIKE ? || '%'
     ORDER BY date`,
    [profileId, monthPrefix]
  );
  return rows.map((r) => r.date);
}

export async function getWeeklyCalories(
  profileId: string
): Promise<{ date: string; calories: number }[]> {
  const db = await getDatabase();
  return db.getAllAsync<{ date: string; calories: number }>(
    `SELECT ml.date, COALESCE(SUM(mli.calories), 0) as calories
     FROM meal_logs ml
     LEFT JOIN meal_log_items mli ON mli.meal_log_id = ml.id
     WHERE ml.profile_id = ? AND ml.date >= date('now', '-7 days')
     GROUP BY ml.date
     ORDER BY ml.date`,
    [profileId]
  );
}
