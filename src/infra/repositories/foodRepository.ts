import { getDatabase } from '../database/connection';
import { generateId } from '../../utils/id';
import { Food, FoodInput } from '../../types/food';
import { FOODS } from '../../constants/foods';

function rowToFood(row: Record<string, unknown>): Food {
  return {
    id: row.id as string,
    nameJa: row.name_ja as string,
    nameEn: row.name_en as string | null,
    brand: row.brand as string | null,
    barcode: row.barcode as string | null,
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
    useCount: row.use_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function searchFoods(
  query: string,
  limit: number = 20
): Promise<Food[]> {
  try {
    const db = await getDatabase();
    const trimmed = query.trim();
    if (!trimmed) return [];
    const exact = trimmed;
    const prefix = `${trimmed}%`;
    const contains = `%${trimmed}%`;
    // Rank: exact match (0), alias exact (1), prefix (2), alias prefix (3), contains (4), alias contains (5).
    // Within the same rank, rows flagged is_common=1 come first (so 白米 beats
    // 10+ variant preparations). After that, sort by actual usage count
    // (meal_log_items appearances), then by historical use_count, then by name.
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT f.*, (
         SELECT COUNT(*) FROM meal_log_items mli WHERE mli.food_id = f.id
       ) AS usage_count,
       MIN(
         CASE WHEN f.name_ja = ? THEN 0 ELSE NULL END,
         CASE WHEN fa.alias_name = ? THEN 1 ELSE NULL END,
         CASE WHEN f.name_ja LIKE ? THEN 2 ELSE NULL END,
         CASE WHEN fa.alias_name LIKE ? THEN 3 ELSE NULL END,
         CASE WHEN f.name_ja LIKE ? THEN 4 ELSE NULL END,
         CASE WHEN fa.alias_name LIKE ? THEN 5 ELSE NULL END
       ) AS match_rank
       FROM foods f
       LEFT JOIN food_aliases fa ON fa.food_id = f.id
       WHERE f.deleted_at IS NULL
         AND (f.name_ja = ?
           OR fa.alias_name = ?
           OR f.name_ja LIKE ?
           OR fa.alias_name LIKE ?
           OR f.name_ja LIKE ?
           OR fa.alias_name LIKE ?)
       GROUP BY f.id
       ORDER BY match_rank ASC, f.is_common DESC, usage_count DESC, f.use_count DESC, f.name_ja
       LIMIT ?`,
      [
        exact, exact, prefix, prefix, contains, contains,
        exact, exact, prefix, prefix, contains, contains,
        limit,
      ]
    );
    return rows.map(rowToFood);
  } catch {
    // Fallback to simple search if alias table doesn't exist yet.
    try {
      const db = await getDatabase();
      const pattern = `%${query}%`;
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM foods
         WHERE (name_ja LIKE ? OR name_en LIKE ?) AND deleted_at IS NULL
         ORDER BY use_count DESC, name_ja LIMIT ?`,
        [pattern, pattern, limit]
      );
      return rows.map(rowToFood);
    } catch {
      return [];
    }
  }
}

export async function getFrequentFoods(limit: number = 20): Promise<Food[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM foods
       WHERE deleted_at IS NULL
       ORDER BY use_count DESC, name_ja LIMIT ?`,
      [limit]
    );
    return rows.map(rowToFood);
  } catch (error) {
    return [];
  }
}

export async function getFoodsByCategory(
  category: string,
  limit: number = 50
): Promise<Food[]> {
  try {
    const categoryFoodIds = FOODS.filter((f) => f.category === category).map(
      (f) => f.id
    );
    if (categoryFoodIds.length === 0) {
      return [];
    }
    const db = await getDatabase();
    const placeholders = categoryFoodIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM foods WHERE id IN (${placeholders}) ORDER BY name_ja LIMIT ?`,
      [...categoryFoodIds, limit]
    );
    return rows.map(rowToFood);
  } catch (error) {
    return [];
  }
}

