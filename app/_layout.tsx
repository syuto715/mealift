import { useEffect, useState, useCallback, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { getColors } from '../src/theme/tokens';
import { getDatabase } from '../src/infra/database/connection';
import { useAuthStore } from '../src/stores/authStore';
import {
  getSession,
  onAuthStateChange,
  isSupabaseConfigured,
} from '../src/infra/supabase/auth';
import { Toast } from '../src/components/ui';
import { useUIStore } from '../src/stores/uiStore';
import { bootstrapNotifications } from '../src/infra/services/notificationService';

SplashScreen.preventAutoHideAsync();

const SPLASH_TIMEOUT_MS = 5000;

function hideSplash() {
  try {
    SplashScreen.hideAsync();
  } catch {
    // hideAsync can throw if already hidden — safe to ignore
  }
}

export default function RootLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const setUnauthenticated = useAuthStore((s) => s.setUnauthenticated);
  const setLoading = useAuthStore((s) => s.setLoading);
  const isLocalOnly = useAuthStore((s) => s.isLocalOnly);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const toastMessage = useUIStore((s) => s.toastMessage);
  const toastType = useUIStore((s) => s.toastType);
  const hideToast = useUIStore((s) => s.hideToast);

  const [appReady, setAppReady] = useState(false);
  const splashHidden = useRef(false);

  // Safety timeout: force-hide splash screen after 5 seconds no matter what
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!splashHidden.current) {
        splashHidden.current = true;
        hideSplash();
        setAppReady(true);
        setUnauthenticated();
      }
    }, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let authUnsubscribe: (() => void) | undefined;

    async function initialize() {
      try {
        // Initialize database (may fail on some Android devices)
        try {
          await getDatabase();
        } catch (dbError) {
          // Continue without DB — app can still show login screen
        }

        // Initialize notifications (single-shot across re-mounts). Passes
        // null profile; app/index.tsx re-runs syncNotifications with the
        // hydrated profile once it's loaded from the DB.
        try {
          await bootstrapNotifications(null);
        } catch (notifError) {
        }

        // Initialize auth state
        if (isSupabaseConfigured && !isLocalOnly) {
          try {
            const { data } = await getSession();
            if (data.session?.user) {
              setAuthenticated(
                data.session.user.id,
                data.session.user.email ?? undefined,
              );
            } else if (!isAuthenticated) {
              setUnauthenticated();
            }
          } catch {
            if (!isAuthenticated) {
              setUnauthenticated();
            }
          }
        } else if (!isAuthenticated) {
          // No Supabase configured and not already authenticated
          setUnauthenticated();
        } else {
          // Already authenticated (persisted local mode or Supabase session)
          setLoading(false);
        }

        // Listen for auth state changes
        try {
          const { data } = onAuthStateChange((_event, session) => {
            if (session && typeof session === 'object' && 'user' in session) {
              const user = (
                session as { user: { id: string; email?: string } }
              ).user;
              setAuthenticated(user.id, user.email ?? undefined);
            } else if (!useAuthStore.getState().isLocalOnly) {
              setUnauthenticated();
            }
          });
          authUnsubscribe = data.subscription.unsubscribe;
        } catch {
          // Auth listener setup failed — non-fatal
        }
      } catch {
        setUnauthenticated();
      } finally {
        setAppReady(true);
      }
    }

    initialize();

    return () => {
      authUnsubscribe?.();
    };
  }, []);

  // Hide splash as soon as appReady becomes true (backup for onLayout not firing on Android)
  useEffect(() => {
    if (appReady && !splashHidden.current) {
      splashHidden.current = true;
      hideSplash();
    }
  }, [appReady]);

  const onLayoutReady = useCallback(() => {
    if (appReady && !splashHidden.current) {
      splashHidden.current = true;
      hideSplash();
    }
  }, [appReady]);

  if (!appReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutReady}>
      <SafeAreaProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            headerBackTitle: '戻る',
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        {toastMessage && toastType && (
          <Toast
            message={toastMessage}
            type={toastType}
            visible={true}
            onHide={hideToast}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
