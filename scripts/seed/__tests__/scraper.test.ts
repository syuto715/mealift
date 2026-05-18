// v1.5 Stage 2 Phase 2.2a — restaurant-menu-scraper tests.
//
// Coverage:
//   - detectContentKind (HTML / JSON / PDF / unknown discriminator)
//   - parseJsonContent (top-level array / `{items: [...]}` /
//     numeric + string number tolerance)
//   - parseHtmlContent (header column mapping for ja + en
//     synonyms)
//   - validateMenuItem (PFC bands + Atwater consistency tolerance)
//   - scrapeRestaurantMenu (fetcher injection; failure paths)

import {
  detectContentKind,
  parseJsonContent,
  parseHtmlContent,
  validateMenuItem,
  scrapeRestaurantMenu,
  isRestaurantType,
} from '../restaurant-menu-scraper';
import type {
  RestaurantScrapeInput,
  MenuItemRecord,
} from '../types';

const INPUT: RestaurantScrapeInput = {
  chainSlug: 'mcdonalds',
  chainName: 'マクドナルド',
  restaurantType: 'dining',
  category: 'FF',
  url: 'https://example.test/nutrition',
  aliases: ['マクド', 'マック', 'McD'],
};

const CAPTURED_AT = '2026-05-19';

describe('detectContentKind', () => {
  it('identifies HTML by DOCTYPE / html prefix', () => {
    expect(detectContentKind('<!DOCTYPE html><html>...')).toBe('html');
    expect(detectContentKind('<html><body>...</body></html>')).toBe('html');
  });

  it('identifies JSON by leading object / array AND parse success', () => {
    expect(detectContentKind('{"items":[]}')).toBe('json');
    expect(detectContentKind('[1,2,3]')).toBe('json');
  });

  it('returns unknown for malformed JSON-shaped content', () => {
    expect(detectContentKind('{not really json')).toBe('unknown');
  });

  it('identifies PDF by %PDF magic bytes', () => {
    expect(detectContentKind('%PDF-1.7\n...')).toBe('pdf');
  });

  it('returns unknown for empty / plain text', () => {
    expect(detectContentKind('')).toBe('unknown');
    expect(detectContentKind('just some text')).toBe('unknown');
  });
});

describe('parseJsonContent', () => {
  it('parses a top-level array of menu items', () => {
    const json = JSON.stringify([
      { name: 'ビッグマック', calories: 525, protein: 25, fat: 26, carbs: 39 },
      { name: 'ポテトM', calories: 410, protein: 5, fat: 21, carbs: 51 },
    ]);
    const result = parseJsonContent(json, INPUT, CAPTURED_AT);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('ビッグマック');
    expect(result.items[0].caloriesPerServing).toBe(525);
    expect(result.items[0].source).toBe('official_disclosure');
    expect(result.items[0].sourceUrl).toBe(INPUT.url);
  });

  it('parses { items: [...] } shape too', () => {
    const json = JSON.stringify({
      items: [{ menuName: 'チキンナゲット 5pc', kcal: 270, protein: 14, fat: 17, carb: 17 }],
    });
    const result = parseJsonContent(json, INPUT, CAPTURED_AT);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('チキンナゲット 5pc');
  });

  it('accepts numeric values as strings (chain pages often render "525")', () => {
    const json = JSON.stringify([
      { name: 'ビッグマック', calories: '525', protein: '25.0', fat: '26', carbs: '39' },
    ]);
    const result = parseJsonContent(json, INPUT, CAPTURED_AT);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].caloriesPerServing).toBe(525);
    expect(result.items[0].proteinG).toBe(25);
  });

  it('drops rows with missing PFC and lists them in failedNames', () => {
    const json = JSON.stringify([
      { name: 'ビッグマック', calories: 525, protein: 25, fat: 26, carbs: 39 },
      { name: '不明商品', calories: null },
    ]);
    const result = parseJsonContent(json, INPUT, CAPTURED_AT);
    expect(result.items).toHaveLength(1);
    expect(result.failedNames).toEqual(['不明商品']);
  });

  it('flips source to package_label when a barcode is present (convenience SKU pattern)', () => {
    const convInput: RestaurantScrapeInput = {
      ...INPUT,
      chainSlug: 'seven',
      chainName: 'セブンイレブン',
      restaurantType: 'convenience',
      category: 'コンビニ',
    };
    const json = JSON.stringify([
      {
        name: 'おにぎり 鮭',
        calories: 180, protein: 4, fat: 0.8, carbs: 38,
        barcode: '4901234567890',
      },
    ]);
    const result = parseJsonContent(json, convInput, CAPTURED_AT);
    expect(result.items[0].source).toBe('package_label');
    expect(result.items[0].barcode).toBe('4901234567890');
  });

  it('returns warning on invalid JSON without throwing', () => {
    const result = parseJsonContent('{not real json', INPUT, CAPTURED_AT);
    expect(result.items).toEqual([]);
    expect(result.warnings[0]).toMatch(/JSON parse failed/);
  });
});

