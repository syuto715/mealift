import { detectMealTypeByTime } from '../detectMealTypeByTime';

function at(h: number, m: number = 0): Date {
  const d = new Date(2026, 4, 20, h, m, 0, 0);
  return d;
}

describe('detectMealTypeByTime (Sprint 2.4.1)', () => {
  it('returns breakfast for 00:00 – 09:59', () => {
    expect(detectMealTypeByTime(at(0))).toBe('breakfast');
    expect(detectMealTypeByTime(at(6, 30))).toBe('breakfast');
    expect(detectMealTypeByTime(at(9, 59))).toBe('breakfast');
  });

  it('returns lunch for 10:00 – 14:59', () => {
    expect(detectMealTypeByTime(at(10))).toBe('lunch');
    expect(detectMealTypeByTime(at(12, 30))).toBe('lunch');
    expect(detectMealTypeByTime(at(14, 59))).toBe('lunch');
  });

  it('returns dinner for 15:00 – 20:59', () => {
    expect(detectMealTypeByTime(at(15))).toBe('dinner');
    expect(detectMealTypeByTime(at(19, 0))).toBe('dinner');
    expect(detectMealTypeByTime(at(20, 59))).toBe('dinner');
  });

  it('returns snack for 21:00 – 23:59', () => {
    expect(detectMealTypeByTime(at(21))).toBe('snack');
    expect(detectMealTypeByTime(at(23, 59))).toBe('snack');
  });
});
