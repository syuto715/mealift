import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { Dish, DishIngredient, DishWithIngredients, DishCategory } from '../../types/dish';

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
    useCount: (row.use_count as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

function rowToIngredient(row: Record<string, unknown>): DishIngredient {
  return {
    id: row.id as string,
    dishId: row.dish_id as string,
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
      'SELECT * FROM dishes WHERE name_ja LIKE ? ORDER BY use_count DESC, name_ja LIMIT ?',
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
    'SELECT * FROM dishes WHERE id = ?',
    [dishId],
  );
  if (!row) return null;

  const dish = rowToDish(row);

  const ingredientRows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM dish_ingredients WHERE dish_id = ? ORDER BY sort_order',
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
    'SELECT * FROM dishes WHERE use_count > 0 ORDER BY use_count DESC LIMIT ?',
    [limit],
  );
  return rows.map(rowToDish);
}

export async function getDishCategories(): Promise<
  { category: DishCategory; count: number }[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT category, COUNT(*) as count FROM dishes GROUP BY category ORDER BY count DESC',
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
    'SELECT * FROM dishes WHERE category = ? ORDER BY use_count DESC, name_ja LIMIT ?',
    [category, limit],
  );
  return rows.map(rowToDish);
}

export async function incrementDishUseCount(dishId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE dishes SET use_count = use_count + 1 WHERE id = ?',
    [dishId],
  );
}

export async function getFavoriteDishes(limit: number = 50): Promise<Dish[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM dishes WHERE is_favorite = 1 ORDER BY name_ja LIMIT ?',
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
    'SELECT is_favorite FROM dishes WHERE id = ?',
    [dishId],
  );
  if (!row) return false;
  const newValue = row.is_favorite ? 0 : 1;
  await db.runAsync(
    'UPDATE dishes SET is_favorite = ? WHERE id = ?',
    [newValue, dishId],
  );
  return newValue === 1;
}

export async function getDishFavoriteCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM dishes WHERE is_favorite = 1',
  );
  return row?.count ?? 0;
}

export async function saveDishFromAI(
  estimate: SaveDishInput,
): Promise<DishWithIngredients> {
  const db = await getDatabase();
  const dishId = generateId();

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
    ingredients.push({
      id: ingId,
      dishId,
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
    'SELECT * FROM dishes WHERE id = ?',
    [dishId],
  );

  return {
    ...rowToDish(dishRow!),
    ingredients,
  };
}
