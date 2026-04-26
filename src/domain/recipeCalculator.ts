import type { Food, ExtendedNutrients } from '../types/food';
import { EXTENDED_NUTRIENT_KEYS } from '../types/food';

// Recipe calculator — pure helpers that turn (canonical Food row,
// amount in grams) tuples into per-ingredient and total nutrition,
// preserving null for unmeasured nutrients.
//
// Design intent:
//   - No DB access. The repository layer fetches Food rows; this
//     module is the math.
//   - Linear scaling only. We assume the foods table stores
//     per-serving values where serving_size_g is the reference
//     amount; scaling is amount/servingSize × value. No cooking-loss
//     adjustments, no water-binding factors — those are out of scope
//     for v1 and would require source-of-truth data we don't have.
//   - Null preservation. If a food row lacks fiber data
//     (fiberG === null), the resulting ingredient also has null
//     fiber — we never coerce null to 0, because 0 means "we
//     measured zero" which is materially different from "we didn't
//     measure".
//   - Strict totals by default. A total reported as null means "at
//     least one ingredient is missing this nutrient" — the UI can
//     render a "—" instead of a misleading partial sum. Pass
//     `partialSums: true` to opt into best-effort totals that ignore
//     nulls (still returns null when no ingredient supplied a value).
//
// What this module deliberately does NOT do:
//   - It does not look up Food by id. Callers (repos, screens) are
//     responsible for resolving foodId → Food and passing the row in.
//   - It does not write to the database. The result objects are
//     plain values; persistence is in dishRepository.
//   - It does not cap or warn about outliers. validateRecipeIngredient
//     handles the obvious sanity bounds; the caller surfaces those to
//     the user.

// Per-ingredient nutrition derived from a Food row scaled to amountG.
// Mirrors the macros + extended nutrients on DishIngredient so this
// can be persisted directly via dishRepository.
export interface IngredientNutrition extends ExtendedNutrients {
  foodId: string;
  foodName: string;
  amountG: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

// Recipe-level totals. Macros are required (always summable, falling
// back to 0 only if the ingredient list is empty). Extended nutrients
// are nullable per-key — see "Strict totals" above.
export interface RecipeTotals extends ExtendedNutrients {
  totalCalories: number;
  totalProteinG: number;
  totalFatG: number;
  totalCarbG: number;
  ingredientCount: number;
}

export interface ComputeTotalsOptions {
  // When true, skip null ingredient values in the per-nutrient sum
  // rather than nulling the total. The total is still null if no
  // ingredient supplied a value at all. Default: false.
  partialSums?: boolean;
}

// ---------------------------------------------------------------------------
// scaleNutrient — per-serving value × (amount / servingSize)
// ---------------------------------------------------------------------------

// Scales a per-serving nutrient value to a target amount in grams.
// Returns null when the source value is null/undefined OR the serving
// size is non-positive (we can't divide by zero, and a missing serving
// size means we can't trust the per-100g assumption).
export function scaleNutrient(
  value: number | null | undefined,
  servingSizeG: number,
  amountG: number,
): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  if (!Number.isFinite(servingSizeG) || servingSizeG <= 0) return null;
  if (!Number.isFinite(amountG) || amountG < 0) return null;
  return (value * amountG) / servingSizeG;
}

// ---------------------------------------------------------------------------
// computeIngredientFromFood — single ingredient
// ---------------------------------------------------------------------------

// Derives an IngredientNutrition row from a canonical Food row plus
// an amount in grams. All four macros are guaranteed finite numbers
// (defaulting to 0 when the food row's serving size is corrupt — we
// surface that as a 0-cal ingredient rather than throwing because the
// alternative is breaking the entire recipe over one bad row).
export function computeIngredientFromFood(
  food: Food,
  amountG: number,
): IngredientNutrition {
  const serving = food.servingSizeG;
  const safeServing = Number.isFinite(serving) && serving > 0 ? serving : 100;
  const safeAmount = Number.isFinite(amountG) && amountG > 0 ? amountG : 0;
  const ratio = safeAmount / safeServing;

  const calories = (food.caloriesPerServing ?? 0) * ratio;
  const protein = (food.proteinG ?? 0) * ratio;
  const fat = (food.fatG ?? 0) * ratio;
  const carb = (food.carbG ?? 0) * ratio;

  // Build extended nutrients in a single pass: scale + round + null-preserve.
  const ext = {} as ExtendedNutrients;
  for (const key of EXTENDED_NUTRIENT_KEYS) {
    const scaled = scaleNutrient(food[key], safeServing, safeAmount);
    if (scaled == null) {
      ext[key] = null;
    } else {
      ext[key] = roundTo(scaled, decimalsForKey(key)) as never;
    }
  }

  return {
    foodId: food.id,
    foodName: food.nameJa,
    amountG: safeAmount,
    calories: roundTo(calories, 1),
    proteinG: roundTo(protein, 2),
    fatG: roundTo(fat, 2),
    carbG: roundTo(carb, 2),
    ...ext,
  };
}

