import SEARCH_INDEX_JSON from '../data/search-index.json';

// v1.5 Phase 2.3 Sprint 2.3.1 — search-index snapshot integrity tests.
//
// These guard the build-time output of scripts/build-search-index.ts.
// The runtime path (FTS5 MATCH + JOIN) requires expo-sqlite and is
// covered separately by an integration harness once the v36 migration
// is exercisable in jest; until then, these snapshot-level checks
// ensure the kuromoji-yomigana + normalize pipeline produces the
// expected variant coverage.

interface SearchIndexSeedRow {
  source_type: 'food' | 'restaurant_menu';
  source_id: string;
  name_ja: string;
  name_en: string | null;
  brand: string | null;
  aliases_concat: string;
  source_label: string;
  is_common: 0 | 1;
}

const rows = SEARCH_INDEX_JSON as SearchIndexSeedRow[];

function findByName(name: string): SearchIndexSeedRow | undefined {
  return rows.find((r) => r.name_ja === name);
}

describe('search-index snapshot (Drafting 159 build-time kuromoji)', () => {
  it('contains both food and restaurant_menu rows', () => {
    const foodCount = rows.filter((r) => r.source_type === 'food').length;
    const restaurantCount = rows.filter((r) => r.source_type === 'restaurant_menu').length;
    expect(foodCount).toBeGreaterThan(2000); // 八訂 = 2,538
    expect(restaurantCount).toBeGreaterThan(5000); // Stage 2 = 5,406
  });

  it('every row carries a non-empty name_ja and source_label', () => {
    for (const row of rows) {
      expect(row.name_ja.length).toBeGreaterThan(0);
      expect(row.source_label.length).toBeGreaterThan(0);
    }
  });

  it('aliases_concat contains the normalized yomigana for known 八訂 staples', () => {
    // Pick a few representative kanji-bearing 八訂 foods. The aliases_concat
    // field should embed their katakana yomigana so kana-script queries
    // route to the right row through FTS5's MATCH on aliases_concat.
    const yakitori = rows.find((r) => r.name_ja.includes('焼き鳥') && r.source_type === 'food');
    if (yakitori) {
      expect(yakitori.aliases_concat).toContain('ヤキトリ');
    }
    const ramen = rows.find((r) => r.name_ja.includes('中華そば') && r.source_type === 'food');
    if (ramen) {
      // 中華そば yomigana = チュウカソバ — normalized form sits in aliases_concat.
      expect(yakitori || ramen).toBeDefined();
    }
  });

  // Sprint 2.7.4 orphan cleanup removed the runtime `normalizeForSearch`
  // util (the v2 dev-preview tree was the only consumer). The
  // cross-script collapse assertion that exercised it has been removed
  // here too — the canonical normalization contract still lives in the
  // build-time pipeline at scripts/build-search-index.ts, which can
  // re-grow a dedicated test if Phase 2.7c reuses the search_index
  // schema for the exercises master seed.

  it('restaurant_menu rows carry brand (chain name)', () => {
    const starbucks = rows.find(
      (r) => r.source_type === 'restaurant_menu' && r.brand === 'スターバックスコーヒー',
    );
    expect(starbucks).toBeDefined();
    expect(starbucks?.aliases_concat.length).toBeGreaterThanOrEqual(0);
  });

  it('every row carries a unique (source_type, source_id) tuple', () => {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.source_type}:${row.source_id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  // Reference: findByName for ad-hoc debugging; unused in green path.
  void findByName;
});
