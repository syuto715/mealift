import { normalizeForSearch } from '../normalizeForSearch';

describe('normalizeForSearch (Drafting 158)', () => {
  it('lowercases ASCII', () => {
    expect(normalizeForSearch('STARBUCKS')).toBe('starbucks');
    expect(normalizeForSearch('TALL Grande')).toBe('tall grande');
  });

  it('NFKC folds fullwidth ASCII to halfwidth', () => {
    expect(normalizeForSearch('ＳＴＡＲＢＵＣＫＳ')).toBe('starbucks');
    expect(normalizeForSearch('１００ｇ')).toBe('100g');
  });

  it('NFKC folds halfwidth katakana to fullwidth', () => {
    expect(normalizeForSearch('ﾗｰﾒﾝ')).toBe('ラーメン');
  });

  it('hiragana → katakana', () => {
    expect(normalizeForSearch('らーめん')).toBe('ラーメン');
    expect(normalizeForSearch('やきとり')).toBe('ヤキトリ');
  });

  it('cross-script collapse: 4 variants of ラーメン map to the same form', () => {
    const forms = ['ラーメン', 'らーめん', 'ﾗｰﾒﾝ', 'ラーメン'.normalize('NFC')];
    const normalized = forms.map(normalizeForSearch);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('ラーメン');
  });

  it('preserves kanji + mixed scripts', () => {
    expect(normalizeForSearch('焼き鳥')).toBe('焼キ鳥');
    expect(normalizeForSearch('カフェ ラテ HOT')).toBe('カフェ ラテ hot');
  });

  it('returns empty string for falsy input', () => {
    expect(normalizeForSearch('')).toBe('');
  });
});
