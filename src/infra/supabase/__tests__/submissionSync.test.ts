import type { SQLiteDatabase } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  uploadPendingSubmissions,
  pullApprovedSubmissions,
  syncSubmissions,
} from '../submissionSync';
import {
  listPendingSync,
  listSubmissionsByStatus,
  markSubmissionSynced,
} from '../../repositories/userSubmittedFoodRepository';
import {
  getWatermark,
  setWatermark,
  SYNC_WATERMARK_KEYS,
} from '../../repositories/syncWatermarkRepository';
import type { UserSubmittedFood } from '../../../types/userSubmittedFood';

// Mock ./client so jest doesn't try to evaluate expo's native env
// module at import time. Tests inject a fake client via the DI param
// anyway — this default never gets read.
jest.mock('../client', () => ({ supabase: null }));

// Mock the repositories with explicit factories so the real modules
// aren't evaluated at import time (auto-mock evaluates the source to
// learn its exports, which transitively loads expo-crypto and
// breaks under jest's transform setup).
jest.mock('../../repositories/userSubmittedFoodRepository', () => ({
  listPendingSync: jest.fn(),
  listSubmissionsByStatus: jest.fn(),
  markSubmissionSynced: jest.fn(),
}));
jest.mock('../../repositories/syncWatermarkRepository', () => ({
  getWatermark: jest.fn(),
  setWatermark: jest.fn(),
  SYNC_WATERMARK_KEYS: { publicFoodsApproved: 'public_foods_approved' },
}));

const mockListPendingSync = listPendingSync as jest.MockedFunction<
  typeof listPendingSync
>;
const mockListSubmissionsByStatus =
  listSubmissionsByStatus as jest.MockedFunction<
    typeof listSubmissionsByStatus
  >;
const mockMarkSubmissionSynced = markSubmissionSynced as jest.MockedFunction<
  typeof markSubmissionSynced
>;
const mockGetWatermark = getWatermark as jest.MockedFunction<typeof getWatermark>;
const mockSetWatermark = setWatermark as jest.MockedFunction<typeof setWatermark>;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// Minimal db stub. The only direct DB call inside submissionSync is
// the foods similarity LIKE in hasGenericSimilarity (getFirstAsync)
// and the foods upsert in pull (runAsync). All other DB access goes
// through the mocked repos.
function makeStubDb(
  similarityMatches = 0,
): SQLiteDatabase & {
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
} {
  const db = {
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
    getFirstAsync: jest
      .fn()
      .mockResolvedValue({ matches: similarityMatches }),
    getAllAsync: jest.fn(),
  };
  return db as unknown as SQLiteDatabase & {
    runAsync: jest.Mock;
    getFirstAsync: jest.Mock;
  };
}

// Build a chainable fake supabase client. Each call to from(table)
// returns a new query builder so tests can vary upsert / select
// behavior independently.
interface QueryBuilder {
  upsert: jest.Mock;
  select: jest.Mock;
  eq: jest.Mock;
  gt: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
}

interface FakeClient {
  auth: { getSession: jest.Mock };
  from: jest.Mock;
  // Test harness handles:
  __upsertResult: { error: { status?: number; message?: string } | null };
  __selectResult: {
    data: Record<string, unknown>[] | null;
    error: { status?: number; message?: string } | null;
  };
  __builder: QueryBuilder;
}

function makeFakeClient(opts: {
  session?:
    | { user: { id: string; email_confirmed_at: string | null } }
    | null;
} = {}): FakeClient {
  const session = opts.session === undefined
    ? { user: { id: 'user-1', email_confirmed_at: '2026-04-26T00:00:00Z' } }
    : opts.session;

  const harness: FakeClient = {
    auth: {
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session }, error: null }),
    },
    from: jest.fn(),
    __upsertResult: { error: null },
    __selectResult: { data: [], error: null },
    __builder: {} as QueryBuilder,
  };

  const builder: QueryBuilder = {
    upsert: jest.fn(() => Promise.resolve(harness.__upsertResult)),
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    gt: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => Promise.resolve(harness.__selectResult)),
  };
  harness.__builder = builder;
  harness.from.mockReturnValue(builder);
  return harness;
}

