import {
  createClient,
  processLock,
  isAuthApiError,
  isAuthRetryableFetchError,
  SupabaseClient,
} from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { APP_CONFIG } from '../../constants/config';
import 'react-native-url-polyfill/auto';

const supabaseUrl = APP_CONFIG.SUPABASE_URL;
const supabaseAnonKey = APP_CONFIG.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Phase 9.1.5 hotfix — `persistSession: true` alone is a no-op on
// React Native because supabase-js falls back to `localStorage`,
// which doesn't exist outside the browser. The session lives only in
// memory and disappears on the next app launch, which is what was
// kicking users back to the login screen.
//
// `storage: AsyncStorage` plugs in the same persistence layer the
// rest of the app uses (zustand persist, the AI menu cache, etc.).
// Build 16+ TODO 11 still tracks a possible MMKV migration; for now
// uniformity with everything else in the project wins.
// `lock: processLock` (Codex review pass 1) coordinates concurrent
// auth operations so the cold-start `getSession()` in app/_layout.tsx
// and the AppState=active `startAutoRefresh()` below don't both try
// to consume the same single-use refresh token. Without it, the
// refresh that loses the race fails and supabase-js emits SIGNED_OUT,
// reproducing the original "logged out after restart" symptom via a
// different path. processLock is re-exported from @supabase/auth-js
// through supabase-js's wildcard export.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        lock: processLock,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Auth Fix Tier 2 — transient refresh-error recovery.
//
// Recon Report (Auth Session Persistence Bug) identified two root
// cause candidates for the post-Phase-9.1.5 "session lost on cold
// start" symptom that survived the storage adapter + processLock
// fixes:
//
//   Candidate A — single-use refresh token race: client commits
//   token rotation, network blip drops the response, AsyncStorage
//   still has the previous (now invalidated) token. Next cold start
//   tries to refresh with the stale token, server rejects with
//   `refresh_token_already_used`, supabase-js fires SIGNED_OUT
//   internally and clears AsyncStorage. User lands on login.
//
//   Candidate B — module-load timing: client.ts kicks
//   startAutoRefresh at module evaluation, BEFORE app/_layout.tsx
//   subscribes onAuthStateChange. A SIGNED_OUT event fired during
//   that window is observed by nothing; only the AsyncStorage
//   cleanup is permanent.
//
// This wrapper closes both: classify the error from startAutoRefresh,
// and for transient refresh-state errors (refresh_token_already_used,
// refresh_token_not_found, session_not_found, session_expired,
// network/retryable fetch errors), attempt one getSession() to see
// if AsyncStorage / server has a recoverable session. If yes, the
// session restores silently. If no, fall through to the normal
// SIGNED_OUT flow that _layout.tsx's onAuthStateChange listener
// handles. Permanent errors (user_banned, invalid_credentials,
// other non-token states) skip recovery entirely and defer to the
// normal flow.
//
// Tier 3 (move startAutoRefresh out of module-load entirely so the
// event is observable from the start) is deferred to v1.4 prep —
// out of scope per the user's E-4-equivalent sign-off boundary.
//
// Patterns applied:
//   #5  fail-fast on unknown error — `isTransientRefreshError`
//       returns false for any error class the SDK doesn't tag, so
//       recovery only fires for the narrow transient set
//   #10 補強 (idempotency guard) — `isRecovering` flag prevents
//       concurrent AppState transitions from double-firing the
//       getSession recovery
//   #18 SSoT — error classification SSoT is the SDK's ErrorCode
//       union + isAuthApiError / isAuthRetryableFetchError type
//       predicates, NOT free-form substring match
//   #25 helper-thick — wrapper + classifier consume the SDK API
//       internally; call sites stay one-line invocations

let isRecovering = false;

