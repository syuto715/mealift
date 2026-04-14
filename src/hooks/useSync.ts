// TODO: Implement sync hook
export function useSync() {
  return {
    isSyncing: false,
    lastSyncedAt: null as string | null,
    pendingCount: 0,
    sync: async () => {},
  };
}
