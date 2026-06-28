import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../supabase/client';
import {
  wipeUserData,
  ProgressPhotoDirectoryWipeError,
} from '../database/connection';

// Set once the SERVER deletion is confirmed; cleared after local wipe finishes.
// If the process dies between server-delete and local-wipe, the startup guard
// (completeOrphanWipeIfPending) finishes the wipe so no PII lingers.
const PENDING_WIPE_KEY = 'account_deletion_pending_wipe';

// v1.6.0 Sprint 6 — client side of account deletion.
//
// Flow: call the delete-account EF (server deletes auth.users → cascades all
// user tables). ONLY on EF success do we wipe local SQLite + clear AsyncStorage
// + sign out. On EF failure the server keeps all data intact, so we must NOT
// wipe locally — the user can retry.

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'failed' };

// Performs the SERVER deletion only. Returns ok=false on any failure so the
// caller can keep local data and let the user retry.
export async function requestServerAccountDeletion(): Promise<DeleteAccountResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: {},
    });
    // EF returns { ok: true } on success (incl. idempotent already-deleted).
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      return { ok: false, reason: 'failed' };
    }
    // Server data is gone → mark a pending local wipe so an interrupted
    // cleanup is finished on next launch.
    try {
      await AsyncStorage.setItem(PENDING_WIPE_KEY, '1');
    } catch {
      // ignore
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

// Local cleanup after a confirmed server deletion: wipe all local user data and
// clear persisted storage (auth session, prefs). Best-effort except for progress
// photo directory deletion: if body photos remain, keep the pending marker by
// preventing the settings flow from clearing AsyncStorage.
export async function wipeLocalAfterDeletion(): Promise<void> {
  try {
    await wipeUserData();
    // Local cleanup done → clear the pending-wipe marker. (The settings flow
    // also calls AsyncStorage.clear() right after, which removes it too.)
    try {
      await AsyncStorage.removeItem(PENDING_WIPE_KEY);
    } catch {
      // ignore
    }
  } catch (error) {
    if (error instanceof ProgressPhotoDirectoryWipeError) {
      throw error;
    }
    // Non-fatal — startup orphan guard re-wipes on next launch (flag stays set).
  }
}

// Startup guard: if a prior account deletion confirmed server-side but its
// local wipe didn't finish (process killed mid-flow), complete it now so no
// PII lingers. Safe for local-only users: the flag is ONLY set after a
// successful server deletion, never for local-only sessions.
export async function completeOrphanWipeIfPending(): Promise<void> {
  try {
    const pending = await AsyncStorage.getItem(PENDING_WIPE_KEY);
    if (pending !== '1') return;
    await wipeUserData();
    await AsyncStorage.removeItem(PENDING_WIPE_KEY);
  } catch {
    // Non-fatal — will retry next launch.
  }
}
