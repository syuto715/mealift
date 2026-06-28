import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase as defaultSupabase } from './client';
import {
  listPendingSync,
  markSubmissionSynced,
} from '../repositories/userSubmittedFoodRepository';
import {
  getWatermark,
  setWatermark,
  SYNC_WATERMARK_KEYS,
} from '../repositories/syncWatermarkRepository';
import type { UserSubmittedFood } from '../../types/userSubmittedFood';

// submissionSync — push local user_submitted_foods to public_foods,
// pull approved public_foods back into the local foods table.
//
// Design contract — please read before extending:
//
//   - The Supabase client is INJECTED. The default export of
//     `./client` is used when callers omit it; tests pass a fake.
//     This module never imports the network layer eagerly so that
//     unit tests don't need to mock the entire Supabase SDK.
//   - Per-row failures are swallowed and tallied. A 500 on submission
//     #3 of 10 must NOT block submissions #4..#10 from trying.
//     Sync is best-effort: every successfully-uploaded row gets
//     marked synced; everything else stays as-is and the next call
//     picks up the slack.
//   - Local state is mutated ONLY on confirmed remote success. If an
//     upload throws, `markSubmissionSynced` is not called → the row
//     stays `submission_status='pending_review' AND synced_at IS NULL`
//     → it surfaces in the next listPendingSync call. Idempotency on
//     the server side is the upsert-on-id pattern (we reuse the local
//     UUID as the public_foods id).
//   - The OFF (Open Food Facts) lookup does NOT happen inside this
//     module. That probe belongs at submission time so the user can
//     see "barcode matched / not matched" feedback in the moment.
//     The sync path does not compute approval_score locally. It sends
//     row data to the `submit_public_food` RPC, where server-side
//     scoring and status routing happen.

// ---------------------------------------------------------------------------
// Result shapes — the caller (UI) reads these to render sync indicators.
// ---------------------------------------------------------------------------

export type UploadSkipReason =
  'supabase_not_configured' | 'not_authenticated' | 'nothing_pending';

export interface UploadResult {
  uploaded: number;
  failed: number;
  // null when the run actually executed; set when nothing was attempted.
  skipped: UploadSkipReason | null;
}

export type PullSkipReason = 'supabase_not_configured' | 'remote_error';

