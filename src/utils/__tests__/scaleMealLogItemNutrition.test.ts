import { scaleMealLogItemPortion } from '../scaleMealLogItemNutrition';
import type { MealLogItem } from '../../types/nutrition';

function buildItem(overrides: Partial<MealLogItem> = {}): MealLogItem {
  return {
    id: 'i-1',
    mealLogId: 'ml-1',
    foodId: null,
    foodName: 'ガーリックチキン弁当',
    servingAmount: 1,
    servingUnit: '個',
    calories: 656,
    proteinG: 34,
    fatG: 17,
    carbG: 94,
    fiberG: 0, sodiumMg: 0, calciumMg: 0, ironMg: 0,
    vitaminAUg: 0, vitaminB1Mg: 0, vitaminB2Mg: 0,
    vitaminB6Mg: 0, vitaminB12Ug: 0, folateUg: 0,
    vitaminCMg: 0, vitaminDUg: 0, vitaminEMg: 0,
    potassiumMg: 0, magnesiumMg: 0, zincMg: 0,
    cholesterolMg: 0, saturatedFatG: 0, sugarG: 0, saltG: 0,
    note: null,
    createdAt: '2026-05-22T08:00:00.000Z',
    ...overrides,
  };
}

describe('scaleMealLogItemPortion (Sprint 2.4.5)', () => {
  it('keeps macros unchanged when newAmount equals the existing amount', () => {
    const out = scaleMealLogItemPortion(buildItem(), 1);
    expect(out.calories).toBe(656);
    expect(out.proteinG).toBe(34);
    expect(out.fatG).toBe(17);
    expect(out.carbG).toBe(94);
  });

  it('halves macros when newAmount is half the original', () => {
    const out = scaleMealLogItemPortion(buildItem(), 0.5);
    expect(out.calories).toBe(328);
    expect(out.proteinG).toBe(17);
    expect(out.fatG).toBe(8.5);
    expect(out.carbG).toBe(47);
  });

  it('doubles macros when newAmount is twice the original', () => {
    const out = scaleMealLogItemPortion(buildItem(), 2);
    expect(out.calories).toBe(1312);
    expect(out.proteinG).toBe(68);
    expect(out.fatG).toBe(34);
    expect(out.carbG).toBe(188);
  });

  it('rounds calories to int, macros to 1 decimal', () => {
    const out = scaleMealLogItemPortion(buildItem({ calories: 100, proteinG: 3.33 }), 1.5);
    expect(out.calories).toBe(150);          // round_0(100*1.5)
    expect(out.proteinG).toBe(5);            // round_1(3.33*1.5) = round_1(4.995) → 5.0
  });

  it('handles a non-unit starting amount correctly (1.5 → 1.0 = 2/3 factor)', () => {
    const out = scaleMealLogItemPortion(
      buildItem({ servingAmount: 1.5, calories: 300, proteinG: 30 }),
      1.0,
    );
    // factor = 1.0 / 1.5 = 0.6667
    expect(out.calories).toBe(200);
    expect(out.proteinG).toBe(20);
  });

  it('preserves the original serving unit while updating the amount', () => {
    const out = scaleMealLogItemPortion(buildItem(), 2);
    expect(out.servingAmount).toBe(2);
    expect(out.servingUnit).toBe('個');
  });

  it('falls back to base=1 when the stored servingAmount is zero (defensive)', () => {
    const out = scaleMealLogItemPortion(
      buildItem({ servingAmount: 0, calories: 50, proteinG: 5 }),
      2,
    );
    expect(out.calories).toBe(100);
    expect(out.proteinG).toBe(10);
  });
});
