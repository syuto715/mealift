// v1.4 ステージ 5.3 Phase 5.3A — probeSession tests.
//
// Pins the six failure-mode branches plus the timer behavior. The
// real Supabase client is never created here — the helper takes a
// SupabaseClient | null and we synthesize the minimum shape it
// actually reads (auth.getSession). This keeps the tests insulated
// from @supabase/supabase-js's module-load side effects (AsyncStorage
// import, AppState listener registration in client.ts, etc.).

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { probeSession } from '../probeSession';

type GetSessionResult = {
  data: { session: Session | null };
  error: { message: string } | null;
};

const makeClient = (
  getSessionImpl: () => Promise<GetSessionResult>,
): SupabaseClient => {
  return {
    auth: {
      getSession: jest.fn(getSessionImpl),
    },
  } as unknown as SupabaseClient;
};

const validSession = {
  user: { id: 'uid-1', email: 'a@b.com' },
} as unknown as Session;

describe('probeSession', () => {
  it('returns null immediately when the client is null (Supabase unconfigured)', async () => {
    const result = await probeSession(null, 0);
    expect(result).toBeNull();
  });

  it('returns the session payload on a successful getSession', async () => {
    const client = makeClient(async () => ({
      data: { session: validSession },
      error: null,
    }));
    const result = await probeSession(client, 0);
    expect(result).toBe(validSession);
  });

  it('returns null when getSession resolves with an error field', async () => {
    const client = makeClient(async () => ({
      data: { session: null },
      error: { message: 'auth probe failed' },
    }));
    const result = await probeSession(client, 0);
    expect(result).toBeNull();
  });

  it('returns null when getSession throws (network / decoder error)', async () => {
    const client = makeClient(async () => {
      throw new Error('TypeError: Network request failed');
    });
    const result = await probeSession(client, 0);
    expect(result).toBeNull();
  });

  it('returns null when getSession resolves with null session and no error (genuine SIGNED_OUT)', async () => {
    const client = makeClient(async () => ({
      data: { session: null },
      error: null,
    }));
    const result = await probeSession(client, 0);
    expect(result).toBeNull();
  });

  describe('delay behavior', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('with delayMs=0, calls getSession synchronously without arming a timer', async () => {
      jest.useFakeTimers();
      const getSessionMock = jest.fn(async () => ({
        data: { session: validSession },
        error: null,
      }));
      const client = {
        auth: { getSession: getSessionMock },
      } as unknown as SupabaseClient;

      const probePromise = probeSession(client, 0);
      // No timers pending — the helper went straight to getSession.
      expect(jest.getTimerCount()).toBe(0);
      await probePromise;
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });

    it('with delayMs > 0, awaits the delay before calling getSession', async () => {
      jest.useFakeTimers();
      const getSessionMock = jest.fn(async () => ({
        data: { session: validSession },
        error: null,
      }));
      const client = {
        auth: { getSession: getSessionMock },
      } as unknown as SupabaseClient;

      const probePromise = probeSession(client, 500);

      // Before timer advance: getSession should not have fired yet
      // (the helper is parked on the setTimeout).
      expect(getSessionMock).not.toHaveBeenCalled();

      // Advance the fake timer past the delay; the chained
      // getSession call resolves on the microtask queue right
      // after.
      jest.advanceTimersByTime(500);
      const result = await probePromise;

      expect(getSessionMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(validSession);
    });
  });
});