// ---------------------------------------------------------------------------
// computeRecipeTotals — sum across ingredients
// ---------------------------------------------------------------------------

// Sums macros and extended nutrients across an ingredient list. Macros
// always sum (missing values treated as 0; the DB schema enforces
// non-null on macros, but the type allows it for flexibility).
// Extended-nutrient totals follow the `partialSums` flag.
export function computeRecipeTotals(
  ingredients: Array<
    Pick<IngredientNutrition, 'calories' | 'proteinG' | 'fatG' | 'carbG'> &
      Partial<ExtendedNutrients>
  >,
  opts: ComputeTotalsOptions = {},
): RecipeTotals {
  const partial = !!opts.partialSums;

  let calories = 0;
  let protein = 0;
  let fat = 0;
  let carb = 0;
  for (const ing of ingredients) {
    calories += ing.calories ?? 0;
    protein += ing.proteinG ?? 0;
    fat += ing.fatG ?? 0;
    carb += ing.carbG ?? 0;
  }

  const extTotals = {} as ExtendedNutrients;

  if (ingredients.length === 0) {
    // Empty ingredient list → no totals to compute.
    for (const key of EXTENDED_NUTRIENT_KEYS) {
      extTotals[key] = null;
    }
  } else {
    for (const key of EXTENDED_NUTRIENT_KEYS) {
      let sum = 0;
      let sawNull = false;
      let sawValue = false;
      for (const ing of ingredients) {
        const v = ing[key];
        if (v == null) {
          sawNull = true;
          if (!partial) break;
        } else {
          sum += v;
          sawValue = true;
        }
      }
      if (!sawValue) {
        // No ingredient measured this nutrient — total is unknowable.
        extTotals[key] = null;
      } else if (sawNull && !partial) {
        // Strict mode: any missing value voids the total.
        extTotals[key] = null;
      } else {
        extTotals[key] = roundTo(sum, decimalsForKey(key)) as never;
      }
    }
  }

  return {
    totalCalories: roundTo(calories, 0),
    totalProteinG: roundTo(protein, 1),
    totalFatG: roundTo(fat, 1),
    totalCarbG: roundTo(carb, 1),
    ingredientCount: ingredients.length,
    ...extTotals,
  };
}

// ---------------------------------------------------------------------------
// validateRecipeIngredient — sanity bounds for a single ingredient
// ---------------------------------------------------------------------------

export type RecipeIngredientIssueCode =
  | 'amount_not_positive'
  | 'amount_too_large'
  | 'food_serving_invalid';

export interface RecipeIngredientValidation {
  ok: boolean;
  issues: Array<{ code: RecipeIngredientIssueCode; message: string }>;
}

// 5kg per ingredient is far above any reasonable real recipe (a
// family-size hot pot uses ~1.5kg of meat) but well below "the user
// typed grams instead of kg by accident" — at 5kg+ we want to push
// back. Below this, the calculator just runs.
const MAX_AMOUNT_G_PER_INGREDIENT = 5000;

export function validateRecipeIngredient(
  food: Pick<Food, 'servingSizeG'>,
  amountG: number,
): RecipeIngredientValidation {
  const issues: RecipeIngredientValidation['issues'] = [];

  if (!Number.isFinite(amountG) || amountG <= 0) {
    issues.push({
      code: 'amount_not_positive',
      message: `amountG must be > 0 (got ${amountG})`,
    });
  } else if (amountG > MAX_AMOUNT_G_PER_INGREDIENT) {
    issues.push({
      code: 'amount_too_large',
      message: `amountG=${amountG} exceeds ${MAX_AMOUNT_G_PER_INGREDIENT}g per ingredient`,
    });
  }

  if (!Number.isFinite(food.servingSizeG) || food.servingSizeG <= 0) {
    issues.push({
      code: 'food_serving_invalid',
      message: `food.servingSizeG=${food.servingSizeG} is not positive`,
    });
  }

  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Macros & gram-scale extended nutrients (fiberG, sugarG, saltG, etc.)
// keep 2 decimals; mg/μg micronutrients keep 1 (the absolute values
// are already small — extra precision is rounding noise).
function decimalsForKey(key: keyof ExtendedNutrients): number {
  return key.endsWith('G') ? 2 : 1;
}

function roundTo(n: number, digits: number): number {
  if (!Number.isFinite(n)) return 0;
  const k = Math.pow(10, digits);
  return Math.round(n * k) / k;
}
