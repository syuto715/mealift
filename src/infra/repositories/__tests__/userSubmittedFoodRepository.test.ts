import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import {
  createSubmission,
  getSubmissionById,
  listSubmissionsByStatus,
  listAllSubmissions,
  listPendingSync,
  updateSubmissionStatus,
  markSubmissionSynced,
  deleteSubmission,
} from '../userSubmittedFoodRepository';
import type {
  UserSubmittedFoodInput,
  SubmissionStatus,
} from '../../../types/userSubmittedFood';

// generateId() uses expo-crypto.randomUUID under the hood, which calls
// into a native module that isn't available in Jest. Mock returns a
// deterministic counter so tests can assert on exact ids.
let mockNextUuid = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mockNextUuid}`,
}));

// In-memory fake DB pattern-matching the SQL the repository emits.
// Same approach as userConsentRepository.test.ts: keep the fake small
// and keyed on the few SQL shapes the repo actually uses. If a new
// query lands in the repo, the fake must learn it.
interface FakeRow {
  id: string;
  name_ja: string;
  name_en: string | null;
  brand: string | null;
  barcode: string | null;
  serving_size_g: number;
  serving_unit: string;
  serving_description: string | null;
  calories_per_serving: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
  cholesterol_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  vitamin_a_ug: number | null;
  vitamin_b1_mg: number | null;
  vitamin_b2_mg: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_e_mg: number | null;
  potassium_mg: number | null;
  magnesium_mg: number | null;
  zinc_mg: number | null;
  source_type: string;
  source_photo_uri: string | null;
  notes: string | null;
  food_category: string;
  submission_status: string;
  rejection_reason: string | null;
  remote_id: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

function makeFakeDb(): SQLiteDatabase {
  const rows: FakeRow[] = [];
  // Monotonic clock for created_at/updated_at so DESC ordering is
  // deterministic without setTimeout in tests.
  let clock = 0;
  const now = () => {
    clock += 1;
    // Use ISO-like strings; ordering by string compare matches numeric
    // ordering for our zero-padded tick.
    return `2026-04-26T00:00:00.${String(clock).padStart(6, '0')}Z`;
  };

  const fake = {
    runAsync: async (
      sql: string,
      params: unknown[],
    ): Promise<SQLiteRunResult> => {
      if (/^\s*INSERT INTO user_submitted_foods/i.test(sql)) {
        // The 32-positional INSERT in createSubmission, plus literal
        // 'local' for submission_status (no param).
        const [
          id,
          nameJa,
          nameEn,
          brand,
          barcode,
          servingSizeG,
          servingUnit,
          servingDescription,
          caloriesPerServing,
          proteinG,
          fatG,
          carbG,
          fiberG,
          sugarG,
          saltG,
          sodiumMg,
          saturatedFatG,
          cholesterolMg,
          calciumMg,
          ironMg,
          vitaminAUg,
          vitaminB1Mg,
          vitaminB2Mg,
          vitaminCMg,
          vitaminDUg,
          vitaminEMg,
          potassiumMg,
          magnesiumMg,
          zincMg,
          sourceType,
          sourcePhotoUri,
          notes,
          foodCategory,
        ] = params as [
          string,
          string,
          string | null,
          string | null,
          string | null,
          number,
          string,
          string | null,
          number,
          number,
          number,
          number,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          number | null,
          string,
          string | null,
          string | null,
          string,
        ];
        const ts = now();
        rows.push({
          id,
          name_ja: nameJa,
          name_en: nameEn,
          brand,
          barcode,
          serving_size_g: servingSizeG,
          serving_unit: servingUnit,
          serving_description: servingDescription,
          calories_per_serving: caloriesPerServing,
          protein_g: proteinG,
          fat_g: fatG,
          carb_g: carbG,
          fiber_g: fiberG,
          sugar_g: sugarG,
          salt_g: saltG,
          sodium_mg: sodiumMg,
          saturated_fat_g: saturatedFatG,
          cholesterol_mg: cholesterolMg,
          calcium_mg: calciumMg,
          iron_mg: ironMg,
          vitamin_a_ug: vitaminAUg,
          vitamin_b1_mg: vitaminB1Mg,
          vitamin_b2_mg: vitaminB2Mg,
          vitamin_c_mg: vitaminCMg,
          vitamin_d_ug: vitaminDUg,
          vitamin_e_mg: vitaminEMg,
          potassium_mg: potassiumMg,
          magnesium_mg: magnesiumMg,
          zinc_mg: zincMg,
          source_type: sourceType,
          source_photo_uri: sourcePhotoUri,
          notes,
          food_category: foodCategory,
          submission_status: 'local',
          rejection_reason: null,
          remote_id: null,
          synced_at: null,
          created_at: ts,
          updated_at: ts,
        });
        return { lastInsertRowId: 0, changes: 1 };
      }

      if (
        /^\s*UPDATE user_submitted_foods\s+SET submission_status/i.test(sql)
      ) {
        const [status, rejectionReason, id] = params as [
          string,
          string | null,
          string,
        ];
        const target = rows.find((r) => r.id === id);
        if (target) {
          target.submission_status = status;
          target.rejection_reason = rejectionReason;
          target.updated_at = now();
        }
        return { lastInsertRowId: 0, changes: target ? 1 : 0 };
      }

      if (/^\s*UPDATE user_submitted_foods\s+SET remote_id/i.test(sql)) {
        const [remoteId, id] = params as [string, string];
        const target = rows.find((r) => r.id === id);
        if (target) {
          target.remote_id = remoteId;
          const ts = now();
          target.synced_at = ts;
          target.updated_at = ts;
        }
        return { lastInsertRowId: 0, changes: target ? 1 : 0 };
      }

      if (/^\s*DELETE FROM user_submitted_foods/i.test(sql)) {
        const [id] = params as [string];
        const idx = rows.findIndex((r) => r.id === id);
        if (idx >= 0) {
          rows.splice(idx, 1);
          return { lastInsertRowId: 0, changes: 1 };
        }
        return { lastInsertRowId: 0, changes: 0 };
      }

      throw new Error(`fake DB: unhandled runAsync SQL: ${sql}`);
    },

    getFirstAsync: async <T,>(
      sql: string,
      params: unknown[],
    ): Promise<T | null> => {
      if (/WHERE id = \?/i.test(sql)) {
        const [id] = params as [string];
        const row = rows.find((r) => r.id === id);
        return (row as unknown as T) ?? null;
      }
      throw new Error(`fake DB: unhandled getFirstAsync SQL: ${sql}`);
    },

    getAllAsync: async <T,>(
      sql: string,
      params?: unknown[],
    ): Promise<T[]> => {
      // listPendingSync — pending_review + synced_at IS NULL, oldest first.
      if (
        /submission_status = 'pending_review'\s+AND synced_at IS NULL/i.test(
          sql,
        )
      ) {
        const out = rows
          .filter(
            (r) =>
              r.submission_status === 'pending_review' && r.synced_at === null,
          )
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        return out as unknown as T[];
      }

      // listSubmissionsByStatus — newest first.
      if (/WHERE submission_status = \?/i.test(sql)) {
        const [status] = (params ?? []) as [string];
        const out = rows
          .filter((r) => r.submission_status === status)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return out as unknown as T[];
      }

      // listAllSubmissions — newest first, no WHERE clause.
      if (/ORDER BY created_at DESC/i.test(sql)) {
        const out = [...rows].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
        return out as unknown as T[];
      }

      throw new Error(`fake DB: unhandled getAllAsync SQL: ${sql}`);
    },
  };

  return fake as unknown as SQLiteDatabase;
}

function baseInput(
  overrides: Partial<UserSubmittedFoodInput> = {},
): UserSubmittedFoodInput {
  return {
    nameJa: 'テスト食品',
    servingSizeG: 100,
    caloriesPerServing: 200,
    proteinG: 10,
    fatG: 5,
    carbG: 30,
    sourceType: 'package_label',
    foodCategory: 'other',
    ...overrides,
  };
}

beforeEach(() => {
  mockNextUuid = 0;
});

describe('userSubmittedFoodRepository — createSubmission', () => {
  it('inserts a row with status=local and returns the persisted shape', async () => {
    const db = makeFakeDb();
    const result = await createSubmission(db, baseInput());

    expect(result.id).toBe('uuid-1');
    expect(result.nameJa).toBe('テスト食品');
    expect(result.submissionStatus).toBe('local');
    expect(result.rejectionReason).toBeNull();
    expect(result.remoteId).toBeNull();
    expect(result.syncedAt).toBeNull();
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
  });

  it('defaults servingUnit to "g" when not provided', async () => {
    const db = makeFakeDb();
    const result = await createSubmission(db, baseInput());
    expect(result.servingUnit).toBe('g');
  });

  it('persists optional fields and nulls when not provided', async () => {
    const db = makeFakeDb();
    const result = await createSubmission(
      db,
      baseInput({
        nameEn: 'Test Food',
        brand: 'TestBrand',
        sodiumMg: 100,
      }),
    );
    expect(result.nameEn).toBe('Test Food');
    expect(result.brand).toBe('TestBrand');
    expect(result.sodiumMg).toBe(100);
    expect(result.barcode).toBeNull();
    expect(result.fiberG).toBeNull();
  });

  it('round-trips food_category through insert + read', async () => {
    const db = makeFakeDb();
    const result = await createSubmission(
      db,
      baseInput({ foodCategory: 'convenience_store' }),
    );
    expect(result.foodCategory).toBe('convenience_store');

    const fetched = await getSubmissionById(db, result.id);
    expect(fetched?.foodCategory).toBe('convenience_store');
  });
});

describe('userSubmittedFoodRepository — getSubmissionById', () => {
  it('returns the row when it exists', async () => {
    const db = makeFakeDb();
    const created = await createSubmission(db, baseInput());
    const fetched = await getSubmissionById(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
  });

  it('returns null when the row does not exist', async () => {
    const db = makeFakeDb();
    const fetched = await getSubmissionById(db, 'missing-id');
    expect(fetched).toBeNull();
  });
});

describe('userSubmittedFoodRepository — listSubmissionsByStatus', () => {
  it('filters by status and orders newest first', async () => {
    const db = makeFakeDb();
    const a = await createSubmission(db, baseInput({ nameJa: 'A' }));
    await createSubmission(db, baseInput({ nameJa: 'B' }));
    const c = await createSubmission(db, baseInput({ nameJa: 'C' }));

    // Move A and C to pending_review.
    await updateSubmissionStatus(db, a.id, 'pending_review');
    await updateSubmissionStatus(db, c.id, 'pending_review');

    const local = await listSubmissionsByStatus(
      db,
      'local' as SubmissionStatus,
    );
    expect(local).toHaveLength(1);
    expect(local[0].nameJa).toBe('B');

    const pending = await listSubmissionsByStatus(
      db,
      'pending_review' as SubmissionStatus,
    );
    expect(pending).toHaveLength(2);
    // C was created after A → newer → first.
    expect(pending[0].nameJa).toBe('C');
    expect(pending[1].nameJa).toBe('A');
  });

  it('returns empty array when no rows match', async () => {
    const db = makeFakeDb();
    await createSubmission(db, baseInput());
    const approved = await listSubmissionsByStatus(
      db,
      'approved' as SubmissionStatus,
    );
    expect(approved).toEqual([]);
  });
});

describe('userSubmittedFoodRepository — listAllSubmissions', () => {
  it('returns every row, newest first', async () => {
    const db = makeFakeDb();
    await createSubmission(db, baseInput({ nameJa: 'first' }));
    await createSubmission(db, baseInput({ nameJa: 'second' }));
    await createSubmission(db, baseInput({ nameJa: 'third' }));

    const all = await listAllSubmissions(db);
    expect(all).toHaveLength(3);
    expect(all[0].nameJa).toBe('third');
    expect(all[2].nameJa).toBe('first');
  });
});

describe('userSubmittedFoodRepository — listPendingSync', () => {
  it('returns pending_review rows that are not yet synced, oldest first', async () => {
    const db = makeFakeDb();
    const a = await createSubmission(db, baseInput({ nameJa: 'A' }));
    const b = await createSubmission(db, baseInput({ nameJa: 'B' }));
    const c = await createSubmission(db, baseInput({ nameJa: 'C' }));

    await updateSubmissionStatus(db, a.id, 'pending_review');
    await updateSubmissionStatus(db, b.id, 'pending_review');
    // c stays local.
    // Mark b as synced — it should drop out of the pending list.
    await markSubmissionSynced(db, b.id, 'remote-b');

    const pending = await listPendingSync(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(a.id);
    // Sanity: c is still local, so not pending.
    expect(pending.some((r) => r.id === c.id)).toBe(false);
  });

  it('excludes rows that are pending but already synced', async () => {
    const db = makeFakeDb();
    const a = await createSubmission(db, baseInput());
    await updateSubmissionStatus(db, a.id, 'pending_review');
    await markSubmissionSynced(db, a.id, 'remote-a');

    const pending = await listPendingSync(db);
    expect(pending).toEqual([]);
  });
});

describe('userSubmittedFoodRepository — updateSubmissionStatus', () => {
  it('flips submission_status', async () => {
    const db = makeFakeDb();
    const created = await createSubmission(db, baseInput());
    const updated = await updateSubmissionStatus(
      db,
      created.id,
      'pending_review',
    );
    expect(updated?.submissionStatus).toBe('pending_review');
  });

  it('records a rejection reason when transitioning to rejected', async () => {
    const db = makeFakeDb();
    const created = await createSubmission(db, baseInput());
    const updated = await updateSubmissionStatus(db, created.id, 'rejected', {
      rejectionReason: '栄養成分が不正です',
    });
    expect(updated?.submissionStatus).toBe('rejected');
    expect(updated?.rejectionReason).toBe('栄養成分が不正です');
  });

  it('preserves the existing rejection_reason when not overridden', async () => {
    const db = makeFakeDb();
    const created = await createSubmission(db, baseInput());
    await updateSubmissionStatus(db, created.id, 'rejected', {
      rejectionReason: '初期理由',
    });
    // Now flip the status without passing a rejectionReason — the reason
    // should still be there.
    const re = await updateSubmissionStatus(db, created.id, 'pending_review');
    expect(re?.submissionStatus).toBe('pending_review');
    expect(re?.rejectionReason).toBe('初期理由');
  });

  it('returns null when the row does not exist', async () => {
    const db = makeFakeDb();
    const result = await updateSubmissionStatus(db, 'missing', 'approved');
    expect(result).toBeNull();
  });
});

describe('userSubmittedFoodRepository — markSubmissionSynced', () => {
  it('sets remote_id and synced_at without changing status', async () => {
    const db = makeFakeDb();
    const created = await createSubmission(db, baseInput());
    await updateSubmissionStatus(db, created.id, 'pending_review');

    const synced = await markSubmissionSynced(db, created.id, 'remote-123');
    expect(synced).not.toBeNull();
    expect(synced?.remoteId).toBe('remote-123');
    expect(synced?.syncedAt).not.toBeNull();
    // Status should still be pending_review — sync is orthogonal to status.
    expect(synced?.submissionStatus).toBe('pending_review');
  });

  it('returns null when the row does not exist', async () => {
    const db = makeFakeDb();
    const result = await markSubmissionSynced(db, 'missing', 'remote-x');
    expect(result).toBeNull();
  });
});

describe('userSubmittedFoodRepository — deleteSubmission', () => {
  it('returns true when a row is deleted', async () => {
    const db = makeFakeDb();
    const created = await createSubmission(db, baseInput());
    const ok = await deleteSubmission(db, created.id);
    expect(ok).toBe(true);
    const after = await getSubmissionById(db, created.id);
    expect(after).toBeNull();
  });

  it('returns false when the row does not exist', async () => {
    const db = makeFakeDb();
    const ok = await deleteSubmission(db, 'missing');
    expect(ok).toBe(false);
  });
});
