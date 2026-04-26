import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import {
  recordConsent,
  withdrawConsent,
  getConsentStatus,
  getLatestConsentByType,
  getConsentHistoryByType,
} from '../userConsentRepository';
import type { ConsentType, ConsentVersion } from '../../../types/userConsent';

// Minimal in-memory fake DB matching the SQLiteDatabase methods the
// repository actually uses. Pattern-matches on the small set of SQL
// shapes the repo emits — see the repository file for the canonical
// queries. This is deliberately not a generic SQL engine; if a new
// query shape lands in the repo, the fake must learn it.
//
// Why not better-sqlite3 or similar? Adding a native dev dep just for
// these tests is heavier than the queries warrant. Five SQL shapes
// fit in a fake under 80 lines.
interface FakeRow {
  id: number;
  consent_type: string;
  consent_version: string;
  consented_at: number;
  consent_text_hash: string;
  withdrawn_at: number | null;
}

function makeFakeDb(): SQLiteDatabase {
  const rows: FakeRow[] = [];
  let nextId = 1;

  // Find the active row for (type, version) — non-withdrawn, newest.
  const findActive = (type: string, version: string): FakeRow | undefined => {
    return rows
      .filter(
        (r) =>
          r.consent_type === type &&
          r.consent_version === version &&
          r.withdrawn_at === null,
      )
      .sort((a, b) => b.consented_at - a.consented_at)[0];
  };

  const fake = {
    runAsync: async (sql: string, params: unknown[]): Promise<SQLiteRunResult> => {
      if (/^\s*INSERT INTO user_consents/i.test(sql)) {
        const [type, version, consentedAt, hash] = params as [
          string,
          string,
          number,
          string,
        ];
        const id = nextId++;
        rows.push({
          id,
          consent_type: type,
          consent_version: version,
          consented_at: consentedAt,
          consent_text_hash: hash,
          withdrawn_at: null,
        });
        return { lastInsertRowId: id, changes: 1 };
      }
      if (/^\s*UPDATE user_consents SET withdrawn_at/i.test(sql)) {
        const [withdrawnAt, id] = params as [number, number];
        const target = rows.find((r) => r.id === id);
        if (target) target.withdrawn_at = withdrawnAt;
        return { lastInsertRowId: 0, changes: target ? 1 : 0 };
      }
      throw new Error(`fake DB: unhandled runAsync SQL: ${sql}`);
    },
    getFirstAsync: async <T,>(sql: string, params: unknown[]): Promise<T | null> => {
      // Active-by-(type, version) — non-withdrawn newest.
      if (/withdrawn_at IS NULL/i.test(sql)) {
        const [type, version] = params as [string, string];
        const row = findActive(type, version);
        return (row as unknown as T) ?? null;
      }
      // Latest-by-type — any version, any withdrawal state, newest.
      if (/ORDER BY consented_at DESC\s*LIMIT 1/i.test(sql)) {
        const [type] = params as [string];
        const row = rows
          .filter((r) => r.consent_type === type)
          .sort((a, b) => b.consented_at - a.consented_at)[0];
        return (row as unknown as T) ?? null;
      }
      throw new Error(`fake DB: unhandled getFirstAsync SQL: ${sql}`);
    },
    getAllAsync: async <T,>(sql: string, params: unknown[]): Promise<T[]> => {
      // History-by-type — newest first, includes withdrawn rows.
      if (/ORDER BY consented_at DESC/i.test(sql)) {
        const [type] = params as [string];
        const out = rows
          .filter((r) => r.consent_type === type)
          .sort((a, b) => b.consented_at - a.consented_at);
        return out as unknown as T[];
      }
      throw new Error(`fake DB: unhandled getAllAsync SQL: ${sql}`);
    },
  };

  return fake as unknown as SQLiteDatabase;
}

