import { useEffect, useState, useRef } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { getColors } from '../src/theme/tokens';
import { useAuthStore } from '../src/stores/authStore';
import { useProfileStore } from '../src/stores/profileStore';
import { getProfile } from '../src/infra/repositories/profileRepository';
import { applyRetroactiveTrialGrantOnce } from '../src/infra/services/planMigrationService';
import {
  syncNotifications,
  loadNotificationSettings,
} from '../src/infra/services/notificationService';

const ROUTING_TIMEOUT_MS = 8000;

export default function IndexScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setProfile = useProfileStore((s) => s.setProfile);
  const [profileChecked, setProfileChecked] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const hasNavigated = useRef(false);

  // Safety timeout: if routing hasn't happened after 8s, force navigate to login
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        try {
          router.replace('/(auth)/login');
        } catch {
          // Navigation failed — nothing more we can do
        }
      }
    }, ROUTING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Load profile from SQLite once auth resolves
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      setProfileChecked(true);
      return;
    }

    async function loadProfile() {
      try {
        const profile = await getProfile();
        if (profile) {
          // Retroactive trial grant: users who onboarded before the billing
          // system shipped get a fresh 7-day Plus trial on next launch.
          const hydrated =
            (await applyRetroactiveTrialGrantOnce(profile)) ?? profile;
          setProfile(hydrated);
          setOnboardingCompleted(hydrated.onboardingCompleted);
          // Re-sync notifications now that we have a profile. The version-
          // gated guard in syncNotifications linearises this with any other
          // concurrent caller so last-write-wins is deterministic.
          const settings = await loadNotificationSettings();
          void syncNotifications({ settings, profile: hydrated });
        }
      } catch (error) {
        // Profile load failed — treat as no profile, proceed to onboarding
      }
      setProfileChecked(true);
    }

    loadProfile();
  }, [isLoading, isAuthenticated, setProfile]);

  // Navigate once both auth and profile are resolved
  useEffect(() => {
    if (isLoading || !profileChecked || hasNavigated.current) return;

    hasNavigated.current = true;
    try {
      if (!isAuthenticated) {
        router.replace('/(auth)/login');
      } else if (!onboardingCompleted) {
        router.replace('/(onboarding)/welcome');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      // Last resort: try to get to login
      try {
        router.replace('/(auth)/login');
      } catch {
        // Nothing more we can do
      }
    }
  }, [isLoading, profileChecked, isAuthenticated, onboardingCompleted]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