// Transient refresh-state errors that warrant a single getSession()
// retry before falling through to the SIGNED_OUT flow. Layered:
//
//   1. SDK-typed retryable fetch — network blip / 5xx / fetch failed.
//      The SDK already classifies these as retryable.
//   2. SDK-typed auth-api errors with token-state codes — server-
//      returned `code` field on AuthApiError. Robust to JP
//      localization, SDK message changes, and i18n.
//   3. Substring fallback — defensive layer for older SDK versions
//      or paths that throw plain Error without type tagging. Catches
//      "Invalid Refresh Token" / "already used" / "network request
//      failed" / "fetch failed" message variants.
//
// PERMANENT auth errors (user_banned, invalid_credentials, weak_password,
// signup_disabled, etc.) intentionally return false: those need user
// action, not a retry. Defaulting to false on unknown shapes (Pattern
// 5 fail-fast) means a future SDK change that introduces a new
// transient code stays correctly routed to SIGNED_OUT until this
// classifier is updated, rather than infinite-recovering an unknown
// state.
export function isTransientRefreshError(error: unknown): boolean {
  // Layer 1: network blip / retryable fetch
  if (isAuthRetryableFetchError(error)) return true;
  // Layer 2: server-returned token-state codes (preferred — type-safe)
  if (isAuthApiError(error)) {
    return (
      error.code === 'refresh_token_not_found' ||
      error.code === 'refresh_token_already_used' ||
      error.code === 'session_not_found' ||
      error.code === 'session_expired'
    );
  }
  // Layer 3: defensive substring match for plain Error / older SDK
  if (error instanceof Error && typeof error.message === 'string') {
    const msg = error.message.toLowerCase();
    return (
      // "Invalid Refresh Token" / "Refresh Token Not Found" both contain
      // the substring "refresh token"
      msg.includes('refresh token') ||
      msg.includes('already used') ||
      msg.includes('network request failed') ||
      msg.includes('fetch failed')
    );
  }
  return false;
}

// Wrapped startAutoRefresh that recovers from transient refresh
// errors via a single getSession() retry. See header comment block
// for the recovery rationale.
export async function startAutoRefreshWithRecovery(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.startAutoRefresh();
  } catch (error) {
    // Permanent / unknown errors → defer to normal SIGNED_OUT flow.
    if (!isTransientRefreshError(error)) {
      return;
    }
    // Idempotency guard: concurrent AppState=active transitions
    // (or module-load + first foreground event) could both fire the
    // wrapper. processLock serializes the supabase-side ops; this
    // flag prevents the second recovery from racing on the same
    // session state.
    if (isRecovering) {
      console.warn('[auth] recovery already in progress, skip');
      return;
    }
    isRecovering = true;
    try {
      console.warn(
        '[auth] startAutoRefresh failed (transient), attempting recovery',
        error,
      );
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        console.info('[auth] recovery succeeded, session restored');
        return;
      }
      console.warn('[auth] recovery: session null, falling to SIGNED_OUT flow');
    } catch (recoveryError) {
      console.warn('[auth] recovery error', recoveryError);
    } finally {
      // Pattern 5 補強 (D-8 学び): try/finally so a thrown getSession
      // never leaves the flag stuck-on, which would permanently
      // disable future recovery attempts within this process.
      isRecovering = false;
    }
  }
}

// Phase 9.1.5 — second half of the canonical Supabase RN setup.
// `autoRefreshToken: true` only does work while a refresh timer is
// active; supabase-js stops that timer when the app goes background
// to avoid wasted radio time, and expects the host to restart it on
// foreground. Without this, a phone left suspended past token
// expiry returns to a silently-invalid session — onAuthStateChange
// then fires INITIAL_SESSION with `session=null`, the app's listener
// in _layout.tsx maps that to setUnauthenticated(), and the user
// lands on the login screen. The exact symptom Phase 9.1.5 fixes.
//
// Module-level registration is intentional: the client is a
// singleton, so its refresh timer should match the process lifetime,
// not any single React component. Re-imports just re-run the
// idempotent addEventListener call (RN dedup'd internally on
// identical handlers).
function handleAppStateChange(nextState: AppStateStatus) {
  if (!supabase) return;
  if (nextState === 'active') {
    // Auth Fix Tier 2 — wrap in recovery so a transient refresh
    // failure on foreground transition doesn't silently log the
    // user out.
    void startAutoRefreshWithRecovery();
  } else {
    supabase.auth.stopAutoRefresh();
  }
}

if (supabase && typeof AppState?.addEventListener === 'function') {
  AppState.addEventListener('change', handleAppStateChange);
  // Kick the refresh loop now in case the module loads while already
  // foregrounded (cold start). Wrapped via Tier 2 for the same
  // reason as the AppState handler above.
  if (AppState.currentState === 'active') {
    void startAutoRefreshWithRecovery();
  }
}
