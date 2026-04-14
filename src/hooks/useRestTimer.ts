import { useEffect, useRef } from 'react';
import { useTimerStore } from '../stores/timerStore';

export function useRestTimer() {
  const store = useTimerStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (store.isRunning) {
      intervalRef.current = setInterval(() => {
        store.tick();
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [store.isRunning]);

  return {
    isRunning: store.isRunning,
    remainingSeconds: store.remainingSeconds,
    totalSeconds: store.totalSeconds,
    progress: store.totalSeconds > 0 ? 1 - store.remainingSeconds / store.totalSeconds : 0,
    start: store.start,
    stop: store.stop,
    reset: store.reset,
  };
}
