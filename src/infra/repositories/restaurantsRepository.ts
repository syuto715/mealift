import { getDatabase } from '../database/connection';

// v1.5 Stage 2 Phase 2.1 — restaurantsRepository shell.
//
// Architectural SSoT:
//   - docs/plans/v1.5_stage_2_restaurant_menu_db_epic.md §5.2
//     (SQLite mirror shape — v34 / v35 tables) + §3.1 surface ①
//     (search query JOIN against alias side tables) + §3.2 (mirror
//     is read-cache; server-authoritative)
//
// Phase 2.1 scope: read-only shell over the v34 + v35 mirror.
// Server-authoritative sync helpers (upsertFromSupabase /
// applyDelta) land in Phase 2.2 once the seed migration is in
// place. The shell exists so Phase 2.3 search UX work can wire up
// against a stable interface.

export type RestaurantType =
  | 'dining'
  | 'convenience'
  | 'cafe_bakery'
  | 'combo_meal';

export interface RestaurantLocal {
  id: string;
  name: string;
  restaurantType: RestaurantType;
  categoryId: string | null;
  officialUrl: string | null;
  attribution: string;
  attributionUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantMenuItemLocal {
  id: string;
  restaurantId: string;
  name: string;
  category: string | null;
  servingSizeG: number;
  servingUnit: string;
  servingDescription: string | null;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
  sodiumMg: number | null;
  saturatedFatG: number | null;
  cholesterolMg: number | null;
  barcode: string | null;
  ingredientDecompositionJson: string | null;
  source: string;
  sourceUrl: string | null;
  sourceCapturedAt: string | null;
  version: number;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

function rowToRestaurant(row: Record<string, unknown>): RestaurantLocal {
  return {
    id: row.id as string,
    name: row.name as string,
    restaurantType: row.restaurant_type as RestaurantType,
    categoryId: (row.category_id as string) ?? null,
    officialUrl: (row.official_url as string) ?? null,
    attribution: row.attribution as string,
    attributionUrl: (row.attribution_url as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMenuItem(
  row: Record<string, unknown>,
): RestaurantMenuItemLocal {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    name: row.name as string,
    category: (row.category as string) ?? null,
    servingSizeG: row.serving_size_g as number,
    servingUnit: row.serving_unit as string,
    servingDescription: (row.serving_description as string) ?? null,
    caloriesPerServing: row.calories_per_serving as number,
    proteinG: row.protein_g as number,
    fatG: row.fat_g as number,
    carbG: row.carb_g as number,
    fiberG: (row.fiber_g as number) ?? null,
    sugarG: (row.sugar_g as number) ?? null,
    saltG: (row.salt_g as number) ?? null,
    sodiumMg: (row.sodium_mg as number) ?? null,
    saturatedFatG: (row.saturated_fat_g as number) ?? null,
    cholesterolMg: (row.cholesterol_mg as number) ?? null,
    barcode: (row.barcode as string) ?? null,
    ingredientDecompositionJson:
      (row.ingredient_decomposition_json as string) ?? null,
    source: row.source as string,
    sourceUrl: (row.source_url as string) ?? null,
    sourceCapturedAt: (row.source_captured_at as string) ?? null,
    version: row.version as number,
    useCount: row.use_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function readAllRestaurants(): Promise<RestaurantLocal[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM restaurants_local ORDER BY name',
  );
  return rows.map(rowToRestaurant);
}

export async function readRestaurantsByType(
  type: RestaurantType,
): Promise<RestaurantLocal[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM restaurants_local WHERE restaurant_type = ? ORDER BY name',
    [type],
  );
  return rows.map(rowToRestaurant);
}

export async function readRestaurantById(
  id: string,
): Promise<RestaurantLocal | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM restaurants_local WHERE id = ?',
    [id],
  );
  return row ? rowToRestaurant(row) : null;
}

export async function readMenuItemsForRestaurant(
  restaurantId: string,
  limit: number = 100,
): Promise<RestaurantMenuItemLocal[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM restaurant_menu_items_local
      WHERE restaurant_id = ?
      ORDER BY use_count DESC, name
      LIMIT ?`,
    [restaurantId, limit],
  );
  return rows.map(rowToMenuItem);
}

export async function readMenuItemById(
  id: string,
): Promise<RestaurantMenuItemLocal | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM restaurant_menu_items_local WHERE id = ?',
    [id],
  );
  return row ? rowToMenuItem(row) : null;
}

// §3.1 surface ① — fuzzy search joining alias side tables. The
// `query` arg is matched against:
//   - restaurants_local.name LIKE
//   - restaurant_aliases_local.alias_lower LIKE
//   - restaurant_menu_items_local.name LIKE
//   - restaurant_menu_item_aliases_local.alias_lower LIKE
// Rows are ranked by menu_item use_count desc. Phase 2.3 lifts
// this into the foods picker as a parallel result list.
export async function searchMenuItems(
  query: string,
  limit: number = 30,
): Promise<RestaurantMenuItemLocal[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const db = await getDatabase();
  const lowerContains = `%${trimmed.toLowerCase()}%`;
  const contains = `%${trimmed}%`;
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT DISTINCT m.*
       FROM restaurant_menu_items_local m
       JOIN restaurants_local r ON r.id = m.restaurant_id
       LEFT JOIN restaurant_aliases_local ra
         ON ra.restaurant_id = r.id
        AND ra.alias_lower LIKE ?
       LEFT JOIN restaurant_menu_item_aliases_local ma
         ON ma.menu_item_id = m.id
        AND ma.alias_lower LIKE ?
      WHERE r.name LIKE ?
         OR ra.alias_lower IS NOT NULL
         OR m.name LIKE ?
         OR ma.alias_lower IS NOT NULL
      ORDER BY m.use_count DESC, m.name
      LIMIT ?`,
    [lowerContains, lowerContains, contains, contains, limit],
  );
  return rows.map(rowToMenuItem);
}

export async function findMenuItemByBarcode(
  barcode: string,
): Promise<RestaurantMenuItemLocal | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM restaurant_menu_items_local WHERE barcode = ? LIMIT 1',
    [barcode],
  );
  return row ? rowToMenuItem(row) : null;
}
