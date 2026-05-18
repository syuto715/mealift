// v1.5 Stage 2 Phase 2.1 — restaurantsRepository tests.
//
// Verifies the SQL fragments that touch v34 restaurants_local +
// restaurant_aliases_local + v35 restaurant_menu_items_local +
// restaurant_menu_item_aliases_local are well-formed against an
// in-memory fake SQLite shim. Covers: readAllRestaurants,
// readRestaurantsByType, readRestaurantById, readMenuItemsForRestaurant,
// readMenuItemById, searchMenuItems (alias-aware join),
// findMenuItemByBarcode.

interface FakeRow extends Record<string, unknown> {}

class FakeDb {
  restaurants: FakeRow[] = [];
  menuItems: FakeRow[] = [];
  restaurantAliases: FakeRow[] = [];
  menuItemAliases: FakeRow[] = [];

  async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (sql.includes('FROM restaurants_local')) {
      if (sql.includes('WHERE restaurant_type = ?')) {
        const [type] = params as [string];
        return this.restaurants
          .filter((r) => r.restaurant_type === type)
          .sort((a, b) => String(a.name).localeCompare(String(b.name))) as unknown as T[];
      }
      return [...this.restaurants].sort((a, b) =>
        String(a.name).localeCompare(String(b.name)),
      ) as unknown as T[];
    }
    if (sql.includes('FROM restaurant_menu_items_local')
        && sql.includes('WHERE restaurant_id = ?')) {
      const [restaurantId, limit] = params as [string, number];
      return this.menuItems
        .filter((r) => r.restaurant_id === restaurantId)
        .sort(
          (a, b) =>
            ((b.use_count as number) ?? 0) - ((a.use_count as number) ?? 0)
            || String(a.name).localeCompare(String(b.name)),
        )
        .slice(0, limit) as unknown as T[];
    }
    if (sql.includes('SELECT DISTINCT m.*')) {
      // searchMenuItems — emulate the JOIN result by checking each
      // menu item against name OR alias OR parent name OR parent
      // alias.
      const [aliasLower, menuAliasLower, parentContains, menuContains, limit] =
        params as [string, string, string, string, number];
      const aliasNeedle = aliasLower.replace(/%/g, '').toLowerCase();
      const menuAliasNeedle = menuAliasLower.replace(/%/g, '').toLowerCase();
      const parentNeedle = parentContains.replace(/%/g, '');
      const menuNeedle = menuContains.replace(/%/g, '');
      const matched: FakeRow[] = [];
      for (const m of this.menuItems) {
        const parent = this.restaurants.find((r) => r.id === m.restaurant_id);
        const parentNameMatch = parent
          && String(parent.name).includes(parentNeedle);
        const menuNameMatch = String(m.name).includes(menuNeedle);
        const parentAliasMatch = this.restaurantAliases.some(
          (a) =>
            a.restaurant_id === m.restaurant_id
            && String(a.alias_lower).includes(aliasNeedle),
        );
        const menuAliasMatch = this.menuItemAliases.some(
          (a) =>
            a.menu_item_id === m.id
            && String(a.alias_lower).includes(menuAliasNeedle),
        );
        if (parentNameMatch || menuNameMatch || parentAliasMatch || menuAliasMatch) {
          matched.push(m);
        }
      }
      return matched
        .sort(
          (a, b) =>
            ((b.use_count as number) ?? 0) - ((a.use_count as number) ?? 0)
            || String(a.name).localeCompare(String(b.name)),
        )
        .slice(0, limit) as unknown as T[];
    }
    return [];
  }

  async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (sql.includes('FROM restaurants_local WHERE id = ?')) {
      const [id] = params as [string];
      return (this.restaurants.find((r) => r.id === id) ?? null) as unknown as T | null;
    }
    if (sql.includes('FROM restaurant_menu_items_local WHERE id = ?')) {
      const [id] = params as [string];
      return (this.menuItems.find((r) => r.id === id) ?? null) as unknown as T | null;
    }
    if (sql.includes('FROM restaurant_menu_items_local WHERE barcode = ?')) {
      const [barcode] = params as [string];
      return (
        this.menuItems.find((r) => r.barcode === barcode) ?? null
      ) as unknown as T | null;
    }
    return null;
  }
}

const mockFakeDb = new FakeDb();

jest.mock('../../database/connection', () => ({
  getDatabase: async () => mockFakeDb,
}));

import {
  readAllRestaurants,
  readRestaurantsByType,
  readRestaurantById,
  readMenuItemsForRestaurant,
  readMenuItemById,
  searchMenuItems,
  findMenuItemByBarcode,
} from '../restaurantsRepository';

function seedRestaurant(
  id: string,
  name: string,
  type: 'dining' | 'convenience' | 'cafe_bakery' | 'combo_meal' = 'dining',
): void {
  mockFakeDb.restaurants.push({
    id,
    name,
    restaurant_type: type,
    category_id: null,
    official_url: null,
    attribution: '公式サイトより',
    attribution_url: null,
    created_at: '2026-05-17T00:00:00.000Z',
    updated_at: '2026-05-17T00:00:00.000Z',
  });
}

