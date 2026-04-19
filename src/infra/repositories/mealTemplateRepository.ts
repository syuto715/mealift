import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { MealTemplate, MealLogItemInput } from '../../types/nutrition';
import { MealType } from '../../types/common';

function rowToTemplate(row: Record<string, unknown>): MealTemplate {
  let items: MealLogItemInput[] = [];
  try {
    items = JSON.parse((row.items as string) ?? '[]');
  } catch {
    items = [];
  }
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    name: row.name as string,
    mealType: (row.meal_type as MealType) ?? null,
    items,
    useCount: (row.use_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getTemplates(profileId: string): Promise<MealTemplate[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM meal_templates WHERE profile_id = ? ORDER BY use_count DESC, updated_at DESC',
    [profileId]
  );
  return rows.map(rowToTemplate);
}

export async function createTemplate(
  profileId: string,
  name: string,
  mealType: MealType | null,
  items: MealLogItemInput[]
): Promise<MealTemplate> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const itemsJson = JSON.stringify(items);

  await db.runAsync(
    `INSERT INTO meal_templates (id, profile_id, name, meal_type, items, use_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, profileId, name, mealType ?? null, itemsJson, now, now]
  );

  return {
    id,
    profileId,
    name,
    mealType,
    items,
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM meal_templates WHERE id = ?', [templateId]);
}

export async function incrementTemplateUseCount(templateId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE meal_templates SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
    [templateId]
  );
}

export async function getTemplateCount(profileId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM meal_templates WHERE profile_id = ?',
    [profileId]
  );
  return row?.count ?? 0;
}

export async function getTemplateById(templateId: string): Promise<MealTemplate | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM meal_templates WHERE id = ?',
    [templateId]
  );
  return row ? rowToTemplate(row) : null;
}

export async function updateTemplate(
  templateId: string,
  updates: { name?: string; mealType?: MealType | null; items?: MealLogItemInput[] }
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.mealType !== undefined) {
    fields.push('meal_type = ?');
    values.push(updates.mealType);
  }
  if (updates.items !== undefined) {
    fields.push('items = ?');
    values.push(JSON.stringify(updates.items));
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(templateId);
  await db.runAsync(
    `UPDATE meal_templates SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

export async function applyTemplateToMeal(
  templateId: string,
  profileId: string,
  date: string,
  mealType: MealType
): Promise<number> {
  const template = await getTemplateById(templateId);
  if (!template) return 0;

  const db = await getDatabase();
  // Ensure meal_log exists
  let mealLog = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM meal_logs WHERE profile_id = ? AND date = ? AND meal_type = ?',
    [profileId, date, mealType]
  );
  let mealLogId: string;
  if (mealLog) {
    mealLogId = mealLog.id as string;
  } else {
    mealLogId = generateId();
    await db.runAsync(
      `INSERT INTO meal_logs (id, profile_id, date, meal_type) VALUES (?, ?, ?, ?)`,
      [mealLogId, profileId, date, mealType]
    );
  }

  let copied = 0;
  for (const item of template.items) {
    const newId = generateId();
    await db.runAsync(
      `INSERT INTO meal_log_items (
        id, meal_log_id, food_id, food_name, serving_amount, serving_unit,
        calories, protein_g, fat_g, carb_g,
        fiber_g, sodium_mg, calcium_mg, iron_mg,
        vitamin_a_ug, vitamin_b1_mg, vitamin_b2_mg, vitamin_b6_mg,
        vitamin_b12_ug, folate_ug, vitamin_c_mg,
        vitamin_d_ug, vitamin_e_mg, potassium_mg, magnesium_mg,
        zinc_mg, cholesterol_mg, saturated_fat_g, sugar_g, salt_g,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        mealLogId,
        item.foodId ?? null,
        item.foodName,
        item.servingAmount,
        item.servingUnit,
        item.calories,
        item.proteinG,
        item.fatG,
        item.carbG,
        item.fiberG ?? 0,
        item.sodiumMg ?? 0,
        item.calciumMg ?? 0,
        item.ironMg ?? 0,
        item.vitaminAUg ?? 0,
        item.vitaminB1Mg ?? 0,
        item.vitaminB2Mg ?? 0,
        item.vitaminB6Mg ?? 0,
        item.vitaminB12Ug ?? 0,
        item.folateUg ?? 0,
        item.vitaminCMg ?? 0,
        item.vitaminDUg ?? 0,
        item.vitaminEMg ?? 0,
        item.potassiumMg ?? 0,
        item.magnesiumMg ?? 0,
        item.zincMg ?? 0,
        item.cholesterolMg ?? 0,
        item.saturatedFatG ?? 0,
        item.sugarG ?? 0,
        item.saltG ?? 0,
        item.note ?? null,
      ]
    );
    copied++;
  }

  await incrementTemplateUseCount(templateId);
  await db.runAsync(
    "UPDATE meal_templates SET last_used_at = datetime('now') WHERE id = ?",
    [templateId]
  );
  return copied;
}
