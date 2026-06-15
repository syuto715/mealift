// v1.6.1 — logout must reset in-memory cross-user state (full-code audit C-1).
// Heavy/irrelevant deps are mocked; subscriptionService / profileStore /
// queryClient are REAL so we assert the actual reset happened.

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

jest.mock('../../utils/id', () => ({ generateId: () => 'test-id' }));
jest.mock('../../infra/supabase/auth', () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  signInWithApple: jest.fn(),
  signOut: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../infra/database/connection', () => ({
  getDatabase: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../infra/database/dataReconciliation', () => ({
  claimLocalDataForUser: jest.fn().mockResolvedValue({ kind: 'no_profile' }),
}));
jest.mock('../coachAdviceStore', () => ({
  useCoachAdviceStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../routineGenStore', () => ({
  useRoutineGenStore: { getState: () => ({ reset: jest.fn() }) },
}));
jest.mock('../diagnosticStore', () => ({
  useDiagnosticStore: { getState: () => ({ reset: jest.fn() }) },
}));

import { useAuthStore } from '../authStore';
import { useProfileStore } from '../profileStore';
import { setTier, getCurrentTier } from '../../infra/services/subscriptionService';
import { queryClient } from '../../infra/query/queryClient';
import type { Profile } from '../../types/profile';

describe('authStore.logout — in-memory cross-user reset (v1.6.1)', () => {
  it('resets currentTier, profileStore, and the query cache', async () => {
    // Arrange: simulate User A's session.
    setTier('pro');
    useProfileStore.getState().setProfile({ id: 'user-a', displayName: 'A' } as unknown as Profile);
    const clearSpy = jest.spyOn(queryClient, 'clear');
    expect(getCurrentTier()).toBe('pro');
    expect(useProfileStore.getState().profile).not.toBeNull();

    // Act
    await useAuthStore.getState().logout();

    // Assert: nothing of User A survives in memory.
    const observed = {
      tier: getCurrentTier(),
      profileNull: useProfileStore.getState().profile === null,
      cacheCleared: clearSpy.mock.calls.length > 0,
    };
    clearSpy.mockRestore();
    expect(observed).toEqual({ tier: 'free', profileNull: true, cacheCleared: true });
  });
});
