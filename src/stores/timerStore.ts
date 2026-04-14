import { create } from 'zustand';
import { DEFAULT_REST_TIMER_SECONDS } from '../constants/defaults';

interface TimerState {
  isRunning: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  start: (seconds?: number) => void;
  stop: () => void;
  tick: () => void;
  reset: (seconds?: number) => void;
}

export const useTimerStore = create<TimerState>((set) => ({
  isRunning: false,
  remainingSeconds: DEFAULT_REST_TIMER_SECONDS,
  totalSeconds: DEFAULT_REST_TIMER_SECONDS,
  start: (seconds) =>
    set((state) => ({
      isRunning: true,
      remainingSeconds: seconds ?? state.totalSeconds,
      totalSeconds: seconds ?? state.totalSeconds,
    })),
  stop: () => set({ isRunning: false }),
  tick: () =>
    set((state) => {
      if (state.remainingSeconds <= 1) {
        return { remainingSeconds: 0, isRunning: false };
      }
      return { remainingSeconds: state.remainingSeconds - 1 };
    }),
  reset: (seconds) =>
    set((state) => ({
      isRunning: false,
      remainingSeconds: seconds ?? state.totalSeconds,
      totalSeconds: seconds ?? state.totalSeconds,
    })),
}));
