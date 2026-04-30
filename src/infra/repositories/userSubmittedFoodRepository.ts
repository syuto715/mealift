import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '../../utils/id';
import type {
  UserSubmittedFood,
  UserSubmittedFoodInput,
  SubmissionStatus,
  FoodSourceType,
  FoodCategory,
} from '../../types/userSubmittedFood';

// userSubmittedFoodRepository — CRUD on user_submitted_foods (v16).
//
// The same row services two stages:
//   - submission_status = 'local'           → user's private library
//   - submission_status = 'pending_review'  → uploaded to public_foods,
//                                             awaiting moderator review
//   - submission_status = 'approved'        → mirrored on Supabase
//   - submission_status = 'rejected'        → with rejection_reason
//
// Sync state lives alongside status: remote_id + synced_at populate
// when the row has been uploaded. Status changes and sync changes are
// orthogonal axes — status='pending_review' AND synced_at IS NULL is
// the "needs upload" state; status='approved' AND synced_at IS NOT NULL
// is the post-approval terminal state.
//
// Pattern matches consent / food / dish repositories: free functions,
// db: SQLiteDatabase as first arg, no module-scoped DB handle.

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToSubmission(row: Record<string, unknown>): UserSubmittedFood {
  return {
    id: row.id as string,
    nameJa: row.name_ja as string,
    nameEn: (row.name_en as string) ?? null,
    brand: (row.brand as string) ?? null,
    barcode: (row.barcode as string) ?? null,
    servingSizeG: row.serving_size_g as number,
    servingUnit: row.serving_unit as string,
    servingDescription: (row.serving_description as string) ?? null,

    caloriesPerServing: row.calories_per_serving as number,
    proteinG: row.protein_g as number,
    fatG: row.fat_g as number,
    carbG: row.carb_g as number,

    fiberG: (row.fiber_g as number) ?? null,
    sugarG: (row.sugar_g as number) ?? null,
    saltG: (row.salt_g as number) ?? null,
    sodiumMg: (row.sodium_mg as number) ?? null,
    saturatedFatG: (row.saturated_fat_g as number) ?? null,
    cholesterolMg: (row.cholesterol_mg as number) ?? null,
    calciumMg: (row.calcium_mg as number) ?? null,
    ironMg: (row.iron_mg as number) ?? null,
    vitaminAUg: (row.vitamin_a_ug as number) ?? null,
    vitaminB1Mg: (row.vitamin_b1_mg as number) ?? null,
    vitaminB2Mg: (row.vitamin_b2_mg as number) ?? null,
    vitaminCMg: (row.vitamin_c_mg as number) ?? null,
    vitaminDUg: (row.vitamin_d_ug as number) ?? null,
    vitaminEMg: (row.vitamin_e_mg as number) ?? null,
    potassiumMg: (row.potassium_mg as number) ?? null,
    magnesiumMg: (row.magnesium_mg as number) ?? null,
    zincMg: (row.zinc_mg as number) ?? null,

    sourceType: row.source_type as FoodSourceType,
    sourcePhotoUri: (row.source_photo_uri as string) ?? null,
    notes: (row.notes as string) ?? null,

    foodCategory: row.food_category as FoodCategory,

    submissionStatus: row.submission_status as SubmissionStatus,
    rejectionReason: (row.rejection_reason as string) ?? null,
    remoteId: (row.remote_id as string) ?? null,
    syncedAt: (row.synced_at as string) ?? null,

    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

// createSubmission — inserts a new row at status='local'. The caller
// is expected to have run the input through validateSubmission first;
// this function trusts its input. Returns the persisted row read back
// from the DB so created_at / updated_at reflect the trigger defaults.
export async function createSubmission(
  db: SQLiteDatabase,
  input: UserSubmittedFoodInput,
): Promise<UserSubmittedFood> {
  const id = generateId();
  await db.runAsync(
    `INSERT INTO user_submitted_foods (
      id, name_ja, name_en, brand, barcode,
      serving_size_g, serving_unit, serving_description,
      calories_per_serving, protein_g, fat_g, carb_g,
      fiber_g, sugar_g, salt_g, sodium_mg, saturated_fat_g, cholesterol_mg,
      calcium_mg, iron_mg, vitamin_a_ug, vitamin_b1_mg, vitamin_b2_mg,
      vitamin_c_mg, vitamin_d_ug, vitamin_e_mg, potassium_mg, magnesium_mg, zinc_mg,
      source_type, source_photo_uri, notes,
      submission_status,
      food_category
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?)`,
    [
      id,
      input.nameJa,
      input.nameEn ?? null,
      input.brand ?? null,
      input.barcode ?? null,
      input.servingSizeG,
      input.servingUnit ?? 'g',
      input.servingDescription ?? null,
      input.caloriesPerServing,
      input.proteinG,
      input.fatG,
      input.carbG,
      input.fiberG ?? null,
      input.sugarG ?? null,
      input.saltG ?? null,
      input.sodiumMg ?? null,
      input.saturatedFatG ?? null,
      input.cholesterolMg ?? null,
      input.calciumMg ?? null,
      input.ironMg ?? null,
      input.vitaminAUg ?? null,
      input.vitaminB1Mg ?? null,
      input.vitaminB2Mg ?? null,
      input.vitaminCMg ?? null,
      input.vitaminDUg ?? null,
      input.vitaminEMg ?? null,
      input.potassiumMg ?? null,
      input.magnesiumMg ?? null,
      input.zincMg ?? null,
      input.sourceType,
      input.sourcePhotoUri ?? null,
      input.notes ?? null,
      input.foodCategory,
    ],
  );

  const persisted = await getSubmissionById(db, id);
  if (!persisted) {
    throw new Error('createSubmission: row not found after insert');
  }
  return persisted;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getSubmissionById(
  db: SQLiteDatabase,
  id: string,
): Promise<UserSubmittedFood | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM user_submitted_foods WHERE id = ?',
    [id],
  );
  return row ? rowToSubmission(row) : null;
}

// listSubmissionsByStatus — newest first by created_at.
export async function listSubmissionsByStatus(
  db: SQLiteDatabase,
  status: SubmissionStatus,
): Promise<UserSubmittedFood[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM user_submitted_foods
      WHERE submission_status = ?
      ORDER BY created_at DESC`,
    [status],
  );
  return rows.map(rowToSubmission);
}

// listAllSubmissions — full local library, newest first. Drives the
// "my submissions" UI in a future sprint.
export async function listAllSubmissions(
  db: SQLiteDatabase,
): Promise<UserSubmittedFood[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM user_submitted_foods
      ORDER BY created_at DESC`,
  );
  return rows.map(rowToSubmission);
}

