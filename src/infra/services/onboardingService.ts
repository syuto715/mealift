import {
  getProfile,
  updateProfile,
} from '../repositories/profileRepository';
import type { Profile } from '../../types/profile';
import type { OnboardingData } from '../../stores/onboardingStore';

// v1.3.0 / Onboarding v2 / Phase A-5 — service layer that finalizes
// the onboardingStore snapshot to profiles via updateProfile.
//
// Two responsibilities:
//
//   1. buildProfilePatch — pure transform. Reads the store snapshot
//      + (optional) existing Profile, produces a Partial<Profile>
//      patch with:
//        - per-field step gating (only fields whose collecting
//          screen has been reached land in the patch; Pattern 18
//          trust-boundary applied per field rather than only at
//          calculateAll's overall threshold)
//        - service-managed fields (onboardingStep monotonic max,
//          onboardingStartedAt set-once-on-first-persist, PFC
//          target persistence at full-input)
//        - estimatedTargetDate Date → ISO string boundary
//          (Phase A-1 schema decision: TEXT, NOT INTEGER ms;
//          parseDateOrNull on the read side already expects ISO)
//
//   2. persistToProfile — async wrapper that reads existing profile,
//      delegates to buildProfilePatch, calls updateProfile.
//
// Sync queue: enqueueRowFromTable is called inside updateProfile
// once per call. Calling persistToProfile twice with the same
// snapshot enqueues twice (NOT sync-layer idempotent) — sync
// resolver dedupes by row id + operation, so this is acceptable
// per Phase 4.0 sync convention.
//
// Patterns applied:
//   #5  fail-fast on caller misuse (profileId empty / mismatch)
//   #6  profile_id SQL scope (inherited via updateProfile)
//   #7  3× soft-delete filter (inherited via updateProfile)
//   #8  TZ-aware ISO boundary (Date → toISOString at write boundary)
//   #9  defensive Record full-shape (Partial<Profile> patch)
//   #17 write-path fieldMap × type-system audit (this commit's core)
//   #18 trust boundary via step sentinel (per-field gating)

// Per-field gating: at which onboardingStep value each Profile field
// becomes "user-set" (matched against the screen that collects it).
// Fields below their threshold are excluded from the patch even if
// the store snapshot carries a non-null value (stale prefill / test
// fixture / regression-induced placeholder).
//
// Service-managed fields (onboardingStep, onboardingStartedAt,
// onboardingVersion, target* PFC cache outputs) are NOT in this
// table — they go through dedicated logic in buildProfilePatch.
const FIELD_STEP_THRESHOLDS = {
  nickname: 2,
  gender: 3,
  birthYear: 3,
  heightCm: 3,
  currentWeightKg: 3,
  activityLevel: 4,
  targetWeightKg: 5,
  weeklyRatePct: 5,
  estimatedTargetDate: 5,
  mealPlan: 6,
  mealTimings: 7,
  proteinFactor: 8,
  weeklyDistribution: 9,
  cheatDays: 9,
} as const;

// Phase A-1 sign-off: v1.3.0 onboarding completes with version=2.
const ONBOARDING_VERSION_V2 = 2;

export interface BuildProfilePatchInput {
  store: OnboardingData;
  existing: Profile | null;
  // Test seam — production callers omit and the helper uses
  // new Date() for the onboardingStartedAt set-once stamp.
  now?: Date;
}

