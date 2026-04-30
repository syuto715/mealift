import {
  parseDecimalInput,
  shouldResyncDraft,
} from '../decimalInputHelpers';

describe('parseDecimalInput', () => {
  describe('empty input', () => {
    it('returns empty for ""', () => {
      expect(parseDecimalInput('')).toEqual({ kind: 'empty' });
    });
  });

  describe('valid decimals', () => {
    it('parses "0"', () => {
      expect(parseDecimalInput('0')).toEqual({ kind: 'parsed', value: 0 });
    });

    it('parses "0.5"', () => {
      expect(parseDecimalInput('0.5')).toEqual({ kind: 'parsed', value: 0.5 });
    });

    it('parses "72.5" — the bug repro value', () => {
      expect(parseDecimalInput('72.5')).toEqual({
        kind: 'parsed',
        value: 72.5,
      });
    });

    it('parses "100" as integer', () => {
      expect(parseDecimalInput('100')).toEqual({ kind: 'parsed', value: 100 });
    });

    it('parses "72." (trailing dot, mid-keystroke) as 72', () => {
      // The dot is preserved by the component's draft state; the
      // helper just reports what to commit.
      expect(parseDecimalInput('72.')).toEqual({ kind: 'parsed', value: 72 });
    });

    it('parses ".5" (leading dot) as 0.5', () => {
      expect(parseDecimalInput('.5')).toEqual({ kind: 'parsed', value: 0.5 });
    });

    it('parses "999.99"', () => {
      expect(parseDecimalInput('999.99')).toEqual({
        kind: 'parsed',
        value: 999.99,
      });
    });
  });

  describe('invalid input', () => {
    it('rejects "." alone (NaN under parseFloat)', () => {
      expect(parseDecimalInput('.')).toEqual({ kind: 'invalid' });
    });

    it('rejects multi-dot "72.5.0"', () => {
      expect(parseDecimalInput('72.5.0')).toEqual({ kind: 'invalid' });
    });

    it('rejects letters', () => {
      expect(parseDecimalInput('abc')).toEqual({ kind: 'invalid' });
    });

    it('rejects mixed alphanumeric "12a"', () => {
      expect(parseDecimalInput('12a')).toEqual({ kind: 'invalid' });
    });

    it('rejects whitespace "  72.5  "', () => {
      expect(parseDecimalInput('  72.5  ')).toEqual({ kind: 'invalid' });
    });

    it('rejects scientific notation "1e5"', () => {
      expect(parseDecimalInput('1e5')).toEqual({ kind: 'invalid' });
    });

    it('rejects negative sign "-5" (weight cannot be negative)', () => {
      expect(parseDecimalInput('-5')).toEqual({ kind: 'invalid' });
    });

    it('rejects plus sign "+5"', () => {
      expect(parseDecimalInput('+5')).toEqual({ kind: 'invalid' });
    });
  });
});

describe('shouldResyncDraft', () => {
  it('returns false when external value matches last committed', () => {
    expect(shouldResyncDraft(5, 5)).toBe(false);
  });

  it('returns true when external set and last committed was null', () => {
    expect(shouldResyncDraft(5, null)).toBe(true);
  });

  it('returns true when external cleared and last committed had a value', () => {
    expect(shouldResyncDraft(null, 5)).toBe(true);
  });

  it('returns false when both are null', () => {
    expect(shouldResyncDraft(null, null)).toBe(false);
  });

  it('treats 5.0 and 5 as equal (JS number equality)', () => {
    expect(shouldResyncDraft(5.0, 5)).toBe(false);
  });

  it('returns true when external value is a different number', () => {
    expect(shouldResyncDraft(5.5, 5)).toBe(true);
  });

  it('returns true when external value differs by fractional amount', () => {
    expect(shouldResyncDraft(72.5, 72)).toBe(true);
  });
});
