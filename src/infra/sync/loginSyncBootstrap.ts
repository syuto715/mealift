import type { SQLiteDatabase } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDatabase } from '../database/connection';
import {
  claimLocalDataForUser,
  type ClaimResult,
} from '../database/dataReconciliation';
import { syncAll, type SyncResult } from '../supabase/sync/syncOrchestrator';
import { signOut } from '../supabase/auth';
import { useSyncStatusStore } from '../../stores/syncStatusStore';

// Phase 7 — login-time pull-and-push bootstrap.
//
// Called from app/_layout.tsx's onAuthStateChange listener whenever
// the event === 'SIGNED_IN'. Three responsibilities:
//
//   1. Run claimLocalDataForUser to remap the local profile/foreign-keys
//      to the Supabase auth uid. The Apple flow (authStore.loginWithApple)
//      already runs claim inline before flipping isAuthenticated, so the
//      claim call here is idempotent (already_claimed_same_uid). Email
//      login does NOT claim inline, so this listener path is the only
//      place that claim runs for password sign-ins.
//
//   2. If claim returns conflict_different_uid, signOut and surface the
//      JP error message via syncStatusStore.lastError. Phase 8 UI reads
//      lastError and renders a banner. Without this, an email user with
//      an unrelated local profile would silently log into a session
//      that owns somebody else's data.
//
//   3. On non-conflict, run syncAll(db, client) — pull then push then
//      submission sync. Both pull and push internally check auth and
//      skip cleanly when the session has been lost. syncAll already
//      handles all status updates (beginRun/finishRun) so we don't
//      duplicate them here.
//
// Mutex: the module-level `isRunning` flag exists because Supabase JS
// can fire SIGNED_IN multiple times in quick succession on network
// reconnect. Without the guard, a second invocation while the first is
// still running would clobber syncStatusStore mid-sync and start two
// concurrent push loops competing for the same sync_queue rows.

let isRunning = false;

export type RunLoginSyncOutcome =
  | { kind: 'completed'; result: SyncResult }
  | { kind: 'skipped_running' }
  | { kind: 'conflict_different_uid'; existingUid: string }
  | { kind: 'claim_error'; message: string }
  | { kind: 'sync_error'; message: string };

interface RunLoginSyncOptions {
  // Test injection points. Production callers omit all of these.
  db?: SQLiteDatabase;
  client?: SupabaseClient | null;
  claim?: typeof claimLocalDataForUser;
  sync?: typeof syncAll;
  onSignOut?: () => Promise<unknown>;
}

const CONFLICT_MESSAGE_JP =
  'このデバイスには別のアカウントのデータが残っています。一度ログアウトしてからやり直してください。';

export async function runLoginSync(
  authUid: string,
  options: RunLoginSyncOptions = {},
): Promise<RunLoginSyncOutcome> {
  if (isRunning) {
    return { kind: 'skipped_running' };
  }
  isRunning = true;

  const status = useSyncStatusStore.getState();
  const claimFn = options.claim ?? claimLocalDataForUser;
  const syncFn = options.sync ?? syncAll;
  const signOutFn = options.onSignOut ?? signOut;

  try {
    const db = options.db ?? (await getDatabase());

    status.beginClaim();

    let claim: ClaimResult;
    try {
      claim = await claimFn(db, authUid);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'claim failed';
      status.finishClaim(`データ整合中にエラーが発生しました: ${message}`);
      return { kind: 'claim_error', message };
    }

    if (claim.kind === 'conflict_different_uid') {
      // Park the store at error+lastError BEFORE signOut so the SIGNED_OUT
      // event that signOut triggers doesn't race with a concurrent
      // status update.
      status.finishClaim(CONFLICT_MESSAGE_JP);
      try {
        await signOutFn();
      } catch {
        // signOut failure is non-fatal — the user is still locally
        // signed-out via the auth listener's handling of the eventual
        // session loss; lastError remains set so UI surfaces the issue.
      }
      return { kind: 'conflict_different_uid', existingUid: claim.existingUid };
    }

    // Drop 'claiming' so syncAll's beginRun() can transition to 'syncing'.
    status.finishClaim();

    let result: SyncResult;
    try {
      result = await syncFn(db, options.client);
    } catch (e) {
      // syncAll already wrote lastError via finishRun(error). We only
      // surface the kind back to the caller.
      const message = e instanceof Error ? e.message : 'sync failed';
      return { kind: 'sync_error', message };
    }

    return { kind: 'completed', result };
  } finally {
    isRunning = false;
  }
}

// Test-only helper. Production code never calls this.
export function __resetIsRunningForTest(): void {
  isRunning = false;
}
