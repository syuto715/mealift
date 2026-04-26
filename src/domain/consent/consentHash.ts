import { sha256 } from 'js-sha256';

// computeConsentTextHash — produces the SHA256 hex digest of the exact
// text the user agreed to.
//
// The hash binds a stored UserConsent row to the wording rendered at
// consent time. Even if the legal text is later revised, the hash on
// the historical row still matches the original wording — and the
// audit chain holds up under "what exactly did this user see?"
// scrutiny.
//
// ⚠️  STABILITY CONTRACT
//
// The normalization rules below MUST NOT change after the first
// release ships. Changing them retroactively invalidates every stored
// hash, breaking the legal traceability the whole system exists to
// provide. If you ever genuinely need to amend the rules:
//
//   1. Treat it as a new hash version (e.g. add a `hashAlgo` column).
//   2. Migrate existing rows by recomputing under the new rules
//      against the original text snapshot — which means you also need
//      to have stored the text, not just the hash. Today we don't.
//
// In short: this function is part of the data format. Touch it like
// you'd touch a database migration.
//
// Normalization rules:
//   - Convert CRLF and lone CR line endings to LF (Windows / old-Mac
//     pastes don't matter — only the visible text does).
//   - Trim leading and trailing whitespace.
//   - Do NOT collapse internal whitespace. Two spaces vs one space is
//     a meaningful formatting difference; the user agreed to whatever
//     was rendered.
//   - js-sha256 internally encodes the string as UTF-8 before
//     hashing, which matters for Japanese legal text.
export function computeConsentTextHash(text: string): string {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  return sha256(normalized);
}

// verifyConsentTextHash — true iff the supplied text would hash to
// the supplied digest under the same normalization rules. Useful for
// "is the text we still have on disk identical to what was agreed
// to?" audits.
export function verifyConsentTextHash(text: string, hash: string): boolean {
  return computeConsentTextHash(text) === hash;
}
