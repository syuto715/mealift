import {
  createClient,
  processLock,
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
// Module-level registration of the AppState handler is intentional:
// the client is a singleton, so its refresh-timer toggle should
// match the process lifetime, not any single React component. Re-
// imports just re-run the idempotent addEventListener call (RN
// dedup'd internally on identical handlers).
//
// v1.4 ステージ 5.3 (Tier 3 partial reorder): the cold-start
// startAutoRefresh kick has been moved out of this file into
// app/_layout.tsx's initialize(), where it runs AFTER the
// onAuthStateChange listener is subscribed. This eliminates the
// "Candidate B" race in docs/plans/auth_session_persistence_fix.md
// (a SIGNED_OUT fired by the very first refresh tick, before any
// listener was wired, was observed by nothing — only AsyncStorage
// got cleared). The AppState change handler stays here because
// foreground/background transitions happen long after listeners
// are wired and have no ordering hazard.
function handleAppStateChange(nextState: AppStateStatus) {
  if (!supabase) return;
  if (nextState === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
}

if (supabase && typeof AppState?.addEventListener === 'function') {
  AppState.addEventListener('change', handleAppStateChange);
  // NOTE: the initial cold-start kick (if AppState.currentState
  // === 'active') is performed by app/_layout.tsx after the
  // onAuthStateChange listener is registered — see Tier 3 note
  // above.
}
