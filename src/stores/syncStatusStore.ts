import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// UI-facing sync state. The orchestrator (syncOrchestrator.ts) drives
// this store as it runs; the data-management screen (Phase 8) reads
// from it to render progress, last-sync timestamps, and error state.
//
// Persisted: lastSyncAt + lastError + dead-letter count survive app
// restarts so the user sees an honest picture even when the
// orchestrator hasn't run yet in the new session.

// 'claiming' is the pre-sync identity-remap step (Phase 4 / Phase 7).
// 'syncing' covers pull/push/submission — fine-grained progress lives
// in `currentResource`. UI can show the four top-level states; cards
// or progress bars consult `currentResource` for sub-state.
export type SyncState = 'idle' | 'claiming' | 'syncing' | 'error';

interface SyncStatusState {
  // Current orchestrator run state.
  state: SyncState;
  currentResource: string | null;
  // Progress within the current run. completed/total only meaningful when
  // state === 'syncing'. completed counts both pushed and pulled rows.
  progressTotal: number;
  progressCompleted: number;

  // Cumulative state — survives across runs.
  lastSyncAt: number | null;
  lastError: string | null;
  pendingCount: number;
  deadLetterCount: number;

  // Mutators called by the orchestrator and by loginSyncBootstrap.
  beginClaim: () => void;
  finishClaim: (error?: string) => void;
  beginRun: () => void;
  setResource: (resource: string | null) => void;
  setProgress: (completed: number, total: number) => void;
  setPendingCount: (count: number) => void;
  setDeadLetterCount: (count: number) => void;
  finishRun: (error?: string) => void;
  clearError: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>()(
  persist(
    (set) => ({
      state: 'idle',
      currentResource: null,
      progressTotal: 0,
      progressCompleted: 0,
      lastSyncAt: null,
      lastError: null,
      pendingCount: 0,
      deadLetterCount: 0,

      beginClaim: () =>
        set({
          state: 'claiming',
          currentResource: null,
          progressTotal: 0,
          progressCompleted: 0,
          lastError: null,
        }),

      // Called immediately after the claim step. Without arg, drops to
      // 'idle' so the next caller (typically syncAll's beginRun) can
      // transition to 'syncing'. With arg, parks the store at 'error'
      // so the UI surfaces the conflict / claim failure.
      finishClaim: (error) =>
        set({
          state: error ? 'error' : 'idle',
          currentResource: null,
          lastError: error ?? null,
        }),

      beginRun: () =>
        set({
          state: 'syncing',
          currentResource: null,
          progressTotal: 0,
          progressCompleted: 0,
          lastError: null,
        }),

      setResource: (resource) => set({ currentResource: resource }),

      setProgress: (completed, total) =>
        set({ progressCompleted: completed, progressTotal: total }),

      setPendingCount: (count) => set({ pendingCount: count }),

      setDeadLetterCount: (count) => set({ deadLetterCount: count }),

      finishRun: (error) =>
        set({
          state: error ? 'error' : 'idle',
          currentResource: null,
          progressTotal: 0,
          progressCompleted: 0,
          lastSyncAt: error ? undefined : Date.now(),
          lastError: error ?? null,
        }),

      clearError: () => set({ lastError: null, state: 'idle' }),
    }),
    {
      name: 'mealift-sync-status',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastSyncAt: state.lastSyncAt,
        lastError: state.lastError,
        pendingCount: state.pendingCount,
        deadLetterCount: state.deadLetterCount,
      }),
    },
  ),
);
