import type * as SQLite from 'expo-sqlite';

// v19: user_consents — audit trail for terms-of-service / submission
// consent.
//
// The shape of each row records exactly what text the user agreed to
// (via consent_text_hash, the SHA256 of the displayed legal text) plus
// when and which version. If the displayed text is later revised, the
// hash is what binds the historical agreement to the original wording —
// the rendered text can change but the audit chain is verifiable.
//
// withdrawn_at is set when the user revokes consent (e.g. for a
// "delete my data" / GDPR-shaped flow). Rows are NEVER deleted: the
// consent → withdrawal sequence is itself part of the audit trail.
//
// Storage is local-only on this device. Sprint 4 may revisit
// multi-device sync via Supabase if user-submitted-foods need consent
// stamping at upload time. Until then, this table exists purely to
// gate features behind "has the user agreed yet?" reads.
//
// Schema decisions:
//   - INTEGER AUTOINCREMENT id is fine because this table never
//     federates to Supabase. user_submitted_foods uses TEXT id for
//     that reason; consent rows do not.
//   - CHECK constraints validate the hash is exactly 64 lowercase hex
//     characters. SHA256 hex digests are always this shape; any other
//     value indicates a bug, and SQLite refuses the insert.
//   - We index (consent_type, consent_version) for the "is the user
//     up-to-date on terms version 2026-04-26?" query, and consented_at
//     DESC for the audit-history view.
export async function migrateV19(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consent_type TEXT NOT NULL,
      consent_version TEXT NOT NULL,
      consented_at INTEGER NOT NULL,
      consent_text_hash TEXT NOT NULL,
      withdrawn_at INTEGER,
      CHECK (consented_at > 0),
      CHECK (consent_text_hash GLOB '[0-9a-f]*'),
      CHECK (length(consent_text_hash) = 64)
    );
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_user_consents_type_version
      ON user_consents(consent_type, consent_version);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_user_consents_consented_at
      ON user_consents(consented_at DESC);
  `);
}
