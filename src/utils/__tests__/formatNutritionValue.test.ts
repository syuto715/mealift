import { formatNutritionValue } from '../formatNutritionValue';

describe('formatNutritionValue (Sprint 2.3.3 detail view)', () => {
  it('returns the em-dash for missing values', () => {
    expect(formatNutritionValue(null)).toBe('—');
    expect(formatNutritionValue(undefined)).toBe('—');
    expect(formatNutritionValue(Number.NaN)).toBe('—');
  });

  it('renders integers without trailing decimals when decimals=0', () => {
    expect(formatNutritionValue(343)).toBe('343');
    expect(formatNutritionValue(0)).toBe('0');
  });

  it('rounds to the requested decimal precision', () => {
    expect(formatNutritionValue(11.34, 1)).toBe('11.3');
    expect(formatNutritionValue(0.123, 2)).toBe('0.12');
  });

  it('handles negative numbers symmetrically', () => {
    expect(formatNutritionValue(-2.5, 1)).toBe('-2.5');
  });
});
