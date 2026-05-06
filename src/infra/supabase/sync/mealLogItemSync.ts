import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../../repositories/syncRepository';
import type { ResourceSyncModule } from './syncOrchestrator';
import {
  applyServerDeletion,
  fetchWatermarkBatch,
  getCurrentUserId,
  upsertWithBackoff,
} from './syncHelpers';

const SERVER_TABLE = 'user_meal_log_items';
const LOCAL_TABLE = 'meal_log_items';
const PULL_BATCH_LIMIT = 500;

// Level 2: depends on user_meal_logs via meal_log_id (FK).
// Carries the full v6 + v9 extended-nutrient set (20 columns) — the
// largest payload of any sync resource. food_id stays as a soft-FK
// (text, no constraint) since canonical foods aren't synced.

interface LocalPayload {
  id: string;
  meal_log_id: string;
  food_id?: string | null;
  food_name: string;
  serving_amount?: number;
  serving_unit?: string;
  calories: number;
  protein_g?: number;
  fat_g?: number;
  carb_g?: number;
  fiber_g?: number | null;
  sodium_mg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
  vitamin_a_ug?: number | null;
  vitamin_b1_mg?: number | null;
  vitamin_b2_mg?: number | null;
  vitamin_b6_mg?: number | null;
  vitamin_b12_ug?: number | null;
  folate_ug?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_ug?: number | null;
  vitamin_e_mg?: number | null;
  potassium_mg?: number | null;
  magnesium_mg?: number | null;
  zinc_mg?: number | null;
  cholesterol_mg?: number | null;
  saturated_fat_g?: number | null;
  sugar_g?: number | null;
  salt_g?: number | null;
  note?: string | null;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  meal_log_id: string;
  food_id: string | null;
  food_name: string;
  serving_amount: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number | null;
  sodium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  vitamin_a_ug: number | null;
  vitamin_b1_mg: number | null;
  vitamin_b2_mg: number | null;
  vitamin_b6_mg: number | null;
  vitamin_b12_ug: number | null;
  folate_ug: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_e_mg: number | null;
  potassium_mg: number | null;
  magnesium_mg: number | null;
  zinc_mg: number | null;
  cholesterol_mg: number | null;
  saturated_fat_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
  note: string | null;
  updated_at: string;
  deleted_at: string | null;
}

function toServerPayload(
  local: LocalPayload,
  userId: string,
): Record<string, unknown> {
  return {
    id: local.id,
    user_id: userId,
    meal_log_id: local.meal_log_id,
    food_id: local.food_id ?? null,
    food_name: local.food_name,
    serving_amount: local.serving_amount ?? 1,
    serving_unit: local.serving_unit ?? 'g',
    calories: local.calories,
    protein_g: local.protein_g ?? 0,
    fat_g: local.fat_g ?? 0,
    carb_g: local.carb_g ?? 0,
    fiber_g: local.fiber_g ?? null,
    sodium_mg: local.sodium_mg ?? null,
    calcium_mg: local.calcium_mg ?? null,
    iron_mg: local.iron_mg ?? null,
    vitamin_a_ug: local.vitamin_a_ug ?? null,
    vitamin_b1_mg: local.vitamin_b1_mg ?? null,
    vitamin_b2_mg: local.vitamin_b2_mg ?? null,
    vitamin_b6_mg: local.vitamin_b6_mg ?? null,
    vitamin_b12_ug: local.vitamin_b12_ug ?? null,
    folate_ug: local.folate_ug ?? null,
    vitamin_c_mg: local.vitamin_c_mg ?? null,
    vitamin_d_ug: local.vitamin_d_ug ?? null,
    vitamin_e_mg: local.vitamin_e_mg ?? null,
    potassium_mg: local.potassium_mg ?? null,
    magnesium_mg: local.magnesium_mg ?? null,
    zinc_mg: local.zinc_mg ?? null,
    cholesterol_mg: local.cholesterol_mg ?? null,
    saturated_fat_g: local.saturated_fat_g ?? null,
    sugar_g: local.sugar_g ?? null,
    salt_g: local.salt_g ?? null,
    note: local.note ?? null,
    deleted_at: local.deleted_at ?? null,
  };
}

