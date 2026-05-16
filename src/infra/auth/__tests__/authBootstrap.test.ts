// v1.4 ステージ 5.2 Phase 5.2B — authBootstrap tests.
//
// Pure-function tests; no jest.mock surface beyond the deps the
// helper itself accepts via injection. The six scenarios pin the
// state-transition decision tree extracted out of app/_layout.tsx
// so cold-start regressions show up as deterministic failures here
// rather than dogfood-only "tab is blank on launch" reports.

import type { Session } from '@supabase/supabase-js';
import {
  bootstrapAuthSession,
  type AuthBootstrapCallbacks,
  type GetSessionFn,
} from '../authBootstrap';

const makeCallbacks = (): AuthBootstrapCallbacks => ({
  setAuthenticated: jest.fn(),
  setUnauthenticated: jest.fn(),
  setLoading: jest.fn(),
});

const makeSession = (
  overrides: { id?: string; email?: string | null } = {},
): Session => {
  const userId = overrides.id ?? 'uid-1';
  // `email` is intentionally falsy-aware — Supabase returns null
  // for users created without an email (Apple Sign In private
  // relay can leave it null on second-launch). The helper under
  // test maps null → undefined at the callback boundary.
  const email = 'email' in overrides ? overrides.email : 'a@b.com';
  return {
    user: {
      id: userId,
      email,
    },
  } as unknown as Session;
};

describe('bootstrapAuthSession', () => {
  it('Case 1: Supabase configured + valid session → setAuthenticated', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn(async () => ({
      data: { session: makeSession({ id: 'uid-1', email: 'a@b.com' }) },
    }));
    await bootstrapAuthSession(true, false, false, getSession, callbacks);
    expect(callbacks.setAuthenticated).toHaveBeenCalledTimes(1);
    expect(callbacks.setAuthenticated).toHaveBeenCalledWith(
      'uid-1',
      'a@b.com',
    );
    expect(callbacks.setUnauthenticated).not.toHaveBeenCalled();
    expect(callbacks.setLoading).not.toHaveBeenCalled();
  });

  it('Case 1b: Supabase + valid session with null email → setAuthenticated with undefined email arg', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn(async () => ({
      data: { session: makeSession({ id: 'uid-2', email: null }) },
    }));
    await bootstrapAuthSession(true, false, false, getSession, callbacks);
    expect(callbacks.setAuthenticated).toHaveBeenCalledWith(
      'uid-2',
      undefined,
    );
  });

  it('Case 2: Supabase configured + null session + not authenticated → setUnauthenticated', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn(async () => ({
      data: { session: null },
    }));
    await bootstrapAuthSession(true, false, false, getSession, callbacks);
    expect(callbacks.setUnauthenticated).toHaveBeenCalledTimes(1);
    expect(callbacks.setAuthenticated).not.toHaveBeenCalled();
  });

  it('Case 3: Supabase configured + null session + isAuthenticated true → no state change (preserves persisted local auth)', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn(async () => ({
      data: { session: null },
    }));
    await bootstrapAuthSession(true, false, true, getSession, callbacks);
    expect(callbacks.setAuthenticated).not.toHaveBeenCalled();
    expect(callbacks.setUnauthenticated).not.toHaveBeenCalled();
    expect(callbacks.setLoading).not.toHaveBeenCalled();
  });

  it('Case 4: Supabase configured + getSession throws + not authed → setUnauthenticated (catch path)', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn(async () => {
      throw new Error('network error');
    });
    await bootstrapAuthSession(true, false, false, getSession, callbacks);
    expect(callbacks.setUnauthenticated).toHaveBeenCalledTimes(1);
    expect(callbacks.setAuthenticated).not.toHaveBeenCalled();
  });

  it('Case 4b: Supabase configured + getSession throws + isAuthenticated true → preserve persisted state (NO setUnauthenticated)', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn(async () => {
      throw new Error('network error');
    });
    await bootstrapAuthSession(true, false, true, getSession, callbacks);
    // Persisted local auth must survive a transient remote failure
    // on cold start. The onAuthStateChange listener (Stage 5.3 Tier 2
    // probe) reconciles when connectivity returns.
    expect(callbacks.setUnauthenticated).not.toHaveBeenCalled();
    expect(callbacks.setAuthenticated).not.toHaveBeenCalled();
    expect(callbacks.setLoading).not.toHaveBeenCalled();
  });

  it('Case 5: local-only mode (isSupabaseConfigured=false) + not authenticated → setUnauthenticated, getSession never called', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn();
    await bootstrapAuthSession(false, false, false, getSession, callbacks);
    expect(callbacks.setUnauthenticated).toHaveBeenCalledTimes(1);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('Case 6: local-only mode + isAuthenticated true → setLoading(false) only (持続 local-only)', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn();
    await bootstrapAuthSession(false, false, true, getSession, callbacks);
    expect(callbacks.setLoading).toHaveBeenCalledWith(false);
    expect(callbacks.setAuthenticated).not.toHaveBeenCalled();
    expect(callbacks.setUnauthenticated).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('Case 7 (regression guard): isLocalOnly=true + Supabase configured → bypass getSession (local-only takes priority)', async () => {
    const callbacks = makeCallbacks();
    const getSession: GetSessionFn = jest.fn();
    await bootstrapAuthSession(true, true, true, getSession, callbacks);
    expect(getSession).not.toHaveBeenCalled();
    expect(callbacks.setLoading).toHaveBeenCalledWith(false);
  });
});
