// Zensho 共通 PDF parser unit tests.

import {
  extractSizeRows,
  groupSizeRows,
  applyMenuNames,
  parseZenshoPdf,
} from '../zensho';

const SUKIYA_FIRST_2_GROUPS = `
栄養成分について
● 検査機関で分析した数値および「日本食品標準成分表」に基づき算出しております。
(kcal) (g) (g) (g) (g)
ミニ 204 10.4 15.1 7.0 1.7
並盛 297 15.0 22.0 9.9 2.4
中盛 423 21.1 32.3 12.2 2.8
２倍盛 581 29.1 43.8 17.6 4.2
３倍盛 865 43.3 65.7 25.5 5.9
４倍盛 1232 61.3 93.9 35.3 8.1
５倍盛 1435 71.4 109.4 41.2 9.5
ミニ 464 14.8 16.0 65.7 1.7
並盛 695 21.7 23.4 99.8 2.4
中盛 752 26.6 33.4 86.5 2.8
大盛 908 28.4 30.7 130.1 3.1
特盛 1100 37.8 45.6 134.9 4.2
メガ 1365 50.8 66.3 141.6 5.6
更新日 2026年4月28日
`;

describe('Zensho parser', () => {
  describe('extractSizeRows', () => {
    it('captures full-width ２倍盛 etc.', () => {
      const rows = extractSizeRows(SUKIYA_FIRST_2_GROUPS);
      expect(rows.length).toBe(13);
      expect(rows[0]).toEqual({
        size: 'ミニ', calories: 204, protein: 10.4, fat: 15.1, carb: 7.0, salt: 1.7,
      });
      expect(rows[3].size).toBe('2倍盛'); // 全角 normalize
    });

    it('uses column order (kcal, P, F, C, S) — verified against 牛丼 並盛', () => {
      const rows = extractSizeRows(SUKIYA_FIRST_2_GROUPS);
      // 牛丼 並盛: 695 / 21.7 / 23.4 / 99.8 / 2.4
      const namimori = rows.find((r) => r.calories === 695);
      expect(namimori).toBeDefined();
      expect(namimori!.protein).toBe(21.7);
      expect(namimori!.fat).toBe(23.4);
      expect(namimori!.carb).toBe(99.8);
      expect(namimori!.salt).toBe(2.4);
    });

    it('ignores non-size lines (header / disclaimer / 更新日)', () => {
      const rows = extractSizeRows(SUKIYA_FIRST_2_GROUPS);
      expect(rows.every((r) => typeof r.calories === 'number')).toBe(true);
    });
  });

  describe('groupSizeRows', () => {
    it('splits at size-index reset (size index goes backward)', () => {
      const rows = extractSizeRows(SUKIYA_FIRST_2_GROUPS);
      const groups = groupSizeRows(rows);
      // Group 1: 7 rows (ミニ → 5倍盛, 牛皿)
      // Group 2: 6 rows (ミニ → メガ, 牛丼)
      expect(groups.length).toBe(2);
      expect(groups[0].length).toBe(7);
      expect(groups[1].length).toBe(6);
      // 牛皿 + 牛丼 boundary: ミニ→5倍盛 then ミニ resets index
      expect(groups[0][0].size).toBe('ミニ');
      expect(groups[0][6].size).toBe('5倍盛');
      expect(groups[1][0].size).toBe('ミニ');
      expect(groups[1][5].size).toBe('メガ');
    });
  });

  describe('applyMenuNames', () => {
    it('maps each group to a menu name in order, emits items per size', () => {
      const rows = extractSizeRows(SUKIYA_FIRST_2_GROUPS);
      const groups = groupSizeRows(rows);
      const { items, unmappedGroups } = applyMenuNames(groups, ['牛皿', '牛丼'], {
        sourceUrl: 'https://example.test/sukiya',
        sourceCapturedAt: '2026-05-18',
        restaurantCategory: '牛丼',
      });
      expect(items.length).toBe(13);
      expect(items[0].name).toBe('牛皿 ミニ');
      expect(items[6].name).toBe('牛皿 5倍盛');
      expect(items[7].name).toBe('牛丼 ミニ');
      expect(items[12].name).toBe('牛丼 メガ');
      expect(unmappedGroups).toBe(0);
      expect(items[0].source).toBe('official_disclosure');
      expect(items[0].sourceUrl).toBe('https://example.test/sukiya');
    });

    it('reports unmappedGroups when menuNames is shorter than groups', () => {
      const rows = extractSizeRows(SUKIYA_FIRST_2_GROUPS);
      const groups = groupSizeRows(rows);
      const { items, unmappedGroups } = applyMenuNames(groups, ['牛皿'], {
        sourceUrl: 'https://example.test',
        sourceCapturedAt: '2026-05-18',
      });
      expect(items.length).toBe(7); // 牛皿 only
      expect(unmappedGroups).toBe(1); // 牛丼 dropped
    });
  });

  describe('parseZenshoPdf (high-level)', () => {
    it('end-to-end: text + menu names → MenuItemRecord[]', () => {
      const result = parseZenshoPdf(
        SUKIYA_FIRST_2_GROUPS,
        ['牛皿', '牛丼'],
        {
          sourceUrl: 'https://example.test/sukiya',
          sourceCapturedAt: '2026-05-18',
        },
      );
      expect(result.totalGroups).toBe(2);
      expect(result.items.length).toBe(13);
      expect(result.unmappedGroups).toBe(0);
    });
  });
});
