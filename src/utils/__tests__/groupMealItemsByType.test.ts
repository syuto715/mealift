import { groupMealItemsByType } from '../groupMealItemsByType';
import type { DailyNutritionSummary, MealLogItem } from '../../types/nutrition';
import type { MealType } from '../../types/common';

function blankItem(name: string, mealLogId: string): MealLogItem {
  return {
    id: `i-${name}`,
    mealLogId,
    foodId: null,
    foodName: name,
    servingAmount: 1,
    servingUnit: '個',
    calories: 100,
    proteinG: 5,
    fatG: 2,
    carbG: 15,
    fiberG: 0, sodiumMg: 0, calciumMg: 0, ironMg: 0,
    vitaminAUg: 0, vitaminB1Mg: 0, vitaminB2Mg: 0,
    vitaminB6Mg: 0, vitaminB12Ug: 0, folateUg: 0,
    vitaminCMg: 0, vitaminDUg: 0, vitaminEMg: 0,
    potassiumMg: 0, magnesiumMg: 0, zincMg: 0,
    cholesterolMg: 0, saturatedFatG: 0, sugarG: 0, saltG: 0,
    note: null,
    createdAt: '2026-05-21T08:00:00.000Z',
  };
}

function summaryWithMeals(
  meals: Array<{ mealType: MealType; items: MealLogItem[] }>,
): DailyNutritionSummary {
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
    meals: meals.map((m, idx) => ({
      id: `ml-${idx}`,
      profileId: 'p1',
      date: '2026-05-21',
      mealType: m.mealType,
      createdAt: '2026-05-21T08:00:00.000Z',
      updatedAt: '2026-05-21T08:00:00.000Z',
      items: m.items,
    })),
  };
}

describe('groupMealItemsByType (Sprint 2.4.4)', () => {
  it('returns an empty bucket for every meal type given a null summary', () => {
    const out = groupMealItemsByType(null);
    expect(out.breakfast).toEqual([]);
    expect(out.lunch).toEqual([]);
    expect(out.dinner).toEqual([]);
    expect(out.snack).toEqual([]);
  });

  it('distributes items into the requested meal types', () => {
    const items = [
      blankItem('卵', 'ml-b'),
      blankItem('鶏肉', 'ml-l'),
      blankItem('米', 'ml-l'),
    ];
    const out = groupMealItemsByType(
      summaryWithMeals([
        { mealType: 'breakfast', items: [items[0]] },
        { mealType: 'lunch', items: [items[1], items[2]] },
      ]),
    );
    expect(out.breakfast.map((i) => i.foodName)).toEqual(['卵']);
    expect(out.lunch.map((i) => i.foodName)).toEqual(['鶏肉', '米']);
    expect(out.dinner).toEqual([]);
    expect(out.snack).toEqual([]);
  });

  it('concatenates items when multiple meal_log rows share a meal type', () => {
    const out = groupMealItemsByType(
      summaryWithMeals([
        { mealType: 'lunch', items: [blankItem('カレー', 'ml-1')] },
        { mealType: 'lunch', items: [blankItem('サラダ', 'ml-2')] },
      ]),
    );
    expect(out.lunch.map((i) => i.foodName)).toEqual(['カレー', 'サラダ']);
  });
});
