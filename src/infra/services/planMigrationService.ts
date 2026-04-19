import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../../types/profile';
import {
  getProfile,
  startTrial,
} from '../repositories/profileRepository';
import { scheduleTrialNotifications } from './notificationService';

// One-shot retroactive migration that grants the 7-day Plus trial to any
// user who already completed onboarding before the billing system launched.
//
// Gating strategy:
//   - AsyncStorage marker `plan_migration_applied_version` pinned to the
//     version string below. A bump forces every device to re-run the check.
//   - Idempotent at the DB level too: startTrial() only writes when
//     trial_started_at IS NULL, so even if the marker is lost the trial
//     cannot be granted twice.
//
// Returned value: the (possibly refreshed) profile so callers can push it
// into the profile store without a second DB read.

const MIGRATION_VERSION = 'v1-2026-04';
const MIGRATION_KEY = 'plan_migration_applied_version';

export async function applyRetroactiveTrialGrantOnce(
  profile: Profile | null,
): Promise<Profile | null> {
  if (!profile) return profile;

  let marker: string | null = null;
  try {
    marker = await AsyncStorage.getItem(MIGRATION_KEY);
  } catch {
    // AsyncStorage unavailable — skip, a later launch can try again.
    return profile;
  }

  if (marker === MIGRATION_VERSION) return profile;

  // Only grant a trial to users who completed onboarding but never received
  // one. New users run startTrial via the onboarding complete screen instead.
  if (profile.onboardingCompleted && !profile.trialStartedAt) {
    const trialStartedAt = new Date().toISOString();
    try {
      await startTrial(profile.id, trialStartedAt);
    } catch {
      // DB write failed — bail without setting the marker so we retry later.
      return profile;
    }

    // Refresh from DB so the caller has authoritative state for the store.
    let refreshed: Profile | null = profile;
    try {
      refreshed = (await getProfile()) ?? profile;
    } catch {
      refreshed = { ...profile, trialStartedAt };
    }

    void scheduleTrialNotifications(refreshed);

    try {
      await AsyncStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
    } catch {
      // Non-fatal — idempotent DB check will prevent duplicate grants next time.
    }

    return refreshed;
  }

  try {
    await AsyncStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
  } catch {
    // ignore
  }
  return profile;
}
