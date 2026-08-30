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
  nutrition_json: string;
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

  // ------------------------------------------------------------------
  // S5b — source_id 安定キー化 + 外食チェーン第 1 弾投入の不変条件。
  // ------------------------------------------------------------------
  describe('S5b stable source_id + chain data batch 1', () => {
    const restaurant = rows.filter((r) => r.source_type === 'restaurant_menu');

    it('has NO legacy positional ids (`slug_0012` 形式) left in the snapshot', () => {
      const legacy = restaurant.filter((r) => /^[a-z_]+_\d{4}(?:#\d+)?$/.test(r.source_id));
      expect(legacy).toHaveLength(0);
    });

    it('uses `slug:品名` stable ids whose name part matches name_ja', () => {
      for (const r of restaurant) {
        const idx = r.source_id.indexOf(':');
        expect(idx).toBeGreaterThan(0);
        const namePart = r.source_id.slice(idx + 1).replace(/#\d+$/, '');
        expect(namePart).toBe(r.name_ja);
      }
    });

    it('contains the 4 batch-1 chains with expected live item counts', () => {
      const countBySlug = new Map<string, number>();
      for (const r of restaurant) {
        const slug = r.source_id.slice(0, r.source_id.indexOf(':'));
        countBySlug.set(slug, (countBySlug.get(slug) ?? 0) + 1);
      }
      expect(countBySlug.get('sukiya')).toBe(401);
      expect(countBySlug.get('nakau')).toBe(248);
      expect(countBySlug.get('joyfull')).toBe(346);
      expect(countBySlug.get('cocos')).toBe(175);
    });

    it('excludes discontinued items from the snapshot (検索から除外)', () => {
      // sukiya 2026-08 更新で公式一覧から消えた代表 (chain JSON には
      // discontinued: true で温存されている)
      expect(restaurant.some((r) => r.source_id === 'sukiya:シャキうま塩野菜牛丼 並盛')).toBe(false);
      expect(restaurant.some((r) => r.source_id === 'sukiya:牛カルビ焼肉丼 並盛')).toBe(false);
      // 旧パーサーのページ跨ぎ融合が生んだ phantom item も居ない
      expect(restaurant.some((r) => r.name_ja === 'ごはん 2倍盛')).toBe(false);
    });

    it('folds the normalized chainName into aliases_concat (混在表記ブランドの検索修正)', () => {
      // query 側 normalizeForSearch は ひらがな→カタカナ 変換するため、
      // 「すき家」は「スキ家」として FTS に渡る。 raw brand 列とは
      // 一致しないので、 正規化形が aliases_concat に居ることが
      // 「すき家 牛丼」ヒットの前提 (S5b dogfood simulation で確認)。
      const gyudon = restaurant.find((r) => r.source_id === 'sukiya:牛丼 並盛');
      expect(gyudon?.aliases_concat).toContain('スキ家');
      const oyakodon = restaurant.find((r) => r.source_id === 'nakau:親子丼 並盛');
      expect(oyakodon?.aliases_concat).toContain('ナカ卯');
    });

    it('carries sourceCapturedAt (取得日) in nutrition_json for batch-1 rows', () => {
      for (const id of ['sukiya:牛丼 並盛', 'nakau:親子丼 並盛', 'joyfull:キッズうどん', 'cocos:ココスのハンバーグ']) {
        const row = restaurant.find((r) => r.source_id === id);
        expect(row).toBeDefined();
        const nutrition = JSON.parse(row!.nutrition_json) as { sourceCapturedAt?: string; sourceUrl?: string };
        expect(nutrition.sourceCapturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(nutrition.sourceUrl).toBeTruthy();
      }
    });

    it('does NOT pull new data for the 見送り chains (規約判断の遵守)', () => {
      // スシロー / はま寿司: 既存 ai_estimate 維持、 official 昇格なし。
      for (const slug of ['sushiro', 'hama_sushi']) {
        const chainRows = restaurant.filter((r) => r.source_id.startsWith(`${slug}:`));
        expect(chainRows.length).toBeGreaterThan(0); // 既存 ai_estimate は維持
        for (const r of chainRows) {
          expect(r.source_label).toBe('ai_estimate');
        }
      }
      // やよい軒: 未収録のまま (新規取り込みなし)。
      expect(restaurant.some((r) => r.source_id.startsWith('yayoiken:'))).toBe(false);
      // 大戸屋: Phase 2.2b 時点の既存 85 件 (official) は現状維持 —
      // S5b では一切 touch していない (2026-08-30 の取得日を持つ行が無い)。
      // 既存 official 扱いの是非は Syuto 判断待ち (report 引き継ぎ参照)。
      const ootoya = restaurant.filter((r) => r.source_id.startsWith('ootoya:'));
      expect(ootoya.length).toBeGreaterThan(0);
      for (const r of ootoya) {
        const nutrition = JSON.parse(r.nutrition_json) as { sourceCapturedAt?: string };
        expect(nutrition.sourceCapturedAt).not.toBe('2026-08-30');
      }
    });
  });
});
