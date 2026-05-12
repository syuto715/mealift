// v1.3.0 / Onboarding v2 / Phase E-4 — v1-migration UX gate tests.
//
// Pins the false-positive defense for isV1MigrationUser: the
// welcome-screen migration notice must NOT show for first-time
// users, mid-flow users, or already-v2 returning users — only
// for v1 users actively forced through re-onboarding via the
// index.tsx Option A version gate.

import { isV1MigrationUser } from '../onboardingMigration';
import { ONBOARDING_VERSION } from '../../constants/onboarding';
import type { Profile } from '../../types/profile';

// Minimal Profile fixture. The helper only reads two fields
// (onboardingCompleted + onboardingVersion); other columns are
// stubbed to satisfy the type.
function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    supabaseUid: null,
    displayName: 'X',
    gender: 'male',
    birthYear: 1995,
    heightCm: 170,
    currentWeightKg: 70,
    targetWeightKg: null,
    targetBodyFatPct: null,
    goalType: 'cut',
    activityLevel: 'moderate',
    trainingDaysPerWeek: 3,
    targetDate: null,
    equipment: 'gym',
    targetCalories: null,
    targetProteinG: null,
    targetFatG: null,
    targetCarbG: null,
    onboardingCompleted: true,
    adaptiveGoalEnabled: true,
    adaptiveGoalSensitivity: 'standard',
    adaptiveGoalLastShownAt: null,
    dailyWaterTargetMl: 2500,
    onboardingVersion: 1,
    trialStartedAt: null,
    planBillingCycle: null,
    planExpiresAt: null,
    notificationsSubmissionEnabled: true,
    plateStepKg: 2.5,
    nickname: null,
    weeklyRatePct: null,
    mealPlan: null,
    mealTimings: null,
    proteinFactor: null,
    weeklyDistribution: null,
    cheatDays: null,
    onboardingStep: 0,
    onboardingStartedAt: null,
    estimatedTargetDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isV1MigrationUser', () => {
  describe('true case — actual v1 migration', () => {
    it('returns true when completed=true + version=1 (canonical v1 user)', () => {
      const profile = makeProfile({
        onboardingCompleted: true,
        onboardingVersion: 1,
      });
      expect(isV1MigrationUser(profile)).toBe(true);
    });

    it('returns true for any version below ONBOARDING_VERSION (forward-proof for v3+)', () => {
      // If SSoT ever bumps to 3, a v1 OR v2 user becomes a migration
      // candidate. Helper is < ONBOARDING_VERSION, not =1, so this
      // generalizes correctly.
      const profile = makeProfile({
        onboardingCompleted: true,
        onboardingVersion: 0, // synthetic pre-v1 row
      });
      expect(isV1MigrationUser(profile)).toBe(true);
    });
  });

  describe('false case — false-positive defense', () => {
    it('returns false when profile is null (first-time user, no row)', () => {
      // Critical: a new user with no profile yet would see the
      // "your data is preserved" notice, which is a lie. Hard
      // false on null.
      expect(isV1MigrationUser(null)).toBe(false);
    });

    it('returns false when onboardingCompleted=false + version=1 (mid-flow v1)', () => {
      // A v1 user who started but never finished v1 onboarding —
      // there's no "completed flow to migrate from", so the
      // reassurance copy doesn't apply.
      const profile = makeProfile({
        onboardingCompleted: false,
        onboardingVersion: 1,
      });
      expect(isV1MigrationUser(profile)).toBe(false);
    });

    it('returns false when onboardingCompleted=false + version=2 (mid-flow v2)', () => {
      // Current-version user mid-flow → not migration.
      const profile = makeProfile({
        onboardingCompleted: false,
        onboardingVersion: ONBOARDING_VERSION,
      });
      expect(isV1MigrationUser(profile)).toBe(false);
    });

    it('returns false when completed=true + version=ONBOARDING_VERSION (already on current)', () => {
      // Standard returning v2 user who passed the index.tsx
      // version gate to /(tabs) on previous boot. Should never see
      // the notice. (The version gate routes them past welcome
      // entirely, so this path is defensive but pinned.)
      const profile = makeProfile({
        onboardingCompleted: true,
        onboardingVersion: ONBOARDING_VERSION,
      });
      expect(isV1MigrationUser(profile)).toBe(false);
    });

    it('returns false when version > ONBOARDING_VERSION (downgrade path)', () => {
      // Defensive: a future client wrote v3 then the user downgraded
      // to this v2 client. Don't show migration notice — the user
      // is "ahead", not behind.
      const profile = makeProfile({
        onboardingCompleted: true,
        onboardingVersion: ONBOARDING_VERSION + 1,
      });
      expect(isV1MigrationUser(profile)).toBe(false);
    });

    it('returns false when version is NaN (corrupted row defense)', () => {
      // A NaN onboardingVersion would naively satisfy `< ONBOARDING_VERSION`
      // as false (NaN comparisons are always false), so the early-
      // return path is needed. Pin so a future refactor that drops
      // the Number.isFinite check surfaces here.
      const profile = makeProfile({
        onboardingCompleted: true,
        onboardingVersion: NaN,
      });
      expect(isV1MigrationUser(profile)).toBe(false);
    });
  });

  describe('SSoT cross-check', () => {
    it('decision pivots on src/constants/onboarding.ts ONBOARDING_VERSION', () => {
      // Sanity pin so a refactor that hardcodes "2" instead of
      // reading the constant surfaces here. If ONBOARDING_VERSION
      // ever bumps to 3, this test catches a stale literal.
      const justBelow = makeProfile({
        onboardingCompleted: true,
        onboardingVersion: ONBOARDING_VERSION - 1,
      });
      const atVersion = makeProfile({
        onboardingCompleted: true,
        onboardingVersion: ONBOARDING_VERSION,
      });
      expect(isV1MigrationUser(justBelow)).toBe(true);
      expect(isV1MigrationUser(atVersion)).toBe(false);
    });
  });
});
