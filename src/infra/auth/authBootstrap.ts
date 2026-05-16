import type { Session } from '@supabase/supabase-js';

// v1.4 ステージ 5.2 Phase 5.2B — auth bootstrap pure helper.
//
// Extracted from `app/_layout.tsx`'s initialize() useEffect (the
// `if (isSupabaseConfigured && !isLocalOnly) { ... }` branch). The
// caller still owns the surrounding lifecycle (splash hide, DB init,
// RevenueCat init, notifications bootstrap, post-auth onAuthStateChange
// registration) — this helper only owns the "did the session boot
// to authenticated, unauthenticated, or stay-as-is" decision.
//
// Why extracted: that decision tree drives Issue 1's cold-start
// hydration race (the v1.4 fixes the static `/(tabs)/home` route
// typo, but a future race could still send the user to the wrong
// screen if the auth-state transitions during navigation). A pure
// function with explicit callback injection makes the six branches
// covered by deterministic unit tests rather than full-render
// integration tests (which would drag jest-expo into the dependency
// tree — see Phase 5.2A commit for why we declined that route).
//
// All side effects flow through `callbacks`; the helper itself is
// pure-async and has no module-level state.

export interface AuthBootstrapCallbacks {
  setAuthenticated: (uid: string, email?: string) => void;
  setUnauthenticated: () => void;
  setLoading: (loading: boolean) => void;
}

export type GetSessionFn = () => Promise<{
  data: { session: Session | null };
}>;

export async function bootstrapAuthSession(
  isSupabaseConfigured: boolean,
  isLocalOnly: boolean,
  isAuthenticated: boolean,
  getSession: GetSessionFn,
  callbacks: AuthBootstrapCallbacks,
): Promise<void> {
  // Local-only branch — no Supabase project configured (e.g. early
  // dev builds, or the EXPO_PUBLIC_SUPABASE_URL env was stripped
  // from a release).
  if (!isSupabaseConfigured || isLocalOnly) {
    if (isAuthenticated) {
      // Already-hydrated local-only session (persisted by zustand
      // through AsyncStorage). Don't touch the auth state — just
      // release the loading gate so RootLayout can render.
      callbacks.setLoading(false);
    } else {
      callbacks.setUnauthenticated();
    }
    return;
  }

  // Supabase-configured branch.
  try {
    const { data } = await getSession();
    const session = data.session;

    if (session) {
      callbacks.setAuthenticated(
        session.user.id,
        session.user.email ?? undefined,
      );
    } else if (!isAuthenticated) {
      callbacks.setUnauthenticated();
    }
    // session === null && isAuthenticated === true: don't touch
    // state. This preserves a persisted local auth value while the
    // remote session is still being negotiated (cold-start race
    // window). The onAuthStateChange listener will reconcile.
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[authBootstrap] getSession failed:', error);
    }
    callbacks.setUnauthenticated();
  }
}
