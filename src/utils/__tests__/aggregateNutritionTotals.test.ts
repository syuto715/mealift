import { aggregateNutritionTotals } from '../aggregateNutritionTotals';
import type { DailyNutritionSummary } from '../../types/nutrition';

function dailySummary(overrides: Partial<DailyNutritionSummary> = {}): DailyNutritionSummary {
  return {
    date: '2026-05-21',
    totalCalories: 0,
    totalProteinG: 0,
    totalFatG: 0,
    totalCarbG: 0,
    extended: {
      fiberG: 0, saltG: 0, calciumMg: 0, ironMg: 0,
      vitaminAUg: 0, vitaminB1Mg: 0, vitaminB2Mg: 0,
      vitaminB6Mg: 0, vitaminB12Ug: 0, folateUg: 0,
      vitaminCMg: 0, vitaminDUg: 0, vitaminEMg: 0,
      potassiumMg: 0, magnesiumMg: 0, zincMg: 0,
      cholesterolMg: 0, saturatedFatG: 0, sugarG: 0, sodiumMg: 0,
    },
    meals: [],
    ...overrides,
  };
}

describe('aggregateNutritionTotals (Sprint 2.4.4)', () => {
  it('returns zeroed totals for an empty input', () => {
    const out = aggregateNutritionTotals([]);
    expect(out.calories).toBe(0);
    expect(out.proteinG).toBe(0);
    expect(out.extended.fiberG).toBe(0);
  });

  it('passes a single-day summary through verbatim', () => {
    const out = aggregateNutritionTotals([
      dailySummary({ totalCalories: 1800, totalProteinG: 60, totalFatG: 50, totalCarbG: 200 }),
    ]);
    expect(out.calories).toBe(1800);
    expect(out.proteinG).toBe(60);
    expect(out.fatG).toBe(50);
    expect(out.carbG).toBe(200);
  });

  it('sums macros across multiple days', () => {
    const out = aggregateNutritionTotals([
      dailySummary({ totalCalories: 1800, totalProteinG: 60 }),
      dailySummary({ totalCalories: 2100, totalProteinG: 75 }),
      dailySummary({ totalCalories: 1500, totalProteinG: 50 }),
    ]);
    expect(out.calories).toBe(5400);
    expect(out.proteinG).toBe(185);
  });

  it('sums every extended-nutrient axis', () => {
    const out = aggregateNutritionTotals([
      dailySummary({
        extended: {
          fiberG: 10, saltG: 5, calciumMg: 600, ironMg: 8,
          vitaminAUg: 700, vitaminB1Mg: 1.2, vitaminB2Mg: 1.4,
          vitaminB6Mg: 1.5, vitaminB12Ug: 2.4, folateUg: 240,
          vitaminCMg: 90, vitaminDUg: 5.5, vitaminEMg: 7,
          potassiumMg: 2500, magnesiumMg: 340, zincMg: 9,
          cholesterolMg: 200, saturatedFatG: 12, sugarG: 50, sodiumMg: 2000,
        },
      }),
      dailySummary({
        extended: {
          fiberG: 8, saltG: 4, calciumMg: 400, ironMg: 6,
          vitaminAUg: 500, vitaminB1Mg: 0.9, vitaminB2Mg: 1.0,
          vitaminB6Mg: 1.2, vitaminB12Ug: 1.8, folateUg: 180,
          vitaminCMg: 70, vitaminDUg: 4.0, vitaminEMg: 5,
          potassiumMg: 1800, magnesiumMg: 260, zincMg: 7,
          cholesterolMg: 150, saturatedFatG: 9, sugarG: 38, sodiumMg: 1600,
        },
      }),
    ]);
    expect(out.extended.fiberG).toBe(18);
    expect(out.extended.calciumMg).toBe(1000);
    expect(out.extended.sodiumMg).toBe(3600);
  });
});