export async function addCustomFood(input: FoodInput): Promise<Food> {
  const db = await getDatabase();
  const id = generateId();
  const source = input.source ?? 'manual';
  await db.runAsync(
    `INSERT INTO foods (id, name_ja, name_en, brand, barcode, serving_size_g, serving_unit, calories_per_serving, protein_g, fat_g, carb_g, fiber_g, source, is_custom, use_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
    [
      id,
      input.nameJa,
      input.nameEn ?? null,
      input.brand ?? null,
      input.barcode ?? null,
      input.servingSizeG,
      input.servingUnit,
      input.caloriesPerServing,
      input.proteinG,
      input.fatG,
      input.carbG,
      input.fiberG ?? null,
      source,
    ]
  );
  const created = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM foods WHERE id = ?',
    [id]
  );
  return rowToFood(created!);
}

export async function incrementFoodUseCount(foodId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE foods SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?`,
    [foodId]
  );
}

export async function getFoodById(foodId: string): Promise<Food | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM foods WHERE id = ?',
    [foodId]
  );
  if (!row) return null;
  return rowToFood(row);
}

export async function getFavoriteFoods(limit: number = 50): Promise<Food[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM foods
       WHERE is_favorite = 1 AND deleted_at IS NULL
       ORDER BY name_ja LIMIT ?`,
      [limit]
    );
    return rows.map(rowToFood);
  } catch (error) {
    return [];
  }
}

export async function toggleFoodFavorite(foodId: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ is_favorite: number }>(
    'SELECT is_favorite FROM foods WHERE id = ?',
    [foodId]
  );
  if (!row) return false;
  const newValue = row.is_favorite ? 0 : 1;
  await db.runAsync(
    "UPDATE foods SET is_favorite = ?, updated_at = datetime('now') WHERE id = ?",
    [newValue, foodId]
  );
  return newValue === 1;
}

export async function getFavoriteCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM foods WHERE is_favorite = 1'
  );
  return row?.count ?? 0;
}

export async function findByExactName(nameJa: string): Promise<Food | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM foods WHERE name_ja = ? AND deleted_at IS NULL LIMIT 1',
      [nameJa]
    );
    return row ? rowToFood(row) : null;
  } catch (error) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Barcode + user-added food helpers
// ---------------------------------------------------------------------------

export async function getFoodByBarcode(barcode: string): Promise<Food | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM foods
       WHERE barcode = ? AND deleted_at IS NULL
       ORDER BY verified DESC, updated_at DESC
       LIMIT 1`,
      [barcode],
    );
    return row ? rowToFood(row) : null;
  } catch {
    return null;
  }
}

const EXT_COLS_WITH_VALUES = [
  'fiber_g', 'sodium_mg', 'calcium_mg', 'iron_mg',
  'vitamin_a_ug', 'vitamin_b1_mg', 'vitamin_b2_mg',
  'vitamin_b6_mg', 'vitamin_b12_ug', 'folate_ug',
  'vitamin_c_mg', 'vitamin_d_ug', 'vitamin_e_mg',
  'potassium_mg', 'magnesium_mg', 'zinc_mg',
  'cholesterol_mg', 'saturated_fat_g', 'sugar_g', 'salt_g',
] as const;

const EXT_INPUT_KEYS: ReadonlyArray<keyof FoodInput> = [
  'fiberG', 'sodiumMg', 'calciumMg', 'ironMg',
  'vitaminAUg', 'vitaminB1Mg', 'vitaminB2Mg',
  'vitaminB6Mg', 'vitaminB12Ug', 'folateUg',
  'vitaminCMg', 'vitaminDUg', 'vitaminEMg',
  'potassiumMg', 'magnesiumMg', 'zincMg',
  'cholesterolMg', 'saturatedFatG', 'sugarG', 'saltG',
];

export interface SaveUserFoodOptions {
  source?: FoodInput['source'];
  externalId?: string | null;
  isUserAdded?: boolean;
  verified?: boolean;
}

/**
 * Full-fidelity food insert (or upsert-by-barcode) that writes every extended
 * nutrient. Used for both OFF-imported rows (`isUserAdded=false, verified=true`)
 * and user-submitted rows (`isUserAdded=true, verified=false`).
 */
