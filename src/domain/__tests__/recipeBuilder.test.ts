import { buildRecipeFromFoodMap } from '../recipeBuilder';
import type { Food } from '../../types/food';

function makeFood(overrides: Partial<Food> = {}): Food {
  const base: Food = {
    id: 'food-A',
    nameJa: 'サンプル食品',
    nameEn: 'Sample Food',
    brand: null,
    barcode: null,
    servingSizeG: 100,
    servingUnit: 'g',
    caloriesPerServing: 100,
    proteinG: 20,
    fatG: 2,
    carbG: 0,
    fiberG: 0,
    sodiumMg: 50,
    calciumMg: 10,
    ironMg: 0.5,
    vitaminAUg: 5,
    vitaminB1Mg: 0.05,
    vitaminB2Mg: 0.05,
    vitaminB6Mg: 0.1,
    vitaminB12Ug: 0.1,
    folateUg: 5,
    vitaminCMg: 1,
    vitaminDUg: 0,
    vitaminEMg: 0.1,
    potassiumMg: 200,
    magnesiumMg: 20,
    zincMg: 0.5,
    cholesterolMg: 50,
    saturatedFatG: 0.5,
    sugarG: 0,
    saltG: 0.1,
    source: 'mext',
    externalId: null,
    isCustom: false,
    isFavorite: false,
    isUserAdded: false,
    verified: true,
    addedAt: null,
    useCount: 0,
    createdAt: '2026-04-26T00:00:00Z',
    updatedAt: '2026-04-26T00:00:00Z',
  };
  return { ...base, ...overrides };
}