describe('parseHtmlContent — JA header table dispatch', () => {
  const HTML = `
    <html><body>
      <table>
        <tr>
          <th>メニュー</th>
          <th>エネルギー</th>
          <th>たんぱく質</th>
          <th>脂質</th>
          <th>炭水化物</th>
        </tr>
        <tr>
          <td>ビッグマック</td>
          <td>525</td>
          <td>25</td>
          <td>26</td>
          <td>39</td>
        </tr>
        <tr>
          <td>ポテトM</td>
          <td>410</td>
          <td>5</td>
          <td>21</td>
          <td>51</td>
        </tr>
      </table>
    </body></html>
  `;

  it('extracts named menu rows by mapping JA column headers', () => {
    const result = parseHtmlContent(HTML, INPUT, CAPTURED_AT);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('ビッグマック');
    expect(result.items[0].caloriesPerServing).toBe(525);
    expect(result.items[0].proteinG).toBe(25);
    expect(result.items[1].name).toBe('ポテトM');
  });

  it('emits a warning when no <table> is present', () => {
    const result = parseHtmlContent('<html><body>no tables</body></html>', INPUT, CAPTURED_AT);
    expect(result.items).toEqual([]);
    expect(result.warnings[0]).toMatch(/no <table> found/);
  });

  it('drops rows with missing PFC into failedNames', () => {
    const partial = `
      <table>
        <tr><th>メニュー</th><th>エネルギー</th><th>たんぱく質</th><th>脂質</th><th>炭水化物</th></tr>
        <tr><td>ビッグマック</td><td>525</td><td>25</td><td>26</td><td>39</td></tr>
        <tr><td>謎商品</td><td></td><td></td><td></td><td></td></tr>
      </table>`;
    const result = parseHtmlContent(partial, INPUT, CAPTURED_AT);
    expect(result.items).toHaveLength(1);
    expect(result.failedNames).toContain('謎商品');
  });
});

describe('validateMenuItem — PFC bands + Atwater', () => {
  function buildItem(overrides: Partial<MenuItemRecord> = {}): MenuItemRecord {
    return {
      name: 'test',
      servingSizeG: 100,
      servingUnit: 'g',
      caloriesPerServing: 525,
      proteinG: 25,
      fatG: 26,
      carbG: 39,
      source: 'official_disclosure',
      sourceUrl: 'https://x.test',
      sourceCapturedAt: CAPTURED_AT,
      ...overrides,
    };
  }

  it('accepts a clean PFC row (deviation < 15%)', () => {
    expect(validateMenuItem(buildItem())).toEqual([]);
  });

  it('flags an out-of-band calorie value (>= 3000)', () => {
    const issues = validateMenuItem(buildItem({ caloriesPerServing: 3000 }));
    expect(issues.some((i) => /calories=3000/.test(i))).toBe(true);
  });

  it('flags PFC inconsistency > 15% deviation', () => {
    // Atwater: 25*4 + 39*4 + 26*9 = 100 + 156 + 234 = 490; flagging
    // calories = 700 against that = 30% deviation, well over the
    // 15% tolerance.
    const issues = validateMenuItem(buildItem({ caloriesPerServing: 700 }));
    expect(issues.some((i) => /PFC inconsistent/.test(i))).toBe(true);
  });

  it('flags negative values', () => {
    const issues = validateMenuItem(buildItem({ proteinG: -1 }));
    expect(issues.some((i) => /protein=-1/.test(i))).toBe(true);
  });
});

