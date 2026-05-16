import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthListenerDeps } from './authListener';
import { probeSession } from './probeSession';

// v1.4 ステージ 5.3 Phase 5.3D — pure builder for the
// AuthListenerDeps object that app/_layout.tsx hands to
// makeAuthListener.
//
// The builder exists so the deps shape can be unit-tested
// independently of the full RootLayout render tree (Path C in
// docs/plans/auth_session_persistence_fix.md — Stage 5.2's
// decision to avoid jest-expo means we don't have RNTL rendering
// app/_layout.tsx under jest). It also crystallizes the "option γ"
// wiring pattern from the canonical doc:
//
//   - identifyRC dep is a no-op. Production-side RC identify lives
//     in the setAuthenticated wrapper so it fires for every
//     session-bearing event (SIGNED_IN / TOKEN_REFRESHED / INITIAL_
//     SESSION / USER_UPDATED). Letting the factory call identifyRC
//     too would double-fire, and identifyUser is idempotent enough
//     that nothing breaks, but the SIGNED_IN-only contract in the
//     factory stays clean for the test pin.
//   - logOutRC fires inside the setUnauthenticated wrapper to match
//     the pre-5.3 inline listener exactly (no behavior change).
//   - runLoginSync's RunLoginSyncOutcome return is dropped to
//     satisfy the dep's Promise<void> signature.
//
// Pattern 18 facet 11 (preset adoption version compat verify) +
// SSoT: the builder is the single place that wires production-side
// callbacks into factory-shaped deps. Future changes to the option
// γ contract (RC firing surface, logOut firing rules) land here,
// not scattered across app/_layout.tsx and the factory.

export interface AuthListenerCallbacks {
  setAuthenticated: (uid: string, email?: string) => void;
  setUnauthenticated: () => void;
  identifyRevenueCatUser: (uid: string) => Promise<void>;
  // The CustomerInfo type lives in react-native-purchases and we
  // don't want to import that chain into the auth layer. `never`
  // is intentional: as a function parameter type it allows ANY
  // production function to satisfy the slot (bottom-typed input,
  // which RC's stronger `CustomerInfo | null` parameter is a
  // supertype of). `unknown` would tighten compatibility in the
  // wrong direction and reject the production function — see
  // Codex Stage 5.3 review pass Nit follow-up.
  applyCustomerInfoToProfile: (info: never) => Promise<void>;
  getRevenueCatCustomerInfo: () => Promise<unknown>;
  logOutRevenueCat: () => Promise<unknown>;
  runLoginSync: (uid: string) => Promise<unknown>;
  getIsLocalOnly: () => boolean;
  // Stage 5.3 Codex pass / Critical fix — non-SIGNED_OUT null-
  // session events must NOT demote a persisted local auth state.
  // The factory reads this through its `isAuthenticated` dep.
  getIsAuthenticated: () => boolean;
  /**
   * Optional override for the probe — primarily used by tests to
   * substitute a deterministic stub. Production passes
   * `() => probeSession(supabase)`.
   */
  probeSession?: () => Promise<Awaited<ReturnType<typeof probeSession>>>;
  /**
   * Supabase client for the default probe wiring; ignored when
   * `probeSession` is supplied. Pass `null` in environments where
   * the Supabase singleton hasn't been created (jest unit tests
   * that exercise the builder without the full client).
   */
  supabaseClient?: SupabaseClient | null;
}

export function buildAuthListenerDeps(
  callbacks: AuthListenerCallbacks,
): AuthListenerDeps {
  const probe =
    callbacks.probeSession ??
    (() => probeSession(callbacks.supabaseClient ?? null));

  return {
    setAuthenticated: (uid, email) => {
      callbacks.setAuthenticated(uid, email);
      // Fire-and-forget RC tie-in. The .then() chain matches the
      // pre-5.3 inline listener body verbatim so the production
      // behavior is unchanged: identify the user, then re-pull
      // their customer info and apply it to the profile.
      void callbacks.identifyRevenueCatUser(uid).then(async () => {
        const info = await callbacks.getRevenueCatCustomerInfo();
        // `info` is forwarded verbatim to applyCustomerInfoToProfile
        // — the builder doesn't introspect the shape. The `as never`
        // satisfies the structural function-parameter check without
        // pulling the RevenueCat type into the auth layer.
        await callbacks.applyCustomerInfoToProfile(info as never);
      });
    },
    setUnauthenticated: () => {
      callbacks.setUnauthenticated();
      void callbacks.logOutRevenueCat();
    },
    // No-op: see comment block above. Production-side RC identify
    // is handled by the setAuthenticated wrapper.
    identifyRC: async () => {},
    runLoginSync: async (uid) => {
      // runLoginSync returns a RunLoginSyncOutcome we don't consume
      // here; the factory's dep is typed Promise<void>.
      await callbacks.runLoginSync(uid);
    },
    probeSession: probe,
    isLocalOnly: () => callbacks.getIsLocalOnly(),
    isAuthenticated: () => callbacks.getIsAuthenticated(),
  };
}
