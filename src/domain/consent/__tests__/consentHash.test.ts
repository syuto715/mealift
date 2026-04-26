import {
  computeConsentTextHash,
  verifyConsentTextHash,
} from '../consentHash';

describe('computeConsentTextHash', () => {
  it('produces stable SHA256 for identical input', () => {
    const text = '利用規約 第1条 ...';
    expect(computeConsentTextHash(text)).toBe(computeConsentTextHash(text));
  });

  it('produces 64-character lowercase hex string', () => {
    const hash = computeConsentTextHash('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the canonical SHA256 of "hello" after trim', () => {
    // Sanity check against a known external value. "hello" → SHA256
    // is well-documented; if our normalization or library ever drifts,
    // this catches it immediately.
    expect(computeConsentTextHash('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('normalizes line endings (CRLF and LF produce same hash)', () => {
    const lf = 'line1\nline2';
    const crlf = 'line1\r\nline2';
    expect(computeConsentTextHash(lf)).toBe(computeConsentTextHash(crlf));
  });

  it('normalizes lone CR (old Mac) to LF', () => {
    const lf = 'line1\nline2';
    const cr = 'line1\rline2';
    expect(computeConsentTextHash(lf)).toBe(computeConsentTextHash(cr));
  });

  it('trims leading and trailing whitespace', () => {
    expect(computeConsentTextHash('  hello  ')).toBe(
      computeConsentTextHash('hello'),
    );
  });

  it('preserves internal whitespace (formatting matters)', () => {
    expect(computeConsentTextHash('a  b')).not.toBe(
      computeConsentTextHash('a b'),
    );
  });

  it('different text produces different hash', () => {
    expect(computeConsentTextHash('text1')).not.toBe(
      computeConsentTextHash('text2'),
    );
  });

  it('handles Japanese text correctly (UTF-8 codepoints)', () => {
    const ja1 = '利用規約に同意します';
    const ja2 = '利用規約に同意します';
    expect(computeConsentTextHash(ja1)).toBe(computeConsentTextHash(ja2));
    // And produces different hashes for different Japanese strings.
    expect(computeConsentTextHash(ja1)).not.toBe(
      computeConsentTextHash('利用規約に同意しません'),
    );
  });

  it('handles empty string without throwing', () => {
    expect(() => computeConsentTextHash('')).not.toThrow();
    expect(computeConsentTextHash('')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyConsentTextHash', () => {
  it('returns true for matching text and hash', () => {
    const text = '利用規約 ...';
    const hash = computeConsentTextHash(text);
    expect(verifyConsentTextHash(text, hash)).toBe(true);
  });

  it('returns false for mismatched text', () => {
    const hash = computeConsentTextHash('original');
    expect(verifyConsentTextHash('modified', hash)).toBe(false);
  });

  it('treats CRLF and LF input as the same when verifying', () => {
    const hash = computeConsentTextHash('line1\nline2');
    expect(verifyConsentTextHash('line1\r\nline2', hash)).toBe(true);
  });
});
