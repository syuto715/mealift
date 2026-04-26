import type { Food } from '../types/food';
import {
  computeIngredientFromFood,
  computeRecipeTotals,
  type IngredientNutrition,
  type RecipeTotals,
  type ComputeTotalsOptions,
} from './recipeCalculator';

// recipeBuilder — bridges "I have a list of foodId+amountG" to "I have a
// computed recipe (per-ingredient + totals)". Stays pure: callers (the
// repository, seed scripts) are responsible for resolving foodIds → Food
// rows and passing the lookup map in.
//
// Why a Map and not the raw array? In practice both saveMyDishFromFoodIds
// and the seed pass need to dedupe lookups (same food appearing twice in
// one recipe is normal — soy sauce + sugar in two steps, etc.) so the
// caller already has a foodId-keyed map before getting here.

export interface RecipeIngredientInput {
  foodId: string;
  amountG: number;
  // Optional sortOrder; if omitted we use the input array index.
  sortOrder?: number;
}

export interface BuiltRecipe {
  // Per-ingredient nutrition with foodId preserved (so the repo can
  // persist food_id linkage on dish_ingredients).
  ingredients: Array<IngredientNutrition & { sortOrder: number }>;
  totals: RecipeTotals;
  // foodIds the caller asked for that weren't in the lookup map.
  // Empty when every input resolved.
  missingFoodIds: string[];
}

export function buildRecipeFromFoodMap(
  foods: Map<string, Food>,
  inputs: RecipeIngredientInput[],
  opts: ComputeTotalsOptions = {},
): BuiltRecipe {
  const ingredients: Array<IngredientNutrition & { sortOrder: number }> = [];
  const missing: string[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const food = foods.get(input.foodId);
    if (!food) {
      missing.push(input.foodId);
      continue;
    }
    const nutrition = computeIngredientFromFood(food, input.amountG);
    ingredients.push({
      ...nutrition,
      sortOrder: input.sortOrder ?? i,
    });
  }

  const totals = computeRecipeTotals(ingredients, opts);

  return { ingredients, totals, missingFoodIds: missing };
}
