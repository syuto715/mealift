// v1.4 ステージ 5.3 Phase 5.3D — buildAuthListenerDeps tests.
//
// The builder wires production callbacks into the factory's
// AuthListenerDeps shape with the option γ semantics:
//   - identifyRC dep is no-op (production RC fires in the
//     setAuthenticated wrapper)
//   - setAuthenticated wrapper fires RC identify + customer info
//   - setUnauthenticated wrapper fires logOutRC
//   - runLoginSync return value is dropped to fit Promise<void>
//
// These tests pin the contract — anyone changing the wrapper
// behavior in the future has to update an assertion here.

import {
  buildAuthListenerDeps,
  type AuthListenerCallbacks,
} from '../buildAuthListenerDeps';

const makeCallbacks = (
  overrides: Partial<AuthListenerCallbacks> = {},
): AuthListenerCallbacks => ({
  setAuthenticated: jest.fn(),
  setUnauthenticated: jest.fn(),
  identifyRevenueCatUser: jest.fn(async () => {}),
  applyCustomerInfoToProfile: jest.fn(async () => {}),
  getRevenueCatCustomerInfo: jest.fn(async () => ({ id: 'rc-info' })),
  logOutRevenueCat: jest.fn(async () => undefined),
  runLoginSync: jest.fn(async () => ({ kind: 'completed' as const })),
  getIsLocalOnly: jest.fn(() => false),
  ...overrides,
});

const flushMicrotasks = () => new Promise<void>((r) => setImmediate(r));

describe('buildAuthListenerDeps', () => {
  it('exposes the full AuthListenerDeps shape (setAuthenticated, setUnauthenticated, identifyRC no-op, runLoginSync, probeSession, isLocalOnly)', () => {
    const deps = buildAuthListenerDeps(makeCallbacks());
    expect(typeof deps.setAuthenticated).toBe('function');
    expect(typeof deps.setUnauthenticated).toBe('function');
    expect(typeof deps.identifyRC).toBe('function');
    expect(typeof deps.runLoginSync).toBe('function');
    expect(typeof deps.probeSession).toBe('function');
    expect(typeof deps.isLocalOnly).toBe('function');
  });

  it('setAuthenticated wrapper forwards uid+email AND fires identifyRevenueCatUser + applyCustomerInfoToProfile (production RC parity)', async () => {
    const callbacks = makeCallbacks();
    const deps = buildAuthListenerDeps(callbacks);

    deps.setAuthenticated('uid-1', 'a@b.com');

    // Synchronous arg forwarding.
    expect(callbacks.setAuthenticated).toHaveBeenCalledWith(
      'uid-1',
      'a@b.com',
    );
    // RC chain is fire-and-forget; let the microtasks settle.
    await flushMicrotasks();
    await flushMicrotasks();

    expect(callbacks.identifyRevenueCatUser).toHaveBeenCalledWith('uid-1');
    expect(callbacks.getRevenueCatCustomerInfo).toHaveBeenCalledTimes(1);
    expect(callbacks.applyCustomerInfoToProfile).toHaveBeenCalledWith({
      id: 'rc-info',
    });
  });

  it('setUnauthenticated wrapper fires both setUnauthenticated and logOutRevenueCat', () => {
    const callbacks = makeCallbacks();
    const deps = buildAuthListenerDeps(callbacks);

    deps.setUnauthenticated();

    expect(callbacks.setUnauthenticated).toHaveBeenCalledTimes(1);
    expect(callbacks.logOutRevenueCat).toHaveBeenCalledTimes(1);
  });

  it('identifyRC dep is a no-op (production RC handled in setAuthenticated wrapper to avoid double-fire on SIGNED_IN)', async () => {
    const callbacks = makeCallbacks();
    const deps = buildAuthListenerDeps(callbacks);

    await deps.identifyRC('uid-X');

    // identifyRC must NOT invoke identifyRevenueCatUser — that
    // would double-fire it on SIGNED_IN events (once via the
    // factory's identifyRC dep, once via the setAuthenticated
    // wrapper).
    expect(callbacks.identifyRevenueCatUser).not.toHaveBeenCalled();
    expect(callbacks.applyCustomerInfoToProfile).not.toHaveBeenCalled();
  });

  it('runLoginSync drops the RunLoginSyncOutcome return value (factory dep is Promise<void>)', async () => {
    const callbacks = makeCallbacks();
    const deps = buildAuthListenerDeps(callbacks);

    const result = await deps.runLoginSync('uid-2');

    expect(callbacks.runLoginSync).toHaveBeenCalledWith('uid-2');
    // The factory's contract is Promise<void> — the result is
    // explicitly discarded.
    expect(result).toBeUndefined();
  });

  it('isLocalOnly dep proxies getIsLocalOnly() so the value is read fresh per call (not a snapshot)', () => {
    let local = false;
    const callbacks = makeCallbacks({ getIsLocalOnly: () => local });
    const deps = buildAuthListenerDeps(callbacks);

    expect(deps.isLocalOnly()).toBe(false);
    local = true;
    expect(deps.isLocalOnly()).toBe(true);
  });

  it('probeSession dep accepts an override so tests can substitute a deterministic stub', async () => {
    const stub = jest.fn(async () => null);
    const callbacks = makeCallbacks({
      probeSession: stub,
    });
    const deps = buildAuthListenerDeps(callbacks);

    await deps.probeSession();
    expect(stub).toHaveBeenCalledTimes(1);
  });
});
