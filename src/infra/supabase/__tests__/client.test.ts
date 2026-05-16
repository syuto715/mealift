// Phase 9.1.5 hotfix regression test — pins the two fixes that
// stopped the "session lost on app restart" bug:
//
//   1. createClient receives `storage: AsyncStorage` so persistSession
//      actually writes somewhere on RN. Without this, supabase-js
//      falls back to localStorage (undefined on RN) and the session
//      is in-memory only.
//
//   2. AppState 'change' listener wires startAutoRefresh / stopAutoRefresh
//      so a long-suspended app comes back with a fresh access token
//      instead of returning a null session that the auth listener
//      then maps to "logged out".
//
// Stubbing createClient + AppState lets us assert the exact arguments
// passed at module evaluation time without spinning up a real network
// client or React Native.

const mockCreateClient = jest.fn();
const mockStartAutoRefresh = jest.fn();
const mockStopAutoRefresh = jest.fn();
// Sentinel — a jest.fn so reference equality holds across imports
// without smuggling a non-mock-prefixed variable into the jest.mock
// factory (babel hoisting rule). Phase 5 lesson, applied again.
const mockProcessLock = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    return {
      auth: {
        startAutoRefresh: mockStartAutoRefresh,
        stopAutoRefresh: mockStopAutoRefresh,
      },
    };
  },
  // Re-exported from @supabase/auth-js through supabase-js's wildcard
  // export. Sentinel value for reference equality in the assertion.
  processLock: mockProcessLock,
}));

// AsyncStorage import resolves to a sentinel object so the assertion
// below can compare by reference instead of duck-typing.
const ASYNC_STORAGE_SENTINEL = { __mock: 'AsyncStorage' };
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: ASYNC_STORAGE_SENTINEL,
}));

const mockAddEventListener = jest.fn();
let mockAppStateValue: 'active' | 'background' | 'inactive' = 'active';
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: mockAddEventListener,
    get currentState() {
      return mockAppStateValue;
    },
  },
}));

jest.mock('react-native-url-polyfill/auto', () => ({}), { virtual: true });

jest.mock('../../../constants/config', () => ({
  APP_CONFIG: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

describe('supabase client (Phase 9.1.5 hotfix)', () => {
  beforeEach(() => {
    mockCreateClient.mockClear();
    mockStartAutoRefresh.mockClear();
    mockStopAutoRefresh.mockClear();
    mockAddEventListener.mockClear();
    // Codex review nit — without this reset, the background-cold-start
    // case below would leak its 'background' value to subsequent runs
    // when the test order changes (e.g. parallel runner).
    mockAppStateValue = 'active';
    jest.resetModules();
  });

  it('passes AsyncStorage as the auth.storage adapter', () => {
    require('../client');
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const [, , options] = mockCreateClient.mock.calls[0];
    expect(options).toMatchObject({
      auth: {
        storage: ASYNC_STORAGE_SENTINEL,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  });

  it('passes processLock as the auth.lock so cold-start refresh races serialize', () => {
    require('../client');
    const [, , options] = mockCreateClient.mock.calls[0];
    expect(options.auth.lock).toBe(mockProcessLock);
  });

  it('registers an AppState change listener at module load', () => {
    require('../client');
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
    const [event, handler] = mockAddEventListener.mock.calls[0];
    expect(event).toBe('change');
    expect(typeof handler).toBe('function');
  });

  it('starts the auto-refresh loop when AppState transitions to active', () => {
    require('../client');
    const handler = mockAddEventListener.mock.calls[0][1] as (s: string) => void;
    handler('active');
    // v1.4 ステージ 5.3 Tier 3 partial reorder — client.ts no
    // longer kicks startAutoRefresh on module load. The AppState
    // handler is the sole caller from this file now; the cold-
    // start kick (when AppState.currentState === 'active' at
    // module load) lives in app/_layout.tsx initialize() AFTER
    // the onAuthStateChange listener is subscribed.
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mockStopAutoRefresh).not.toHaveBeenCalled();
  });

  it('stops the auto-refresh loop when AppState transitions away from active', () => {
    require('../client');
    const handler = mockAddEventListener.mock.calls[0][1] as (s: string) => void;
    handler('background');
    expect(mockStopAutoRefresh).toHaveBeenCalledTimes(1);
    handler('inactive');
    expect(mockStopAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('does NOT kick the refresh loop at module load even when AppState is active (Tier 3 partial reorder)', () => {
    // Pre-5.3 pinned the opposite: client.ts started the refresh
    // ticker on cold start when the app was already foregrounded.
    // The reorder moved that kick into app/_layout.tsx so any
    // SIGNED_OUT fired by the first refresh tick is observable by
    // the onAuthStateChange listener (which is subscribed before
    // the kick in initialize()). client.ts is now strictly
    // listener-registration + the AppState transition handler.
    mockAppStateValue = 'active';
    require('../client');
    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
  });

  it('does not start the cold-start refresh when the app is launched in background (still true post-reorder)', () => {
    mockAppStateValue = 'background';
    require('../client');
    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
  });
});
