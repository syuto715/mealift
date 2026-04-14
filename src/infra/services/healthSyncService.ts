import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HealthSyncSettings, HealthDataPoint } from '../../types/healthSync';

const STORAGE_KEY = 'health_sync_settings';

export const DEFAULT_HEALTH_SETTINGS: HealthSyncSettings = {
  enabled: false,
  syncWeight: true,
  syncSteps: true,
  syncCalories: true,
  syncWorkouts: true,
  lastSyncAt: null,
};

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

export async function loadHealthSyncSettings(): Promise<HealthSyncSettings> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_HEALTH_SETTINGS, ...JSON.parse(stored) };
    return { ...DEFAULT_HEALTH_SETTINGS };
  } catch {
    return { ...DEFAULT_HEALTH_SETTINGS };
  }
}

export async function saveHealthSyncSettings(
  settings: HealthSyncSettings,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Health platform availability check
// ---------------------------------------------------------------------------

export function getHealthPlatformName(): string {
  if (Platform.OS === 'ios') return 'Apple Health';
  if (Platform.OS === 'android') return 'Health Connect';
  return 'ヘルスケア';
}

/**
 * Check if the health platform is available on this device.
 * Returns false in Expo Go / development builds without native modules.
 */
export async function isHealthAvailable(): Promise<boolean> {
  // In development, native health modules aren't available.
  // When built with EAS, this should check actual availability:
  // - iOS: HealthKit is always available on iPhone
  // - Android: Check if Health Connect app is installed
  try {
    if (Platform.OS === 'ios') {
      return false; // Stub: not available in dev
    }
    if (Platform.OS === 'android') {
      return false; // Stub: not available in dev
    }
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Permission request
// ---------------------------------------------------------------------------

export async function requestHealthPermissions(): Promise<boolean> {
  // Real implementation would request:
  // iOS: HKHealthStore.requestAuthorization for weight, steps, calories, workouts
  // Android: HealthConnect permissions for same data types
  return false;
}

// ---------------------------------------------------------------------------
// Data sync (stubs — implement with real SDK when building with EAS)
// ---------------------------------------------------------------------------

/** Read weight data from health platform */
export async function readWeightFromHealth(
  _startDate: Date,
  _endDate: Date,
): Promise<HealthDataPoint[]> {
  return [];
}

/** Write weight to health platform */
export async function writeWeightToHealth(
  _date: Date,
  _weightKg: number,
): Promise<void> {
}

/** Read step count from health platform */
export async function readStepsFromHealth(
  _startDate: Date,
  _endDate: Date,
): Promise<HealthDataPoint[]> {
  return [];
}

/** Read active calories from health platform */
export async function readCaloriesFromHealth(
  _startDate: Date,
  _endDate: Date,
): Promise<HealthDataPoint[]> {
  return [];
}

/** Write workout to health platform */
export async function writeWorkoutToHealth(
  _date: Date,
  _durationMinutes: number,
  _caloriesBurned: number,
): Promise<void> {
}

// ---------------------------------------------------------------------------
// Full sync (called from settings or on app launch)
// ---------------------------------------------------------------------------

export async function performFullSync(
  _profileId: string,
): Promise<{ synced: boolean; error?: string }> {
  const settings = await loadHealthSyncSettings();
  if (!settings.enabled) return { synced: false };

  const available = await isHealthAvailable();
  if (!available) {
    return { synced: false, error: 'ヘルスケアプラットフォームが利用できません' };
  }

  // Real implementation would:
  // 1. Read recent data from health platform
  // 2. Merge with local data (dedup by date)
  // 3. Write local-only data back to health platform
  // 4. Update lastSyncAt

  const updatedSettings = { ...settings, lastSyncAt: new Date().toISOString() };
  await saveHealthSyncSettings(updatedSettings);

  return { synced: true };
}
