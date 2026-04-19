export interface RestTimerSettings {
  enabled: boolean;
  defaultSeconds: number;
  autoStart: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  perExerciseOverride: boolean;
}

export const DEFAULT_REST_TIMER_SETTINGS: RestTimerSettings = {
  enabled: true,
  defaultSeconds: 90,
  autoStart: true,
  soundEnabled: true,
  vibrationEnabled: true,
  perExerciseOverride: true,
};

export interface ActiveTimer {
  startedAt: number;
  totalSeconds: number;
  notificationId: string | null;
  exerciseName?: string;
}
