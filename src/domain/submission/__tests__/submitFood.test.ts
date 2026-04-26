import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import { submitFood } from '../submitFood';
import { ConsentRequiredError } from '../errors';
import { recordConsent } from '../../../infra/repositories/userConsentRepository';
import type {
  UserSubmittedFoodInput,
} from '../../../types/userSubmittedFood';
import type { ConsentVersion } from '../../../types/userConsent';

// generateId() in createSubmission uses expo-crypto.randomUUID. Mock
// it deterministically so tests can assert on resulting ids.
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mockUuidCounter}`,
}));

// Combined fake DB — supports the consent SQL shapes (subset from
// userConsentRepository.test.ts) AND the submission SQL shapes
// (subset from userSubmittedFoodRepository.test.ts). submitFood
// touches both tables, so a single fake covers both queries.
//
// The fake is hand-rolled because adding better-sqlite3 just for
// these tests outweighs the cost of pattern-matching the small set
// of SQL strings the two repositories actually emit.

interface ConsentRow {
  id: number;
  consent_type: string;
  consent_version: string;
  consented_at: number;
  consent_text_hash: string;
  withdrawn_at: number | null;
}

interface SubmissionRow {
  id: string;
  name_ja: string;
  serving_size_g: number;
  serving_unit: string;
  calories_per_serving: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  source_type: string;
  submission_status: string;
  rejection_reason: string | null;
  remote_id: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  // The repo selects with `*`; columns we don't care about can be
  // missing — rowToSubmission tolerates undefined via ?? null.
  [extra: string]: unknown;
}

function makeFakeDb(): SQLiteDatabase {
  const consents: ConsentRow[] = [];
  const submissions: SubmissionRow[] = [];
  let nextConsentId = 1;
  let clock = 0;
  const tick = () => {
    clock += 1;
    return `2026-04-26T00:00:00.${String(clock).padStart(6, '0')}Z`;
  };

  const findActiveConsent = (
    type: string,
    version: string,
  ): ConsentRow | undefined =>
    consents
      .filter(
        (c) =>
          c.consent_type === type &&
          c.consent_version === version &&
          c.withdrawn_at === null,
      )
      .sort((a, b) => b.consented_at - a.consented_at)[0];

  const fake = {
    runAsync: async (
      sql: string,
      params: unknown[],
    ): Promise<SQLiteRunResult> => {
      if (/^\s*INSERT INTO user_consents/i.test(sql)) {
        const [type, version, consentedAt, hash] = params as [
          string,
          string,
          number,
          string,
        ];
        const id = nextConsentId++;
        consents.push({
          id,
          consent_type: type,
          consent_version: version,
          consented_at: consentedAt,
          consent_text_hash: hash,
          withdrawn_at: null,
        });
        return { lastInsertRowId: id, changes: 1 };
      }

      if (/^\s*INSERT INTO user_submitted_foods/i.test(sql)) {
        const [
          id,
          nameJa,
          ,
          ,
          ,
          servingSizeG,
          servingUnit,
          ,
          caloriesPerServing,
          proteinG,
          fatG,
          carbG,
          // 17 nullable nutrients we don't store individually
        ] = params as Array<unknown>;
        const sourceType = params[29] as string;
        const ts = tick();
        submissions.push({
          id: id as string,
          name_ja: nameJa as string,
          serving_size_g: servingSizeG as number,
          serving_unit: servingUnit as string,
          calories_per_serving: caloriesPerServing as number,
          protein_g: proteinG as number,
          fat_g: fatG as number,
          carb_g: carbG as number,
          source_type: sourceType,
          submission_status: 'local',
          rejection_reason: null,
          remote_id: null,
          synced_at: null,
          created_at: ts,
          updated_at: ts,
        });
        return { lastInsertRowId: 0, changes: 1 };
      }

      throw new Error(`fake DB: unhandled runAsync SQL: ${sql}`);
    },

    getFirstAsync: async <T,>(
      sql: string,
      params: unknown[],
    ): Promise<T | null> => {
      // Active consent lookup.
      if (/withdrawn_at IS NULL/i.test(sql)) {
        const [type, version] = params as [string, string];
        const row = findActiveConsent(type, version);
        return (row as unknown as T) ?? null;
      }
      // Submission fetch by id.
      if (/FROM user_submitted_foods/i.test(sql)) {
        const [id] = params as [string];
        const row = submissions.find((s) => s.id === id);
        return (row as unknown as T) ?? null;
      }
      throw new Error(`fake DB: unhandled getFirstAsync SQL: ${sql}`);
    },

    getAllAsync: async <T,>(_sql: string, _params: unknown[]): Promise<T[]> => {
      throw new Error('fake DB: getAllAsync not used by submitFood');
    },
  };

  return fake as unknown as SQLiteDatabase;
}

const CONSENT_VERSION: ConsentVersion = '2026-04-26';
const CONSENT_HASH = 'a'.repeat(64);

function baseSubmission(
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
    ...overrides,
  };
}

beforeEach(() => {
  mockUuidCounter = 0;
});

describe('submitFood — consent gate', () => {
  it('throws ConsentRequiredError when no food_submission consent exists', async () => {
    const db = makeFakeDb();
    await expect(
      submitFood(db, baseSubmission(), CONSENT_VERSION),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it('throws ConsentRequiredError carrying the requested version', async () => {
    const db = makeFakeDb();
    try {
      await submitFood(db, baseSubmission(), CONSENT_VERSION);
      throw new Error('expected ConsentRequiredError');
    } catch (e) {
      expect(e).toBeInstanceOf(ConsentRequiredError);
      const err = e as ConsentRequiredError;
      expect(err.consentType).toBe('food_submission');
      expect(err.consentVersion).toBe(CONSENT_VERSION);
      expect(err.name).toBe('ConsentRequiredError');
    }
  });

  it('throws ConsentRequiredError when only a different consent type is active', async () => {
    const db = makeFakeDb();
    // User has agreed to terms_of_service but not food_submission.
    await recordConsent(db, {
      consentType: 'terms_of_service',
      consentVersion: CONSENT_VERSION,
      consentTextHash: CONSENT_HASH,
    });
    await expect(
      submitFood(db, baseSubmission(), CONSENT_VERSION),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it('throws ConsentRequiredError when food_submission consent exists for a different version', async () => {
    const db = makeFakeDb();
    await recordConsent(db, {
      consentType: 'food_submission',
      consentVersion: '2025-01-01',
      consentTextHash: CONSENT_HASH,
    });
    await expect(
      submitFood(db, baseSubmission(), CONSENT_VERSION),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });
});

describe('submitFood — happy path', () => {
  it('inserts the submission when an active consent exists for the version', async () => {
    const db = makeFakeDb();
    await recordConsent(db, {
      consentType: 'food_submission',
      consentVersion: CONSENT_VERSION,
      consentTextHash: CONSENT_HASH,
    });
    const result = await submitFood(db, baseSubmission(), CONSENT_VERSION);
    expect(result.id).toBe('uuid-1');
    expect(result.submissionStatus).toBe('local');
    expect(result.nameJa).toBe('テスト食品');
  });

  it('does not double-record consent on submit (idempotency at consent layer)', async () => {
    const db = makeFakeDb();
    const first = await recordConsent(db, {
      consentType: 'food_submission',
      consentVersion: CONSENT_VERSION,
      consentTextHash: CONSENT_HASH,
    });
    await submitFood(db, baseSubmission(), CONSENT_VERSION);
    // Re-recording is a no-op when (type, version, hash) already match.
    const second = await recordConsent(db, {
      consentType: 'food_submission',
      consentVersion: CONSENT_VERSION,
      consentTextHash: CONSENT_HASH,
    });
    expect(second.id).toBe(first.id);
  });
});

describe('ConsentRequiredError — typed error contract', () => {
  it('is identifiable via instanceof and has a stable name', () => {
    const err = new ConsentRequiredError(CONSENT_VERSION);
    expect(err).toBeInstanceOf(ConsentRequiredError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ConsentRequiredError');
    expect(err.message).toContain(CONSENT_VERSION);
  });
});
