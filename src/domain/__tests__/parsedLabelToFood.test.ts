// v1.4 ステージ 4 Phase 4E-1 — parsedLabelToFood tests.

import { mapParsedLabelToFood } from '../parsedLabelToFood';
import type { ParsedNutritionLabel } from '../submission/nutritionLabelParser';

function makeParsed(
  overrides: Partial<ParsedNutritionLabel> = {},
): ParsedNutritionLabel {
  return {
    perBasis: 'per_serving',
    perBasisRaw: '1食分',
    calories: 200,
    proteinG: 10,
    fatG: 5,
    carbG: 30,
    saltG: null,
    sodiumMg: null,
    fiberG: null,
    sugarG: null,
    saturatedFatG: null,
    cholesterolMg: null,
    calciumMg: null,
    ironMg: null,
    warnings: [],
    ...overrides,
  };
}

describe('mapParsedLabelToFood', () => {
  it('produces a Food candidate with empty id (signals manual entry)', () => {
    const food = mapParsedLabelToFood(makeParsed());
    expect(food.id).toBe('');
  });

  it('seeds a placeholder name so ServingQuantityModal has a header', () => {
    const food = mapParsedLabelToFood(makeParsed());
    expect(food.nameJa.length).toBeGreaterThan(0);
  });

  it('maps per_serving fields to caloriesPerServing/PFC', () => {
    const food = mapParsedLabelToFood(
      makeParsed({
        perBasis: 'per_serving',
        calories: 350,
        proteinG: 15,
        fatG: 8,
        carbG: 45,
      }),
    );
    expect(food.caloriesPerServing).toBe(350);
    expect(food.proteinG).toBe(15);
    expect(food.fatG).toBe(8);
    expect(food.carbG).toBe(45);
    expect(food.servingSizeG).toBe(100);
    expect(food.servingUnit).toBe('g');
  });

  it('maps per_100g fields the same way (perBasis is informational only here)', () => {
    const food = mapParsedLabelToFood(
      makeParsed({
        perBasis: 'per_100g',
        perBasisRaw: '100g当たり',
        calories: 180,
        proteinG: 6,
      }),
    );
    expect(food.caloriesPerServing).toBe(180);
    expect(food.proteinG).toBe(6);
    expect(food.servingSizeG).toBe(100);
  });

  it('fires onUnknownBasis callback when perBasis is unknown', () => {
    const onUnknownBasis = jest.fn();
    mapParsedLabelToFood(
      makeParsed({ perBasis: 'unknown', perBasisRaw: null }),
      { onUnknownBasis },
    );
    expect(onUnknownBasis).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onUnknownBasis for per_serving / per_100g', () => {
    const onUnknownBasis = jest.fn();
    mapParsedLabelToFood(makeParsed({ perBasis: 'per_serving' }), {
      onUnknownBasis,
    });
    mapParsedLabelToFood(makeParsed({ perBasis: 'per_100g' }), {
      onUnknownBasis,
    });
    expect(onUnknownBasis).not.toHaveBeenCalled();
  });

  it('defaults missing nutrient values to 0 (not null)', () => {
    const food = mapParsedLabelToFood(
      makeParsed({
        calories: null,
        proteinG: null,
        fatG: null,
        carbG: null,
      }),
    );
    expect(food.caloriesPerServing).toBe(0);
    expect(food.proteinG).toBe(0);
    expect(food.fatG).toBe(0);
    expect(food.carbG).toBe(0);
  });

  it('forwards extended nutrients (saltG, fiberG, saturatedFatG, etc.) preserving null vs number', () => {
    const food = mapParsedLabelToFood(
      makeParsed({
        saltG: 1.2,
        fiberG: 3,
        saturatedFatG: 1.5,
        sugarG: null,
        cholesterolMg: 50,
        calciumMg: null,
        ironMg: 2,
        sodiumMg: null,
      }),
    );
    expect(food.saltG).toBe(1.2);
    expect(food.fiberG).toBe(3);
    expect(food.saturatedFatG).toBe(1.5);
    expect(food.sugarG).toBeNull();
    expect(food.cholesterolMg).toBe(50);
    expect(food.calciumMg).toBeNull();
    expect(food.ironMg).toBe(2);
    expect(food.sodiumMg).toBeNull();
  });

  it('does not throw on unknown basis when onUnknownBasis is omitted', () => {
    expect(() =>
      mapParsedLabelToFood(makeParsed({ perBasis: 'unknown' })),
    ).not.toThrow();
  });
});
