import {
  scaleNutrient,
  computeIngredientFromFood,
  computeRecipeTotals,
  validateRecipeIngredient,
} from '../recipeCalculator';
import type { Food } from '../../types/food';

// ---- Test helpers ----------------------------------------------------------

// Builds a Food fixture with sane defaults. Override anything per-test.
function makeFood(overrides: Partial<Food> = {}): Food {
  const base: Food = {
    id: 'food-1',
    nameJa: '鶏むね肉',
    nameEn: 'Chicken breast (skinless, raw)',
    brand: null,
    barcode: null,
    servingSizeG: 100,
    servingUnit: 'g',
    caloriesPerServing: 105,
    proteinG: 23.3,
    fatG: 1.9,
    carbG: 0,
    fiberG: 0,
    sodiumMg: 45,
    calciumMg: 4,
    ironMg: 0.3,
    vitaminAUg: 9,
    vitaminB1Mg: 0.09,
    vitaminB2Mg: 0.12,
    vitaminB6Mg: 0.6,
    vitaminB12Ug: 0.2,
    folateUg: 12,
    vitaminCMg: 3,
    vitaminDUg: 0.1,
    vitaminEMg: 0.3,
    potassiumMg: 360,
    magnesiumMg: 27,
    zincMg: 0.6,
    cholesterolMg: 73,
    saturatedFatG: 0.4,
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

// ---- scaleNutrient ---------------------------------------------------------

describe('scaleNutrient', () => {
  it('scales linearly: per-100g × amount/serving', () => {
    expect(scaleNutrient(20, 100, 200)).toBe(40);
    expect(scaleNutrient(20, 100, 50)).toBe(10);
  });

  it('preserves null for unmeasured nutrients', () => {
    expect(scaleNutrient(null, 100, 50)).toBeNull();
    expect(scaleNutrient(undefined, 100, 50)).toBeNull();
  });

  it('returns null when serving size is zero/negative/non-finite', () => {
    expect(scaleNutrient(20, 0, 100)).toBeNull();
    expect(scaleNutrient(20, -5, 100)).toBeNull();
    expect(scaleNutrient(20, NaN, 100)).toBeNull();
  });

  it('returns null when amount is non-finite/negative', () => {
    expect(scaleNutrient(20, 100, -5)).toBeNull();
    expect(scaleNutrient(20, 100, NaN)).toBeNull();
  });

  it('zero amount yields zero scaled value (not null)', () => {
    expect(scaleNutrient(20, 100, 0)).toBe(0);
  });

  it('zero source value yields zero scaled value', () => {
    expect(scaleNutrient(0, 100, 50)).toBe(0);
  });
});

// ---- computeIngredientFromFood --------------------------------------------

describe('computeIngredientFromFood', () => {
  it('scales macros linearly to amountG', () => {
    const food = makeFood();
    const ing = computeIngredientFromFood(food, 200);
    expect(ing.calories).toBeCloseTo(210, 0);
    expect(ing.proteinG).toBeCloseTo(46.6, 1);
    expect(ing.fatG).toBeCloseTo(3.8, 1);
    expect(ing.carbG).toBe(0);
  });

  it('preserves foodId and foodName', () => {
    const food = makeFood({ id: 'food-xyz', nameJa: '鶏もも肉' });
    const ing = computeIngredientFromFood(food, 100);
    expect(ing.foodId).toBe('food-xyz');
    expect(ing.foodName).toBe('鶏もも肉');
    expect(ing.amountG).toBe(100);
  });

  it('preserves null on extended nutrients when food row has them', () => {
    const food = makeFood({
      fiberG: null,
      vitaminCMg: null,
      potassiumMg: 360,
    });
    const ing = computeIngredientFromFood(food, 50);
    expect(ing.fiberG).toBeNull();
    expect(ing.vitaminCMg).toBeNull();
    expect(ing.potassiumMg).toBeCloseTo(180, 0);
  });

  it('scales extended nutrients linearly', () => {
    const food = makeFood({ servingSizeG: 100, sodiumMg: 100 });
    expect(computeIngredientFromFood(food, 50).sodiumMg).toBeCloseTo(50, 0);
    expect(computeIngredientFromFood(food, 200).sodiumMg).toBeCloseTo(200, 0);
  });

  it('respects non-100g serving sizes', () => {
    // A bar labeled per-45g serving with 15g protein → at 90g (2 servings) gives 30g protein.
    const food = makeFood({
      servingSizeG: 45,
      caloriesPerServing: 180,
      proteinG: 15,
      fatG: 6,
      carbG: 16,
    });
    const ing = computeIngredientFromFood(food, 90);
    expect(ing.calories).toBeCloseTo(360, 0);
    expect(ing.proteinG).toBeCloseTo(30, 1);
  });

  it('treats invalid serving size by falling back to 100g', () => {
    const food = makeFood({ servingSizeG: 0 });
    const ing = computeIngredientFromFood(food, 100);
    // With fallback servingSizeG=100, amountG=100 → ratio 1 → values unchanged.
    expect(ing.proteinG).toBeCloseTo(23.3, 1);
  });

  it('treats invalid amount as zero', () => {
    const food = makeFood();
    const ing = computeIngredientFromFood(food, -50);
    expect(ing.amountG).toBe(0);
    expect(ing.calories).toBe(0);
    expect(ing.proteinG).toBe(0);
  });

  it('rounds gram-scale extended nutrients to 2 decimals', () => {
    const food = makeFood({ saturatedFatG: 1.555 });
    const ing = computeIngredientFromFood(food, 100);
    expect(ing.saturatedFatG).toBeCloseTo(1.56, 2);
  });

  it('rounds mg/μg micronutrients to 1 decimal', () => {
    const food = makeFood({ vitaminCMg: 3.456 });
    const ing = computeIngredientFromFood(food, 100);
    expect(ing.vitaminCMg).toBe(3.5);
  });
});

// ---- computeRecipeTotals --------------------------------------------------

describe('computeRecipeTotals', () => {
  function ingredient(over: Partial<ReturnType<typeof computeIngredientFromFood>> = {}) {
    return {
      foodId: 'food-1',
      foodName: 'x',
      amountG: 100,
      calories: 100,
      proteinG: 10,
      fatG: 5,
      carbG: 5,
      fiberG: 2,
      sodiumMg: 200,
      calciumMg: 50,
      ironMg: 1,
      vitaminAUg: 10,
      vitaminB1Mg: 0.1,
      vitaminB2Mg: 0.1,
      vitaminB6Mg: 0.1,
      vitaminB12Ug: 0.1,
      folateUg: 10,
      vitaminCMg: 5,
      vitaminDUg: 1,
      vitaminEMg: 1,
      potassiumMg: 200,
      magnesiumMg: 30,
      zincMg: 1,
      cholesterolMg: 50,
      saturatedFatG: 1,
      sugarG: 1,
      saltG: 0.5,
      ...over,
    };
  }

  it('sums macros across ingredients', () => {
    const totals = computeRecipeTotals([
      ingredient({ calories: 100, proteinG: 10, fatG: 5, carbG: 5 }),
      ingredient({ calories: 200, proteinG: 20, fatG: 10, carbG: 15 }),
    ]);
    expect(totals.totalCalories).toBe(300);
    expect(totals.totalProteinG).toBeCloseTo(30, 1);
    expect(totals.totalFatG).toBeCloseTo(15, 1);
    expect(totals.totalCarbG).toBeCloseTo(20, 1);
    expect(totals.ingredientCount).toBe(2);
  });

  it('strict mode nulls a total when any ingredient is missing that nutrient', () => {
    const totals = computeRecipeTotals([
      ingredient({ fiberG: 2 }),
      ingredient({ fiberG: null }),
    ]);
    expect(totals.fiberG).toBeNull();
    // Other nutrients still summed where complete
    expect(totals.sodiumMg).toBeCloseTo(400, 0);
  });

  it('partial mode sums what is present and ignores nulls', () => {
    const totals = computeRecipeTotals(
      [
        ingredient({ fiberG: 2 }),
        ingredient({ fiberG: null }),
      ],
      { partialSums: true },
    );
    expect(totals.fiberG).toBeCloseTo(2, 1);
  });

  it('partial mode returns null when no ingredient supplied a value', () => {
    const totals = computeRecipeTotals(
      [ingredient({ fiberG: null }), ingredient({ fiberG: null })],
      { partialSums: true },
    );
    expect(totals.fiberG).toBeNull();
  });

  it('handles empty ingredient list as zero macros + null extended', () => {
    const totals = computeRecipeTotals([]);
    expect(totals.totalCalories).toBe(0);
    expect(totals.totalProteinG).toBe(0);
    expect(totals.ingredientCount).toBe(0);
    expect(totals.fiberG).toBeNull();
    expect(totals.sodiumMg).toBeNull();
  });

  it('treats missing macros on an ingredient as zero', () => {
    const totals = computeRecipeTotals([
      { calories: 0, proteinG: 0, fatG: 0, carbG: 0 },
    ]);
    expect(totals.totalCalories).toBe(0);
  });

  it('rounds totals to spec (cal=0dp, macros=1dp, gram-extended=2dp, mg/μg=1dp)', () => {
    const totals = computeRecipeTotals([
      ingredient({ calories: 100.4, proteinG: 10.36, fiberG: 2.555, sodiumMg: 200.45 }),
    ]);
    expect(totals.totalCalories).toBe(100); // 0 dp
    expect(totals.totalProteinG).toBe(10.4); // 1 dp
    expect(totals.fiberG).toBe(2.56); // 2 dp
    expect(totals.sodiumMg).toBe(200.5); // 1 dp
  });
});

// ---- validateRecipeIngredient ----------------------------------------------

describe('validateRecipeIngredient', () => {
  it('accepts a normal ingredient', () => {
    const r = validateRecipeIngredient(makeFood(), 200);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('rejects zero or negative amounts', () => {
    expect(validateRecipeIngredient(makeFood(), 0).ok).toBe(false);
    expect(validateRecipeIngredient(makeFood(), -50).ok).toBe(false);
    expect(validateRecipeIngredient(makeFood(), 0).issues[0].code).toBe(
      'amount_not_positive',
    );
  });

  it('rejects amounts above 5kg', () => {
    const r = validateRecipeIngredient(makeFood(), 5001);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'amount_too_large')).toBe(true);
  });

  it('rejects food rows with bad serving size', () => {
    const r = validateRecipeIngredient({ servingSizeG: 0 }, 100);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'food_serving_invalid')).toBe(true);
  });

  it('reports multiple issues at once', () => {
    const r = validateRecipeIngredient({ servingSizeG: 0 }, -10);
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThanOrEqual(2);
  });
});
