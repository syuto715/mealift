import { buildBrandMatcher, isAsciiOnly } from '../lib/brandMatcher';

describe('isAsciiOnly', () => {
  it('returns true for pure ASCII strings', () => {
    expect(isAsciiOnly('IN JELLY')).toBe(true);
    expect(isAsciiOnly('DNS')).toBe(true);
    expect(isAsciiOnly("GOLD'S GYM")).toBe(true);
    expect(isAsciiOnly('7-Eleven')).toBe(true);
  });

  it('returns false when any non-ASCII char is present', () => {
    expect(isAsciiOnly('明治')).toBe(false);
    expect(isAsciiOnly('森永')).toBe(false);
    expect(isAsciiOnly('ザバス')).toBe(false);
    // Mixed: even a single Japanese char tips the whole token to non-ASCII.
    expect(isAsciiOnly('SAVASプロテイン')).toBe(false);
  });
});

describe('buildBrandMatcher — ASCII tokens use word boundaries', () => {
  it('matches a standalone ASCII token', () => {
    const m = buildBrandMatcher('IN JELLY');
    expect(m("I'm IN JELLY heaven")).toBe(true);
  });

  it('does NOT match across a word boundary inside another word', () => {
    // Regression: "Protein Jelly Drink" contains the literal substring
    // "in jelly" across the protein/jelly word break, but "IN JELLY" the
    // brand token should not fire.
    const m = buildBrandMatcher('IN JELLY');
    expect(m('Protein Jelly Drink')).toBe(false);
  });

  it('does NOT match a substring inside a longer word', () => {
    const m = buildBrandMatcher('IN JELLY');
    expect(m('spinning jelly')).toBe(false);
  });

  it('matches case-insensitively', () => {
    const m = buildBrandMatcher('IN JELLY');
    expect(m('it was an in jelly party')).toBe(true);
    expect(m('it was an In Jelly party')).toBe(true);
  });

  it('handles tokens with apostrophes and hyphens via \\b anchors', () => {
    const m1 = buildBrandMatcher("GOLD'S GYM");
    expect(m1("members of GOLD'S GYM gathered")).toBe(true);
    expect(m1('the gold standard')).toBe(false);

    const m2 = buildBrandMatcher('7-Eleven');
    expect(m2('bought it at 7-Eleven yesterday')).toBe(true);
    expect(m2('combined 17-eleven items')).toBe(false);
  });

  it('handles single-token brand names like DNS', () => {
    const m = buildBrandMatcher('DNS');
    expect(m('DNS Whey Protein')).toBe(true);
    expect(m('configured DNSSEC settings')).toBe(false);
  });
});

describe('buildBrandMatcher — non-ASCII tokens use substring match', () => {
  it('matches Japanese brand tokens as substrings', () => {
    const m = buildBrandMatcher('明治');
    expect(m('明治ヨーグルト')).toBe(true);
    expect(m('森永と明治の比較')).toBe(true);
  });

  it('matches another Japanese brand token as substring', () => {
    const m = buildBrandMatcher('森永');
    expect(m('森永のミルク')).toBe(true);
  });

  it('matches katakana brand tokens as substrings', () => {
    const m = buildBrandMatcher('ザバス');
    expect(m('ザバスホエイ100')).toBe(true);
  });

  it('does not match unrelated Japanese strings', () => {
    const m = buildBrandMatcher('明治');
    expect(m('鶏むね肉のソテー')).toBe(false);
    expect(m('プロテインゼリー飲料')).toBe(false);
  });
});

describe('buildBrandMatcher — edge cases', () => {
  it('returns a no-match function for empty tokens', () => {
    const m = buildBrandMatcher('');
    expect(m('anything')).toBe(false);
    expect(m('')).toBe(false);
  });

  it('handles regex metacharacters in ASCII tokens', () => {
    // Real example: the warn-marker list contains "®". It's not ASCII (it
    // is in Latin-1 but > 127), so it falls to substring. We cover
    // ASCII-with-special-chars here for the regex-escape path.
    const m = buildBrandMatcher('A.B+C');
    expect(m('A.B+C is the brand')).toBe(true);
    // "A.B+C" the literal must appear; "AxBC" or "A B C" should not.
    expect(m('AxBxC')).toBe(false);
  });
});
