// v1.5 Stage 1 Phase 1.1 — types contract tests.

import {
  ageRangeFromBirthYear,
  isChatStream,
  type ChatStream,
} from '../types';

describe('ageRangeFromBirthYear', () => {
  const NOW = new Date('2026-05-17T00:00:00Z');

  it('buckets a 30-year-old into 30-34', () => {
    expect(ageRangeFromBirthYear(1996, NOW)).toBe('30-34');
  });

  it('buckets a 9-year-old into under-10', () => {
    expect(ageRangeFromBirthYear(2017, NOW)).toBe('under-10');
  });

  it('buckets an 85-year-old into 85-plus', () => {
    expect(ageRangeFromBirthYear(1941, NOW)).toBe('85-plus');
  });

  it('uses 5-year boundaries (29 → 25-29, 30 → 30-34)', () => {
    expect(ageRangeFromBirthYear(1997, NOW)).toBe('25-29');
    expect(ageRangeFromBirthYear(1996, NOW)).toBe('30-34');
  });

  it('defaults to current Date when now is omitted', () => {
    // The exact bucket depends on the host clock, but the return
    // should always be a valid string from the AgeRange union.
    const value = ageRangeFromBirthYear(2000);
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });
});

describe('isChatStream', () => {
  it('returns true for an object with the three required slots', () => {
    const fake = {
      meta: Promise.resolve(),
      done: Promise.resolve(),
      [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true }) }),
    } as unknown as ChatStream;
    expect(isChatStream(fake)).toBe(true);
  });

  it('returns false when meta or done is missing', () => {
    expect(
      isChatStream({
        [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true }) }),
      }),
    ).toBe(false);
  });

  it('returns false for null / non-objects', () => {
    expect(isChatStream(null)).toBe(false);
    expect(isChatStream(undefined)).toBe(false);
    expect(isChatStream('string')).toBe(false);
    expect(isChatStream(42)).toBe(false);
  });
});
