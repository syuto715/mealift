import { Platform } from 'react-native';
import {
  isHealthDataAvailable,
  requestAuthorization,
  queryStatisticsForQuantity,
  authorizationStatusFor,
  AuthorizationStatus,
} from '@kingstinct/react-native-healthkit';

// ---------------------------------------------------------------------------
// HealthKit is iOS-only; every public helper returns a safe default on
// non-iOS platforms so callers can invoke them unconditionally. The library
// still bundles on Android (the module has a JS stub) but calling any native
// method would throw — hence the early returns.
// ---------------------------------------------------------------------------

const ACTIVE_ENERGY_ID = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;

export function isHealthKitAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isHealthDataAvailable();
  } catch {
    return false;
  }
}

// Resolves to the current Apple-granted authorization state for the
// activeEnergyBurned read scope. Note: Apple deliberately obscures denial
// (returning `NotDetermined` for both "never asked" and "denied") so we
// cannot reliably tell them apart — callers should treat `NotDetermined`
// after a requestAuthorization() round-trip as effectively "denied".
export function getAuthorizationStatus(): AuthorizationStatus | null {
  if (!isHealthKitAvailable()) return null;
  try {
    return authorizationStatusFor(ACTIVE_ENERGY_ID);
  } catch {
    return null;
  }
}

// Triggers the native HealthKit permission sheet. Returns true if the SDK
// reports authorization (note: Apple hides the granular grant result —
// `true` just means "the sheet was shown without error"). Callers should
// confirm effective access by performing a read and checking for data.
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;
  try {
    const status = await requestAuthorization({
      toRead: [ACTIVE_ENERGY_ID],
      toShare: [],
    });
    return !!status;
  } catch (e) {
    console.error('[HealthKit] requestAuthorization failed', e);
    return false;
  }
}

// Sum of activeEnergyBurned (kcal) for the given local-calendar day.
// `isoDate` is a YYYY-MM-DD string; the window is [00:00, next 00:00) in
// the device's local time zone — matches the spec's "ワークアウト終了時刻の
// 日付で計上" rule since HealthKit buckets samples by their end time.
export async function getActiveEnergyForDate(isoDate: string): Promise<number> {
  if (!isHealthKitAvailable()) return 0;
  const start = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  try {
    const result = await queryStatisticsForQuantity(
      ACTIVE_ENERGY_ID,
      ['cumulativeSum'],
      { filter: { date: { startDate: start, endDate: end } } },
    );
    const kcal = result.sumQuantity?.quantity ?? 0;
    return Math.max(0, Math.round(kcal));
  } catch (e) {
    // A common cause is "no read permission" — HealthKit returns an error
    // rather than an empty result set in that case.
    console.warn('[HealthKit] queryStatisticsForQuantity failed', e);
    return 0;
  }
}
