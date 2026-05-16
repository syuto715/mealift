import type { Session, SupabaseClient } from '@supabase/supabase-js';

// v1.4 ステージ 5.3 Phase 5.3A — Tier 2 spurious-SIGNED_OUT probe.
//
// The Tier 2 design in docs/plans/auth_session_persistence_fix.md
// (line 95-100) is to "re-call getSession() once with a small delay
// to see if AsyncStorage has been re-populated by a concurrent
// refresh on a different path." That is exactly what this helper
// does, and nothing more.
//
// Why this minimal shape:
//   - The reverted commit f541d75 wrapped supabase.auth.startAutoRefresh
//     in a try/catch, but the SDK's _autoRefreshTokenTick catches its
//     own refresh failures (GoTrueClient.ts:4946) — the wrapper never
//     observed the error path. The architectural lesson (Pattern 11
//     facet 6 + canonical doc line 138-167) was to interpose at the
//     onAuthStateChange listener boundary and probe AsyncStorage,
//     NOT to try to recover the refresh itself.
//
// Why a 500 ms default delay:
//   - AsyncStorage writes commit in ~100-200 ms typical. The race
//     window we're closing is "SIGNED_OUT fired by one code path
//     while a concurrent refresh on another path is mid-write to
//     AsyncStorage." 500 ms gives the concurrent path room to land,
//     and the user only sees the 0.5 s latency on the spurious-
//     SIGNED_OUT branch — the steady state is unaffected.
//   - Callers can pass `delayMs=0` to skip the wait (tests, and
//     scenarios where the caller already has reason to believe the
//     storage is settled).
//
// We never call `refreshSession()` here. The doc considered it but
// rejected it as out-of-scope: if the SIGNED_OUT was fired because
// the SDK's own refresh failed, calling refreshSession() again will
// likely hit the same failure (token already used, rate limit, etc.)
// and waste a network round-trip. Tier 1 (server-side
// refresh_token_reuse_interval = 10 s) already absorbs that path.

export async function probeSession(
  client: SupabaseClient | null,
  delayMs = 500,
): Promise<Session | null> {
  if (!client) return null;
  if (delayMs > 0) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data.session;
  } catch {
    // SDK boundary errors (network, decoder, etc.) — treat as a
    // null probe; the listener's setUnauthenticated() fall-through
    // is the correct response (Pattern: probe failures must NOT
    // recover into setAuthenticated — would risk false positives).
    return null;
  }
}
