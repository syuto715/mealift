// Stub native-bound modules so the test runner doesn't try to
// evaluate expo-sqlite / react-native-url-polyfill / AsyncStorage
// under jest's CJS transform. These mocks are only here to neutralize
// the module-load side effects — every test uses dependency injection
// (claim/sync/onSignOut) to control behavior, so the mocks never
// actually run.
jest.mock('../../database/connection', () => ({ getDatabase: jest.fn() }));
jest.mock('../../database/dataReconciliation', () => ({
  claimLocalDataForUser: jest.fn(),
}));
jest.mock('../../supabase/sync/syncOrchestrator', () => ({
  syncAll: jest.fn(),
}));
jest.mock('../../supabase/auth', () => ({ signOut: jest.fn() }));
// AsyncStorage's web fallback references `window`; the in-memory
// stub keeps zustand's persist middleware happy under node.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
    },
  };
});

import {
  runLoginSync,
  __resetIsRunningForTest,
} from '../loginSyncBootstrap';
import type { ClaimResult } from '../../database/dataReconciliation';
import type { SyncResult } from '../../supabase/sync/syncOrchestrator';
import { useSyncStatusStore } from '../../../stores/syncStatusStore';

// Phase 7 — login-time bootstrap. The unit under test stitches three
// existing pieces together (claim, syncAll, signOut) and adds a mutex
// + status-store wiring on top. Tests use dependency injection
// (claim/sync/onSignOut) rather than module-level mocks so the seam
// stays explicit and reordering imports doesn't break the suite.

const fakeDb = {} as never;

const SAMPLE_SYNC_RESULT: SyncResult = {
  push: { uploaded: 0, failed: 0, deadLettered: 0, skipped: 'nothing_pending' },
  pull: { pulled: 0, skipped: null },
  submission: { ok: true, count: 0 } as never,
};

function resetStatusStore(): void {
  useSyncStatusStore.setState({
    state: 'idle',
    currentResource: null,
    progressTotal: 0,
    progressCompleted: 0,
    lastSyncAt: null,
    lastError: null,
    pendingCount: 0,
    deadLetterCount: 0,
  });
}

beforeEach(() => {
  __resetIsRunningForTest();
  resetStatusStore();
});

describe('runLoginSync — claim outcomes', () => {
  it('runs claim then syncAll when claim returns remapped', async () => {
    const claim = jest.fn(
      async (): Promise<ClaimResult> => ({
        kind: 'remapped',
        oldId: 'local-uuid',
        rowsAffected: 12,
      }),
    );
    const sync = jest.fn(async () => SAMPLE_SYNC_RESULT);
    const onSignOut = jest.fn(async () => {});

    const out = await runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync,
      onSignOut,
    });

    expect(out.kind).toBe('completed');
    expect(claim).toHaveBeenCalledWith(fakeDb, 'auth-uid-1');
    expect(sync).toHaveBeenCalledWith(fakeDb, undefined);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it('runs claim then syncAll when claim returns no_profile', async () => {
    const claim = jest.fn(async (): Promise<ClaimResult> => ({ kind: 'no_profile' }));
    const sync = jest.fn(async () => SAMPLE_SYNC_RESULT);

    const out = await runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync,
    });

    expect(out.kind).toBe('completed');
    expect(sync).toHaveBeenCalled();
  });

  it('runs claim then syncAll when claim returns already_claimed_same_uid', async () => {
    // Idempotent path — Apple flow already claimed inline. Listener
    // claim is a no-op and we still want sync to fire.
    const claim = jest.fn(
      async (): Promise<ClaimResult> => ({ kind: 'already_claimed_same_uid' }),
    );
    const sync = jest.fn(async () => SAMPLE_SYNC_RESULT);

    const out = await runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync,
    });

    expect(out.kind).toBe('completed');
    expect(sync).toHaveBeenCalled();
  });

  it('aborts and signs out on conflict_different_uid', async () => {
    const claim = jest.fn(
      async (): Promise<ClaimResult> => ({
        kind: 'conflict_different_uid',
        existingUid: 'other-account-uid',
      }),
    );
    const sync = jest.fn(async () => SAMPLE_SYNC_RESULT);
    const onSignOut = jest.fn(async () => {});

    const out = await runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync,
      onSignOut,
    });

    expect(out).toEqual({
      kind: 'conflict_different_uid',
      existingUid: 'other-account-uid',
    });
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();

    const status = useSyncStatusStore.getState();
    expect(status.state).toBe('error');
    expect(status.lastError).toMatch(/別のアカウント/);
  });

  it('keeps lastError set even when signOut throws on conflict path', async () => {
    const claim = jest.fn(
      async (): Promise<ClaimResult> => ({
        kind: 'conflict_different_uid',
        existingUid: 'other-account-uid',
      }),
    );
    const onSignOut = jest.fn(async () => {
      throw new Error('network unreachable');
    });

    const out = await runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync: jest.fn(),
      onSignOut,
    });

    expect(out.kind).toBe('conflict_different_uid');
    // lastError survives signOut failure — UI still surfaces the conflict.
    expect(useSyncStatusStore.getState().lastError).toMatch(/別のアカウント/);
  });
});

