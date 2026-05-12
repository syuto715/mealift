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
const mockGetSession = jest.fn();
// Sentinel — a jest.fn so reference equality holds across imports
// without smuggling a non-mock-prefixed variable into the jest.mock
// factory (babel hoisting rule). Phase 5 lesson, applied again.
const mockProcessLock = jest.fn();
// Auth Fix Tier 2 — mock the SDK type predicates so the classifier
// test can configure them per scenario. The classifier composes
// these predicates; mocking them tests the COMPOSITION, with the
// substring-fallback layer covered by tests that deliberately make
// both predicates return false.
const mockIsAuthApiError = jest.fn();
const mockIsAuthRetryableFetchError = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    return {
      auth: {
        startAutoRefresh: mockStartAutoRefresh,
        stopAutoRefresh: mockStopAutoRefresh,
        getSession: mockGetSession,
      },
    };
  },
  // Re-exported from @supabase/auth-js through supabase-js's wildcard
  // export. Sentinel value for reference equality in the assertion.
  processLock: mockProcessLock,
  // Auth Fix Tier 2 — error classification predicates the wrapper
  // calls. Each test sets the return value per scenario.
  isAuthApiError: (...args: unknown[]) => mockIsAuthApiError(...args),
  isAuthRetryableFetchError: (...args: unknown[]) =>
    mockIsAuthRetryableFetchError(...args),
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

// Auth Fix Tier 2 — top-level beforeEach. Applies to EVERY test in
// this file (across all describe blocks). Required because the
// Tier 2 wrapper + classifier describes are siblings of the
// Phase-9.1.5 wiring describe; nesting them under the wiring describe
// would imply they only exercise the Phase-9.1.5 surface, which is
// misleading.
beforeEach(() => {
  // Use mockReset (not mockClear) on every mock so queued
  // .mockRejectedValueOnce / .mockResolvedValueOnce from a prior
  // test don't leak. mockClear only clears call history; mockReset
  // also drops implementations + queued returns. Required because
  // the wrapper tests use mockRejectedValueOnce to inject errors,
  // and the module-load cold-start kick consumes one queued value
  // per require().
  mockCreateClient.mockReset();
  mockStartAutoRefresh.mockReset();
  mockStopAutoRefresh.mockReset();
  mockGetSession.mockReset();
  mockAddEventListener.mockReset();
  mockIsAuthApiError.mockReset();
  mockIsAuthRetryableFetchError.mockReset();
  // Defaults applied AFTER reset so each test starts with predicates
  // = false and startAutoRefresh = resolved.
  mockIsAuthApiError.mockReturnValue(false);
  mockIsAuthRetryableFetchError.mockReturnValue(false);
  mockStartAutoRefresh.mockResolvedValue(undefined);
  // Codex review nit — without this reset, the background-cold-start
  // case below would leak its 'background' value to subsequent runs
  // when the test order changes (e.g. parallel runner).
  mockAppStateValue = 'active';
  jest.resetModules();
});

