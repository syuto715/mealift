// v1.5 Stage 2 Phase 2.2a — build-seed-migration tests.

import {
  buildSeedMigrationSql,
  buildRestaurantInsert,
  buildMenuItemInsert,
  buildCategoryInserts,
  restaurantIdForSlug,
  categoryIdForName,
  v5UuidFromSlug,
  sqlString,
  sqlTextArray,
  sqlNumber,
  sqlJsonb,
} from '../build-seed-migration';
import type { RestaurantScrapeOutput } from '../types';

function buildOutput(): RestaurantScrapeOutput {
  return {
    chainSlug: 'mcdonalds',
    chainName: 'マクドナルド',
    restaurantType: 'dining',
    category: 'FF',
    aliases: ['マクド', 'マック'],
    attribution: '公式サイトより',
    attributionUrl: 'https://example.test/nutrition',
    sourceCapturedAt: '2026-05-19',
    menuItems: [
      {
        name: 'ビッグマック',
        aliases: ['BigMac'],
        category: 'バーガー',
        servingSizeG: 215,
        servingUnit: '個',
        servingDescription: '1 個',
        caloriesPerServing: 525,
        proteinG: 25,
        fatG: 26,
        carbG: 39,
        sodiumMg: 1010,
        source: 'official_disclosure',
        sourceUrl: 'https://example.test/nutrition',
        sourceCapturedAt: '2026-05-19',
      },
    ],
  };
}

describe('sqlString / sqlTextArray / sqlNumber / sqlJsonb', () => {
  it('quotes strings and escapes embedded apostrophes', () => {
    expect(sqlString('plain')).toBe(`'plain'`);
    expect(sqlString("L'Espresso")).toBe(`'L''Espresso'`);
    expect(sqlString(null)).toBe('null');
    expect(sqlString(undefined)).toBe('null');
  });

  it('formats PG text[] literal with quoted elements', () => {
    expect(sqlTextArray([])).toBe(`'{}'`);
    expect(sqlTextArray(['マクド', 'McD'])).toBe(`'{"マクド","McD"}'`);
    // Escape double quotes via backslash (PG array literal rule).
    expect(sqlTextArray(['has"quote'])).toBe(`'{"has\\"quote"}'`);
  });

  it('doubles single quotes after PG array assembly (Codex round 1 Critical fix)', () => {
    // Earlier draft: `'{"McDonald's"}'` — the apostrophe inside
    // terminates the SQL string literal and breaks downstream SQL.
    // Fix: double `'` → `''` AFTER the array literal is built.
    expect(sqlTextArray(["McDonald's"])).toBe(`'{"McDonald''s"}'`);
    expect(sqlTextArray(["L'Espresso", "Joe's"])).toBe(
      `'{"L''Espresso","Joe''s"}'`,
    );
  });

  it('formats numbers with no scientific notation, null fallback', () => {
    expect(sqlNumber(525)).toBe('525');
    expect(sqlNumber(2.5)).toBe('2.50');
    expect(sqlNumber(null)).toBe('null');
    expect(sqlNumber(NaN)).toBe('null');
    expect(sqlNumber(Infinity)).toBe('null');
  });

  it('encodes jsonb cast or null', () => {
    expect(sqlJsonb(null)).toBe('null');
    expect(sqlJsonb({ a: 1 })).toBe(`'{"a":1}'::jsonb`);
  });
});

describe('Deterministic UUID derivation', () => {
  it('restaurantIdForSlug yields the same id for the same slug', () => {
    expect(restaurantIdForSlug('mcdonalds')).toBe(restaurantIdForSlug('mcdonalds'));
  });

  it('different slugs yield different ids', () => {
    expect(restaurantIdForSlug('mcdonalds')).not.toBe(restaurantIdForSlug('moss_burger'));
  });

  it('v5UuidFromSlug emits valid RFC 4122 v5 (version nibble = 5, variant = 10)', () => {
    const uuid = v5UuidFromSlug('8e3f4b2a-1c5d-4e7f-9a0b-2d8c3f6e1b4a', 'mcdonalds');
    // 5th group's first char should be 5 (version 5)
    expect(uuid[14]).toBe('5');
    // Variant: bits 10xx ⇒ 8 / 9 / a / b in the 17th char
    expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
  });

  it('categoryIdForName is stable for each category', () => {
    expect(categoryIdForName('FF')).toBe(categoryIdForName('FF'));
    expect(categoryIdForName('FF')).not.toBe(categoryIdForName('コンビニ'));
  });
});

