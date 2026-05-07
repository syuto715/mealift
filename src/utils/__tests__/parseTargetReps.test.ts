import { parseTargetReps } from '../parseTargetReps';

describe('parseTargetReps', () => {
  it('parses a single integer literal', () => {
    expect(parseTargetReps('5')).toBe(5);
    expect(parseTargetReps('8')).toBe(8);
    expect(parseTargetReps('12')).toBe(12);
    expect(parseTargetReps('1')).toBe(1);
  });

  it('parses a range to its floor median', () => {
    expect(parseTargetReps('8-12')).toBe(10);
    expect(parseTargetReps('1-3')).toBe(2);
    expect(parseTargetReps('7-9')).toBe(8);
    expect(parseTargetReps('5-10')).toBe(7); // floor(7.5) = 7
    expect(parseTargetReps('6-8')).toBe(7);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseTargetReps(' 5 ')).toBe(5);
    expect(parseTargetReps('\t8-12\n')).toBe(10);
  });

  it('returns null for null / undefined / empty / whitespace-only input', () => {
    expect(parseTargetReps(null)).toBeNull();
    expect(parseTargetReps(undefined)).toBeNull();
    expect(parseTargetReps('')).toBeNull();
    expect(parseTargetReps('   ')).toBeNull();
  });

  it('returns null for special pattern tokens (AMRAP, etc.)', () => {
    expect(parseTargetReps('AMRAP')).toBeNull();
    expect(parseTargetReps('failure')).toBeNull();
    expect(parseTargetReps('TBD')).toBeNull();
  });

  it('returns null for malformed numeric strings', () => {
    expect(parseTargetReps('8a')).toBeNull();
    expect(parseTargetReps('a8')).toBeNull();
    expect(parseTargetReps('foo')).toBeNull();
    expect(parseTargetReps('8-')).toBeNull();
    expect(parseTargetReps('-8')).toBeNull();
    expect(parseTargetReps('8 - 12')).toBeNull(); // strict format only
  });

  it('returns null for non-positive integers', () => {
    expect(parseTargetReps('0')).toBeNull();
    expect(parseTargetReps('0-3')).toBeNull();
    expect(parseTargetReps('-5')).toBeNull();
  });

  it('returns null for non-integer numerics', () => {
    expect(parseTargetReps('5.5')).toBeNull();
    expect(parseTargetReps('1.5')).toBeNull();
  });

  it('accepts decimal strings that resolve to an integer (5.0 → 5)', () => {
    // Number('5.0') === 5 and Number.isInteger(5) is true. Accept rather
    // than over-strictly rejecting any '.' character.
    expect(parseTargetReps('5.0')).toBe(5);
    expect(parseTargetReps('8.0')).toBe(8);
  });

  it('returns null for inverted ranges (high < low)', () => {
    expect(parseTargetReps('12-8')).toBeNull();
    expect(parseTargetReps('5-3')).toBeNull();
  });

  it('accepts equal-bound ranges as a single value', () => {
    // '5-5' is technically a range but median floor((5+5)/2)=5, valid.
    expect(parseTargetReps('5-5')).toBe(5);
  });
});
