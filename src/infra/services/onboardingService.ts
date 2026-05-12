import {
  createProfile,
  getProfile,
  updateProfile,
} from '../repositories/profileRepository';
import type { Profile, ProfileInput, MacroKey } from '../../types/profile';
import type { OnboardingData } from '../../stores/onboardingStore';
import { calculateBMR, calculateTDEE, calculateAge } from '../../domain/calories';
import {
  calculateDailyTarget,
  estimateTargetDate,
  calculatePFCTargetsByMealPlan,
  ONBOARDING_STEP_FULL_INPUT,
} from '../../domain/onboardingCalc';
import { ONBOARDING_VERSION } from '../../constants/onboarding';

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
//
// Codex pass 1 / Phase D-2 sign-off violation fix — every input
// field's threshold = its collecting screen's step number per
// ONBOARDING_ROUTES (src/domain/onboardingSteps.ts:28). The 5
// downstream-of-mealPlan thresholds were originally aligned with
// an earlier route numbering that didn't include the goal-summary
// step (step 6, read-only); inserting it shifted every following
// input by +1, but this table wasn't updated. The pre-fix gap
// meant a returning user with prefilled mealPlan/mealTimings/etc.
// could leak those values into the DB on a step-N persist BEFORE
// reaching the corresponding screen. Each row below now matches
// the route table.
const FIELD_STEP_THRESHOLDS = {
  nickname: 2,        // /nickname
  gender: 3,          // /body-info
  birthYear: 3,       // /body-info
  heightCm: 3,        // /body-info
  currentWeightKg: 3, // /body-info
  activityLevel: 4,   // /activity
  targetWeightKg: 5,  // /goal-weight
  weeklyRatePct: 5,   // /goal-weight
  estimatedTargetDate: 5, // /goal-weight (derived)
  mealPlan: 7,        // /meal-plan (was 6, off by 1)
  mealTimings: 8,     // /meal-timing (was 7, off by 1)
  proteinFactor: 9,   // /protein-target (was 8, off by 1)
  weeklyDistribution: 10, // /weekly-distrib (was 9, off by 1)
  cheatDays: 10,      // /weekly-distrib (was 9, off by 1)
} as const;

// Codex review pass 1 / Important — derive cache values from the
// snapshot at write time rather than reading from store.bmr / tdee /
// dailyCalorieTarget / estimatedTargetDate / pfcTargets. setField
// doesn't invalidate cache; without this layer, the chain
// "calculateAll once → user navigates back → setField changes a calc
// input → persist immediately" would write stale derived values.
// Recomputing here makes correctness a service invariant rather than
// a UI-ordering invariant. Tests pin both the populated-cache match
// and the stale-cache resistance.
//
// Returns null fields when the matching screen hasn't been reached
// (step < 5 → no estimatedTargetDate; step < 8 → no PFC targets);
// callers gate on the presence of values.
interface DerivedSnapshotCache {
  estimatedTargetDateIso: string | null;
  targetCalories: number | null;
  pfcTargets: Record<MacroKey, number> | null;
}

function deriveCacheFromSnapshot(store: OnboardingData): DerivedSnapshotCache {
  let estimatedTargetDateIso: string | null = null;
  let targetCalories: number | null = null;
  let pfcTargets: Record<MacroKey, number> | null = null;

  // step >= 5: estimatedTargetDate from currentWeight + targetWeight + weeklyRatePct
  if (
    store.onboardingStep >= 5 &&
    store.targetWeightKg !== null &&
    store.weeklyRatePct !== null
  ) {
    const { date } = estimateTargetDate({
      currentWeight: store.currentWeightKg,
      targetWeight: store.targetWeightKg,
      weeklyRatePct: store.weeklyRatePct,
    });
    estimatedTargetDateIso = date.toISOString();
  }

  // step >= ONBOARDING_STEP_FULL_INPUT (= 9 post Codex pass 1 / D-2
  // route renumbering): targetCalories + pfcTargets atomically
  // computed together so a stale-cache scenario can't persist only
  // half of the bundle.
  if (
    store.onboardingStep >= ONBOARDING_STEP_FULL_INPUT &&
    store.weeklyRatePct !== null &&
    store.proteinFactor !== null &&
    store.mealPlan !== null
  ) {
    const age = calculateAge(store.birthYear);
    const bmr = Math.round(
      calculateBMR(store.currentWeightKg, store.heightCm, age, store.gender),
    );
    const tdee = calculateTDEE(bmr, store.activityLevel);
    targetCalories = calculateDailyTarget({
      currentWeight: store.currentWeightKg,
      weeklyRatePct: store.weeklyRatePct,
      tdee,
    });
    pfcTargets = calculatePFCTargetsByMealPlan({
      dailyCalorie: targetCalories,
      currentWeight: store.currentWeightKg,
      proteinFactor: store.proteinFactor,
      mealPlan: store.mealPlan,
    });
  }

  return { estimatedTargetDateIso, targetCalories, pfcTargets };
}

