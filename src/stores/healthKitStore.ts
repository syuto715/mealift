import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// `unknown` before the user has interacted with the toggle,
// `granted` / `denied` after a permission round-trip, `unsupported` when the
// device is iPad / Simulator / non-iOS and HealthKit is not available.
export type HealthKitPermissionStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'unsupported';

interface HealthKitState {
  // User-facing opt-in toggle. Persisted so the choice survives app restarts.
  enabled: boolean;
  permissionStatus: HealthKitPermissionStatus;
  setEnabled: (enabled: boolean) => void;
  setPermissionStatus: (status: HealthKitPermissionStatus) => void;
}

export const useHealthKitStore = create<HealthKitState>()(
  persist(
    (set) => ({
      enabled: false,
      permissionStatus: 'unknown',
      setEnabled: (enabled) => set({ enabled }),
      setPermissionStatus: (permissionStatus) => set({ permissionStatus }),
    }),
    {
      name: 'mealift-healthkit',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