const TYPE_TOS: ConsentType = 'terms_of_service';
const TYPE_FOOD: ConsentType = 'food_submission';
const VERSION_1: ConsentVersion = '2026-04-26';
const VERSION_2: ConsentVersion = '2026-05-01';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('userConsentRepository', () => {
  it('records a new consent', async () => {
    const db = makeFakeDb();
    const result = await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    expect(result.id).toBe(1);
    expect(result.consentType).toBe(TYPE_TOS);
    expect(result.consentVersion).toBe(VERSION_1);
    expect(result.consentTextHash).toBe(HASH_A);
    expect(result.consentedAt).toBeGreaterThan(0);
    expect(result.withdrawnAt).toBeNull();
  });

  it('returns the existing record for an idempotent re-record (same hash)', async () => {
    const db = makeFakeDb();
    const first = await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    const second = await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    expect(second.id).toBe(first.id);
    expect(second.consentedAt).toBe(first.consentedAt);

    // History should still contain only the first row.
    const history = await getConsentHistoryByType(db, TYPE_TOS);
    expect(history).toHaveLength(1);
  });

  it('creates a new record when the hash differs (text revised under same version)', async () => {
    const db = makeFakeDb();
    const first = await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    const second = await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_B,
    });
    expect(second.id).not.toBe(first.id);

    const history = await getConsentHistoryByType(db, TYPE_TOS);
    expect(history).toHaveLength(2);
  });

  it('withdraws an active consent', async () => {
    const db = makeFakeDb();
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    const withdrawn = await withdrawConsent(db, TYPE_TOS, VERSION_1);
    expect(withdrawn).not.toBeNull();
    expect(withdrawn?.withdrawnAt).toBeGreaterThan(0);
  });

  it('returns null when withdrawing a non-existent consent', async () => {
    const db = makeFakeDb();
    const result = await withdrawConsent(db, TYPE_TOS, VERSION_1);
    expect(result).toBeNull();
  });

  it('returns null when withdrawing an already-withdrawn consent', async () => {
    const db = makeFakeDb();
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    await withdrawConsent(db, TYPE_TOS, VERSION_1);
    // Second withdrawal: nothing active to withdraw.
    const second = await withdrawConsent(db, TYPE_TOS, VERSION_1);
    expect(second).toBeNull();
  });

  it('getConsentStatus returns hasActive=true for a current consent', async () => {
    const db = makeFakeDb();
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    const status = await getConsentStatus(db, TYPE_TOS, VERSION_1);
    expect(status.hasActive).toBe(true);
    expect(status.consent).not.toBeNull();
    expect(status.consent?.consentTextHash).toBe(HASH_A);
  });

  it('getConsentStatus returns hasActive=false after withdrawal', async () => {
    const db = makeFakeDb();
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    await withdrawConsent(db, TYPE_TOS, VERSION_1);
    const status = await getConsentStatus(db, TYPE_TOS, VERSION_1);
    expect(status.hasActive).toBe(false);
    expect(status.consent).toBeNull();
  });

  it('getConsentStatus returns hasActive=false when no consent exists', async () => {
    const db = makeFakeDb();
    const status = await getConsentStatus(db, TYPE_TOS, VERSION_1);
    expect(status.hasActive).toBe(false);
    expect(status.consent).toBeNull();
  });

  it('getLatestConsentByType returns the most recent consent regardless of version', async () => {
    const db = makeFakeDb();
    // Record two consents under the same type but different versions.
    // We can't easily control consented_at via Date.now() between
    // ms-tick rapid calls, so manually space them with a small await.
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    await new Promise((r) => setTimeout(r, 5));
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_2,
      consentTextHash: HASH_B,
    });
    const latest = await getLatestConsentByType(db, TYPE_TOS);
    expect(latest?.consentVersion).toBe(VERSION_2);
    expect(latest?.consentTextHash).toBe(HASH_B);
  });

  it('getLatestConsentByType returns null when no consents of that type exist', async () => {
    const db = makeFakeDb();
    // Record a consent of a different type.
    await recordConsent(db, {
      consentType: TYPE_FOOD,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    const latest = await getLatestConsentByType(db, TYPE_TOS);
    expect(latest).toBeNull();
  });

  it('getConsentHistoryByType includes withdrawn consents, newest first', async () => {
    const db = makeFakeDb();
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    await withdrawConsent(db, TYPE_TOS, VERSION_1);
    await new Promise((r) => setTimeout(r, 5));
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_2,
      consentTextHash: HASH_B,
    });
    const history = await getConsentHistoryByType(db, TYPE_TOS);
    expect(history).toHaveLength(2);
    expect(history[0].consentVersion).toBe(VERSION_2);
    expect(history[0].withdrawnAt).toBeNull();
    expect(history[1].consentVersion).toBe(VERSION_1);
    expect(history[1].withdrawnAt).not.toBeNull();
  });

  it('getConsentHistoryByType filters by consent type', async () => {
    const db = makeFakeDb();
    await recordConsent(db, {
      consentType: TYPE_TOS,
      consentVersion: VERSION_1,
      consentTextHash: HASH_A,
    });
    await recordConsent(db, {
      consentType: TYPE_FOOD,
      consentVersion: VERSION_1,
      consentTextHash: HASH_B,
    });
    const tosHistory = await getConsentHistoryByType(db, TYPE_TOS);
    const foodHistory = await getConsentHistoryByType(db, TYPE_FOOD);
    expect(tosHistory).toHaveLength(1);
    expect(foodHistory).toHaveLength(1);
    expect(tosHistory[0].consentType).toBe(TYPE_TOS);
    expect(foodHistory[0].consentType).toBe(TYPE_FOOD);
  });
});
