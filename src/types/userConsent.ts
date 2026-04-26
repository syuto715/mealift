// LEGAL FOUNDATION — DO NOT MODIFY WITHOUT CARE
//
// The shape of UserConsent is the audit trail for user agreement to
// terms. Changes to this type may invalidate stored consent records or
// break legal traceability. Coordinate with the consent_text_hash
// helper (src/domain/consent/consentHash.ts) if you change anything
// beyond adding optional fields.
//
// In particular: the normalization rules baked into computeConsentTextHash
// must NEVER change once a release ships, or every previously stored
// hash becomes unverifiable.

export type ConsentType =
  | 'terms_of_service'   // 利用規約全体
  | 'food_submission'    // 食品投稿時の権利許諾 (Sprint 4 で使う)
  | 'marketing_emails'   // 将来用、メール配信同意
  | 'analytics';         // 将来用、分析データ提供

// ConsentVersion is intentionally a free-form string — both ISO date
// ('2026-04-26') and semver ('1.0.0') are reasonable. The chosen
// convention is documented at the consent-publishing site, not enforced
// here, so future versioning schemes can land without a type change.
export type ConsentVersion = string;

export interface UserConsent {
  id: number;
  consentType: ConsentType;
  consentVersion: ConsentVersion;
  consentedAt: number;          // unix epoch ms
  consentTextHash: string;      // SHA256 hex (64 lowercase chars)
  withdrawnAt: number | null;   // unix epoch ms when revoked
}

export interface UserConsentInput {
  consentType: ConsentType;
  consentVersion: ConsentVersion;
  consentTextHash: string;
}

// Result of checking whether the user has an active consent for a
// specific (type, version) pair. `consent` is null only when no record
// exists at all; if the consent was withdrawn it is still returned so
// callers can show "you previously agreed and then withdrew" UI.
export interface ConsentStatus {
  hasActive: boolean;            // active = consented and not withdrawn
  consent: UserConsent | null;   // null if never consented
}
