// v1.5 Stage 1 Phase 1.2 — disclaimer-seen flag persistence.
//
// §7.3 says the AI coach disclaimer renders once at the top of the
// FIRST conversation. We persist the "seen" boolean in MMKV so it
// survives app restarts but is reset on reinstall (matching the
// existing aiMenuStagingStore pattern).

import { MMKV } from 'react-native-mmkv';

const STORAGE_ID = 'coach.persona.v1';
const DISCLAIMER_SEEN_KEY = 'disclaimer_seen';

let storage: MMKV | null = null;
function getStorage(): MMKV {
  if (!storage) {
    storage = new MMKV({ id: STORAGE_ID });
  }
  return storage;
}

export function isDisclaimerSeen(): boolean {
  return getStorage().getBoolean(DISCLAIMER_SEEN_KEY) ?? false;
}

export function markDisclaimerSeen(): void {
  getStorage().set(DISCLAIMER_SEEN_KEY, true);
}

/** Test-only — resets the persisted flag so the disclaimer
 *  re-renders. NOT wired to any user-facing surface. */
export function __resetDisclaimerForTest(): void {
  getStorage().delete(DISCLAIMER_SEEN_KEY);
}
