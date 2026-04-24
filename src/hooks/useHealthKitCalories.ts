import { useQuery } from '@tanstack/react-query';
import {
  getActiveEnergyForDate,
  isHealthKitAvailable,
} from '../infra/services/healthKitService';
import { useHealthKitStore } from '../stores/healthKitStore';

// Cached per-date activeEnergyBurned read. Returns 0 when the integration
// is disabled or permission hasn't been granted — callers can therefore
// unconditionally add this to the manual-workout calorie total.
export function useHealthKitCalories(isoDate: string) {
  const enabled = useHealthKitStore((s) => s.enabled);
  const permissionStatus = useHealthKitStore((s) => s.permissionStatus);

  const queryEnabled =
    enabled && permissionStatus === 'granted' && isHealthKitAvailable();

  const query = useQuery({
    queryKey: ['healthkit', 'activeEnergy', isoDate],
    queryFn: () => getActiveEnergyForDate(isoDate),
    enabled: queryEnabled,
    staleTime: 5 * 60_000,
  });

  return {
    calories: queryEnabled ? (query.data ?? 0) : 0,
    isActive: queryEnabled,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
