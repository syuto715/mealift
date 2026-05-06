// Stub native-bound modules so node can load pushTokenService without
// crashing on the top-level expo-notifications / expo-constants /
// react-native imports. The mocks return minimal shapes; every test
// uses the dependency-injection seam in the function signature
// (`options.notifications`, `options.platform`, `options.projectId`)
// to drive behavior, so the jest mocks are never actually called.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: 'mock-project-id' } } },
  },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  registerExpoPushToken,
  type NotificationsBindings,
  type RegisterPushTokenOutcome,
} from '../pushTokenService';

interface UpsertCall {
  table: string;
  payload: Record<string, unknown>;
  onConflict?: string;
}

interface MockClientOpts {
  upsertError?: { message?: string } | null;
}

function makeMockClient(opts: MockClientOpts = {}) {
  const calls: UpsertCall[] = [];
  const client = {
    from(table: string) {
      return {
        upsert(
          payload: Record<string, unknown>,
          options?: { onConflict?: string },
        ) {
          calls.push({ table, payload, onConflict: options?.onConflict });
          return Promise.resolve({
            data: opts.upsertError ? null : payload,
            error: opts.upsertError ?? null,
          });
        },
      };
    },
  } as unknown as Parameters<typeof registerExpoPushToken>[1];
  return { client, calls };
}

function makeNotifications(
  overrides: Partial<{
    existing: 'granted' | 'denied' | 'undetermined';
    requested: 'granted' | 'denied';
    tokenError: Error | null;
    tokenValue: string;
  }> = {},
): { bindings: NotificationsBindings; calls: { request: number; getToken: number } } {
  const calls = { request: 0, getToken: 0 };
  return {
    bindings: {
      getPermissionsAsync: async () => ({
        status: overrides.existing ?? 'undetermined',
      }),
      requestPermissionsAsync: async () => {
        calls.request += 1;
        return { status: overrides.requested ?? 'granted' };
      },
      getExpoPushTokenAsync: async () => {
        calls.getToken += 1;
        if (overrides.tokenError) throw overrides.tokenError;
        return { data: overrides.tokenValue ?? 'ExponentPushToken[xxx]' };
      },
    },
    calls,
  };
}

describe('registerExpoPushToken — happy path', () => {
  it('returns registered with the issued token when everything succeeds', async () => {
    const { client, calls } = makeMockClient();
    const { bindings, calls: notifCalls } = makeNotifications({
      existing: 'granted',
      tokenValue: 'ExponentPushToken[ABC]',
    });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      projectId: 'p1',
    });

    expect(out).toEqual({ kind: 'registered', token: 'ExponentPushToken[ABC]' });
    // Permission already granted → OS prompt skipped.
    expect(notifCalls.request).toBe(0);
    expect(notifCalls.getToken).toBe(1);
    // Upsert hits push_tokens with the conflict key on (user_id, token).
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('push_tokens');
    expect(calls[0].onConflict).toBe('user_id,expo_push_token');
    expect(calls[0].payload).toMatchObject({
      user_id: 'user-1',
      expo_push_token: 'ExponentPushToken[ABC]',
      platform: 'ios',
    });
    expect(calls[0].payload.last_seen_at).toEqual(expect.any(String));
  });

  it('requests permission when existing status is undetermined', async () => {
    const { client } = makeMockClient();
    const { bindings, calls: notifCalls } = makeNotifications({
      existing: 'undetermined',
      requested: 'granted',
    });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      projectId: 'p1',
    });

    expect(out.kind).toBe('registered');
    expect(notifCalls.request).toBe(1);
  });
});

describe('registerExpoPushToken — refusal outcomes', () => {
  it('returns permission_denied when user declines the prompt', async () => {
    const { client, calls } = makeMockClient();
    const { bindings } = makeNotifications({
      existing: 'undetermined',
      requested: 'denied',
    });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      projectId: 'p1',
    });

    expect(out).toEqual({ kind: 'permission_denied' });
    expect(calls).toHaveLength(0);
  });

  it('returns permission_denied when existing status is denied and remains denied on re-request', async () => {
    // iOS won't re-prompt after first denial; requestPermissionsAsync
    // returns the cached denied status. Verify we treat that the same.
    const { client } = makeMockClient();
    const { bindings } = makeNotifications({
      existing: 'denied',
      requested: 'denied',
    });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      projectId: 'p1',
    });

    expect(out).toEqual({ kind: 'permission_denied' });
  });

  it('returns unsupported_platform on web / macos / windows', async () => {
    const { client, calls } = makeMockClient();
    const { bindings } = makeNotifications({ existing: 'granted' });

    const webOut = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'web',
      projectId: 'p1',
    });
    expect(webOut).toEqual({ kind: 'unsupported_platform' });

    const macOut = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'macos',
      projectId: 'p1',
    });
    expect(macOut).toEqual({ kind: 'unsupported_platform' });

    expect(calls).toHaveLength(0);
  });

  it('falls back to Constants.expoConfig.extra.eas.projectId when options.projectId is undefined', async () => {
    // The jest mock at the top of this file populates the Constants
    // fallback with 'mock-project-id'. Verify the function reaches
    // upsert (i.e. did NOT short-circuit to no_project_id) when no
    // override is passed.
    const { client, calls } = makeMockClient();
    const { bindings } = makeNotifications({ existing: 'granted' });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      // projectId omitted → uses Constants fallback (= 'mock-project-id').
    });

    expect(out.kind).toBe('registered');
    expect(calls).toHaveLength(1);
  });

  it('returns no_project_id when projectId override is empty string', async () => {
    // `options.projectId ??` skips the Constants fallback only on
    // null/undefined; an empty string is "set but falsy" → flows
    // through to the no_project_id branch. This mirrors the production
    // failure mode where app.config.ts misconfigured leaves the
    // Constants value falsy at runtime.
    const { client, calls } = makeMockClient();
    const { bindings } = makeNotifications({ existing: 'granted' });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      projectId: '',
    });

    expect(out).toEqual({ kind: 'no_project_id' });
    expect(calls).toHaveLength(0);
  });
});

describe('registerExpoPushToken — error outcomes', () => {
  it('returns error when getExpoPushTokenAsync throws', async () => {
    const { client, calls } = makeMockClient();
    const { bindings } = makeNotifications({
      existing: 'granted',
      tokenError: new Error('Expo push API unreachable'),
    });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      projectId: 'p1',
    });

    expect(out).toEqual({
      kind: 'error',
      message: 'Expo push API unreachable',
    });
    expect(calls).toHaveLength(0);
  });

  it('returns error when supabase upsert returns an error', async () => {
    const { client } = makeMockClient({
      upsertError: { message: 'unique constraint conflict' },
    });
    const { bindings } = makeNotifications({ existing: 'granted' });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      projectId: 'p1',
    });

    expect(out).toEqual({
      kind: 'error',
      message: 'unique constraint conflict',
    });
  });

  it('falls back to a generic message when the thrown error has no message field', async () => {
    const { client } = makeMockClient();
    const { bindings } = makeNotifications({
      existing: 'granted',
      tokenError: 'string-error' as unknown as Error,
    });

    const out = await registerExpoPushToken('user-1', client, {
      notifications: bindings,
      platform: 'ios',
      projectId: 'p1',
    });

    expect((out as Extract<RegisterPushTokenOutcome, { kind: 'error' }>).kind).toBe(
      'error',
    );
    expect(
      (out as Extract<RegisterPushTokenOutcome, { kind: 'error' }>).message,
    ).toBe('token request failed');
  });
});
