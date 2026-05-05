import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { Dish, DishIngredient, DishWithIngredients, DishCategory } from '../../types/dish';
import { ExtendedNutrients, EXTENDED_NUTRIENT_KEYS, EXTENDED_NUTRIENT_DB_COLUMNS } from '../../types/food';
import { buildRecipeFromFoodMap, type RecipeIngredientInput } from '../../domain/recipeBuilder';
import { getFoodsByIds } from './foodRepository';
import { enqueueRowFromTable } from './syncRepository';

/** Generic input type for saving AI-estimated dishes */
export interface SaveDishInput {
  dishName: string;
  servingDescription: string;
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarb: number;
  ingredients: {
    name: string;
    amountG: number;
    calories: number;
    protein: number;
    fat: number;
    carb: number;
  }[];
  confidence: string;
}

// ---------------------------------------------------------------------------
// Row mapping helpers
// ---------------------------------------------------------------------------

function rowToDish(row: Record<string, unknown>): Dish {
  return {
    id: row.id as string,
    nameJa: row.name_ja as string,
    nameEn: (row.name_en as string) ?? null,
    category: row.category as DishCategory,
    servingDescription: row.serving_description as string,
    totalCalories: row.total_calories as number,
    totalProteinG: row.total_protein_g as number,
    totalFatG: row.total_fat_g as number,
    totalCarbG: row.total_carb_g as number,
    fiberG: (row.fiber_g as number) ?? null,
    sodiumMg: (row.sodium_mg as number) ?? null,
    calciumMg: (row.calcium_mg as number) ?? null,
    ironMg: (row.iron_mg as number) ?? null,
    vitaminAUg: (row.vitamin_a_ug as number) ?? null,
    vitaminB1Mg: (row.vitamin_b1_mg as number) ?? null,
    vitaminB2Mg: (row.vitamin_b2_mg as number) ?? null,
    vitaminB6Mg: (row.vitamin_b6_mg as number) ?? null,
    vitaminB12Ug: (row.vitamin_b12_ug as number) ?? null,
    folateUg: (row.folate_ug as number) ?? null,
    vitaminCMg: (row.vitamin_c_mg as number) ?? null,
    vitaminDUg: (row.vitamin_d_ug as number) ?? null,
    vitaminEMg: (row.vitamin_e_mg as number) ?? null,
    potassiumMg: (row.potassium_mg as number) ?? null,
    magnesiumMg: (row.magnesium_mg as number) ?? null,
    zincMg: (row.zinc_mg as number) ?? null,
    cholesterolMg: (row.cholesterol_mg as number) ?? null,
    saturatedFatG: (row.saturated_fat_g as number) ?? null,
    sugarG: (row.sugar_g as number) ?? null,
    saltG: (row.salt_g as number) ?? null,
    isCustom: (row.is_custom as number) === 1,
    isFavorite: (row.is_favorite as number) === 1,
    isMyDish: (row.is_my_dish as number) === 1,
    userNote: (row.user_note as string) ?? null,
    lastUsedAt: (row.last_used_at as string) ?? null,
    useCount: (row.use_count as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

function rowToIngredient(row: Record<string, unknown>): DishIngredient {
  return {
    id: row.id as string,
    dishId: row.dish_id as string,
    foodId: (row.food_id as string) ?? null,
    foodName: row.food_name as string,
    amountG: row.amount_g as number,
    calories: row.calories as number,
    proteinG: row.protein_g as number,
    fatG: row.fat_g as number,
    carbG: row.carb_g as number,
    fiberG: (row.fiber_g as number) ?? null,
    sodiumMg: (row.sodium_mg as number) ?? null,
    calciumMg: (row.calcium_mg as number) ?? null,
    ironMg: (row.iron_mg as number) ?? null,
    vitaminAUg: (row.vitamin_a_ug as number) ?? null,
    vitaminB1Mg: (row.vitamin_b1_mg as number) ?? null,
    vitaminB2Mg: (row.vitamin_b2_mg as number) ?? null,
    vitaminB6Mg: (row.vitamin_b6_mg as number) ?? null,
    vitaminB12Ug: (row.vitamin_b12_ug as number) ?? null,
    folateUg: (row.folate_ug as number) ?? null,
    vitaminCMg: (row.vitamin_c_mg as number) ?? null,
    vitaminDUg: (row.vitamin_d_ug as number) ?? null,
    vitaminEMg: (row.vitamin_e_mg as number) ?? null,
    potassiumMg: (row.potassium_mg as number) ?? null,
    magnesiumMg: (row.magnesium_mg as number) ?? null,
    zincMg: (row.zinc_mg as number) ?? null,
    cholesterolMg: (row.cholesterol_mg as number) ?? null,
    saturatedFatG: (row.saturated_fat_g as number) ?? null,
    sugarG: (row.sugar_g as number) ?? null,
    saltG: (row.salt_g as number) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function searchDishes(
  query: string,
  limit: number = 30,
): Promise<Dish[]> {
  const db = await getDatabase();
  try {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM dishes
       WHERE name_ja LIKE ? AND deleted_at IS NULL
       ORDER BY use_count DESC, name_ja LIMIT ?`,
      [`%${query}%`, limit],
    );
    return rows.map(rowToDish);
  } catch (error) {
    return [];
  }
}

export async function getDishById(
  dishId: string,
): Promise<DishWithIngredients | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM dishes WHERE id = ? AND deleted_at IS NULL',
    [dishId],
  );
  if (!row) return null;

  const dish = rowToDish(row);

  const ingredientRows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM dish_ingredients WHERE dish_id = ? AND deleted_at IS NULL ORDER BY sort_order',
    [dishId],
  );

  return {
    ...dish,
    ingredients: ingredientRows.map(rowToIngredient),
  };
}

export async function getFrequentDishes(
  limit: number = 20,
): Promise<Dish[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM dishes
     WHERE use_count > 0 AND deleted_at IS NULL
     ORDER BY use_count DESC LIMIT ?`,
    [limit],
  );
  return rows.map(rowToDish);
}

export async function getDishCategories(): Promise<
  { category: DishCategory; count: number }[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT category, COUNT(*) as count FROM dishes WHERE deleted_at IS NULL GROUP BY category ORDER BY count DESC',
  );
  return rows.map((row) => ({
    category: row.category as DishCategory,
    count: row.count as number,
  }));
}

export async function getDishesByCategory(
  category: DishCategory,
  limit: number = 50,
): Promise<Dish[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM dishes WHERE category = ? AND deleted_at IS NULL ORDER BY use_count DESC, name_ja LIMIT ?',
    [category, limit],
  );
  return rows.map(rowToDish);
}

export async function incrementDishUseCount(dishId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE dishes SET use_count = use_count + 1, last_used_at = ?, updated_at = datetime('now') WHERE id = ?",
    [now, dishId],
  );
  await enqueueRowFromTable('dishes', dishId, 'UPDATE');
}

export async function getFavoriteDishes(limit: number = 50): Promise<Dish[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM dishes
       WHERE is_favorite = 1 AND deleted_at IS NULL
       ORDER BY name_ja LIMIT ?`,
      [limit],
    );
    return rows.map(rowToDish);
  } catch (error) {
    return [];
  }
}

export async function toggleDishFavorite(dishId: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ is_favorite: number }>(
    'SELECT is_favorite FROM dishes WHERE id = ? AND deleted_at IS NULL',
    [dishId],
  );
  if (!row) return false;
  const newValue = row.is_favorite ? 0 : 1;
  await db.runAsync(
    "UPDATE dishes SET is_favorite = ?, updated_at = datetime('now') WHERE id = ?",
    [newValue, dishId],
  );
  await enqueueRowFromTable('dishes', dishId, 'UPDATE');
  return newValue === 1;
}

export async function getDishFavoriteCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM dishes WHERE is_favorite = 1 AND deleted_at IS NULL',
  );
  return row?.count ?? 0;
}

export async function saveDishFromAI(
  estimate: SaveDishInput,
): Promise<DishWithIngredients> {
  const db = await getDatabase();
  const dishId = generateId();

  // sync-skip: AI-estimate path keeps is_my_dish=0; only saveMyDish
  // (below) sets is_my_dish=1 and enqueues. AI-only dishes stay
  // local — they aren't the user's curated content.
  await db.runAsync(
    `INSERT INTO dishes (id, name_ja, name_en, category, serving_description, total_calories, total_protein_g, total_fat_g, total_carb_g, is_custom, use_count)
     VALUES (?, ?, NULL, 'other', ?, ?, ?, ?, ?, 1, 0)`,
    [
      dishId,
      estimate.dishName,
      estimate.servingDescription,
      estimate.totalCalories,
      estimate.totalProtein,
      estimate.totalFat,
      estimate.totalCarb,
    ],
  );

  const ingredients: DishIngredient[] = [];
  for (let i = 0; i < estimate.ingredients.length; i++) {
    const ing = estimate.ingredients[i];
    const ingId = generateId();
    await db.runAsync(
      `INSERT INTO dish_ingredients (id, dish_id, food_name, amount_g, calories, protein_g, fat_g, carb_g, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ingId, dishId, ing.name, ing.amountG, ing.calories, ing.protein, ing.fat, ing.carb, i],
    );
    // sync-skip: parent dish (saveDishFromAI) is local-only; ingredients follow it.
    ingredients.push({
      id: ingId,
      dishId,
      foodId: null,
      foodName: ing.name,
      amountG: ing.amountG,
      calories: ing.calories,
      proteinG: ing.protein,
      fatG: ing.fat,
      carbG: ing.carb,
      fiberG: null, sodiumMg: null, calciumMg: null, ironMg: null,
      vitaminAUg: null, vitaminB1Mg: null, vitaminB2Mg: null,
      vitaminB6Mg: null, vitaminB12Ug: null, folateUg: null,
      vitaminCMg: null,
      vitaminDUg: null, vitaminEMg: null, potassiumMg: null, magnesiumMg: null,
      zincMg: null, cholesterolMg: null, saturatedFatG: null, sugarG: null, saltG: null,
      sortOrder: i,
    });
  }

  const dishRow = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM dishes WHERE id = ? AND deleted_at IS NULL',
    [dishId],
  );

  return {
    ...rowToDish(dishRow!),
    ingredients,
  };
}

