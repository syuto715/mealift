import * as SQLite from 'expo-sqlite';
import { FITNESS_DISHES, type FitnessDishDef } from '../../../constants/fitnessDishes';
import { generateId } from '../../../utils/id';
import {
  EXTENDED_NUTRIENT_KEYS,
  EXTENDED_NUTRIENT_DB_COLUMNS,
  type Food,
} from '../../../types/food';
import { buildRecipeFromFoodMap } from '../../../domain/recipeBuilder';

// seedFitnessDishes — inserts FITNESS_DISHES into the dishes table on
// fresh installs (and on upgrades, the first time fitness_* dishes are
// missing). The pass is gated on `id LIKE 'fitness_%'` count so it's
// independent of the older legacy DISHES seed which gates on is_custom.
//
// Why we resolve foodIds at boot rather than baking nutrition into the
// constant: keeps totals grounded in 八訂 figures. If a referenced food
// updates (e.g. MEXT correction), the next boot recomputes — no stale
// numbers to maintain.

interface FoodRow extends Record<string, unknown> {
  id: string;
}

function rowToFood(row: Record<string, unknown>): Food {
  return {
    id: row.id as string,
    nameJa: row.name_ja as string,
    nameEn: (row.name_en as string) ?? null,
    brand: (row.brand as string) ?? null,
    barcode: (row.barcode as string) ?? null,
    servingSizeG: row.serving_size_g as number,
    servingUnit: row.serving_unit as string,
    caloriesPerServing: row.calories_per_serving as number,
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
    source: row.source as Food['source'],
    externalId: (row.external_id as string) ?? null,
    isCustom: Boolean(row.is_custom),
    isFavorite: Boolean(row.is_favorite),
    isUserAdded: Boolean(row.is_user_added),
    verified: row.verified == null ? true : Boolean(row.verified),
    addedAt: (row.added_at as string) ?? null,
    useCount: (row.use_count as number) ?? 0,
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

export async function seedFitnessDishes(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  // Gate: only seed when no fitness_* rows exist yet. Cheap on subsequent
  // boots once seeded.
  const gate = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM dishes WHERE id LIKE 'fitness_%'`,
  );
  if (gate && gate.count > 0) return;

  // One bulk lookup: collect every distinct foodId across all 50 recipes,
  // SELECT them in a single query, build a Map for the calculator.
  const allFoodIds = Array.from(
    new Set(
      FITNESS_DISHES.flatMap((d) => d.ingredients.map((i) => i.foodId)),
    ),
  );
  if (allFoodIds.length === 0) return;

  const placeholders = allFoodIds.map(() => '?').join(',');
  let foodRows: FoodRow[] = [];
  try {
    foodRows = await db.getAllAsync<FoodRow>(
      `SELECT * FROM foods WHERE id IN (${placeholders})`,
      allFoodIds,
    );
  } catch {
    // foods table missing → migrations didn't run yet. Bail; will retry next boot.
    return;
  }
  const foodMap = new Map<string, Food>();
  for (const row of foodRows) {
    foodMap.set(row.id, rowToFood(row));
  }

  for (const dish of FITNESS_DISHES) {
    try {
      await insertOneFitnessDish(db, dish, foodMap);
    } catch {
      // Per-dish failure shouldn't fail the whole seed; skip and continue.
    }
  }
}

async function insertOneFitnessDish(
  db: SQLite.SQLiteDatabase,
  dish: FitnessDishDef,
  foodMap: Map<string, Food>,
): Promise<void> {
  const built = buildRecipeFromFoodMap(
    foodMap,
    dish.ingredients.map((i, idx) => ({
      foodId: i.foodId,
      amountG: i.amountG,
      sortOrder: idx,
    })),
    // Use partialSums for seed data — better to show a partial total than
    // null out an entire nutrient because one ingredient (e.g. salt)
    // doesn't carry that nutrient.
    { partialSums: true },
  );

  if (built.missingFoodIds.length > 0) {
    // Skip dishes with unresolved foodIds. A future migration / seed update
    // can fix the underlying data; we don't want a partial recipe in the DB.
    return;
  }

  const extCols = EXTENDED_NUTRIENT_KEYS.map((k) => EXTENDED_NUTRIENT_DB_COLUMNS[k]);
  const extVals = EXTENDED_NUTRIENT_KEYS.map((k) => built.totals[k] ?? null);

  // Insert dish row. is_custom=0 (it's a seed dish, not user-saved),
  // is_my_dish=0 so it doesn't show in the user's "マイ料理" list, and
  // use_count=0. The fitness_* IDs make the row identifiable.
  const dishCols = [
    'id', 'name_ja', 'name_en', 'category', 'serving_description',
    'total_calories', 'total_protein_g', 'total_fat_g', 'total_carb_g',
    'is_custom', 'is_my_dish', 'use_count',
    ...extCols,
  ].join(', ');
  const dishPlaceholders = new Array(12 + extCols.length).fill('?').join(', ');
  await db.runAsync(
    `INSERT OR IGNORE INTO dishes (${dishCols}) VALUES (${dishPlaceholders})`,
    [
      dish.id,
      dish.nameJa,
      dish.nameEn,
      dish.category,
      dish.servingDescription,
      built.totals.totalCalories,
      built.totals.totalProteinG,
      built.totals.totalFatG,
      built.totals.totalCarbG,
      0,
      0,
      0,
      ...extVals,
    ],
  );

  // Insert each ingredient with food_id linkage.
  const ingExtCols = EXTENDED_NUTRIENT_KEYS.map((k) => EXTENDED_NUTRIENT_DB_COLUMNS[k]);
  for (const ing of built.ingredients) {
    const ingExtVals = EXTENDED_NUTRIENT_KEYS.map((k) => ing[k] ?? null);
    const cols = [
      'id', 'dish_id', 'food_id', 'food_name', 'amount_g', 'calories',
      'protein_g', 'fat_g', 'carb_g', 'sort_order',
      ...ingExtCols,
    ].join(', ');
    const placeholders = new Array(10 + ingExtCols.length).fill('?').join(', ');
    await db.runAsync(
      `INSERT OR IGNORE INTO dish_ingredients (${cols}) VALUES (${placeholders})`,
      [
        generateId(),
        dish.id,
        ing.foodId,
        ing.foodName,
        ing.amountG,
        ing.calories,
        ing.proteinG,
        ing.fatG,
        ing.carbG,
        ing.sortOrder,
        ...ingExtVals,
      ],
    );
  }
}