export async function saveFood(
  input: FoodInput,
  opts: SaveUserFoodOptions = {},
): Promise<Food> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  // Upsert by barcode when provided so repeat OFF lookups replace the cached row.
  if (input.barcode) {
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM foods WHERE barcode = ? AND deleted_at IS NULL LIMIT 1',
      [input.barcode],
    );
    if (existing) {
      const setClauses = [
        'name_ja = ?',
        'name_en = ?',
        'brand = ?',
        'serving_size_g = ?',
        'serving_unit = ?',
        'calories_per_serving = ?',
        'protein_g = ?',
        'fat_g = ?',
        'carb_g = ?',
        'source = ?',
        'external_id = ?',
        'verified = ?',
        "updated_at = datetime('now')",
        ...EXT_COLS_WITH_VALUES.map((c) => `${c} = ?`),
      ].join(', ');
      const extVals = EXT_INPUT_KEYS.map((k) => (input[k] as number | null | undefined) ?? null);
      await db.runAsync(
        `UPDATE foods SET ${setClauses} WHERE id = ?`,
        [
          input.nameJa,
          input.nameEn ?? null,
          input.brand ?? null,
          input.servingSizeG,
          input.servingUnit,
          input.caloriesPerServing,
          input.proteinG,
          input.fatG,
          input.carbG,
          opts.source ?? input.source ?? 'manual',
          opts.externalId ?? input.barcode,
          opts.verified === false ? 0 : 1,
          ...extVals,
          existing.id,
        ],
      );
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM foods WHERE id = ?',
        [existing.id],
      );
      return rowToFood(row!);
    }
  }

  const id = generateId();
  const source = opts.source ?? input.source ?? 'manual';
  const isUserAdded = opts.isUserAdded ? 1 : 0;
  const verified = opts.verified === false ? 0 : 1;
  const addedAt = opts.isUserAdded ? now : null;

  const cols = [
    'id', 'name_ja', 'name_en', 'brand', 'barcode',
    'serving_size_g', 'serving_unit',
    'calories_per_serving', 'protein_g', 'fat_g', 'carb_g',
    'source', 'external_id', 'is_custom', 'is_user_added',
    'verified', 'added_at', 'use_count',
    ...EXT_COLS_WITH_VALUES,
  ].join(', ');
  const placeholders = new Array(18 + EXT_COLS_WITH_VALUES.length).fill('?').join(', ');
  const extVals = EXT_INPUT_KEYS.map((k) => (input[k] as number | null | undefined) ?? null);

  await db.runAsync(
    `INSERT INTO foods (${cols}) VALUES (${placeholders})`,
    [
      id,
      input.nameJa,
      input.nameEn ?? null,
      input.brand ?? null,
      input.barcode ?? null,
      input.servingSizeG,
      input.servingUnit,
      input.caloriesPerServing,
      input.proteinG,
      input.fatG,
      input.carbG,
      source,
      opts.externalId ?? null,
      isUserAdded, // is_custom — user-added rows are also "custom" in the legacy sense
      isUserAdded,
      verified,
      addedAt,
      0,
      ...extVals,
    ],
  );

  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM foods WHERE id = ?',
    [id],
  );
  return rowToFood(row!);
}

export async function getUserAddedFoods(limit: number = 200): Promise<Food[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM foods
       WHERE is_user_added = 1 AND deleted_at IS NULL
       ORDER BY added_at DESC, created_at DESC
       LIMIT ?`,
      [limit],
    );
    return rows.map(rowToFood);
  } catch {
    return [];
  }
}

export async function updateUserFood(
  foodId: string,
  input: FoodInput,
): Promise<Food | null> {
  const db = await getDatabase();
  const setClauses = [
    'name_ja = ?',
    'name_en = ?',
    'brand = ?',
    'barcode = ?',
    'serving_size_g = ?',
    'serving_unit = ?',
    'calories_per_serving = ?',
    'protein_g = ?',
    'fat_g = ?',
    'carb_g = ?',
    "updated_at = datetime('now')",
    ...EXT_COLS_WITH_VALUES.map((c) => `${c} = ?`),
  ].join(', ');
  const extVals = EXT_INPUT_KEYS.map((k) => (input[k] as number | null | undefined) ?? null);
  await db.runAsync(
    `UPDATE foods SET ${setClauses} WHERE id = ? AND is_user_added = 1`,
    [
      input.nameJa,
      input.nameEn ?? null,
      input.brand ?? null,
      input.barcode ?? null,
      input.servingSizeG,
      input.servingUnit,
      input.caloriesPerServing,
      input.proteinG,
      input.fatG,
      input.carbG,
      ...extVals,
      foodId,
    ],
  );
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM foods WHERE id = ?',
    [foodId],
  );
  return row ? rowToFood(row) : null;
}

export async function softDeleteUserFood(foodId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE foods SET deleted_at = ?, updated_at = datetime('now')
     WHERE id = ? AND is_user_added = 1`,
    [now, foodId],
  );
}
