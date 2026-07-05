// Regression coverage for the audit fix (C-03): finishRun(error) used to
// write `lastSyncAt: undefined`, and zustand v5's Object.assign-based merge
// copies undefined values — clobbering the last-success timestamp on every
// failed run (the sync screen then showed "30日以上前" / "未同期").

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

import { useSyncStatusStore } from '../syncStatusStore';

describe('syncStatusStore.finishRun (audit C-03 regression)', () => {
  beforeEach(() => {
    useSyncStatusStore.setState({
      state: 'idle',
      currentResource: null,
      progressTotal: 0,
      progressCompleted: 0,
      lastSyncAt: null,
      lastError: null,
    });
  });

  it('stamps lastSyncAt on a successful run', () => {
    useSyncStatusStore.getState().finishRun();
    const { state, lastSyncAt, lastError } = useSyncStatusStore.getState();
    expect(state).toBe('idle');
    expect(typeof lastSyncAt).toBe('number');
    expect(lastError).toBeNull();
  });

  it('preserves the prior lastSyncAt when a run fails', () => {
    useSyncStatusStore.getState().finishRun(); // success stamps a timestamp
    const stamped = useSyncStatusStore.getState().lastSyncAt;
    expect(typeof stamped).toBe('number');

    useSyncStatusStore.getState().finishRun('network error');
    const after = useSyncStatusStore.getState();
    expect(after.state).toBe('error');
    expect(after.lastError).toBe('network error');
    // The last-success timestamp must survive the failure (was clobbered
    // to undefined before the fix).
    expect(after.lastSyncAt).toBe(stamped);
  });
});
