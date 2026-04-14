export interface HealthSyncSettings {
  enabled: boolean;
  syncWeight: boolean;
  syncSteps: boolean;
  syncCalories: boolean;
  syncWorkouts: boolean;
  lastSyncAt: string | null;
}

export interface HealthDataPoint {
  date: string;
  value: number;
}

export interface HealthWorkoutData {
  date: string;
  type: string;
  durationMinutes: number;
  caloriesBurned: number;
}
