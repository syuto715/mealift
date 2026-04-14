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