describe('runLoginSync — error surfacing', () => {
  it('returns claim_error and sets lastError when claim throws', async () => {
    const claim = jest.fn(async () => {
      throw new Error('FK violation');
    });
    const sync = jest.fn();

    const out = await runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync,
    });

    expect(out).toEqual({ kind: 'claim_error', message: 'FK violation' });
    expect(sync).not.toHaveBeenCalled();
    const status = useSyncStatusStore.getState();
    expect(status.state).toBe('error');
    expect(status.lastError).toMatch(/データ整合中にエラー/);
    expect(status.lastError).toMatch(/FK violation/);
  });

  it('returns sync_error when syncAll throws', async () => {
    const claim = jest.fn(async (): Promise<ClaimResult> => ({ kind: 'no_profile' }));
    const sync = jest.fn(async () => {
      throw new Error('supabase 503');
    });

    const out = await runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync,
    });

    expect(out).toEqual({ kind: 'sync_error', message: 'supabase 503' });
  });
});

describe('runLoginSync — mutex', () => {
  it('skips a concurrent invocation while the first run is still pending', async () => {
    let releaseClaim: (() => void) | null = null;
    const claim = jest.fn(
      () =>
        new Promise<ClaimResult>((res) => {
          releaseClaim = () => res({ kind: 'no_profile' });
        }),
    );
    const sync = jest.fn(async () => SAMPLE_SYNC_RESULT);

    const first = runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync,
    });
    // Second call lands while the first is mid-claim.
    const second = await runLoginSync('auth-uid-1', {
      db: fakeDb,
      claim,
      sync,
    });

    expect(second).toEqual({ kind: 'skipped_running' });
    expect(claim).toHaveBeenCalledTimes(1);

    releaseClaim!();
    const firstResult = await first;
    expect(firstResult.kind).toBe('completed');
  });

  it('releases the mutex after a completed run so subsequent calls succeed', async () => {
    const claim = jest.fn(async (): Promise<ClaimResult> => ({ kind: 'no_profile' }));
    const sync = jest.fn(async () => SAMPLE_SYNC_RESULT);

    await runLoginSync('auth-uid-1', { db: fakeDb, claim, sync });
    const out = await runLoginSync('auth-uid-1', { db: fakeDb, claim, sync });

    expect(out.kind).toBe('completed');
    expect(claim).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('releases the mutex even when claim throws', async () => {
    let attempt = 0;
    const claim = jest.fn(async (): Promise<ClaimResult> => {
      attempt++;
      if (attempt === 1) throw new Error('first failed');
      return { kind: 'no_profile' };
    });
    const sync = jest.fn(async () => SAMPLE_SYNC_RESULT);

    const r1 = await runLoginSync('auth-uid-1', { db: fakeDb, claim, sync });
    const r2 = await runLoginSync('auth-uid-1', { db: fakeDb, claim, sync });

    expect(r1.kind).toBe('claim_error');
    expect(r2.kind).toBe('completed');
  });

  it('releases the mutex even when syncAll throws', async () => {
    let attempt = 0;
    const claim = jest.fn(async (): Promise<ClaimResult> => ({ kind: 'no_profile' }));
    const sync = jest.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error('first sync failed');
      return SAMPLE_SYNC_RESULT;
    });

    const r1 = await runLoginSync('auth-uid-1', { db: fakeDb, claim, sync });
    const r2 = await runLoginSync('auth-uid-1', { db: fakeDb, claim, sync });

    expect(r1.kind).toBe('sync_error');
    expect(r2.kind).toBe('completed');
  });
});

describe('runLoginSync — store wiring', () => {
  it('transitions through claiming → idle → (syncing handled by syncAll)', async () => {
    const seenStates: string[] = [];
    const claim = jest.fn(async (): Promise<ClaimResult> => {
      seenStates.push(useSyncStatusStore.getState().state);
      return { kind: 'no_profile' };
    });
    const sync = jest.fn(async () => {
      // syncAll's responsibility — we simulate it by reading the
      // post-finishClaim state. In production syncAll's beginRun
      // immediately overwrites this with 'syncing'.
      seenStates.push(useSyncStatusStore.getState().state);
      return SAMPLE_SYNC_RESULT;
    });

    await runLoginSync('auth-uid-1', { db: fakeDb, claim, sync });

    // First entry: state during claim (after beginClaim) = 'claiming'.
    // Second entry: state at start of sync (after finishClaim()) = 'idle'.
    expect(seenStates).toEqual(['claiming', 'idle']);
  });

  it('clears lastError when starting a fresh successful run', async () => {
    useSyncStatusStore.setState({ lastError: 'previous failure', state: 'error' });

    const claim = jest.fn(async (): Promise<ClaimResult> => ({ kind: 'no_profile' }));
    const sync = jest.fn(async () => SAMPLE_SYNC_RESULT);

    await runLoginSync('auth-uid-1', { db: fakeDb, claim, sync });

    // beginClaim clears lastError; the success path doesn't re-set it.
    expect(useSyncStatusStore.getState().lastError).toBeNull();
  });
});