function asClient(c: FakeClient): SupabaseClient {
  return c as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeSubmission(overrides: Partial<UserSubmittedFood> = {}): UserSubmittedFood {
  return {
    id: 'sub-1',
    nameJa: 'テスト食品',
    nameEn: null,
    brand: null,
    barcode: null,
    servingSizeG: 100,
    servingUnit: 'g',
    servingDescription: null,
    caloriesPerServing: 200,
    proteinG: 10,
    fatG: 5,
    carbG: 30,
    fiberG: null,
    sugarG: null,
    saltG: null,
    sodiumMg: null,
    saturatedFatG: null,
    cholesterolMg: null,
    calciumMg: null,
    ironMg: null,
    vitaminAUg: null,
    vitaminB1Mg: null,
    vitaminB2Mg: null,
    vitaminCMg: null,
    vitaminDUg: null,
    vitaminEMg: null,
    potassiumMg: null,
    magnesiumMg: null,
    zincMg: null,
    sourceType: 'package_label',
    sourcePhotoUri: null,
    notes: null,
    submissionStatus: 'pending_review',
    rejectionReason: null,
    remoteId: null,
    syncedAt: null,
    createdAt: '2026-04-26T00:00:00Z',
    updatedAt: '2026-04-26T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no pending, no history.
  mockListPendingSync.mockResolvedValue([]);
  mockListSubmissionsByStatus.mockResolvedValue([]);
  mockMarkSubmissionSynced.mockResolvedValue(null);
  mockGetWatermark.mockResolvedValue(null);
  mockSetWatermark.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// uploadPendingSubmissions
// ---------------------------------------------------------------------------

describe('uploadPendingSubmissions — guard rails', () => {
  it('skips with supabase_not_configured when no client', async () => {
    const db = makeStubDb();
    const result = await uploadPendingSubmissions(db, null);
    expect(result.skipped).toBe('supabase_not_configured');
    expect(result.uploaded).toBe(0);
    expect(mockListPendingSync).not.toHaveBeenCalled();
  });

  it('skips with not_authenticated when there is no session', async () => {
    const db = makeStubDb();
    const client = makeFakeClient({ session: null });
    const result = await uploadPendingSubmissions(db, asClient(client));
    expect(result.skipped).toBe('not_authenticated');
    expect(mockListPendingSync).not.toHaveBeenCalled();
  });

  it('skips with nothing_pending when listPendingSync is empty', async () => {
    const db = makeStubDb();
    const client = makeFakeClient();
    const result = await uploadPendingSubmissions(db, asClient(client));
    expect(result.skipped).toBe('nothing_pending');
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('uploadPendingSubmissions — happy path', () => {
  it('uploads one row and marks it synced with the local id as remote id', async () => {
    const sub = fakeSubmission();
    mockListPendingSync.mockResolvedValue([sub]);
    const db = makeStubDb();
    const client = makeFakeClient();

    const result = await uploadPendingSubmissions(db, asClient(client));

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBeNull();
    expect(client.from).toHaveBeenCalledWith('public_foods');
    expect(client.__builder.upsert).toHaveBeenCalledTimes(1);
    expect(mockMarkSubmissionSynced).toHaveBeenCalledWith(db, sub.id, sub.id);
  });

  it('always sends status=pending_review (server flips, not client)', async () => {
    mockListPendingSync.mockResolvedValue([fakeSubmission()]);
    const db = makeStubDb();
    const client = makeFakeClient();

    await uploadPendingSubmissions(db, asClient(client));

    const payload = client.__builder.upsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.status).toBe('pending_review');
    expect(payload.submitted_by).toBe('user-1');
  });

  it('attaches an approval_score in [0, 100] to every upload', async () => {
    mockListPendingSync.mockResolvedValue([fakeSubmission()]);
    const db = makeStubDb();
    const client = makeFakeClient();

    await uploadPendingSubmissions(db, asClient(client));

    const payload = client.__builder.upsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const score = payload.approval_score as number;
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('uses upsert (not insert) for idempotency on retries', async () => {
    mockListPendingSync.mockResolvedValue([fakeSubmission()]);
    const db = makeStubDb();
    const client = makeFakeClient();

    await uploadPendingSubmissions(db, asClient(client));

    expect(client.__builder.upsert).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ onConflict: 'id' }),
    );
  });
});

describe('uploadPendingSubmissions — failure handling', () => {
  it('does not call markSubmissionSynced when upsert returns an error', async () => {
    mockListPendingSync.mockResolvedValue([fakeSubmission()]);
    const db = makeStubDb();
    const client = makeFakeClient();
    client.__upsertResult = {
      error: { status: 400, message: 'bad request' },
    };

    const result = await uploadPendingSubmissions(db, asClient(client));

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockMarkSubmissionSynced).not.toHaveBeenCalled();
  });

  it('continues processing remaining rows after a single failure', async () => {
    const a = fakeSubmission({ id: 'sub-a' });
    const b = fakeSubmission({ id: 'sub-b' });
    const c = fakeSubmission({ id: 'sub-c' });
    mockListPendingSync.mockResolvedValue([a, b, c]);
    const db = makeStubDb();
    const client = makeFakeClient();

    let call = 0;
    client.__builder.upsert.mockImplementation(() => {
      call += 1;
      if (call === 2) {
        return Promise.resolve({
          error: { status: 500, message: 'server error' },
        });
      }
      return Promise.resolve({ error: null });
    });

    const result = await uploadPendingSubmissions(db, asClient(client));

    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(1);
    // a and c marked synced; b not.
    const syncedIds = mockMarkSubmissionSynced.mock.calls.map((c) => c[1]);
    expect(syncedIds).toEqual(['sub-a', 'sub-c']);
  });

  it('retries on 429 with backoff and ultimately marks as failed if it never clears', async () => {
    mockListPendingSync.mockResolvedValue([fakeSubmission()]);
    const db = makeStubDb();
    const client = makeFakeClient();
    client.__builder.upsert.mockResolvedValue({
      error: { status: 429, message: 'Too Many Requests' },
    });

    const result = await uploadPendingSubmissions(db, asClient(client));

    expect(client.__builder.upsert).toHaveBeenCalledTimes(3);
    expect(result.failed).toBe(1);
    expect(mockMarkSubmissionSynced).not.toHaveBeenCalled();
  }, 10000);

  it('succeeds without retry on the first attempt when there is no error', async () => {
    mockListPendingSync.mockResolvedValue([fakeSubmission()]);
    const db = makeStubDb();
    const client = makeFakeClient();

    await uploadPendingSubmissions(db, asClient(client));
    expect(client.__builder.upsert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// pullApprovedSubmissions
// ---------------------------------------------------------------------------

describe('pullApprovedSubmissions — guard rails', () => {
  it('skips with supabase_not_configured when no client', async () => {
    const db = makeStubDb();
    const result = await pullApprovedSubmissions(db, null);
    expect(result.skipped).toBe('supabase_not_configured');
    expect(result.pulled).toBe(0);
  });

  it('returns remote_error when supabase select returns an error', async () => {
    const db = makeStubDb();
    const client = makeFakeClient();
    client.__selectResult = {
      data: null,
      error: { status: 500, message: 'server error' },
    };
    const result = await pullApprovedSubmissions(db, asClient(client));
    expect(result.skipped).toBe('remote_error');
    expect(mockSetWatermark).not.toHaveBeenCalled();
  });
});

describe('pullApprovedSubmissions — happy path', () => {
  it('returns pulled=0 and does not advance watermark on empty data', async () => {
    const db = makeStubDb();
    const client = makeFakeClient();
    client.__selectResult = { data: [], error: null };

    const result = await pullApprovedSubmissions(db, asClient(client));

    expect(result.pulled).toBe(0);
    expect(result.newWatermark).toBeNull();
    expect(mockSetWatermark).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('upserts each approved row into local foods and advances the watermark to the latest', async () => {
    const db = makeStubDb();
    const client = makeFakeClient();
    client.__selectResult = {
      data: [
        {
          id: 'r1',
          name_ja: 'A',
          name_en: null,
          brand: null,
          barcode: null,
          serving_size_g: 100,
          serving_unit: 'g',
          calories_per_serving: 200,
          protein_g: 10,
          fat_g: 5,
          carb_g: 30,
          fiber_g: null,
          updated_at: '2026-04-26T01:00:00Z',
        },
        {
          id: 'r2',
          name_ja: 'B',
          name_en: null,
          brand: null,
          barcode: null,
          serving_size_g: 100,
          serving_unit: 'g',
          calories_per_serving: 100,
          protein_g: 5,
          fat_g: 2,
          carb_g: 15,
          fiber_g: null,
          updated_at: '2026-04-26T02:00:00Z',
        },
      ],
      error: null,
    };

    const result = await pullApprovedSubmissions(db, asClient(client));

    expect(result.pulled).toBe(2);
    expect(result.newWatermark).toBe('2026-04-26T02:00:00Z');
    expect(db.runAsync).toHaveBeenCalledTimes(2);
    expect(mockSetWatermark).toHaveBeenCalledWith(
      db,
      SYNC_WATERMARK_KEYS.publicFoodsApproved,
      '2026-04-26T02:00:00Z',
    );
  });

  it('passes the existing watermark to the gt() filter on subsequent runs', async () => {
    const db = makeStubDb();
    mockGetWatermark.mockResolvedValue('2026-04-20T00:00:00Z');
    const client = makeFakeClient();

    await pullApprovedSubmissions(db, asClient(client));

    expect(client.__builder.gt).toHaveBeenCalledWith(
      'updated_at',
      '2026-04-20T00:00:00Z',
    );
  });

  it('uses the epoch as initial watermark when none has been recorded', async () => {
    const db = makeStubDb();
    mockGetWatermark.mockResolvedValue(null);
    const client = makeFakeClient();

    await pullApprovedSubmissions(db, asClient(client));

    expect(client.__builder.gt).toHaveBeenCalledWith(
      'updated_at',
      '1970-01-01T00:00:00Z',
    );
  });

  it('filters by status=approved on the server query', async () => {
    const db = makeStubDb();
    const client = makeFakeClient();

    await pullApprovedSubmissions(db, asClient(client));

    expect(client.__builder.eq).toHaveBeenCalledWith('status', 'approved');
  });

  it('upserts foods with source=user_submitted and ON CONFLICT preservation', async () => {
    const db = makeStubDb();
    const client = makeFakeClient();
    client.__selectResult = {
      data: [
        {
          id: 'r1',
          name_ja: 'A',
          name_en: null,
          brand: null,
          barcode: null,
          serving_size_g: 100,
          serving_unit: 'g',
          calories_per_serving: 200,
          protein_g: 10,
          fat_g: 5,
          carb_g: 30,
          fiber_g: null,
          updated_at: '2026-04-26T01:00:00Z',
        },
      ],
      error: null,
    };

    await pullApprovedSubmissions(db, asClient(client));

    const sql = (db.runAsync.mock.calls[0][0] as string).toLowerCase();
    expect(sql).toContain("'user_submitted'");
    expect(sql).toContain('on conflict(id) do update set');
    // The conflict-update branch must NOT touch is_favorite / use_count / source.
    expect(sql).not.toContain('is_favorite');
    expect(sql).not.toContain('use_count');
  });
});

// ---------------------------------------------------------------------------
// syncSubmissions — composes pull + upload
// ---------------------------------------------------------------------------

describe('syncSubmissions', () => {
  it('runs pull before upload (so freshly-approved rows reflect locally first)', async () => {
    const db = makeStubDb();
    const client = makeFakeClient();
    const callOrder: string[] = [];
    client.auth.getSession.mockImplementation(() => {
      callOrder.push('upload-auth');
      return Promise.resolve({
        data: {
          session: {
            user: { id: 'user-1', email_confirmed_at: '2026-04-26T00:00:00Z' },
          },
        },
        error: null,
      });
    });
    // Pull only happens via the from() chain — we observe it via from().
    let firstFromCall = '';
    client.from.mockImplementation((table: string) => {
      if (!firstFromCall) {
        firstFromCall = `from-${table}`;
        callOrder.push(firstFromCall);
      }
      return client.__builder;
    });

    await syncSubmissions(db, asClient(client));

    // Pull goes first → from('public_foods') for select happens before upload-auth.
    expect(callOrder[0]).toBe('from-public_foods');
  });

  it('returns both upload and pull results', async () => {
    const db = makeStubDb();
    const client = makeFakeClient();
    const result = await syncSubmissions(db, asClient(client));
    expect(result).toHaveProperty('upload');
    expect(result).toHaveProperty('pull');
  });
});