describe('buildRecipeFromFoodMap', () => {
  it('resolves all foodIds and computes ingredients + totals', () => {
    const foods = new Map<string, Food>([
      ['food-A', makeFood({ id: 'food-A', nameJa: '鶏むね肉', proteinG: 22.3, fatG: 1.5, caloriesPerServing: 108 })],
      ['food-B', makeFood({ id: 'food-B', nameJa: 'オリーブオイル', proteinG: 0, fatG: 100, carbG: 0, caloriesPerServing: 884, servingSizeG: 100 })],
    ]);

    const built = buildRecipeFromFoodMap(foods, [
      { foodId: 'food-A', amountG: 200 },
      { foodId: 'food-B', amountG: 5 },
    ]);

    expect(built.missingFoodIds).toEqual([]);
    expect(built.ingredients).toHaveLength(2);
    expect(built.ingredients[0].foodId).toBe('food-A');
    expect(built.ingredients[0].foodName).toBe('鶏むね肉');
    // 22.3 × 2 = 44.6g protein
    expect(built.ingredients[0].proteinG).toBeCloseTo(44.6, 1);
    expect(built.ingredients[1].foodName).toBe('オリーブオイル');
    expect(built.ingredients[1].fatG).toBeCloseTo(5, 1);

    // Total = 108 × 2 + 884 × 0.05 = 216 + 44.2 = 260
    expect(built.totals.totalCalories).toBeCloseTo(260, 0);
    expect(built.totals.ingredientCount).toBe(2);
  });

  it('reports missing foodIds and skips them in ingredients', () => {
    const foods = new Map<string, Food>([
      ['food-A', makeFood({ id: 'food-A' })],
    ]);
    const built = buildRecipeFromFoodMap(foods, [
      { foodId: 'food-A', amountG: 100 },
      { foodId: 'food-MISSING', amountG: 50 },
      { foodId: 'food-ALSO-MISSING', amountG: 30 },
    ]);
    expect(built.missingFoodIds).toEqual(['food-MISSING', 'food-ALSO-MISSING']);
    expect(built.ingredients).toHaveLength(1);
    expect(built.ingredients[0].foodId).toBe('food-A');
  });

  it('uses the input array index as default sortOrder', () => {
    const foods = new Map<string, Food>([
      ['food-A', makeFood({ id: 'food-A' })],
      ['food-B', makeFood({ id: 'food-B' })],
    ]);
    const built = buildRecipeFromFoodMap(foods, [
      { foodId: 'food-A', amountG: 100 },
      { foodId: 'food-B', amountG: 100 },
    ]);
    expect(built.ingredients[0].sortOrder).toBe(0);
    expect(built.ingredients[1].sortOrder).toBe(1);
  });

  it('preserves explicit sortOrder when provided', () => {
    const foods = new Map<string, Food>([
      ['food-A', makeFood({ id: 'food-A' })],
      ['food-B', makeFood({ id: 'food-B' })],
    ]);
    const built = buildRecipeFromFoodMap(foods, [
      { foodId: 'food-A', amountG: 100, sortOrder: 10 },
      { foodId: 'food-B', amountG: 100, sortOrder: 20 },
    ]);
    expect(built.ingredients[0].sortOrder).toBe(10);
    expect(built.ingredients[1].sortOrder).toBe(20);
  });

  it('preserves sortOrder index across missing-id gaps', () => {
    // When a foodId is missing, the missing entry is dropped — but downstream
    // ingredients should still get their original input index as default
    // sortOrder. (Otherwise re-saving the recipe would lose position info.)
    const foods = new Map<string, Food>([
      ['food-B', makeFood({ id: 'food-B' })],
    ]);
    const built = buildRecipeFromFoodMap(foods, [
      { foodId: 'food-MISSING', amountG: 50 },
      { foodId: 'food-B', amountG: 100 },
    ]);
    expect(built.ingredients).toHaveLength(1);
    // food-B was at input index 1 → sortOrder=1.
    expect(built.ingredients[0].sortOrder).toBe(1);
  });

  it('strict mode (default) nulls extended-nutrient totals when an ingredient lacks them', () => {
    const foods = new Map<string, Food>([
      ['food-A', makeFood({ id: 'food-A', sodiumMg: 100, fiberG: 2 })],
      ['food-B', makeFood({ id: 'food-B', sodiumMg: null, fiberG: null })],
    ]);
    const built = buildRecipeFromFoodMap(foods, [
      { foodId: 'food-A', amountG: 100 },
      { foodId: 'food-B', amountG: 100 },
    ]);
    expect(built.totals.sodiumMg).toBeNull();
    expect(built.totals.fiberG).toBeNull();
  });

  it('partial mode sums what is present', () => {
    const foods = new Map<string, Food>([
      ['food-A', makeFood({ id: 'food-A', sodiumMg: 100 })],
      ['food-B', makeFood({ id: 'food-B', sodiumMg: null })],
    ]);
    const built = buildRecipeFromFoodMap(
      foods,
      [
        { foodId: 'food-A', amountG: 100 },
        { foodId: 'food-B', amountG: 100 },
      ],
      { partialSums: true },
    );
    // Only food-A contributes. 100 mg per 100g × 1.0 → 100mg.
    expect(built.totals.sodiumMg).toBeCloseTo(100, 0);
  });

  it('returns empty totals when every input id is missing', () => {
    const foods = new Map<string, Food>();
    const built = buildRecipeFromFoodMap(foods, [
      { foodId: 'x', amountG: 100 },
      { foodId: 'y', amountG: 200 },
    ]);
    expect(built.ingredients).toHaveLength(0);
    expect(built.missingFoodIds).toEqual(['x', 'y']);
    expect(built.totals.totalCalories).toBe(0);
    expect(built.totals.ingredientCount).toBe(0);
    expect(built.totals.sodiumMg).toBeNull();
  });

  it('handles same foodId appearing multiple times (e.g. soy sauce in two steps)', () => {
    const foods = new Map<string, Food>([
      ['food-A', makeFood({ id: 'food-A', proteinG: 20, caloriesPerServing: 100, servingSizeG: 100 })],
    ]);
    const built = buildRecipeFromFoodMap(foods, [
      { foodId: 'food-A', amountG: 50 },
      { foodId: 'food-A', amountG: 50 },
    ]);
    expect(built.ingredients).toHaveLength(2);
    // Each contributes 50g × 0.20 = 10g protein → 20g total
    expect(built.totals.totalProteinG).toBeCloseTo(20, 1);
    expect(built.totals.totalCalories).toBeCloseTo(100, 0);
  });
});