describe('supabase client (Phase 9.1.5 hotfix)', () => {

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
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(2); // 1 from cold-start kick + 1 from handler
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

  it('kicks the refresh loop on cold start when the app is already active', () => {
    mockAppStateValue = 'active';
    require('../client');
    expect(mockStartAutoRefresh).toHaveBeenCalled();
  });

  it('does not start the cold-start refresh when the app is launched in background', () => {
    mockAppStateValue = 'background';
    require('../client');
    // No active-state cold-start kick; only addEventListener registration.
    expect(mockStartAutoRefresh).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Auth Fix Tier 2 — startAutoRefreshWithRecovery + isTransientRefreshError
// ---------------------------------------------------------------------------
//
// Pins the recovery wrapper that closes Recon Report Candidates A (single-
// use refresh token race) + B (module-load timing). The wrapper catches
// errors from supabase.auth.startAutoRefresh, classifies them via the
// SDK's structured type predicates + a substring fallback, and for
// transient refresh-state errors attempts a single getSession() retry
// to recover. Permanent / unknown errors defer to the existing
// SIGNED_OUT flow.

describe('startAutoRefreshWithRecovery (Auth Fix Tier 2)', () => {
  beforeEach(() => {
    // Isolate the wrapper tests from the module-load cold-start kick.
    // With currentState='active', `require('../client')` fires
    // startAutoRefreshWithRecovery() at module-load and consumes
    // any queued mockRejectedValueOnce BEFORE the test's explicit
    // invocation. Setting to 'background' suppresses the kick so
    // the test's queued rejection lands on the test's own call.
    mockAppStateValue = 'background';
  });

  it('refresh success → no recovery attempt (getSession not called)', async () => {
    mockStartAutoRefresh.mockResolvedValueOnce(undefined);
    const { startAutoRefreshWithRecovery } = require('../client');
    await startAutoRefreshWithRecovery();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('refresh_token_already_used → getSession returns session → recovery succeeds', async () => {
    const apiError = Object.assign(new Error('Already used'), {
      code: 'refresh_token_already_used',
    });
    mockStartAutoRefresh.mockRejectedValueOnce(apiError);
    mockIsAuthApiError.mockReturnValue(true);
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
    });
    const { startAutoRefreshWithRecovery } = require('../client');
    await startAutoRefreshWithRecovery();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    // Success path returns silently; no second startAutoRefresh fire.
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('refresh_token_not_found → getSession returns session → recovery succeeds', async () => {
    const apiError = Object.assign(new Error('Not found'), {
      code: 'refresh_token_not_found',
    });
    mockStartAutoRefresh.mockRejectedValueOnce(apiError);
    mockIsAuthApiError.mockReturnValue(true);
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
    });
    const { startAutoRefreshWithRecovery } = require('../client');
    await startAutoRefreshWithRecovery();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('network blip (AuthRetryableFetchError) → getSession returns session → recovery succeeds', async () => {
    const netError = new Error('Network request failed');
    mockStartAutoRefresh.mockRejectedValueOnce(netError);
    mockIsAuthRetryableFetchError.mockReturnValue(true);
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
    });
    const { startAutoRefreshWithRecovery } = require('../client');
    await startAutoRefreshWithRecovery();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('transient error → getSession returns null → falls through to SIGNED_OUT flow', async () => {
    // Recovery attempted but storage truly empty — the wrapper returns
    // silently, letting the normal onAuthStateChange listener observe
    // the SIGNED_OUT event the SDK already fired internally.
    const apiError = Object.assign(new Error('Already used'), {
      code: 'refresh_token_already_used',
    });
    mockStartAutoRefresh.mockRejectedValueOnce(apiError);
    mockIsAuthApiError.mockReturnValue(true);
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    const { startAutoRefreshWithRecovery } = require('../client');
    await startAutoRefreshWithRecovery();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    // No throw — recovery exits silently on null session.
  });

  it('transient error → getSession throws → logged + falls through to SIGNED_OUT flow', async () => {
    // Defensive: even if the recovery retry itself fails, we must
    // not propagate the error out of the wrapper (which would crash
    // the AppState handler or module-load init).
    const apiError = Object.assign(new Error('Already used'), {
      code: 'refresh_token_already_used',
    });
    mockStartAutoRefresh.mockRejectedValueOnce(apiError);
    mockIsAuthApiError.mockReturnValue(true);
    mockGetSession.mockRejectedValueOnce(new Error('Storage IO error'));
    const { startAutoRefreshWithRecovery } = require('../client');
    await expect(startAutoRefreshWithRecovery()).resolves.toBeUndefined();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('permanent error (user_banned) → no recovery, defers to SIGNED_OUT flow', async () => {
    // user_banned is in the AuthApiError set but NOT a transient
    // refresh-state code, so the classifier returns false and the
    // wrapper exits without calling getSession.
    const apiError = Object.assign(new Error('User banned'), {
      code: 'user_banned',
    });
    mockStartAutoRefresh.mockRejectedValueOnce(apiError);
    mockIsAuthApiError.mockReturnValue(true); // is an AuthApiError…
    // …but its code is not in the transient set, so isTransientRefreshError → false
    const { startAutoRefreshWithRecovery } = require('../client');
    await startAutoRefreshWithRecovery();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('concurrent calls during recovery → idempotency guard short-circuits the second', async () => {
    // Two AppState transitions in quick succession could both throw
    // a transient error. The first triggers recovery; the second must
    // see isRecovering=true and skip without firing a second getSession.
    const apiError = Object.assign(new Error('Already used'), {
      code: 'refresh_token_already_used',
    });
    mockStartAutoRefresh.mockRejectedValue(apiError);
    mockIsAuthApiError.mockReturnValue(true);
    // Make getSession hang so the first recovery is in-flight when
    // the second wrapper call runs.
    let resolveGetSession: (v: unknown) => void;
    mockGetSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGetSession = resolve;
      }),
    );
    const { startAutoRefreshWithRecovery } = require('../client');
    const first = startAutoRefreshWithRecovery();
    // Yield so the first wrapper invocation reaches `isRecovering = true`
    // before the second one runs.
    await new Promise((resolve) => setImmediate(resolve));
    const second = startAutoRefreshWithRecovery();
    // Resolve the first's getSession so both can finish.
    resolveGetSession!({ data: { session: null } });
    await Promise.all([first, second]);
    // Only one recovery attempt: the second short-circuited at the guard.
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    // Both attempts called startAutoRefresh first (the guard is only on
    // recovery, not on the wrapper entry).
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(2);
  });
});

describe('isTransientRefreshError (Auth Fix Tier 2 classifier)', () => {
  beforeEach(() => {
    // Same isolation rationale as the wrapper describe — suppress
    // module-load cold-start kick so the classifier tests aren't
    // affected by what predicates the kick's wrapper invocation may
    // have probed.
    mockAppStateValue = 'background';
  });

  // Layer 1: network blip via isAuthRetryableFetchError
  it('returns true for AuthRetryableFetchError', () => {
    mockIsAuthRetryableFetchError.mockReturnValue(true);
    const { isTransientRefreshError } = require('../client');
    expect(isTransientRefreshError(new Error('Network request failed'))).toBe(
      true,
    );
  });

  // Layer 2: AuthApiError code-based — 4 transient codes
  it('returns true for AuthApiError code=refresh_token_already_used', () => {
    mockIsAuthApiError.mockReturnValue(true);
    const { isTransientRefreshError } = require('../client');
    const err = Object.assign(new Error('Already used'), {
      code: 'refresh_token_already_used',
    });
    expect(isTransientRefreshError(err)).toBe(true);
  });

  it('returns true for AuthApiError code=refresh_token_not_found', () => {
    mockIsAuthApiError.mockReturnValue(true);
    const { isTransientRefreshError } = require('../client');
    const err = Object.assign(new Error('Not found'), {
      code: 'refresh_token_not_found',
    });
    expect(isTransientRefreshError(err)).toBe(true);
  });

  it('returns true for AuthApiError code=session_not_found', () => {
    mockIsAuthApiError.mockReturnValue(true);
    const { isTransientRefreshError } = require('../client');
    const err = Object.assign(new Error('Session not found'), {
      code: 'session_not_found',
    });
    expect(isTransientRefreshError(err)).toBe(true);
  });

  it('returns true for AuthApiError code=session_expired', () => {
    mockIsAuthApiError.mockReturnValue(true);
    const { isTransientRefreshError } = require('../client');
    const err = Object.assign(new Error('Session expired'), {
      code: 'session_expired',
    });
    expect(isTransientRefreshError(err)).toBe(true);
  });

  // Layer 2: AuthApiError code-based — permanent codes (verify NOT transient)
  it('returns false for AuthApiError code=user_banned (permanent)', () => {
    mockIsAuthApiError.mockReturnValue(true);
    const { isTransientRefreshError } = require('../client');
    const err = Object.assign(new Error('User banned'), {
      code: 'user_banned',
    });
    expect(isTransientRefreshError(err)).toBe(false);
  });

  it('returns false for AuthApiError code=invalid_credentials (permanent)', () => {
    mockIsAuthApiError.mockReturnValue(true);
    const { isTransientRefreshError } = require('../client');
    const err = Object.assign(new Error('Invalid credentials'), {
      code: 'invalid_credentials',
    });
    expect(isTransientRefreshError(err)).toBe(false);
  });

  // Layer 3: substring fallback for plain Error / older SDK
  it('returns true for plain Error with "refresh token" message (fallback)', () => {
    // Both predicates return false (default in beforeEach) → fallback kicks in.
    const { isTransientRefreshError } = require('../client');
    expect(
      isTransientRefreshError(new Error('Invalid Refresh Token')),
    ).toBe(true);
  });

  it('returns true for plain Error with "fetch failed" message (fallback)', () => {
    const { isTransientRefreshError } = require('../client');
    expect(isTransientRefreshError(new Error('fetch failed'))).toBe(true);
  });

  it('returns false for non-Error inputs (null, undefined, plain object, string)', () => {
    const { isTransientRefreshError } = require('../client');
    expect(isTransientRefreshError(null)).toBe(false);
    expect(isTransientRefreshError(undefined)).toBe(false);
    expect(isTransientRefreshError({ message: 'refresh token' })).toBe(false);
    expect(isTransientRefreshError('refresh token error string')).toBe(false);
  });
});