export interface PullResult {
  pulled: number;
  skipped: PullSkipReason | null;
  // The latest server-side updated_at observed in this run, or null
  // when nothing was pulled. Useful for the UI to show "last sync".
  newWatermark: string | null;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// Pull batch size. 500 keeps the response under typical Supabase row
// limits while getting through a backlog quickly. Multiple calls
// drain a long tail since each call advances the watermark.
const PULL_BATCH_LIMIT = 500;

// Backoff for 429s on upload. base * 2^attempt, capped at 3 attempts.
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Map a UserSubmittedFood (camelCase) to the snake_case payload accepted by
// `submit_public_food`. Trust-boundary fields are intentionally omitted.
function toPublicFoodPayload(row: UserSubmittedFood): Record<string, unknown> {
  return {
    id: row.id,
    name_ja: row.nameJa,
    name_en: row.nameEn,
    brand: row.brand,
    barcode: row.barcode,
    serving_size_g: row.servingSizeG,
    serving_unit: row.servingUnit,
    serving_description: row.servingDescription,
    calories_per_serving: row.caloriesPerServing,
    protein_g: row.proteinG,
    fat_g: row.fatG,
    carb_g: row.carbG,
    fiber_g: row.fiberG,
    sugar_g: row.sugarG,
    salt_g: row.saltG,
    sodium_mg: row.sodiumMg,
    saturated_fat_g: row.saturatedFatG,
    cholesterol_mg: row.cholesterolMg,
    calcium_mg: row.calciumMg,
    iron_mg: row.ironMg,
    vitamin_a_ug: row.vitaminAUg,
    vitamin_b1_mg: row.vitaminB1Mg,
    vitamin_b2_mg: row.vitaminB2Mg,
    vitamin_c_mg: row.vitaminCMg,
    vitamin_d_ug: row.vitaminDUg,
    vitamin_e_mg: row.vitaminEMg,
    potassium_mg: row.potassiumMg,
    magnesium_mg: row.magnesiumMg,
    zinc_mg: row.zincMg,
    source_type: row.sourceType,
    source_photo_url: row.sourcePhotoUri,
    notes: row.notes,
    food_category: row.foodCategory,
  };
}

interface RemoteError {
  status?: number;
  message?: string;
}

function isRateLimited(err: RemoteError | null | undefined): boolean {
  if (!err) return false;
  if (err.status === 429) return true;
  // Some clients surface this only in the message string.
  return /\b(429|rate.?limit|too.?many)\b/i.test(err.message ?? '');
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// upsertWithBackoff — single-row RPC submit with exponential backoff on
// 429. Throws on terminal failure (caller treats per-row throw as
// "leave local state alone, count as failed"). Other (non-429)
// errors fail fast — backing off won't help a 400.
async function upsertWithBackoff(
  client: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    const { error } = await client.rpc('submit_public_food', { payload });
    if (!error) return;
    if (!isRateLimited(error)) {
      throw new Error(
        `submit_public_food failed: ${error.message ?? 'unknown error'}`,
      );
    }
    if (attempt + 1 < RETRY_MAX_ATTEMPTS) {
      await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error('submit_public_food: rate-limited after max retries');
}

// ---------------------------------------------------------------------------
// uploadPendingSubmissions
// ---------------------------------------------------------------------------

export async function uploadPendingSubmissions(
  db: SQLiteDatabase,
  client: SupabaseClient | null = defaultSupabase,
): Promise<UploadResult> {
  if (!client) {
    return { uploaded: 0, failed: 0, skipped: 'supabase_not_configured' };
  }

  const sessionResult = await client.auth.getSession();
  const session = sessionResult.data.session;
  if (!session) {
    return { uploaded: 0, failed: 0, skipped: 'not_authenticated' };
  }

  const pending = await listPendingSync(db);
  if (pending.length === 0) {
    return { uploaded: 0, failed: 0, skipped: 'nothing_pending' };
  }

  let uploaded = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      const payload = toPublicFoodPayload(row);
      await upsertWithBackoff(client, payload);
      // Remote id mirrors the local id (idempotent upsert key).
      await markSubmissionSynced(db, row.id, row.id);
      uploaded += 1;
    } catch {
      // Per-row failure: leave local state untouched, count as failed,
      // and continue to the next row. Surfacing the specific error
      // would require pulling in a logging facility — for now the
      // tally + downstream UI status is enough.
      failed += 1;
    }
  }

  return { uploaded, failed, skipped: null };
}

// ---------------------------------------------------------------------------
// pullApprovedSubmissions
// ---------------------------------------------------------------------------

interface PublicFoodApprovedRow {
  id: string;
  name_ja: string;
  name_en: string | null;
  brand: string | null;
  barcode: string | null;
  serving_size_g: number;
  serving_unit: string;
  calories_per_serving: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number | null;
  updated_at: string;
}

const EPOCH_WATERMARK = '1970-01-01T00:00:00Z';

export async function pullApprovedSubmissions(
  db: SQLiteDatabase,
  client: SupabaseClient | null = defaultSupabase,
): Promise<PullResult> {
  if (!client) {
    return {
      pulled: 0,
      skipped: 'supabase_not_configured',
      newWatermark: null,
    };
  }

  const watermark =
    (await getWatermark(db, SYNC_WATERMARK_KEYS.publicFoodsApproved)) ??
    EPOCH_WATERMARK;

  const { data, error } = await client
    .from('approved_public_foods')
    .select(
      'id, name_ja, name_en, brand, barcode, serving_size_g, serving_unit, calories_per_serving, protein_g, fat_g, carb_g, fiber_g, updated_at',
    )
    .eq('status', 'approved')
    .gt('updated_at', watermark)
    .order('updated_at', { ascending: true })
    .limit(PULL_BATCH_LIMIT);

  if (error) {
    return { pulled: 0, skipped: 'remote_error', newWatermark: null };
  }
  const rows = (data ?? []) as PublicFoodApprovedRow[];
  if (rows.length === 0) {
    return { pulled: 0, skipped: null, newWatermark: null };
  }

  // Mirror to local foods. ON CONFLICT preserves user-modified fields
  // (is_favorite, use_count, is_custom, source) — the canonical
  // server data only overwrites the nutrition columns. If the row is
  // brand-new locally, source is set to 'user_submitted' to match
  // the v17 source-filter convention.
  for (const row of rows) {
    await db.runAsync(
      `INSERT INTO foods (
         id, name_ja, name_en, brand, barcode, serving_size_g, serving_unit,
         calories_per_serving, protein_g, fat_g, carb_g, fiber_g,
         source, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user_submitted', ?)
       ON CONFLICT(id) DO UPDATE SET
         name_ja              = excluded.name_ja,
         name_en              = excluded.name_en,
         brand                = excluded.brand,
         barcode              = excluded.barcode,
         serving_size_g       = excluded.serving_size_g,
         serving_unit         = excluded.serving_unit,
         calories_per_serving = excluded.calories_per_serving,
         protein_g            = excluded.protein_g,
         fat_g                = excluded.fat_g,
         carb_g               = excluded.carb_g,
         fiber_g              = excluded.fiber_g,
         updated_at           = excluded.updated_at`,
      [
        row.id,
        row.name_ja,
        row.name_en,
        row.brand,
        row.barcode,
        row.serving_size_g,
        row.serving_unit,
        row.calories_per_serving,
        row.protein_g,
        row.fat_g,
        row.carb_g,
        row.fiber_g,
        row.updated_at,
      ],
    );
  }

  // Server returned rows ordered by updated_at ASC, so the last row's
  // timestamp is the high-water mark for this batch.
  const newWatermark = rows[rows.length - 1].updated_at;
  await setWatermark(db, SYNC_WATERMARK_KEYS.publicFoodsApproved, newWatermark);

  return { pulled: rows.length, skipped: null, newWatermark };
}

// ---------------------------------------------------------------------------
// syncSubmissions — convenience for the eventual sync loop. Order is
// pull-then-upload so that a row that was rejected server-side and
// has now been re-approved by the moderator gets reflected locally
// before the next upload tries to re-push something stale.
// ---------------------------------------------------------------------------

export interface SyncResult {
  upload: UploadResult;
  pull: PullResult;
}

export async function syncSubmissions(
  db: SQLiteDatabase,
  client: SupabaseClient | null = defaultSupabase,
): Promise<SyncResult> {
  const pull = await pullApprovedSubmissions(db, client);
  const upload = await uploadPendingSubmissions(db, client);
  return { upload, pull };
}
