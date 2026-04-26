import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  UserConsent,
  UserConsentInput,
  ConsentStatus,
  ConsentType,
  ConsentVersion,
} from '../../types/userConsent';

// userConsentRepository — persistence layer for the user_consents
// audit trail (see migrations/v19.ts).
//
// LEGAL-TRACE CONTRACT
//
// Each row records exactly what text the user agreed to (via
// consent_text_hash, the SHA256 of the displayed legal text). If you
// change how rows are written, withdrawn, or surfaced, coordinate
// with src/domain/consent/consentHash.ts — the two together form the
// audit chain. In particular: rows are NEVER deleted; withdrawn_at
// is set to mark revocation. The consent → withdrawal sequence is
// itself the audit trail.
//
// The schema (v19) enforces consent_text_hash is exactly 64 lowercase
// hex chars and consented_at > 0; this module assumes inputs already
// match (callers run the text through computeConsentTextHash).

function rowToConsent(row: Record<string, unknown>): UserConsent {
  return {
    id: row.id as number,
    consentType: row.consent_type as ConsentType,
    consentVersion: row.consent_version as ConsentVersion,
    consentedAt: row.consented_at as number,
    consentTextHash: row.consent_text_hash as string,
    withdrawnAt: (row.withdrawn_at as number | null) ?? null,
  };
}

// findActiveByTypeAndVersion — newest non-withdrawn row for the
// (type, version) pair. Internal helper. Multiple active rows for
// the same pair shouldn't happen in practice (recordConsent's
// idempotency guards against it), but ORDER BY consented_at DESC
// ensures we pick the newest if it ever does.
async function findActiveByTypeAndVersion(
  db: SQLiteDatabase,
  consentType: ConsentType,
  consentVersion: ConsentVersion,
): Promise<UserConsent | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM user_consents
      WHERE consent_type = ?
        AND consent_version = ?
        AND withdrawn_at IS NULL
      ORDER BY consented_at DESC
      LIMIT 1`,
    [consentType, consentVersion],
  );
  return row ? rowToConsent(row) : null;
}

// recordConsent — idempotent for the (type, version, hash) triple.
// If an active consent already exists for the same (type, version)
// AND the hashes match, return the existing row instead of writing
// a duplicate. Any difference (hash drift = text revised, or no
// active row) writes a fresh row.
//
// A row with a different hash for the same (type, version) is rare
// but possible — e.g. typo-fix on the legal text under the same
// version label. Treating that as "new consent" is correct; the
// prior row stays as audit history.
export async function recordConsent(
  db: SQLiteDatabase,
  input: UserConsentInput,
): Promise<UserConsent> {
  const existing = await findActiveByTypeAndVersion(
    db,
    input.consentType,
    input.consentVersion,
  );
  if (existing && existing.consentTextHash === input.consentTextHash) {
    return existing;
  }

  const now = Date.now();
  const result = await db.runAsync(
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
export async function withdrawConsent(
  db: SQLiteDatabase,
  consentType: ConsentType,
  consentVersion: ConsentVersion,
): Promise<UserConsent | null> {
  const existing = await findActiveByTypeAndVersion(
    db,
    consentType,
    consentVersion,
  );
  if (!existing) return null;

  const now = Date.now();
  await db.runAsync(
    'UPDATE user_consents SET withdrawn_at = ? WHERE id = ?',
    [now, existing.id],
  );

  return { ...existing, withdrawnAt: now };
}

// getConsentStatus — "is the user currently consented to this exact
// (type, version)?" Returns hasActive=false if the row is missing OR
// withdrawn; in the withdrawn case, `consent` is null because
// findActiveByTypeAndVersion filters withdrawn rows out (use
// getConsentHistoryByType to inspect withdrawals).
export async function getConsentStatus(
  db: SQLiteDatabase,
  consentType: ConsentType,
  consentVersion: ConsentVersion,
): Promise<ConsentStatus> {
  const consent = await findActiveByTypeAndVersion(
    db,
    consentType,
    consentVersion,
  );
  return {
    hasActive: consent !== null,
    consent,
  };
}

// getLatestConsentByType — most recent consent of a given type by
// consented_at, regardless of version or withdrawal state. Useful
// for "has the user ever agreed to *any* version of terms?" gates.
export async function getLatestConsentByType(
  db: SQLiteDatabase,
  consentType: ConsentType,
): Promise<UserConsent | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM user_consents
      WHERE consent_type = ?
      ORDER BY consented_at DESC
      LIMIT 1`,
    [consentType],
  );
  return row ? rowToConsent(row) : null;
}

// getConsentHistoryByType — full history for a type, newest first,
// including withdrawn rows. Drives the "show me everything I've
// agreed to" audit UI.
export async function getConsentHistoryByType(
  db: SQLiteDatabase,
  consentType: ConsentType,
): Promise<UserConsent[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM user_consents
      WHERE consent_type = ?
      ORDER BY consented_at DESC`,
    [consentType],
  );
  return rows.map(rowToConsent);
}
