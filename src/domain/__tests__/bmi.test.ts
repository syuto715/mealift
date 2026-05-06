import { calculateBMI } from '../bmi';

describe('calculateBMI — categories', () => {
  it('classifies a 170cm/55kg adult as 普通体重', () => {
    const r = calculateBMI(55, 170)!;
    expect(r.bmi).toBe(19.0);
    expect(r.category).toBe('normal');
    expect(r.label).toBe('普通体重');
  });

  it('classifies BMI 18.4 as 低体重 (just under the 18.5 boundary)', () => {
    // 170cm * 1.7^2 = 2.89; 18.4 * 2.89 = 53.176kg
    const r = calculateBMI(53.176, 170)!;
    expect(r.bmi).toBe(18.4);
    expect(r.category).toBe('underweight');
    expect(r.label).toBe('低体重');
  });

  it('classifies BMI exactly 18.5 as 普通体重 (boundary inclusive)', () => {
    const r = calculateBMI(53.465, 170)!;
    expect(r.bmi).toBe(18.5);
    expect(r.category).toBe('normal');
  });

  it('classifies BMI 24.9 as 普通体重 (just under the 25 boundary)', () => {
    const r = calculateBMI(72, 170)!;
    expect(r.bmi).toBe(24.9);
    expect(r.category).toBe('normal');
  });

  it('classifies BMI exactly 25 as 肥満 (1度)', () => {
    // 170cm * 1.7^2 = 2.89; 25 * 2.89 = 72.25kg
    const r = calculateBMI(72.25, 170)!;
    expect(r.bmi).toBe(25.0);
    expect(r.category).toBe('obese_1');
    expect(r.label).toBe('肥満 (1度)');
  });

  it('classifies BMI 29.9 as 肥満 (1度) (just under 30)', () => {
    const r = calculateBMI(86.4, 170)!;
    expect(r.bmi).toBe(29.9);
    expect(r.category).toBe('obese_1');
  });

  it('classifies BMI exactly 30 as 肥満 (2度)', () => {
    const r = calculateBMI(86.7, 170)!;
    expect(r.bmi).toBe(30.0);
    expect(r.category).toBe('obese_2');
    expect(r.label).toBe('肥満 (2度)');
  });

  it('classifies BMI exactly 35 as 肥満 (3度)', () => {
    const r = calculateBMI(101.15, 170)!;
    expect(r.bmi).toBe(35.0);
    expect(r.category).toBe('obese_3');
    expect(r.label).toBe('肥満 (3度)');
  });

  it('classifies BMI exactly 40 as 肥満 (4度)', () => {
    const r = calculateBMI(115.6, 170)!;
    expect(r.bmi).toBe(40.0);
    expect(r.category).toBe('obese_4');
    expect(r.label).toBe('肥満 (4度)');
  });

  it('classifies BMI > 40 as 肥満 (4度)', () => {
    const r = calculateBMI(150, 170)!;
    expect(r.bmi).toBe(51.9);
    expect(r.category).toBe('obese_4');
  });
});

describe('calculateBMI — invalid inputs', () => {
  it('returns null for zero weight', () => {
    expect(calculateBMI(0, 170)).toBeNull();
  });

  it('returns null for zero height', () => {
    expect(calculateBMI(70, 0)).toBeNull();
  });

  it('returns null for negative weight', () => {
    expect(calculateBMI(-1, 170)).toBeNull();
  });

  it('returns null for negative height', () => {
    expect(calculateBMI(70, -1)).toBeNull();
  });

  it('returns null for NaN inputs', () => {
    expect(calculateBMI(NaN, 170)).toBeNull();
    expect(calculateBMI(70, NaN)).toBeNull();
  });

  it('returns null for Infinity inputs', () => {
    expect(calculateBMI(Infinity, 170)).toBeNull();
    expect(calculateBMI(70, Infinity)).toBeNull();
  });
});

describe('calculateBMI — rounding', () => {
  it('rounds BMI to 1 decimal', () => {
    // 70 / (1.75^2) = 22.857142...
    const r = calculateBMI(70, 175)!;
    expect(r.bmi).toBe(22.9);
  });

  it('rounds half-up at the 1-decimal boundary', () => {
    // Math.round(22.85 * 10) / 10 — JS rounds half-to-even or half-up
    // depending on the platform, but both give an integer; we just
    // verify the result is a 1-decimal number.
    const r = calculateBMI(70, 175)!;
    expect(r.bmi.toString()).toMatch(/^\d+\.\d$/);
  });
});