export function buildProfilePatch(
  input: BuildProfilePatchInput,
): Partial<Profile> {
  const { store, existing, now = new Date() } = input;
  const step = store.onboardingStep;
  const patch: Partial<Profile> = {};

  // === Per-field gated assignment ===
  // Each field's threshold lives in FIELD_STEP_THRESHOLDS; we only
  // assign when the user has advanced past the gate. This keeps a
  // partial-state save (e.g. step=3 right after [3] body-info
  // submit) from leaking step >= 4 fields whose values are still
  // INITIAL_STATE placeholders.
  if (step >= FIELD_STEP_THRESHOLDS.nickname) {
    patch.nickname = store.nickname;
  }
  if (step >= FIELD_STEP_THRESHOLDS.gender) {
    patch.gender = store.gender;
    patch.birthYear = store.birthYear;
    patch.heightCm = store.heightCm;
    patch.currentWeightKg = store.currentWeightKg;
  }
  if (step >= FIELD_STEP_THRESHOLDS.activityLevel) {
    patch.activityLevel = store.activityLevel;
  }
  if (step >= FIELD_STEP_THRESHOLDS.targetWeightKg) {
    patch.targetWeightKg = store.targetWeightKg;
    patch.weeklyRatePct = store.weeklyRatePct;
    // estimatedTargetDate boundary: Date → ISO string. The store
    // cache holds Date for in-memory use; persistence requires
    // ISO 8601 UTC per Phase A-1 schema (TEXT, not INTEGER).
    patch.estimatedTargetDate = store.estimatedTargetDate
      ? store.estimatedTargetDate.toISOString()
      : null;
  }
  if (step >= FIELD_STEP_THRESHOLDS.mealPlan) {
    patch.mealPlan = store.mealPlan;
  }
  if (step >= FIELD_STEP_THRESHOLDS.mealTimings) {
    patch.mealTimings = store.mealTimings;
  }
  if (step >= FIELD_STEP_THRESHOLDS.proteinFactor) {
    patch.proteinFactor = store.proteinFactor;
    // PFC cache → persisted target columns. calculateAll only
    // populates these when all v2 inputs are set, so reading them
    // at step >= 8 guarantees they reflect the user's choices.
    if (store.dailyCalorieTarget !== null) {
      patch.targetCalories = store.dailyCalorieTarget;
    }
    if (store.pfcTargets !== null) {
      patch.targetProteinG = store.pfcTargets.protein;
      patch.targetFatG = store.pfcTargets.fat;
      patch.targetCarbG = store.pfcTargets.carbs;
    }
  }
  if (step >= FIELD_STEP_THRESHOLDS.weeklyDistribution) {
    patch.weeklyDistribution = store.weeklyDistribution;
    patch.cheatDays = store.cheatDays;
  }

  // === Service-managed fields ===

  // onboardingStep monotonic max — a screen-back navigation that
  // regresses store.onboardingStep below the existing DB value
  // shouldn't roll the persisted progress back. The user's already-
  // collected data lives in the patch above (gated by the LIVE
  // store value), so the DB step stays at the high-water mark.
  patch.onboardingStep = Math.max(
    existing?.onboardingStep ?? 0,
    store.onboardingStep,
  );

  // onboardingStartedAt: set on first persist, preserve on subsequent
  // calls. existing.onboardingStartedAt being non-null means a prior
  // onboarding run already stamped it; we don't refresh.
  if (existing?.onboardingStartedAt == null) {
    patch.onboardingStartedAt = now.toISOString();
  }

  // onboardingVersion: bump to 2 the first time a v1.3.0 client
  // touches a profile that's still on the Build 14/15 default of 1.
  // Already-v2 profiles don't get a redundant write.
  if ((existing?.onboardingVersion ?? 0) < ONBOARDING_VERSION_V2) {
    patch.onboardingVersion = ONBOARDING_VERSION_V2;
  }

  return patch;
}

export interface PersistToProfileOptions {
  // Test seam for the onboardingStartedAt timestamp. Production
  // callers omit.
  now?: Date;
}

export async function persistToProfile(
  store: OnboardingData,
  profileId: string,
  options: PersistToProfileOptions = {},
): Promise<void> {
  // Pattern 5 — fail-fast on caller misuse. Empty/null profileId is
  // a programmer bug; we throw rather than silently no-op.
  if (!profileId) {
    throw new Error('persistToProfile: profileId is required');
  }
  const existing = await getProfile();
  if (!existing) {
    throw new Error(
      `persistToProfile: no profile found (expected id=${profileId})`,
    );
  }
  if (existing.id !== profileId) {
    throw new Error(
      `persistToProfile: profile id mismatch (expected=${profileId}, actual=${existing.id})`,
    );
  }
  const patch = buildProfilePatch({ store, existing, now: options.now });
  // Empty-patch short-circuit — no fields gated past, nothing to
  // write. The service-managed fields almost always populate at
  // least onboardingStep + onboardingStartedAt, so this branch is
  // mainly a safety net.
  if (Object.keys(patch).length === 0) return;
  await updateProfile(profileId, patch);
}
