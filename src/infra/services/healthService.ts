import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthData {
  steps: number | null;
  activeCalories: number | null;
  totalCalories: number | null;
  weight: number | null;
  heartRate: number | null;
}

export interface HealthService {
  /** Human-readable name of the platform (e.g. "Apple Health", "Health Connect") */
  platformName: string;
  /** Check whether the health platform SDK is available on this device */
  isAvailable(): Promise<boolean>;
  /** Request read/write permissions */
  requestPermissions(): Promise<boolean>;
  /** Get step count for a given date (ISO date string) */
  getSteps(date: string): Promise<number | null>;
  /** Get active (exercise) calories for a given date */
  getActiveCalories(date: string): Promise<number | null>;
  /** Get total calories burned for a given date */
  getTotalCalories(date: string): Promise<number | null>;
  /** Write a weight entry */
  syncWeight(weightKg: number, date: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Mock implementation (used until native modules are integrated)
// ---------------------------------------------------------------------------

class MockHealthService implements HealthService {
  platformName = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    return false;
  }

  async getSteps(_date: string): Promise<number | null> {
    return null;
  }

  async getActiveCalories(_date: string): Promise<number | null> {
    return null;
  }

  async getTotalCalories(_date: string): Promise<number | null> {
    return null;
  }

  async syncWeight(_weightKg: number, _date: string): Promise<boolean> {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/** The active health service instance. Replace with a real implementation later. */
export const healthService: HealthService = new MockHealthService();

// Convenience re-exports matching the old API for backward compatibility
export const isHealthAvailable = () => healthService.isAvailable();
export const requestPermissions = () => healthService.requestPermissions();
export const getSteps = (date: string) => healthService.getSteps(date);
export const getActiveCalories = (date: string) => healthService.getActiveCalories(date);
export const syncWeight = (weightKg: number, date: string) =>
  healthService.syncWeight(weightKg, date);