describe('buildCategoryInserts', () => {
  it('emits 7 category INSERT statements in epic §5.1 fixed order', () => {
    const stmts = buildCategoryInserts();
    expect(stmts).toHaveLength(7);
    const joined = stmts.join('\n');
    // First (display_order = 0) is FF; last (display_order = 6) is コンビニ.
    expect(stmts[0]).toMatch(/VALUES[\s\S]*'FF',\s*0\s*\)/);
    expect(stmts[6]).toMatch(/VALUES[\s\S]*'コンビニ',\s*6\s*\)/);
    // Every insert uses ON CONFLICT DO UPDATE (idempotent re-apply).
    expect(joined.match(/ON CONFLICT/g)).toHaveLength(7);
  });
});

describe('buildRestaurantInsert', () => {
  it('inserts the chain row with aliases array + restaurant_type + chain category FK', () => {
    const sql = buildRestaurantInsert(buildOutput());
    expect(sql).toMatch(/INSERT INTO public\.restaurants/);
    expect(sql).toMatch(/'マクドナルド'/);
    expect(sql).toMatch(/'\{"マクド","マック"\}'/);
    expect(sql).toMatch(/'dining'/);
    // restaurant_type cast paired with category cast — both ::uuid.
    expect(sql.match(/::uuid/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Idempotent on re-apply (Stage 2 epic §4.1 step 3).
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    expect(sql).toMatch(/takedown_flag/);
  });
});

describe('buildMenuItemInsert', () => {
  it('inserts the menu item with PFC + serving + idempotent ON CONFLICT', () => {
    const sql = buildMenuItemInsert(buildOutput(), 0);
    expect(sql).toMatch(/INSERT INTO public\.restaurant_menu_items/);
    expect(sql).toMatch(/'ビッグマック'/);
    expect(sql).toMatch(/'official_disclosure'/);
    // ON CONFLICT key is (restaurant_id, name) — matches the Phase 2.1 DDL.
    expect(sql).toMatch(/ON CONFLICT \(restaurant_id, name\) DO UPDATE/);
    // Version bumps on re-apply (excluded.version isn't possible since we'd lose history; bump via existing + 1).
    expect(sql).toMatch(/version = public\.restaurant_menu_items\.version \+ 1/);
  });

  it('outputs null when optional micronutrients are unset (never fabricates)', () => {
    const sql = buildMenuItemInsert(buildOutput(), 0);
    // No fiber/sugar/salt/saturated_fat in the fixture → emit `null` literal.
    expect(sql).toMatch(/fiber_g[,)]?[\s\S]*\bnull\b/);
  });
});

describe('buildSeedMigrationSql', () => {
  it('emits BEGIN; … COMMIT; with chain + menu inserts', () => {
    const sql = buildSeedMigrationSql([buildOutput()]);
    expect(sql.startsWith('-- v1.5 Stage 2 Phase 2.2')).toBe(true);
    expect(sql).toMatch(/BEGIN;/);
    expect(sql).toMatch(/COMMIT;/);
    expect(sql).toMatch(/-- Chain count: 1/);
    expect(sql).toMatch(/-- Menu item count: 1/);
    // 1 restaurant + 1 menu_items + 7 categories = ≥ 9 INSERTs.
    expect(sql.match(/INSERT INTO public\.restaurant_chain_categories/g)?.length).toBe(7);
    expect(sql.match(/INSERT INTO public\.restaurants/g)?.length).toBe(1);
    expect(sql.match(/INSERT INTO public\.restaurant_menu_items/g)?.length).toBe(1);
  });

  it('embeds the canonical migration filename in the header', () => {
    const sql = buildSeedMigrationSql([buildOutput()]);
    expect(sql).toMatch(/20260520000003_restaurant_menu_seed\.sql/);
  });

  it('zero-chain input still produces a valid (empty-data) migration with categories', () => {
    const sql = buildSeedMigrationSql([]);
    expect(sql).toMatch(/BEGIN;/);
    expect(sql).toMatch(/COMMIT;/);
    expect(sql).toMatch(/-- Chain count: 0/);
    // Categories still land (the chain category list is fixed).
    expect(sql.match(/INSERT INTO public\.restaurant_chain_categories/g)?.length).toBe(7);
  });
});
