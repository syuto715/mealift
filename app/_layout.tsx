import { useEffect, useState, useCallback, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, useColorScheme } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getColors } from '../src/theme/tokens';
import { getDatabase } from '../src/infra/database/connection';
import { useAuthStore } from '../src/stores/authStore';
import {
  getSession,
  onAuthStateChange,
  isSupabaseConfigured,
} from '../src/infra/supabase/auth';
import { supabase } from '../src/infra/supabase/client';
import { bootstrapAuthSession } from '../src/infra/auth/authBootstrap';
import { makeAuthListener } from '../src/infra/auth/authListener';
import { buildAuthListenerDeps } from '../src/infra/auth/buildAuthListenerDeps';
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
import { decideNotificationRoute } from '../src/utils/notificationRouting';

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

        // Initialize auth state. The branch logic (Supabase vs
        // local-only, session present vs not, isAuthenticated
        // persisted state) lives in `bootstrapAuthSession` so it's
        // unit-testable in isolation (Phase 5.2B). The RevenueCat
        // tie-in stays here because it depends on lifecycle-scoped
        // state (cleanup ref) that doesn't belong in the pure helper.
        await bootstrapAuthSession(
          isSupabaseConfigured,
          isLocalOnly,
          isAuthenticated,
          getSession,
          {
            setAuthenticated: (uid, email) => {
              setAuthenticated(uid, email);
              // Tie RevenueCat appUserID to the Supabase user so
              // purchases follow the account across devices.
              void (async () => {
                try {
                  await identifyRevenueCatUser(uid);
                  const info = await getRevenueCatCustomerInfo();
                  await applyCustomerInfoToProfile(info);
                } catch {
                  // Non-fatal — plan state falls back to local defaults.
                }
              })();
            },
            setUnauthenticated,
            setLoading,
          },
        );

        // v1.4 ステージ 5.3 — onAuthStateChange listener via the
        // makeAuthListener factory (Stage 5.2). The factory owns the
        // pure decision tree (SIGNED_IN / SIGNED_OUT / probe-recover);
        // buildAuthListenerDeps owns the option γ wiring:
        //   - identifyRevenueCatUser fires inside the setAuthenticated
        //     wrapper, on every session-bearing event (matching the
        //     pre-5.3 inline listener exactly)
        //   - the factory's identifyRC dep is a no-op so SIGNED_IN
        //     doesn't double-fire RC
        //   - logOutRevenueCat fires inside the setUnauthenticated
        //     wrapper
        // See src/infra/auth/buildAuthListenerDeps.ts for the
        // rationale + Pattern 18 facet 11 commentary.
        try {
          const listener = makeAuthListener(
            buildAuthListenerDeps({
              setAuthenticated,
              setUnauthenticated,
              identifyRevenueCatUser,
              applyCustomerInfoToProfile,
              getRevenueCatCustomerInfo,
              logOutRevenueCat,
              runLoginSync,
              getIsLocalOnly: () => useAuthStore.getState().isLocalOnly,
              getIsAuthenticated: () => useAuthStore.getState().isAuthenticated,
              supabaseClient: supabase,
            }),
          );

          const { data } = onAuthStateChange((event, session) => {
            // The shared onAuthStateChange wrapper types session as
            // `unknown` because the Supabase JS Session shape leaks
            // through several call sites. Narrow once here for the
            // factory's Session | null contract.
            const narrowed =
              session &&
              typeof session === 'object' &&
              'user' in (session as Record<string, unknown>)
                ? (session as Session)
                : null;
            void listener(event, narrowed);
          });
          authUnsubscribe = data.subscription.unsubscribe;

          // v1.4 ステージ 5.3 Tier 3 — kick the refresh timer AFTER
          // the listener is subscribed. Pre-5.3 this lived in
          // client.ts at module load, which meant the very first
          // refresh tick could fire SIGNED_OUT before any listener
          // existed (Candidate B in
          // docs/plans/auth_session_persistence_fix.md). Now any
          // such SIGNED_OUT lands on the factory listener, which
          // probes for a recoverable session before committing.
          if (supabase && AppState.currentState === 'active') {
            supabase.auth.startAutoRefresh();
          }
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

  // Build 16 / Phase 1 (Feature H) — notification-tap deep-link
  // routing. Weekly-report notifications carry
  // `data: { route, params }` (see notificationService _scheduleWeekly
  // call site). Tapping routes the user to the matching screen with
  // the given params; weekly-report.tsx then auto-fires AI generation
  // when autoGenerate=1 is set and the user has Plus+ access.
  //
  // Allowlist + param coercion live in src/utils/notificationRouting
  // so the decision logic is unit-testable and shared between the
  // warm-app listener and the cold-start one-shot below (Codex
  // review pass 1 / Important #3 — terminated-app taps were
  // previously dropped because only the listener was wired).
  useEffect(() => {
    if (!appReady) return;

    const dispatch = (data: unknown) => {
      try {
        const decision = decideNotificationRoute(data);
        if (!decision) return;
        router.push({
          pathname: decision.route as never,
          params: decision.params,
        });
      } catch {
        // Listener / cold-start errors must never propagate — they'd
        // crash the notification subsystem on Android.
      }
    };

    // Warm-app responses.
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => dispatch(response.notification.request.content.data),
    );

    // Cold-start: app was terminated when the user tapped the
    // notification. expo-notifications keeps the last response
    // available exactly once for this case. Fire-and-forget; if it
    // resolves to null nothing happens.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          dispatch(response.notification.request.content.data);
        }
      })
      .catch(() => {
        // ignore
      });

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