// Server-pull path. INTENTIONALLY does NOT call bumpPublicFoodUseCount
// (Build 15 / Feature 3). The originating device already bumped
// use_count when this row was first created — bumping again on each
// pulled mirror would double-count once per syncing device. Mirrors
// the audit pattern from Phase 6-E: we filter writes by their origin
// (client INSERT vs server pull), not by table name.
async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO meal_log_items (
       id, meal_log_id, food_id, food_name, serving_amount, serving_unit,
       calories, protein_g, fat_g, carb_g,
       fiber_g, sodium_mg, calcium_mg, iron_mg,
       vitamin_a_ug, vitamin_b1_mg, vitamin_b2_mg, vitamin_b6_mg,
       vitamin_b12_ug, folate_ug, vitamin_c_mg,
       vitamin_d_ug, vitamin_e_mg, potassium_mg, magnesium_mg,
       zinc_mg, cholesterol_mg, saturated_fat_g, sugar_g, salt_g,
       note, updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       meal_log_id = excluded.meal_log_id,
       food_id = excluded.food_id,
       food_name = excluded.food_name,
       serving_amount = excluded.serving_amount,
       serving_unit = excluded.serving_unit,
       calories = excluded.calories,
       protein_g = excluded.protein_g,
       fat_g = excluded.fat_g,
       carb_g = excluded.carb_g,
       fiber_g = excluded.fiber_g,
       sodium_mg = excluded.sodium_mg,
       calcium_mg = excluded.calcium_mg,
       iron_mg = excluded.iron_mg,
       vitamin_a_ug = excluded.vitamin_a_ug,
       vitamin_b1_mg = excluded.vitamin_b1_mg,
       vitamin_b2_mg = excluded.vitamin_b2_mg,
       vitamin_b6_mg = excluded.vitamin_b6_mg,
       vitamin_b12_ug = excluded.vitamin_b12_ug,
       folate_ug = excluded.folate_ug,
       vitamin_c_mg = excluded.vitamin_c_mg,
       vitamin_d_ug = excluded.vitamin_d_ug,
       vitamin_e_mg = excluded.vitamin_e_mg,
       potassium_mg = excluded.potassium_mg,
       magnesium_mg = excluded.magnesium_mg,
       zinc_mg = excluded.zinc_mg,
       cholesterol_mg = excluded.cholesterol_mg,
       saturated_fat_g = excluded.saturated_fat_g,
       sugar_g = excluded.sugar_g,
       salt_g = excluded.salt_g,
       note = excluded.note,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.meal_log_id,
      row.food_id,
      row.food_name,
      row.serving_amount,
      row.serving_unit,
      row.calories,
      row.protein_g,
      row.fat_g,
      row.carb_g,
      row.fiber_g,
      row.sodium_mg,
      row.calcium_mg,
      row.iron_mg,
      row.vitamin_a_ug,
      row.vitamin_b1_mg,
      row.vitamin_b2_mg,
      row.vitamin_b6_mg,
      row.vitamin_b12_ug,
      row.folate_ug,
      row.vitamin_c_mg,
      row.vitamin_d_ug,
      row.vitamin_e_mg,
      row.potassium_mg,
      row.magnesium_mg,
      row.zinc_mg,
      row.cholesterol_mg,
      row.saturated_fat_g,
      row.sugar_g,
      row.salt_g,
      row.note,
      row.updated_at,
    ],
  );
}

export const mealLogItemSync: ResourceSyncModule = {
  localTableName: LOCAL_TABLE,
  serverTableName: SERVER_TABLE,

  async pushOne(client, _db, queueRow: SyncQueueRow) {
    const userId = await getCurrentUserId(client);
    const local = JSON.parse(queueRow.payload) as LocalPayload;
    const payload = toServerPayload(local, userId);
    if (queueRow.operation === 'DELETE') {
      payload.deleted_at = new Date().toISOString();
    }
    await upsertWithBackoff(client, SERVER_TABLE, payload);
  },

  async pullBatch(client, db, watermark) {
    const userId = await getCurrentUserId(client);
    const rows = await fetchWatermarkBatch<ServerRow>(
      client,
      SERVER_TABLE,
      userId,
      watermark,
      PULL_BATCH_LIMIT,
    );
    if (rows.length === 0) return { pulled: 0, newWatermark: null };
    for (const row of rows) {
      if (row.deleted_at !== null) {
        await applyServerDeletion(db, LOCAL_TABLE, row.id);
      } else {
        await applyServerRow(db, row);
      }
    }
    return {
      pulled: rows.length,
      newWatermark: rows[rows.length - 1].updated_at,
    };
  },
};
