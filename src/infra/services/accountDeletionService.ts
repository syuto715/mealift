import { supabase, isSupabaseConfigured } from '../supabase/client';
import { wipeUserData } from '../database/connection';

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
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

// Local cleanup after a confirmed server deletion: wipe all local user data and
// clear persisted storage (auth session, prefs). Best-effort; never throws.
export async function wipeLocalAfterDeletion(): Promise<void> {
  try {
    await wipeUserData();
  } catch {
    // Non-fatal — startup orphan guard re-wipes on next launch.
  }
}
