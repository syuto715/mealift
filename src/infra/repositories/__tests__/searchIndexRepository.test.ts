import { buildMatchExpression } from '../../../utils/buildMatchExpression';

describe('buildMatchExpression (Drafting 158 query-side normalization)', () => {
  it('returns empty string for blank input', () => {
    expect(buildMatchExpression('')).toBe('');
    expect(buildMatchExpression('   ')).toBe('');
  });

  it('lowercases and prefix-matches a single ASCII token', () => {
    expect(buildMatchExpression('Starbucks')).toBe('"starbucks"*');
  });

  it('hiragana query collapses to katakana before MATCH', () => {
    expect(buildMatchExpression('らーめん')).toBe('"ラーメン"*');
  });

  it('halfwidth katakana folds to fullwidth (NFKC)', () => {
    expect(buildMatchExpression('ﾗｰﾒﾝ')).toBe('"ラーメン"*');
  });

  it('cross-script ラーメン variants collapse to the same MATCH expression', () => {
    const variants = ['ラーメン', 'らーめん', 'ﾗｰﾒﾝ'];
    const exprs = variants.map(buildMatchExpression);
    expect(new Set(exprs).size).toBe(1);
  });

  it('multiple whitespace-separated tokens map to AND-of-prefix', () => {
    expect(buildMatchExpression('スタバ ラテ')).toBe('"スタバ"* "ラテ"*');
  });

  it('strips FTS5-syntax characters that would break MATCH', () => {
    expect(buildMatchExpression('CAFE (mocha)')).toBe('"cafe"* "mocha"*');
  });
});