function seedMenuItem(
  id: string,
  restaurantId: string,
  name: string,
  opts: { useCount?: number; barcode?: string | null } = {},
): void {
  mockFakeDb.menuItems.push({
    id,
    restaurant_id: restaurantId,
    name,
    category: null,
    serving_size_g: 100,
    serving_unit: 'g',
    serving_description: null,
    calories_per_serving: 500,
    protein_g: 20,
    fat_g: 25,
    carb_g: 50,
    fiber_g: null,
    sugar_g: null,
    salt_g: null,
    sodium_mg: null,
    saturated_fat_g: null,
    cholesterol_mg: null,
    barcode: opts.barcode ?? null,
    ingredient_decomposition_json: null,
    source: 'official_disclosure',
    source_url: null,
    source_captured_at: null,
    version: 1,
    use_count: opts.useCount ?? 0,
    created_at: '2026-05-17T00:00:00.000Z',
    updated_at: '2026-05-17T00:00:00.000Z',
  });
}

function seedRestaurantAlias(restaurantId: string, alias: string): void {
  mockFakeDb.restaurantAliases.push({
    restaurant_id: restaurantId,
    alias,
    alias_lower: alias.toLowerCase(),
  });
}

function seedMenuItemAlias(menuItemId: string, alias: string): void {
  mockFakeDb.menuItemAliases.push({
    menu_item_id: menuItemId,
    alias,
    alias_lower: alias.toLowerCase(),
  });
}

beforeEach(() => {
  mockFakeDb.restaurants = [];
  mockFakeDb.menuItems = [];
  mockFakeDb.restaurantAliases = [];
  mockFakeDb.menuItemAliases = [];
});

describe('restaurantsRepository (v34 + v35 mirror reads)', () => {
  it('readAllRestaurants returns rows sorted by name', async () => {
    seedRestaurant('r1', 'マクドナルド');
    seedRestaurant('r2', 'モスバーガー');
    seedRestaurant('r3', 'KFC');

    const rows = await readAllRestaurants();
    expect(rows.map((r) => r.id)).toEqual(['r3', 'r1', 'r2']);
    expect(rows[0].restaurantType).toBe('dining');
    expect(rows[0].attribution).toBe('公式サイトより');
  });

  it('readRestaurantsByType filters by restaurant_type', async () => {
    seedRestaurant('r1', 'マクド', 'dining');
    seedRestaurant('r2', 'セブン', 'convenience');
    seedRestaurant('r3', 'スタバ', 'cafe_bakery');

    const dining = await readRestaurantsByType('dining');
    expect(dining.map((r) => r.id)).toEqual(['r1']);

    const conv = await readRestaurantsByType('convenience');
    expect(conv.map((r) => r.id)).toEqual(['r2']);
  });

  it('readRestaurantById returns null for unknown id', async () => {
    seedRestaurant('r1', 'マクド');
    expect((await readRestaurantById('r1'))?.name).toBe('マクド');
    expect(await readRestaurantById('missing')).toBeNull();
  });

  it('readMenuItemsForRestaurant orders by use_count desc', async () => {
    seedRestaurant('r1', 'マクド');
    seedMenuItem('m1', 'r1', 'チキンナゲット', { useCount: 5 });
    seedMenuItem('m2', 'r1', 'ビッグマック', { useCount: 50 });
    seedMenuItem('m3', 'r1', 'ポテト', { useCount: 30 });

    const items = await readMenuItemsForRestaurant('r1');
    expect(items.map((m) => m.id)).toEqual(['m2', 'm3', 'm1']);
    expect(items[0].caloriesPerServing).toBe(500);
  });

  it('readMenuItemById returns null for unknown id', async () => {
    seedMenuItem('m1', 'r1', 'ビッグマック');
    expect((await readMenuItemById('m1'))?.name).toBe('ビッグマック');
    expect(await readMenuItemById('missing')).toBeNull();
  });

  it('searchMenuItems empty query returns []', async () => {
    seedRestaurant('r1', 'マクド');
    seedMenuItem('m1', 'r1', 'ビッグマック');
    expect(await searchMenuItems('')).toEqual([]);
    expect(await searchMenuItems('   ')).toEqual([]);
  });

  it('searchMenuItems matches on chain alias (Codex Important #3 side-table pattern)', async () => {
    seedRestaurant('r1', 'マクドナルド');
    seedMenuItem('m1', 'r1', 'ビッグマック');
    seedRestaurantAlias('r1', 'マクド');
    // Query "マクド" should hit via the alias even though the
    // restaurant's canonical name is "マクドナルド".
    const results = await searchMenuItems('マクド');
    expect(results.map((m) => m.id)).toEqual(['m1']);
  });

  it('searchMenuItems matches on menu item alias', async () => {
    seedRestaurant('r1', 'マクドナルド');
    seedMenuItem('m1', 'r1', 'ビッグマック');
    seedMenuItemAlias('m1', 'BigMac');
    const results = await searchMenuItems('BigMac');
    expect(results.map((m) => m.id)).toEqual(['m1']);
  });

  it('findMenuItemByBarcode returns the matching コンビニ PB item', async () => {
    seedRestaurant('r1', 'セブンイレブン', 'convenience');
    seedMenuItem('m1', 'r1', 'おにぎり 鮭', { barcode: '4901234567890' });
    seedMenuItem('m2', 'r1', 'おにぎり 梅', { barcode: '4901234567891' });

    const hit = await findMenuItemByBarcode('4901234567890');
    expect(hit?.id).toBe('m1');

    const miss = await findMenuItemByBarcode('0000000000000');
    expect(miss).toBeNull();
  });
});