describe('scrapeRestaurantMenu — orchestration', () => {
  function makeFetcher(content: string, statusCode = 200) {
    return async () => ({ content, statusCode });
  }

  it('returns kind=success with menuItems when parse + validate land', async () => {
    const json = JSON.stringify([
      { name: 'ビッグマック', calories: 525, protein: 25, fat: 26, carbs: 39 },
    ]);
    const result = await scrapeRestaurantMenu(INPUT, {
      fetcher: makeFetcher(json),
      capturedAt: CAPTURED_AT,
    });
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.output.menuItems).toHaveLength(1);
      expect(result.output.chainSlug).toBe('mcdonalds');
      expect(result.output.aliases).toEqual(['マクド', 'マック', 'McD']);
    }
  });

  it('returns kind=failure with errorKind=fetch_failed on HTTP 500', async () => {
    const result = await scrapeRestaurantMenu(INPUT, {
      fetcher: makeFetcher('server error', 500),
      capturedAt: CAPTURED_AT,
    });
    expect(result.kind).toBe('failure');
    if (result.kind === 'failure') {
      expect(result.failure.errorKind).toBe('fetch_failed');
    }
  });

  it('returns kind=failure with errorKind=fetch_failed on fetcher exception', async () => {
    const result = await scrapeRestaurantMenu(INPUT, {
      fetcher: async () => { throw new Error('ECONNREFUSED'); },
      capturedAt: CAPTURED_AT,
    });
    expect(result.kind).toBe('failure');
    if (result.kind === 'failure') {
      expect(result.failure.errorKind).toBe('fetch_failed');
      expect(result.failure.message).toMatch(/ECONNREFUSED/);
    }
  });

  it('returns kind=failure with errorKind=content_type_unknown on PDF', async () => {
    const result = await scrapeRestaurantMenu(INPUT, {
      fetcher: makeFetcher('%PDF-1.7\nbinary'),
      capturedAt: CAPTURED_AT,
    });
    expect(result.kind).toBe('failure');
    if (result.kind === 'failure') {
      expect(result.failure.errorKind).toBe('content_type_unknown');
      expect(result.failure.manualEntryRequired).toBe(true);
    }
  });

  it('partial success: kind=success with partial=true + droppedItems lists failed rows (Codex round 1 Important fix)', async () => {
    // 3 rows: 2 valid + 1 with implausible PFC (Atwater deviation
    // > 15%). Validation drops the third row but the first two
    // survive, so kind=success with partial=true.
    const json = JSON.stringify([
      { name: 'OK_1', calories: 525, protein: 25, fat: 26, carbs: 39 },
      { name: 'OK_2', calories: 410, protein: 5, fat: 21, carbs: 51 },
      // Calories far above Atwater: 50*4 + 50*4 + 50*9 = 850 vs 200 → 76% deviation
      { name: 'PFC_INCONSISTENT', calories: 200, protein: 50, fat: 50, carbs: 50 },
    ]);
    const result = await scrapeRestaurantMenu(INPUT, {
      fetcher: makeFetcher(json),
      capturedAt: CAPTURED_AT,
    });
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.output.menuItems).toHaveLength(2);
      expect(result.output.partial).toBe(true);
      expect(result.output.droppedItems).toBeDefined();
      expect(result.output.droppedItems!.length).toBeGreaterThan(0);
      // Dropped row's name must appear in droppedItems so the
      // Phase 2.2b iteration can render it into the spot-check md.
      expect(result.output.droppedItems!.some((d) => d.includes('PFC_INCONSISTENT'))).toBe(true);
    }
  });

  it('returns kind=failure with errorKind=parse_no_rows when 0 valid items parse', async () => {
    // Calories null → row dropped → validate yields 0 items.
    const json = JSON.stringify([{ name: 'X', calories: null }]);
    const result = await scrapeRestaurantMenu(INPUT, {
      fetcher: makeFetcher(json),
      capturedAt: CAPTURED_AT,
    });
    expect(result.kind).toBe('failure');
    if (result.kind === 'failure') {
      expect(result.failure.errorKind).toBe('parse_no_rows');
      expect(result.failure.manualEntryRequired).toBe(true);
    }
  });
});

describe('isRestaurantType type guard', () => {
  it('accepts all 4 DEC-7 enum values', () => {
    expect(isRestaurantType('dining')).toBe(true);
    expect(isRestaurantType('convenience')).toBe(true);
    expect(isRestaurantType('cafe_bakery')).toBe(true);
    expect(isRestaurantType('combo_meal')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isRestaurantType('restaurant')).toBe(false);
    expect(isRestaurantType('')).toBe(false);
  });
});
