// v1.5 Phase 2.3 Sprint 2.3.2 — useDebouncedValue smoke test.
//
// Full render-cycle behavior (timer reset on rapid changes) is
// exercised via the dev preview route `/nutrition/search-v2` at
// app runtime; React render-level unit tests would need a
// testing-library bundle the repo intentionally omits (Path C
// jest@30 + manual extension — see jest.config.js).
//
// This smoke test pins the module surface so callers can rely on
// the export shape without spinning up React.

import { useDebouncedValue } from '../useDebouncedValue';

describe('useDebouncedValue (Sprint 2.3.2)', () => {
  it('is exported as a callable function', () => {
    expect(typeof useDebouncedValue).toBe('function');
  });
});
