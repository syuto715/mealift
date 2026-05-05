import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncQueueRow } from '../../repositories/syncRepository';
import type { ResourceSyncModule } from './syncOrchestrator';
import {
  applyServerDeletion,
  boolToInt,
  fetchWatermarkBatch,
  getCurrentUserId,
  intToBool,
  upsertWithBackoff,
} from './syncHelpers';

const SERVER_TABLE = 'user_dishes';
const LOCAL_TABLE = 'dishes';
const PULL_BATCH_LIMIT = 500;

// Mixed-table situation: local `dishes` carries canonical seeds + user
// custom (is_my_dish = 1). Phase 6 only enqueues is_my_dish = 1 rows.
// Push: set is_my_dish = true on the server (canonical-only-on-local
// cases stay private). Pull: set is_my_dish = 1 on the local upsert.
//
// Server schema gap: user_dishes has only the 4 macro totals
// (total_calories / total_protein_g / total_fat_g / total_carb_g) and
// not the 16+ extended-nutrient sums that local dishes table carries
// from v6/v9. Push drops them; pull leaves the local extended
// columns NULL (UI re-derives from dish_ingredients sums when needed).

interface LocalPayload {
  id: string;
  name_ja: string;
  name_en?: string | null;
  category: string;
  serving_description?: string;
  total_calories: number;
  total_protein_g?: number;
  total_fat_g?: number;
  total_carb_g?: number;
  is_favorite?: number | boolean;
  use_count?: number;
  last_used_at?: string | null;
  user_note?: string | null;
  deleted_at?: string | null;
}

interface ServerRow {
  id: string;
  user_id: string;
  name_ja: string;
  name_en: string | null;
  category: string;
  serving_description: string;
  total_calories: number;
  total_protein_g: number;
  total_fat_g: number;
  total_carb_g: number;
  is_my_dish: boolean;
  is_favorite: boolean;
  use_count: number;
  last_used_at: string | null;
  user_note: string | null;
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
    name_ja: local.name_ja,
    name_en: local.name_en ?? null,
    category: local.category,
    serving_description: local.serving_description ?? '1人前',
    total_calories: local.total_calories,
    total_protein_g: local.total_protein_g ?? 0,
    total_fat_g: local.total_fat_g ?? 0,
    total_carb_g: local.total_carb_g ?? 0,
    is_my_dish: true,
    is_favorite: intToBool(local.is_favorite),
    use_count: local.use_count ?? 0,
    last_used_at: local.last_used_at ?? null,
    user_note: local.user_note ?? null,
    deleted_at: local.deleted_at ?? null,
  };
}

async function applyServerRow(
  db: SQLiteDatabase,
  row: ServerRow,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO dishes (
       id, name_ja, name_en, category, serving_description,
       total_calories, total_protein_g, total_fat_g, total_carb_g,
       is_my_dish, is_favorite, use_count, last_used_at, user_note,
       updated_at, synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       name_ja = excluded.name_ja,
       name_en = excluded.name_en,
       category = excluded.category,
       serving_description = excluded.serving_description,
       total_calories = excluded.total_calories,
       total_protein_g = excluded.total_protein_g,
       total_fat_g = excluded.total_fat_g,
       total_carb_g = excluded.total_carb_g,
       is_my_dish = excluded.is_my_dish,
       is_favorite = excluded.is_favorite,
       use_count = excluded.use_count,
       last_used_at = excluded.last_used_at,
       user_note = excluded.user_note,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.name_ja,
      row.name_en,
      row.category,
      row.serving_description,
      row.total_calories,
      row.total_protein_g,
      row.total_fat_g,
      row.total_carb_g,
      boolToInt(row.is_my_dish),
      boolToInt(row.is_favorite),
      row.use_count,
      row.last_used_at,
      row.user_note,
      row.updated_at,
    ],
  );
}

export const dishSync: ResourceSyncModule = {
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
