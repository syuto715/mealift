import type { Profile } from '../types/profile';
import { ONBOARDING_VERSION } from '../constants/onboarding';

// v1.3.0 / Onboarding v2 / Phase E-4 — v1-migration UX gate.
//
// Decides whether the welcome screen should render the migration
// notice section. The notice reassures returning v1 users that
// their data is preserved through the Option A force-re-onboarding
// flow established in Phase E-1.
//
// Returns true ONLY when ALL three conditions hold:
//   - A profile row exists (returning user, not first-time)
//   - That row's onboarding was previously completed
//     (onboardingCompleted === true)
//   - On the legacy schema (onboardingVersion < ONBOARDING_VERSION)
//
// Returns false for:
//   - profile == null — first-time user with no row yet. The
//     reassurance copy ("あなたのデータは保存されています") would
//     be incorrect: no data to preserve.
//   - onboardingCompleted === false — user is mid-flow or never
//     completed onboarding. The notice would mislead a new user
//     into thinking they have prior data.
//   - onboardingVersion >= ONBOARDING_VERSION — already on v2 (or
//     newer), no migration to communicate.
//
// Defensive: a non-finite onboardingVersion (NaN / Infinity from
// a corrupted row) is treated as "not v1" via the >= comparison
// being NaN-aware (NaN < N is false, so the early-return path
// fires correctly). Pinned in tests.
//
// Patterns applied:
//   #18 SSoT — single decision function; the screen layer should
//       never re-derive this logic inline
//   #25 helper-thick — all the migration decision logic lives
//       here so the screen stays render-only
//   #28 dev assert + prod sanitize hybrid (NaN-aware)
export function isV1MigrationUser(profile: Profile | null): boolean {
  if (!profile) return false;
  if (!profile.onboardingCompleted) return false;
  // NaN-aware: a corrupted version would short-circuit here because
  // (NaN >= ONBOARDING_VERSION) is false → falls through to true.
  // The explicit Number.isFinite check rejects that path.
  if (!Number.isFinite(profile.onboardingVersion)) return false;
  if (profile.onboardingVersion >= ONBOARDING_VERSION) return false;
  return true;
}
