import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { useProfileStore } from '../../src/stores/profileStore';
import { useAuthStore } from '../../src/stores/authStore';
import { createProfileFromOnboarding } from '../../src/infra/services/onboardingService';
import {
  syncNotifications,
  loadNotificationSettings,
} from '../../src/infra/services/notificationService';
import { findEarliestInvalidRoute } from '../../src/domain/goalSummaryAggregator';

// v1.3.0 / Onboarding v2 / Phase D-8 — Complete screen [12].
//
// Architectural baseline simplification — the pre-D-8 file was
// ~536 lines with 8 conditional preservation patches accumulated
// across C-2 / C-5 / D-2 / D-3 / D-4 / D-5 / D-7 (one per v2
// field that the legacy createProfile path didn't accept). Each
// patch had a sibling spread in hydratedProfile. The whole thing
// duplicated logic that buildProfilePatch already owned.
//
// Post-rewrite the screen is a thin status-driven view: mount-
// time call to createProfileFromOnboarding wrapper (which composes
// createProfile + buildProfilePatch via updateProfile in a single
// service call), then redirect to /(tabs)/home on success or
// render a retry surface on error. Pattern 26 facet 1 + facet 3
// conditional logic is fully reverted; buildProfilePatch is the
// SSoT for v2 field persistence (Pattern 18).
//
// Patterns applied:
//   #5  mount sanity (findEarliestInvalidRoute redirect) + service-
//       call idempotency (useRef guard against StrictMode double-
//       mount + retry-loop double-fire)
//   #18 SSoT — createProfileFromOnboarding owns the persistence
//       composition; complete.tsx doesn't compute or patch
//   #22 monotonic step bump to 13 (terminal step) via setField
//       on success
//   #24 derived bundle atomicity — buildProfilePatch writes the
//       PFC bundle + estimatedTargetDate as part of the service
//       composition; the screen never reads or mirrors them
//   #25 logic in service / domain layers; screen is render-only
//       orchestration

type CompletionStatus = 'idle' | 'pending' | 'success' | 'error';

export default function CompleteScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const onboarding = useOnboardingStore();
  const setProfile = useProfileStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);

  const [status, setStatus] = useState<CompletionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasRun = useRef(false);

  const runCompletion = useCallback(async () => {
    if (hasRun.current) return;
    hasRun.current = true;
    setStatus('pending');
    setErrorMessage(null);

    // Mount sanity — if any prior input is invalid, route to the
    // earliest screen owning that input rather than letting the
    // service throw a less-actionable error. D-1 / D-6 / D-7
    // precedent.
    const earliestInvalid =
      onboarding.targetWeightKg == null || onboarding.weeklyRatePct == null
        ? '/(onboarding)/goal-weight'
        : findEarliestInvalidRoute({
            gender: onboarding.gender,
            birthYear: onboarding.birthYear,
            heightCm: onboarding.heightCm,
            currentWeightKg: onboarding.currentWeightKg,
            activityLevel: onboarding.activityLevel,
            trainingDaysPerWeek: onboarding.trainingDaysPerWeek,
            targetWeightKg: onboarding.targetWeightKg,
            goalType: onboarding.goalType,
            weeklyRatePct: onboarding.weeklyRatePct,
            proteinFactor: onboarding.proteinFactor,
          });
    if (earliestInvalid) {
      hasRun.current = false; // allow retry after upstream fix
      router.replace(earliestInvalid);
      return;
    }

    // displayName derives from auth user (email prefix); not
    // collected explicitly by the onboarding flow. nickname
    // (warm v2 copy) is collected separately on C-2 and flows
    // through buildProfilePatch.
    const displayName = user?.email
      ? user.email.split('@')[0]
      : 'ユーザー';

    try {
      // The wrapper handles both v2-field persistence AND the
      // terminal markers (onboardingCompleted: true + step=13)
      // via buildProfilePatch's markCompleted path. The returned
      // profile already reflects those terminal values, so the
      // in-memory setProfile is a direct passthrough.
      const profile = await createProfileFromOnboarding({
        store: onboarding,
        displayName,
      });
      // Sync to profile store so the rest of the app reads the
      // fresh profile without waiting for a DB round-trip.
      setProfile(profile);
      // Fire-and-forget notification scheduling — never block
      // home entry on notification setup. The existing service
      // logs internally.
      void (async () => {
        try {
          const settings = await loadNotificationSettings();
          await syncNotifications({ settings, profile });
        } catch (notifErr) {
          console.warn('[onboarding/complete] notification sync failed', notifErr);
        }
      })();
      setStatus('success');
      // Brief success display, then home redirect.
      setTimeout(() => {
        router.replace('/(tabs)/home');
      }, 1500);
    } catch (err) {
      console.error('[onboarding/complete] createProfileFromOnboarding failed', err);
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'プロフィール作成に失敗しました',
      );
      // Allow the retry button to re-fire by resetting the guard.
      hasRun.current = false;
    }
  }, [onboarding, setProfile, user]);

  useEffect(() => {
    void runCompletion();
    // Intentionally fire only once on mount. The useRef guard
    // above defends against React StrictMode double-mount; the
    // error retry path manually resets the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {(status === 'idle' || status === 'pending') && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              プランを作成しています...
            </Text>
          </View>
        )}

        {status === 'success' && (
          <View style={styles.center}>
            <View
              style={[
                styles.checkCircle,
                { backgroundColor: colors.success + '15' },
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={64}
                color={colors.success}
              />
            </View>
            <Text style={[styles.successTitle, { color: colors.textPrimary }]}>
              準備完了！
            </Text>
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              あなた専用のプランが作成されました
            </Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.center}>
            <View
              style={[
                styles.checkCircle,
                { backgroundColor: colors.error + '15' },
              ]}
            >
              <Ionicons
                name="alert-circle"
                size={64}
                color={colors.error}
              />
            </View>
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
              保存に失敗しました
            </Text>
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {errorMessage ?? '時間をおいて再度お試しください'}
            </Text>
            <View style={styles.retryRow}>
              <Button
                title="再試行"
                onPress={runCompletion}
                variant="primary"
                size="lg"
                fullWidth
                testID="complete-retry"
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    gap: spacing.md,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    ...typography.titleLarge,
  },
  errorTitle: {
    ...typography.titleLarge,
  },
  statusText: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  retryRow: {
    width: '100%',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
});
