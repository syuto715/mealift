import type { Session } from '@supabase/supabase-js';

// v1.4 ステージ 5.2 Phase 5.2C — Supabase onAuthStateChange listener
// factory (Stage 5.3 prerequisite stub).
//
// This factory crystallizes the Tier 2 spurious-SIGNED_OUT defense
// pattern (see ハンドブック §11 Auth Tier 2). Supabase JS can fire
// a SIGNED_OUT event in response to a transient network blip, token
// refresh race, or a stale-but-recoverable session — committing
// straight to `setUnauthenticated()` in those cases evicts a user
// who is still legitimately signed in. The Tier 2 design probes the
// session store before committing, and re-emits a SIGNED_IN when
// the probe reveals a recoverable session.
//
// Stage 5.2 ships:
//   - the factory shape with a `probeSession` dep slot
//   - the four-branch decision logic (session present, non-
//     SIGNED_OUT null-session, local-only short-circuit, probe
//     recovery vs commit)
//   - the unit-test scenarios covering normal SIGNED_IN,
//     TOKEN_REFRESHED, spurious recoverable, genuine SIGNED_OUT,
//     plus regression guards for local-only and probe-throws
//
// Stage 5.3 will:
//   - implement an actual `probeSession` that reads from
//     AsyncStorage / SecureStore and revalidates the refresh token
//   - wire the factory into `app/_layout.tsx`'s
//     onAuthStateChange registration site
//
// Until Stage 5.3 ships, `app/_layout.tsx` keeps its current inline
// listener — this file is exercised only by its own unit tests.

export interface AuthListenerDeps {
  setAuthenticated: (uid: string, email?: string) => void;
  setUnauthenticated: () => void;
  identifyRC: (uid: string) => Promise<void>;
  runLoginSync: (uid: string) => Promise<void>;
  /**
   * Tier 2 — invoked when the listener observes a SIGNED_OUT event
   * with a null session. If this returns a Session the listener
   * treats it as a spurious SIGNED_OUT and re-emits SIGNED_IN
   * against the recovered session. If it returns null (or throws),
   * the listener commits to setUnauthenticated().
   *
   * Stage 5.3 will provide an actual implementation against
   * supabase.auth.getSession() + storage probe + 1-retry refresh.
   */
  probeSession: () => Promise<Session | null>;
  isLocalOnly: () => boolean;
}

export type AuthListener = (
  event: string,
  session: Session | null,
) => Promise<void>;

export function makeAuthListener(deps: AuthListenerDeps): AuthListener {
  return async (event, session) => {
    // SIGNED_IN path — session present, commit straight through.
    if (session) {
      deps.setAuthenticated(
        session.user.id,
        session.user.email ?? undefined,
      );
      // identifyRC / runLoginSync only on the explicit SIGNED_IN
      // event. TOKEN_REFRESHED / INITIAL_SESSION / USER_UPDATED
      // arrive with a session too but don't warrant re-running the
      // full login sync.
      if (event === 'SIGNED_IN') {
        await deps.identifyRC(session.user.id);
        await deps.runLoginSync(session.user.id);
      }
      return;
    }

    // session === null. The Tier 2 probe is scoped to SIGNED_OUT
    // specifically (Codex pass / Important — the probe defense is
    // documented as spurious-SIGNED_OUT recovery, not a general
    // null-session catchall). INITIAL_SESSION with null session at
    // cold start is a legitimate "user is logged out", not a
    // candidate for recovery.
    if (event !== 'SIGNED_OUT') {
      deps.setUnauthenticated();
      return;
    }

    // Local-only mode short-circuits the probe — there is no remote
    // session to recover, and probing would either no-op or fail.
    if (deps.isLocalOnly()) {
      deps.setUnauthenticated();
      return;
    }

    // Tier 2 probe — was the SIGNED_OUT spurious?
    let probe: Session | null = null;
    try {
      probe = await deps.probeSession();
    } catch (error) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error('[authListener] probeSession failed:', error);
      }
      // Fall through to setUnauthenticated. Probe failures don't
      // recover us into setAuthenticated — that would risk false
      // positives on transient errors.
    }

    if (probe) {
      // Recovered. Re-emit as if SIGNED_IN against the probed
      // session, but skip runLoginSync — the original SIGNED_IN
      // (before the spurious SIGNED_OUT) already ran it.
      //
      // Codex pass / Important fix — identifyRC failures must NOT
      // demote us back to setUnauthenticated. RevenueCat is a
      // best-effort tie-in (plan state falls back to local
      // defaults); a transient RC outage should not log the user
      // out. The probe call above is the only thing whose failure
      // gates the recovered branch.
      deps.setAuthenticated(
        probe.user.id,
        probe.user.email ?? undefined,
      );
      try {
        await deps.identifyRC(probe.user.id);
      } catch (rcError) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.error(
            '[authListener] identifyRC after probe recovery failed (non-fatal):',
            rcError,
          );
        }
      }
      return;
    }

    deps.setUnauthenticated();
  };
}
