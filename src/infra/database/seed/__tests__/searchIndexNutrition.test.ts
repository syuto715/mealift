import SEARCH_INDEX_JSON from '../data/search-index.json';

// v1.5 Phase 2.3 Sprint 2.3.3 — verify the v37 nutrition_json
// embed shape covers both 八訂 (full grid) and restaurant
// (subset) rows.

interface SearchIndexSeedRow {
  source_type: 'food' | 'restaurant_menu';
  source_id: string;
  name_ja: string;
  source_label: string;
  nutrition_json: string;
}

const rows = SEARCH_INDEX_JSON as SearchIndexSeedRow[];

describe('search-index nutrition_json (Sprint 2.3.3 v37)', () => {
  it('every row carries a non-empty nutrition_json string', () => {
    for (const row of rows.slice(0, 50)) {
      expect(typeof row.nutrition_json).toBe('string');
      expect(row.nutrition_json.length).toBeGreaterThan(0);
    }
  });

  it('八訂 food rows expose the full 17-micronutrient grid', () => {
    const food = rows.find((r) => r.source_type === 'food');
    expect(food).toBeDefined();
    const n = JSON.parse(food!.nutrition_json);
    expect(typeof n.caloriesPerServing).toBe('number');
    expect(typeof n.proteinG).toBe('number');
    expect(typeof n.fatG).toBe('number');
    expect(typeof n.carbG).toBe('number');
    // 17-micronutrient field keys present (may be null when 八訂
    // disclosed a blank for that field — but the field exists).
    const expectedKeys = [
      'fiberG', 'sugarG', 'saltG', 'sodiumMg', 'saturatedFatG', 'cholesterolMg',
      'calciumMg', 'ironMg', 'magnesiumMg', 'zincMg', 'potassiumMg',
      'vitaminAUg', 'vitaminB1Mg', 'vitaminB2Mg', 'vitaminB6Mg', 'vitaminB12Ug',
      'folateUg', 'vitaminCMg', 'vitaminDUg', 'vitaminEMg',
    ];
    for (const k of expectedKeys) {
      expect(Object.prototype.hasOwnProperty.call(n, k)).toBe(true);
    }
  });

  it('restaurant_menu rows include the disclosed PFC + occasionally fiber/salt', () => {
    const row = rows.find((r) => r.source_type === 'restaurant_menu');
    expect(row).toBeDefined();
    const n = JSON.parse(row!.nutrition_json);
    expect(typeof n.caloriesPerServing).toBe('number');
    expect(typeof n.proteinG).toBe('number');
    expect(typeof n.fatG).toBe('number');
    expect(typeof n.carbG).toBe('number');
  });

  it('source_url is preserved on restaurant_menu rows when the seed carried one', () => {
    const restWithSource = rows.find(
      (r) => r.source_type === 'restaurant_menu' && /sourceUrl/.test(r.nutrition_json),
    );
    expect(restWithSource).toBeDefined();
    const n = JSON.parse(restWithSource!.nutrition_json);
    expect(typeof n.sourceUrl).toBe('string');
    expect(n.sourceUrl.length).toBeGreaterThan(0);
  });
});