// ---------------------------------------------------------------------------
// My Dish (mai-ryouri): user-composed dishes from the food database.
// ---------------------------------------------------------------------------

export interface MyDishIngredientInput {
  // Optional canonical food link. Set when the ingredient was picked from
  // the food database (via the recipe calculator); null/undefined for
  // free-text or AI-estimated ingredients.
  foodId?: string | null;
  foodName: string;
  amountG: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  extended?: Partial<ExtendedNutrients>;
}

export interface SaveMyDishInput {
  id?: string;
  nameJa: string;
  userNote: string | null;
  servingDescription?: string;
  ingredients: MyDishIngredientInput[];
}

function sumNutrients(
  ingredients: MyDishIngredientInput[],
): {
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  extended: Partial<Record<keyof ExtendedNutrients, number>>;
} {
  let calories = 0;
  let proteinG = 0;
  let fatG = 0;
  let carbG = 0;
  const extended: Partial<Record<keyof ExtendedNutrients, number>> = {};

  for (const ing of ingredients) {
    calories += ing.calories;
    proteinG += ing.proteinG;
    fatG += ing.fatG;
    carbG += ing.carbG;
    if (ing.extended) {
      for (const key of EXTENDED_NUTRIENT_KEYS) {
        const v = ing.extended[key];
        if (v != null) {
          extended[key] = (extended[key] ?? 0) + v;
        }
      }
    }
  }

  return { calories, proteinG, fatG, carbG, extended };
}

