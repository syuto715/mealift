import { useEffect, useState, useCallback, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import {
  initialize as initializeRevenueCat,
  identifyUser as identifyRevenueCatUser,
  logOut as logOutRevenueCat,
  addCustomerInfoListener,
  applyCustomerInfoToProfile,
  getCustomerInfo as getRevenueCatCustomerInfo,
} from '../src/infra/services/revenueCatService';
import { runLoginSync } from '../src/infra/sync/loginSyncBootstrap';

SplashScreen.preventAutoHideAsync();

// Single shared QueryClient for the app. HealthKit reads are the first
// consumer — modest staleTime keeps today's calories fresh without over-
// fetching when the user navigates between tabs.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
    let rcUnsubscribe: (() => void) | undefined;

    async function initialize() {
      try {
        // Initialize database (may fail on some Android devices)
        try {
          await getDatabase();
        } catch (dbError) {
          // Continue without DB — app can still show login screen
        }

        // Initialize RevenueCat (iOS-only, no-op on Android/missing API key).
        // Safe before login: anonymous appUserID is upgraded on identifyUser().
        try {
          initializeRevenueCat();
          rcUnsubscribe = addCustomerInfoListener((info) => {
            void applyCustomerInfoToProfile(info);
          });
        } catch {
          // RC failures must not block app boot.
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
              // Tie RevenueCat appUserID to the Supabase user so purchases
              // follow the account across devices.
              void (async () => {
                try {
                  await identifyRevenueCatUser(data.session!.user.id);
                  const info = await getRevenueCatCustomerInfo();
                  await applyCustomerInfoToProfile(info);
                } catch {
                  // Non-fatal — plan state falls back to local defaults.
                }
              })();
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
          const { data } = onAuthStateChange((event, session) => {
            if (session && typeof session === 'object' && 'user' in session) {
              const user = (
                session as { user: { id: string; email?: string } }
              ).user;
              setAuthenticated(user.id, user.email ?? undefined);
              void identifyRevenueCatUser(user.id).then(async () => {
                const info = await getRevenueCatCustomerInfo();
                await applyCustomerInfoToProfile(info);
              });
              // SIGNED_IN only — TOKEN_REFRESHED / INITIAL_SESSION /
              // USER_UPDATED don't trigger a sync run. Re-entry while a
              // run is already going gets dropped by runLoginSync's
              // mutex; surfaced errors land in syncStatusStore.lastError.
              if (event === 'SIGNED_IN') {
                void runLoginSync(user.id);
              }
            } else if (!useAuthStore.getState().isLocalOnly) {
              setUnauthenticated();
              void logOutRevenueCat();
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
      rcUnsubscribe?.();
    };
  }, []);

  // Hide splash as soon as appReady becomes true (backup for onLayout not firing on Android)
  useEffect(() => {
    if (appReady && !splashHidden.current) {
      splashHidden.current = true;
      hideSplash();
    }
  }, [appReady]);

  // Deep-link handler for the email-confirmation callback
  // (`mealift://auth/callback?code=…`). Routes to /auth/callback which
  // calls supabase.auth.exchangeCodeForSession. The route lives at
  // app/auth/callback.tsx (NOT inside the (auth) group — parentheses
  // segments strip from the URL, which would resolve to /callback and
  // mismatch the deep link). Handles both cold start (getInitialURL)
  // and warm foreground (addEventListener); also redundant with
  // expo-router's auto-routing now that the path matches the file
  // tree, but kept as a defense for cold-start edge cases.
  useEffect(() => {
    if (!appReady) return;

    const route = (url: string | null) => {
      if (!url) return;
      const { path, queryParams } = Linking.parse(url);
      if (path !== 'auth/callback') return;
      router.replace({
        pathname: '/auth/callback',
        params: (queryParams ?? {}) as Record<string, string>,
      });
    };

    Linking.getInitialURL().then(route).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => route(url));
    return () => sub.remove();
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
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