// Phase D-8 — terminal step value for the new flow's completion
// screen. Matches ONBOARDING_ROUTES.complete.step. Hardcoded as
// a number rather than imported to avoid pulling the routes
// table into the service layer (the boundary is the screen
// layer's responsibility); kept in sync with onboardingSteps.ts
// by the test `terminal step matches ONBOARDING_ROUTES.complete`.
const TERMINAL_ONBOARDING_STEP = 13;

export interface BuildProfilePatchInput {
  store: OnboardingData;
  existing: Profile | null;
  // Test seam — production callers omit and the helper uses
  // new Date() for the onboardingStartedAt set-once stamp.
  now?: Date;
  // Phase D-8 — when true, terminalize the patch:
  // onboardingCompleted=true + onboardingStep>=TERMINAL_ONBOARDING_STEP.
  // Caller is createProfileFromOnboarding wrapper signaling "this
  // is the final save"; intermediate per-screen persists omit
  // (default false) so a back-nav round-trip never flips the
  // completion flag prematurely.
  markCompleted?: boolean;
}

export function buildProfilePatch(
  input: BuildProfilePatchInput,
): Partial<Profile> {
  const { store, existing, now = new Date(), markCompleted = false } = input;
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
  // Codex review pass 1 / Important — derive estimatedTargetDate +
  // PFC bundle from the snapshot at write time, not from the
  // (potentially stale) store cache. See deriveCacheFromSnapshot
  // header for rationale.
  const derived = deriveCacheFromSnapshot(store);

  if (step >= FIELD_STEP_THRESHOLDS.targetWeightKg) {
    patch.targetWeightKg = store.targetWeightKg;
    patch.weeklyRatePct = store.weeklyRatePct;
    // estimatedTargetDate boundary: Date → ISO string. Phase A-1
    // schema is TEXT (not INTEGER); parseDateOrNull on the read
    // side already expects ISO. Always write a value at step >= 5:
    // null when targetWeightKg / weeklyRatePct aren't set yet
    // (the screen submit still triggers a write to record progress).
    patch.estimatedTargetDate = derived.estimatedTargetDateIso;
  }
  if (step >= FIELD_STEP_THRESHOLDS.mealPlan) {
    patch.mealPlan = store.mealPlan;
  }
  if (step >= FIELD_STEP_THRESHOLDS.mealTimings) {
    patch.mealTimings = store.mealTimings;
  }
  if (step >= FIELD_STEP_THRESHOLDS.proteinFactor) {
    patch.proteinFactor = store.proteinFactor;
    // PFC bundle persisted ATOMICALLY — both null or both populated.
    // deriveCacheFromSnapshot only emits non-null values when every
    // input is set, so a partial bundle (targetCalories without
    // pfcTargets) can't slip through.
    if (derived.targetCalories !== null && derived.pfcTargets !== null) {
      patch.targetCalories = derived.targetCalories;
      patch.targetProteinG = derived.pfcTargets.protein;
      patch.targetFatG = derived.pfcTargets.fat;
      patch.targetCarbG = derived.pfcTargets.carbs;
    }
  }
  if (step >= FIELD_STEP_THRESHOLDS.weeklyDistribution) {
    patch.weeklyDistribution = store.weeklyDistribution;
    // Phase D-5 / Codex pass 1 Important fix — enforce the
    // composite invariant at the persistence boundary, not just
    // the screen:
    //   - When distribution === 'even', cheatDays MUST be null
    //     (the array is meaningless without cheat_days mode).
    //   - cheatDays cap (CHEAT_DAYS_MAX = 3) is enforced by
    //     truncating to the first N canonical-sorted entries
    //     rather than silently writing an oversize array.
    // Defense-in-depth: a prefill / test / future-caller path
    // that bypasses the screen's UI cap can't leak unreachable
    // state into the DB.
    if (store.weeklyDistribution === 'even') {
      patch.cheatDays = null;
    } else if (store.cheatDays != null && store.cheatDays.length > 3) {
      patch.cheatDays = store.cheatDays.slice(0, 3);
    } else {
      patch.cheatDays = store.cheatDays;
    }
  }

  // === Service-managed fields ===

  // onboardingStep monotonic max — a screen-back navigation that
  // regresses store.onboardingStep below the existing DB value
  // shouldn't roll the persisted progress back. The user's already-
  // collected data lives in the patch above (gated by the LIVE
  // store value), so the DB step stays at the high-water mark.
  //
  // Phase D-8 / Codex pass 1 — when markCompleted is true (terminal
  // save from createProfileFromOnboarding), include
  // TERMINAL_ONBOARDING_STEP in the max so the persisted step
  // reaches the route table's complete value (13). Without this
  // the DB landed at step 12 (from /progress-preview) while the
  // in-memory store advanced to 13.
  const stepCandidates = [
    existing?.onboardingStep ?? 0,
    store.onboardingStep,
  ];
  if (markCompleted) {
    stepCandidates.push(TERMINAL_ONBOARDING_STEP);
  }
  patch.onboardingStep = Math.max(...stepCandidates);

  // Phase D-8 / Codex pass 1 — onboardingCompleted is the terminal
  // boolean the rest of the app reads (app/index.tsx routes
  // !onboardingCompleted users back into onboarding). buildProfilePatch
  // intentionally only writes this when markCompleted is true so
  // intermediate per-screen persists never flip the flag.
  if (markCompleted) {
    patch.onboardingCompleted = true;
  }

  // onboardingStartedAt: set on first persist, preserve on subsequent
  // calls. existing.onboardingStartedAt being non-null means a prior
  // onboarding run already stamped it; we don't refresh.
  if (existing?.onboardingStartedAt == null) {
    patch.onboardingStartedAt = now.toISOString();
  }

  // onboardingVersion: bump to 2 the first time a v1.3.0 client
  // touches a profile that's still on the Build 14/15 default of 1.
  // Already-v2 profiles don't get a redundant write.
  if ((existing?.onboardingVersion ?? 0) < ONBOARDING_VERSION) {
    patch.onboardingVersion = ONBOARDING_VERSION;
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

// =============================================================================
// createProfileFromOnboarding — Phase D-8 baseline simplification
// =============================================================================
//
// Single service call that persists a completed onboarding flow into the
// profile table. Replaces the C-2..D-7 accumulated complete.tsx logic
// (legacy createProfile + 8 conditional patches + hydratedProfile mirror)
// with a clean two-step composition:
//
//   1. createProfile(legacyInput) — writes the legacy columns that the
//      v30 schema's INSERT statement requires (gender / birthYear /
//      heightCm / currentWeightKg / activityLevel / trainingDaysPerWeek /
//      goalType / equipment / targetWeightKg / targetBodyFatPct /
//      targetDate / displayName).
//   2. updateProfile(profile.id, buildProfilePatch(store, existing)) —
//      atomically applies every v2 field gated by FIELD_STEP_THRESHOLDS
//      (nickname / weeklyRatePct / mealPlan / mealTimings / proteinFactor
//      / weeklyDistribution / cheatDays / estimatedTargetDate / PFC
//      bundle / service-managed onboardingStep+startedAt+version).
//
// Pattern 24 derived bundle atomicity — both writes are awaited
// sequentially in this single function so callers can't observe a
// half-persisted profile. createProfile + updateProfile are NOT in a
// SQLite transaction today (their existing signatures don't share one),
// but the second call is idempotent against any half-state from the
// first because updateProfile is a partial UPDATE.
//
// Pattern 18 SSoT — buildProfilePatch is the single source of truth
// for which v2 fields persist at which step. complete.tsx had a copy
// of that logic spread across 8 conditional blocks; this wrapper
// delegates back to the canonical helper.
//
// displayName extraction policy: legacy createProfile requires a
// non-empty displayName (it's a NOT NULL column on the v30 schema).
// The new flow doesn't collect displayName explicitly — it collects
// `nickname` (warm copy). Caller supplies displayName separately
// (e.g., email-prefix fallback from useAuthStore); the wrapper doesn't
// hardcode that decision since auth state isn't visible at the
// service layer.

export interface CreateProfileFromOnboardingInput {
  store: OnboardingData;
  // Legacy displayName fallback — caller derives from auth user.
  // Required by the NOT NULL column on profiles.display_name. The
  // post-onboarding profile.displayName + profile.nickname remain
  // distinct fields (kickoff §6.2 sign-off (i)).
  displayName: string;
  // Test seam — production callers omit and the helper uses
  // new Date() for the onboardingStartedAt set-once stamp.
  now?: Date;
}

export async function createProfileFromOnboarding(
  input: CreateProfileFromOnboardingInput,
): Promise<Profile> {
  const { store, displayName, now } = input;

  // Pattern 5 — fail-fast on missing required legacy inputs. These
  // are populated by C-3 + C-4 + C-5 screens before the user can
  // reach the complete screen; an empty value here is a regression
  // upstream (e.g., a deep-link arrival that bypassed onboarding).
  if (!displayName) {
    throw new Error('createProfileFromOnboarding: displayName is required');
  }
  if (
    !store.gender ||
    !Number.isFinite(store.birthYear) ||
    !Number.isFinite(store.heightCm) ||
    !Number.isFinite(store.currentWeightKg) ||
    !store.activityLevel ||
    !store.goalType ||
    !store.equipment
  ) {
    throw new Error(
      'createProfileFromOnboarding: required legacy inputs missing from store',
    );
  }

  const legacyInput: ProfileInput = {
    displayName,
    gender: store.gender,
    birthYear: store.birthYear,
    heightCm: store.heightCm,
    currentWeightKg: store.currentWeightKg,
    targetWeightKg: store.targetWeightKg,
    targetBodyFatPct: store.targetBodyFatPct,
    goalType: store.goalType,
    activityLevel: store.activityLevel,
    trainingDaysPerWeek: store.trainingDaysPerWeek,
    targetDate: store.targetDate,
    equipment: store.equipment,
  };

  // Phase D-8 / Codex pass 1 Critical fix — orphan-row defense.
  // The screen's retry path resets its idempotency guard and
  // re-fires the wrapper. Without this pre-check, a partial
  // success (createProfile inserted row A, updateProfile threw)
  // would, on retry, call createProfile AGAIN with a fresh id
  // and produce row B. getProfile()'s SELECT ... LIMIT 1 (no
  // id targeting) could then return either row. Pre-checking
  // for an existing profile makes the wrapper idempotent at
  // the row-insert level: first call creates+patches, retry
  // detects the existing row and re-patches (idempotent for
  // unchanged store values).
  const preExisting = await getProfile();
  const profile = preExisting ?? (await createProfile(legacyInput));

  // Step 2 — atomically patch every v2 field gated by step
  // thresholds + terminalize completion (markCompleted: true).
  // Passing the just-created profile as `existing` ensures
  // buildProfilePatch can read its onboardingStep /
  // onboardingStartedAt baseline (set-once stamp + monotonic
  // step max both work off existing.* values).
  const patch = buildProfilePatch({
    store,
    existing: profile,
    now,
    markCompleted: true,
  });
  if (Object.keys(patch).length > 0) {
    await updateProfile(profile.id, patch);
  }

  // Re-read so the returned Profile reflects both legacy + v2
  // columns. getProfile is the boundary that hydrates JSON arrays
  // + ISO dates correctly per Phase A-1 schema mirror.
  const hydrated = await getProfile();
  if (!hydrated) {
    throw new Error(
      'createProfileFromOnboarding: profile not found after insert',
    );
  }
  return hydrated;
}
