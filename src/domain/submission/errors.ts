import type { ConsentVersion } from '../../types/userConsent';

// ConsentRequiredError — thrown by submitFood when there is no
// active food_submission consent for the version the caller passed.
// Callers catch this specifically (instanceof) and route to the
// consent modal; they should NOT fold it into a generic "submission
// failed" error message because the recovery path is different
// (show legal text + record consent, then retry).
export class ConsentRequiredError extends Error {
  // Discriminator for `instanceof` checks across module boundaries.
  // React Native's bundle splitting can produce surprising prototype
  // chains, so call sites that need to be 100% safe should also
  // check `name === 'ConsentRequiredError'`.
  readonly consentType = 'food_submission' as const;
  readonly consentVersion: ConsentVersion;

  constructor(consentVersion: ConsentVersion) {
    super(
      `food_submission consent (version ${consentVersion}) is required before submitting`,
    );
    this.name = 'ConsentRequiredError';
    this.consentVersion = consentVersion;
    // Restore prototype chain for `instanceof` after super() in the
    // ES5-target output that bundlers default to. No-op on modern
    // engines; safe to keep for cross-runtime portability.
    Object.setPrototypeOf(this, ConsentRequiredError.prototype);
  }
}
