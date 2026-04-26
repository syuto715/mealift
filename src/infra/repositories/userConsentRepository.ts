import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  UserConsent,
  UserConsentInput,
  ConsentStatus,
  ConsentType,
  ConsentVersion,
} from '../../types/userConsent';

// UserConsentRepository — persistence layer for the user_consents
// audit trail (see migrations/v19.ts). Constructor-injected so unit
// tests can pass a fake DB; production callers pass the singleton
// from `getDatabase()`.
//
// Free-function repos elsewhere in the codebase (foodRepository,
// dishRepository, …) use a module-scoped DB handle; this one diverges
// because the audit-trail semantics are heavy enough to warrant
// targeted unit tests, and DI makes those cheap. There's no functional
// difference at the call site — `new UserConsentRepository(db)` is
// trivially constructed in a thin top-level wrapper if/when consumers
// land.
//
// The schema (v19) enforces that consent_text_hash is exactly 64
// lowercase hex chars and that consented_at > 0; the repository assumes
// inputs already match (callers run the text through computeConsentTextHash).
export class UserConsentRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  // recordConsent — idempotent for the (type, version, hash) triple.
  // If an active consent already exists for the same (type, version)
  // AND the hashes match, return the existing row instead of writing
  // a duplicate. Any difference (hash drift = text revised, or no
  // active row) writes a fresh row.
  //
  // Note: a row with a different hash for the same (type, version)
  // is rare but possible — e.g. typo-fix on the legal text under the
  // same version label. Treating that as "new consent" is correct;
  // the prior row stays as audit history.
  async recordConsent(input: UserConsentInput): Promise<UserConsent> {
    const existing = await this.findActiveByTypeAndVersion(
      input.consentType,
      input.consentVersion,
    );
    if (existing && existing.consentTextHash === input.consentTextHash) {
      return existing;
    }

    const now = Date.now();
    const result = await this.db.runAsync(
      `INSERT INTO user_consents
        (consent_type, consent_version, consented_at, consent_text_hash, withdrawn_at)
       VALUES (?, ?, ?, ?, NULL)`,
      [input.consentType, input.consentVersion, now, input.consentTextHash],
    );

    return {
      id: result.lastInsertRowId,
      consentType: input.consentType,
      consentVersion: input.consentVersion,
      consentedAt: now,
      consentTextHash: input.consentTextHash,
      withdrawnAt: null,
    };
  }

  // withdrawConsent — sets withdrawn_at on the currently-active row.
  // Returns null if there is no active row to withdraw. Rows are
  // never deleted: the consent → withdrawal sequence is itself part
  // of the audit trail.
  async withdrawConsent(
    consentType: ConsentType,
    consentVersion: ConsentVersion,
  ): Promise<UserConsent | null> {
    const existing = await this.findActiveByTypeAndVersion(
      consentType,
      consentVersion,
    );
    if (!existing) return null;

    const now = Date.now();
    await this.db.runAsync(
      'UPDATE user_consents SET withdrawn_at = ? WHERE id = ?',
      [now, existing.id],
    );

    return { ...existing, withdrawnAt: now };
  }

  // getStatus — "is the user currently consented to this exact (type,
  // version)?" Returns hasActive=false if the row is missing OR
  // withdrawn; in the withdrawn case, `consent` is still null because
  // findActiveByTypeAndVersion filters withdrawn rows out (use
  // getHistoryByType to inspect withdrawals).
  async getStatus(
    consentType: ConsentType,
    consentVersion: ConsentVersion,
  ): Promise<ConsentStatus> {
    const consent = await this.findActiveByTypeAndVersion(
      consentType,
      consentVersion,
    );
    return {
      hasActive: consent !== null,
      consent,
    };
  }

  // getLatestByType — most recent consent of a given type by
  // consented_at, regardless of version or withdrawal state. Useful
  // for "has the user ever agreed to *any* version of terms?" gates.
  async getLatestByType(consentType: ConsentType): Promise<UserConsent | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM user_consents
        WHERE consent_type = ?
        ORDER BY consented_at DESC
        LIMIT 1`,
      [consentType],
    );
    return row ? this.rowToConsent(row) : null;
  }

  // getHistoryByType — full history for a type, newest first,
  // including withdrawn rows. Drives the "show me everything I've
  // agreed to" audit UI.
  async getHistoryByType(consentType: ConsentType): Promise<UserConsent[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM user_consents
        WHERE consent_type = ?
        ORDER BY consented_at DESC`,
      [consentType],
    );
    return rows.map((r) => this.rowToConsent(r));
  }

  // findActiveByTypeAndVersion — newest non-withdrawn row for the
  // (type, version) pair. Returns null when none exists. Multiple
  // active rows for the same pair shouldn't happen in practice
  // (recordConsent's idempotency guards against it), but ORDER BY
  // consented_at DESC ensures we pick the newest if it ever does.
  private async findActiveByTypeAndVersion(
    consentType: ConsentType,
    consentVersion: ConsentVersion,
  ): Promise<UserConsent | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM user_consents
        WHERE consent_type = ?
          AND consent_version = ?
          AND withdrawn_at IS NULL
        ORDER BY consented_at DESC
        LIMIT 1`,
      [consentType, consentVersion],
    );
    return row ? this.rowToConsent(row) : null;
  }

  private rowToConsent(row: Record<string, unknown>): UserConsent {
    return {
      id: row.id as number,
      consentType: row.consent_type as ConsentType,
      consentVersion: row.consent_version as ConsentVersion,
      consentedAt: row.consented_at as number,
      consentTextHash: row.consent_text_hash as string,
      withdrawnAt: (row.withdrawn_at as number | null) ?? null,
    };
  }
}