export async function saveMyDish(
  input: SaveMyDishInput,
): Promise<DishWithIngredients> {
  const db = await getDatabase();
  const dishId = input.id ?? generateId();
  const isUpdate = !!input.id;
  const totals = sumNutrients(input.ingredients);
  const serving = input.servingDescription ?? '1人前';

  // Build column list + values for extended nutrients dynamically so we don't
  // have to hardcode 20 columns in each statement.
  const extCols = EXTENDED_NUTRIENT_KEYS.map((k) => EXTENDED_NUTRIENT_DB_COLUMNS[k]);
  const extVals = EXTENDED_NUTRIENT_KEYS.map((k) => totals.extended[k] ?? null);

  if (isUpdate) {
    const setClauses = [
      'name_ja = ?',
      'serving_description = ?',
      'total_calories = ?',
      'total_protein_g = ?',
      'total_fat_g = ?',
      'total_carb_g = ?',
      'user_note = ?',
      ...extCols.map((c) => `${c} = ?`),
      "updated_at = datetime('now')",
    ].join(', ');
    await db.runAsync(
      `UPDATE dishes SET ${setClauses} WHERE id = ? AND is_my_dish = 1`,
      [
        input.nameJa,
        serving,
        Math.round(totals.calories),
        Math.round(totals.proteinG * 10) / 10,
        Math.round(totals.fatG * 10) / 10,
        Math.round(totals.carbG * 10) / 10,
        input.userNote,
        ...extVals,
        dishId,
      ],
    );
    await enqueueRowFromTable('dishes', dishId, 'UPDATE');

    await db.runAsync('DELETE FROM dish_ingredients WHERE dish_id = ?', [dishId]);
    // sync-skip: regen pattern (Phase 6 sign-off #5) — HARD delete is
    // intentional, not a user-facing delete. New ingredient INSERTs
    // below are enqueued, so the new shape reaches the server. Stale
    // server-side ingredient rows for the previous shape accumulate —
    // accepted v1 trade-off.
  } else {
    const insertCols = [
      'id', 'name_ja', 'name_en', 'category', 'serving_description',
      'total_calories', 'total_protein_g', 'total_fat_g', 'total_carb_g',
      'is_custom', 'is_my_dish', 'user_note', 'use_count',
      ...extCols,
    ].join(', ');
    const placeholders = new Array(
      9 /* id + 8 core fields */ + 4 /* is_custom, is_my_dish, user_note, use_count */ + extCols.length,
    )
      .fill('?')
      .join(', ');
    await db.runAsync(
      `INSERT INTO dishes (${insertCols}) VALUES (${placeholders})`,
      [
        dishId,
        input.nameJa,
        null,
        'other',
        serving,
        Math.round(totals.calories),
        Math.round(totals.proteinG * 10) / 10,
        Math.round(totals.fatG * 10) / 10,
        Math.round(totals.carbG * 10) / 10,
        0,
        1,
        input.userNote,
        0,
        ...extVals,
      ],
    );
    await enqueueRowFromTable('dishes', dishId, 'INSERT');
  }

  const ingExtCols = EXTENDED_NUTRIENT_KEYS.map((k) => EXTENDED_NUTRIENT_DB_COLUMNS[k]);
  for (let i = 0; i < input.ingredients.length; i++) {
    const ing = input.ingredients[i];
    const ingId = generateId();
    const ingExtVals = EXTENDED_NUTRIENT_KEYS.map((k) => ing.extended?.[k] ?? null);
    const cols = [
      'id', 'dish_id', 'food_id', 'food_name', 'amount_g', 'calories',
      'protein_g', 'fat_g', 'carb_g', 'sort_order',
      ...ingExtCols,
    ].join(', ');
    const placeholders = new Array(10 + ingExtCols.length).fill('?').join(', ');
    await db.runAsync(
      `INSERT INTO dish_ingredients (${cols}) VALUES (${placeholders})`,
      [
        ingId,
        dishId,
        ing.foodId ?? null,
        ing.foodName,
        ing.amountG,
        Math.round(ing.calories),
        Math.round(ing.proteinG * 10) / 10,
        Math.round(ing.fatG * 10) / 10,
        Math.round(ing.carbG * 10) / 10,
        i,
        ...ingExtVals,
      ],
    );
    await enqueueRowFromTable('dish_ingredients', ingId, 'INSERT');
  }

  const full = await getDishById(dishId);
  if (!full) throw new Error('saveMyDish: dish not found after insert');
  return full;
}

