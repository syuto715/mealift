/* eslint-env jest */
// v1.4 ステージ 5.2 Phase 5.2A — jest global setup.
//
// This file runs once per test file via jest.config.js's
// setupFilesAfterEnv hook. The 1957-test suite that pre-dates this
// hook installs its own jest.mock() boundaries per file; the only
// thing crystallized here at the global level is the `__DEV__`
// React Native compile-time constant. Production code reaches for
// `if (__DEV__) { ... }` to gate diagnostic logging; without this
// shim those branches throw ReferenceError under jest.
//
// babel-preset-expo does NOT replace `__DEV__` with a literal in
// jest's transform path, so the symbol lands at the global level
// at runtime. The codebase's convention (see
// src/infra/services/__tests__/subscriptionService.test.ts and
// aiWeeklyReportService.test.ts) is for tests that need to flip
// the dev-vs-prod branch to set `(global as ...).__DEV__ = false`
// in their own setup. Defaulting to `true` here matches that
// convention — dev mode is the implicit default during jest runs.

(globalThis).__DEV__ = (globalThis).__DEV__ ?? true;
//
// The samples below are kept as commented templates so future
// component tests (added when RNTL coverage lands in Stage 5.3 / 5.4
// or v1.5) have a one-stop reference for the Expo native modules
// that always trip jest's CommonJS runtime.
//
// Activate a block by uncommenting it and dropping the matching
// per-file jest.mock() in the test files that need it. Keeping the
// templates here avoids a re-discovery hunt every time a new
// component test reaches for an Expo native module.

/*
// expo-constants — used by AppConfig boot + many feature flag reads.
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: { extra: {} },
    manifest: {},
  },
}));
*/

/*
// expo-linking — deep-link parse + createURL for auth callback.
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `mealift://${path}`),
  parse: jest.fn(() => ({ path: '', queryParams: {} })),
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));
*/

/*
// expo-splash-screen — preventAutoHideAsync at module load + hideAsync.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));
*/

/*
// expo-notifications — listener registration + last-response polling.
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));
*/
