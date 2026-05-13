// v1.4 / UI 改善 v1 Phase D-1 — homeGreeting tests.
//
// 4-tier boundary verification + TZ stability via deterministic
// Date constructor (Onboarding v2 Phase E-3 pattern: local-time
// constructor `new Date(Y, M, D, H, M, S)` to avoid ISO-parse
// drift across runner TZ).

import { getHomeGreeting } from '../homeGreeting';

// Local-time constructor: matches what the helper reads
// (`new Date().getHours()` returns local-TZ hours).
function localTime(hour: number, minute = 0): Date {
  return new Date(2026, 4, 14, hour, minute, 0);
}

describe('getHomeGreeting — 4-tier time-of-day mapping', () => {
  describe('05:00 - 09:59 朝 (おはようございます)', () => {
    it.each([
      ['05:00', 5, 0],
      ['07:30', 7, 30],
      ['09:00', 9, 0],
      ['09:59', 9, 59],
    ])('%s → おはようございます + sunny-outline', (_label, hour, minute) => {
      const out = getHomeGreeting(localTime(hour, minute));
      expect(out.label).toBe('おはようございます');
      expect(out.icon).toBe('sunny-outline');
    });
  });

  describe('10:00 - 16:59 昼 (こんにちは)', () => {
    it.each([
      ['10:00', 10, 0],
      ['12:00', 12, 0],
      ['15:30', 15, 30],
      ['16:59', 16, 59],
    ])('%s → こんにちは + sunny', (_label, hour, minute) => {
      const out = getHomeGreeting(localTime(hour, minute));
      expect(out.label).toBe('こんにちは');
      expect(out.icon).toBe('sunny');
    });
  });

  describe('17:00 - 21:59 夕 (こんばんは)', () => {
    it.each([
      ['17:00', 17, 0],
      ['19:00', 19, 0],
      ['21:00', 21, 0],
      ['21:59', 21, 59],
    ])('%s → こんばんは + moon-outline', (_label, hour, minute) => {
      const out = getHomeGreeting(localTime(hour, minute));
      expect(out.label).toBe('こんばんは');
      expect(out.icon).toBe('moon-outline');
    });
  });

  describe('22:00 - 04:59 深夜 / 早朝 (お疲れさまです)', () => {
    it.each([
      ['22:00', 22, 0],
      ['23:30', 23, 30],
      ['00:00', 0, 0],
      ['02:00', 2, 0],
      ['04:59', 4, 59],
    ])('%s → お疲れさまです + moon', (_label, hour, minute) => {
      const out = getHomeGreeting(localTime(hour, minute));
      expect(out.label).toBe('お疲れさまです');
      expect(out.icon).toBe('moon');
    });
  });

  describe('boundary integrity (4 transition points)', () => {
    it('boundary 04:59 → 05:00: お疲れさまです → おはようございます', () => {
      expect(getHomeGreeting(localTime(4, 59)).label).toBe('お疲れさまです');
      expect(getHomeGreeting(localTime(5, 0)).label).toBe('おはようございます');
    });

    it('boundary 09:59 → 10:00: おはようございます → こんにちは', () => {
      expect(getHomeGreeting(localTime(9, 59)).label).toBe('おはようございます');
      expect(getHomeGreeting(localTime(10, 0)).label).toBe('こんにちは');
    });

    it('boundary 16:59 → 17:00: こんにちは → こんばんは', () => {
      expect(getHomeGreeting(localTime(16, 59)).label).toBe('こんにちは');
      expect(getHomeGreeting(localTime(17, 0)).label).toBe('こんばんは');
    });

    it('boundary 21:59 → 22:00: こんばんは → お疲れさまです', () => {
      expect(getHomeGreeting(localTime(21, 59)).label).toBe('こんばんは');
      expect(getHomeGreeting(localTime(22, 0)).label).toBe('お疲れさまです');
    });
  });

  describe('TZ stability — local-hour invariant', () => {
    // Helper reads `now.getHours()` which returns hours in the
    // process's local TZ. The Onboarding v2 Phase E-3 lesson: use
    // local-constructor Date for test determinism so all 3 TZ
    // jest runners see the same hour. The boundary values are
    // pure integer comparisons — no ISO parse, no DST math —
    // so the suite passes identically in UTC / Asia/Tokyo /
    // America/Los_Angeles via the test runner's local-Date contract.
    it('uses local hour, not UTC', () => {
      // If the helper called getUTCHours() instead, this localTime(7am)
      // → UTC 22pm (JST) would return 「お疲れさまです」 in TZ=JST runner.
      // Verify it returns 「おはようございます」 = local-hour read.
      const out = getHomeGreeting(localTime(7, 0));
      expect(out.label).toBe('おはようございます');
    });
  });

  describe('production no-arg call', () => {
    it('uses new Date() when called without argument', () => {
      // Smoke test only — actual hour depends on when test runs.
      // Just verify the return shape is valid (defined-label + defined-icon).
      const out = getHomeGreeting();
      expect(out.label.length).toBeGreaterThan(0);
      expect(out.icon).toBeDefined();
    });
  });
});