export async function getMyDishes(limit: number = 100): Promise<Dish[]> {
  const db = await getDatabase();
  try {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM dishes
       WHERE is_my_dish = 1 AND deleted_at IS NULL
       ORDER BY last_used_at DESC, created_at DESC
       LIMIT ?`,
      [limit],
    );
    return rows.map(rowToDish);
  } catch {
    return [];
  }
}

export async function softDeleteMyDish(dishId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE dishes SET deleted_at = ?, updated_at = datetime('now') WHERE id = ? AND is_my_dish = 1",
    [now, dishId],
  );
  await enqueueRowFromTable('dishes', dishId, 'UPDATE');
}

export async function duplicateMyDish(
  dishId: string,
): Promise<DishWithIngredients | null> {
  const source = await getDishById(dishId);
  if (!source) return null;
  return saveMyDish({
    nameJa: `${source.nameJa} (コピー)`,
    userNote: source.userNote,
    servingDescription: source.servingDescription,
    ingredients: source.ingredients.map((ing) => ({
      foodId: ing.foodId,
      foodName: ing.foodName,
      amountG: ing.amountG,
      calories: ing.calories,
      proteinG: ing.proteinG,
      fatG: ing.fatG,
      carbG: ing.carbG,
      extended: {
        fiberG: ing.fiberG,
        sodiumMg: ing.sodiumMg,
        calciumMg: ing.calciumMg,
        ironMg: ing.ironMg,
        vitaminAUg: ing.vitaminAUg,
        vitaminB1Mg: ing.vitaminB1Mg,
        vitaminB2Mg: ing.vitaminB2Mg,
        vitaminB6Mg: ing.vitaminB6Mg,
        vitaminB12Ug: ing.vitaminB12Ug,
        folateUg: ing.folateUg,
        vitaminCMg: ing.vitaminCMg,
        vitaminDUg: ing.vitaminDUg,
        vitaminEMg: ing.vitaminEMg,
        potassiumMg: ing.potassiumMg,
        magnesiumMg: ing.magnesiumMg,
        zincMg: ing.zincMg,
        cholesterolMg: ing.cholesterolMg,
        saturatedFatG: ing.saturatedFatG,
        sugarG: ing.sugarG,
        saltG: ing.saltG,
      },
    })),
  });
}

// ---------------------------------------------------------------------------
// My Dish from food-id list — recipe calculator entry point.
// ---------------------------------------------------------------------------
//
// Resolves foodIds to canonical Food rows, runs the pure recipe calculator,
// and persists the result as a my-dish with food_id linkage on each
// ingredient. Throws if any foodId can't be resolved — partial recipes
// would silently lose nutrition and we'd rather fail loudly.

export interface SaveMyDishFromFoodIdsInput {
  id?: string;
  nameJa: string;
  userNote: string | null;
  servingDescription?: string;
  ingredients: RecipeIngredientInput[];
  // partialSums: when true, extended-nutrient totals skip null values
  // instead of voiding the whole sum. See computeRecipeTotals docs.
  partialSums?: boolean;
}

export class MissingFoodIdsError extends Error {
  constructor(public missingFoodIds: string[]) {
    super(
      `saveMyDishFromFoodIds: ${missingFoodIds.length} foodId(s) not in DB: ${missingFoodIds.join(', ')}`,
    );
    this.name = 'MissingFoodIdsError';
  }
}

export async function saveMyDishFromFoodIds(
  input: SaveMyDishFromFoodIdsInput,
): Promise<DishWithIngredients> {
  if (input.ingredients.length === 0) {
    throw new Error('saveMyDishFromFoodIds: ingredients[] must be non-empty');
  }

  const ids = input.ingredients.map((i) => i.foodId);
  const foods = await getFoodsByIds(ids);
  const built = buildRecipeFromFoodMap(foods, input.ingredients, {
    partialSums: !!input.partialSums,
  });
  if (built.missingFoodIds.length > 0) {
    throw new MissingFoodIdsError(built.missingFoodIds);
  }

  // Map calculator output → MyDishIngredientInput shape so we go through
  // the existing saveMyDish persistence path. The calculator already
  // preserved nulls on extended nutrients; we forward them via `extended`.
  const myDishIngredients: MyDishIngredientInput[] = built.ingredients.map((ing) => {
    const extended: Partial<ExtendedNutrients> = {};
    for (const key of EXTENDED_NUTRIENT_KEYS) {
      // Pass through both numeric values and explicit nulls — saveMyDish's
      // dynamic extVals build coerces undefined to null too, but being
      // explicit keeps null preservation visible at this boundary.
      extended[key] = ing[key] as never;
    }
    return {
      foodId: ing.foodId,
      foodName: ing.foodName,
      amountG: ing.amountG,
      calories: ing.calories,
      proteinG: ing.proteinG,
      fatG: ing.fatG,
      carbG: ing.carbG,
      extended,
    };
  });

  return saveMyDish({
    id: input.id,
    nameJa: input.nameJa,
    userNote: input.userNote,
    servingDescription: input.servingDescription,
    ingredients: myDishIngredients,
  });
}
