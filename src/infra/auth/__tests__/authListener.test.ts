// v1.4 ステージ 5.2 Phase 5.2C — authListener factory tests.
//
// Pinned scenarios cover the Tier 2 spurious-SIGNED_OUT defense.
// The factory is exercised in isolation — Stage 5.3 will wire it
// into app/_layout.tsx, and these tests will keep it honest as
// the probe / RC / sync deps evolve.

import type { Session } from '@supabase/supabase-js';
import {
  makeAuthListener,
  type AuthListenerDeps,
} from '../authListener';

const makeSession = (
  overrides: { id?: string; email?: string | null } = {},
): Session => {
  const userId = overrides.id ?? 'uid-1';
  const email = 'email' in overrides ? overrides.email : 'a@b.com';
  return {
    user: {
      id: userId,
      email,
    },
  } as unknown as Session;
};

const makeDeps = (
  overrides: Partial<AuthListenerDeps> = {},
): AuthListenerDeps => ({
  setAuthenticated: jest.fn(),
  setUnauthenticated: jest.fn(),
  identifyRC: jest.fn(async () => {}),
  runLoginSync: jest.fn(async () => {}),
  probeSession: jest.fn(async () => null),
  isLocalOnly: jest.fn(() => false),
  ...overrides,
});

describe('makeAuthListener', () => {
  it('Scenario 1: Normal SIGNED_IN → setAuthenticated + identifyRC + runLoginSync (1 each), probe untouched', async () => {
    const deps = makeDeps();
    const listener = makeAuthListener(deps);
    const session = makeSession({ id: 'uid-1', email: 'a@b.com' });

    await listener('SIGNED_IN', session);

    expect(deps.setAuthenticated).toHaveBeenCalledTimes(1);
    expect(deps.setAuthenticated).toHaveBeenCalledWith('uid-1', 'a@b.com');
    expect(deps.identifyRC).toHaveBeenCalledTimes(1);
    expect(deps.identifyRC).toHaveBeenCalledWith('uid-1');
    expect(deps.runLoginSync).toHaveBeenCalledTimes(1);
    expect(deps.runLoginSync).toHaveBeenCalledWith('uid-1');
    expect(deps.probeSession).not.toHaveBeenCalled();
    expect(deps.setUnauthenticated).not.toHaveBeenCalled();
  });

  it('Scenario 1b: TOKEN_REFRESHED with session → setAuthenticated, NO identifyRC / runLoginSync', async () => {
    const deps = makeDeps();
    const listener = makeAuthListener(deps);
    const session = makeSession({ id: 'uid-3' });

    await listener('TOKEN_REFRESHED', session);

    expect(deps.setAuthenticated).toHaveBeenCalledWith('uid-3', 'a@b.com');
    expect(deps.identifyRC).not.toHaveBeenCalled();
    expect(deps.runLoginSync).not.toHaveBeenCalled();
  });

  it('Scenario 2: Spurious SIGNED_OUT + probe recovers → setAuthenticated (recovered) + identifyRC, NO runLoginSync, NO setUnauthenticated', async () => {
    const recoveredSession = makeSession({ id: 'uid-2', email: 'c@d.com' });
    const deps = makeDeps({
      probeSession: jest.fn(async () => recoveredSession),
    });
    const listener = makeAuthListener(deps);

    await listener('SIGNED_OUT', null);

    expect(deps.probeSession).toHaveBeenCalledTimes(1);
    expect(deps.setAuthenticated).toHaveBeenCalledWith('uid-2', 'c@d.com');
    expect(deps.identifyRC).toHaveBeenCalledTimes(1);
    expect(deps.runLoginSync).not.toHaveBeenCalled();
    expect(deps.setUnauthenticated).not.toHaveBeenCalled();
  });

  it('Scenario 3: Genuine SIGNED_OUT (probe returns null) → setUnauthenticated, probe called exactly once', async () => {
    const deps = makeDeps();
    const listener = makeAuthListener(deps);

    await listener('SIGNED_OUT', null);

    expect(deps.probeSession).toHaveBeenCalledTimes(1);
    expect(deps.setUnauthenticated).toHaveBeenCalledTimes(1);
    expect(deps.setAuthenticated).not.toHaveBeenCalled();
  });

  it('Scenario 4 (regression guard): isLocalOnly=true bypasses probe entirely', async () => {
    const deps = makeDeps({ isLocalOnly: jest.fn(() => true) });
    const listener = makeAuthListener(deps);

    await listener('SIGNED_OUT', null);

    expect(deps.probeSession).not.toHaveBeenCalled();
    expect(deps.setUnauthenticated).toHaveBeenCalledTimes(1);
    expect(deps.setAuthenticated).not.toHaveBeenCalled();
  });

  it('Scenario 5 (regression guard): probe throws → setUnauthenticated (probe failures do NOT recover)', async () => {
    const deps = makeDeps({
      probeSession: jest.fn(async () => {
        throw new Error('storage probe network error');
      }),
    });
    const listener = makeAuthListener(deps);

    await listener('SIGNED_OUT', null);

    expect(deps.probeSession).toHaveBeenCalledTimes(1);
    expect(deps.setUnauthenticated).toHaveBeenCalledTimes(1);
    expect(deps.setAuthenticated).not.toHaveBeenCalled();
  });
});