// listPendingSync — rows that have been moved to 'pending_review' but
// have not yet been uploaded (synced_at IS NULL). Sprint 4 commit 3
// (Supabase sync) iterates this list on each sync attempt; on upload
// success it calls markSubmissionSynced.
export async function listPendingSync(
  db: SQLiteDatabase,
): Promise<UserSubmittedFood[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM user_submitted_foods
      WHERE submission_status = 'pending_review'
        AND synced_at IS NULL
      ORDER BY created_at ASC`,
  );
  return rows.map(rowToSubmission);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateSubmissionStatusOptions {
  rejectionReason?: string | null;
}

// updateSubmissionStatus — flips submission_status. Used both for the
// local 'local' → 'pending_review' transition (user clicked Submit)
// and for the post-review 'pending_review' → 'approved' / 'rejected'
// transitions (Supabase sync pulls the moderator decision back). When
// flipping to 'rejected', pass `rejectionReason`.
//
// Returns null if the row didn't exist.
export async function updateSubmissionStatus(
  db: SQLiteDatabase,
  id: string,
  status: SubmissionStatus,
  options: UpdateSubmissionStatusOptions = {},
): Promise<UserSubmittedFood | null> {
  const existing = await getSubmissionById(db, id);
  if (!existing) return null;

  await db.runAsync(
    `UPDATE user_submitted_foods
        SET submission_status = ?,
            rejection_reason  = ?,
            updated_at        = datetime('now')
      WHERE id = ?`,
    [
      status,
      options.rejectionReason ?? existing.rejectionReason ?? null,
      id,
    ],
  );

  return getSubmissionById(db, id);
}

// markSubmissionSynced — records that an upload to public_foods
// succeeded. Sets remote_id + synced_at; does NOT change status (the
// caller decides the next status, typically 'pending_review' if it
// wasn't already there).
export async function markSubmissionSynced(
  db: SQLiteDatabase,
  id: string,
  remoteId: string,
): Promise<UserSubmittedFood | null> {
  const existing = await getSubmissionById(db, id);
  if (!existing) return null;

  await db.runAsync(
    `UPDATE user_submitted_foods
        SET remote_id  = ?,
            synced_at  = datetime('now'),
            updated_at = datetime('now')
      WHERE id = ?`,
    [remoteId, id],
  );

  return getSubmissionById(db, id);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

// deleteSubmission — hard-deletes the local row. Returns true if a
// row was actually deleted. Note: if the row had been synced
// (remote_id set), the public_foods copy is NOT deleted by this
// function. Sprint 4 commit 3 will add a "remote retract" path that
// goes through Supabase RLS-permitted DELETE on public_foods.
export async function deleteSubmission(
  db: SQLiteDatabase,
  id: string,
): Promise<boolean> {
  const result = await db.runAsync(
    'DELETE FROM user_submitted_foods WHERE id = ?',
    [id],
  );
  return result.changes > 0;
}
