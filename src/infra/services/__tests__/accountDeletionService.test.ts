// v1.6.0 Sprint 6 — accountDeletionService client logic.
// EF cascade/authorization/idempotency are server/DB behaviors verified at
// deploy; this pins the CLIENT contract: EF success gates the local wipe and
// the pending-wipe marker, failure preserves data, and the startup guard
// completes an interrupted wipe.

const mockInvoke = jest.fn();
jest.mock('../../supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } },
}));

const mockWipe = jest.fn().mockResolvedValue(undefined);
jest.mock('../../database/connection', () => ({
  wipeUserData: () => mockWipe(),
}));

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
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
}));

import {
  requestServerAccountDeletion,
  wipeLocalAfterDeletion,
  completeOrphanWipeIfPending,
} from '../accountDeletionService';

const FLAG = 'account_deletion_pending_wipe';

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(store)) delete store[k];
});

describe('requestServerAccountDeletion', () => {
  it('ok=true and sets pending-wipe flag when EF returns ok', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    const r = await requestServerAccountDeletion();
    expect(r.ok).toBe(true);
    expect(store[FLAG]).toBe('1');
  });

  it('ok=false and does NOT set the flag on EF error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await requestServerAccountDeletion();
    expect(r).toEqual({ ok: false, reason: 'failed' });
    expect(store[FLAG]).toBeUndefined();
  });

  it('ok=false when EF returns data without ok:true (no flag)', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });
    const r = await requestServerAccountDeletion();
    expect(r.ok).toBe(false);
    expect(store[FLAG]).toBeUndefined();
  });

  it('ok=false when invoke throws (no flag, no wipe)', async () => {
    mockInvoke.mockRejectedValue(new Error('network'));
    const r = await requestServerAccountDeletion();
    expect(r.ok).toBe(false);
    expect(mockWipe).not.toHaveBeenCalled();
  });
});

describe('wipeLocalAfterDeletion', () => {
  it('wipes local data and clears the pending-wipe flag', async () => {
    store[FLAG] = '1';
    await wipeLocalAfterDeletion();
    expect(mockWipe).toHaveBeenCalledTimes(1);
    expect(store[FLAG]).toBeUndefined();
  });

  it('keeps the flag set if the wipe throws (so startup retries)', async () => {
    store[FLAG] = '1';
    mockWipe.mockRejectedValueOnce(new Error('db locked'));
    await wipeLocalAfterDeletion();
    expect(store[FLAG]).toBe('1');
  });
});

describe('completeOrphanWipeIfPending (startup guard)', () => {
  it('wipes + clears flag when pending', async () => {
    store[FLAG] = '1';
    await completeOrphanWipeIfPending();
    expect(mockWipe).toHaveBeenCalledTimes(1);
    expect(store[FLAG]).toBeUndefined();
  });

  it('no-op when no pending flag (local-only / normal users untouched)', async () => {
    await completeOrphanWipeIfPending();
    expect(mockWipe).not.toHaveBeenCalled();
  });
});
