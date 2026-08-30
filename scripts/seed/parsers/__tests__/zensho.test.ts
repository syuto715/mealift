// Zensho 共通 PDF parser unit tests.

import {
  extractSizeRows,
  groupSizeRows,
  applyMenuNames,
  parseZenshoPdf,
} from '../zensho';
import { NAKAU_SIZE_LABELS } from '../nakau';

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

  // S5b — なか卯 2026-08-19 版 PDF の label 体系拡張。
  describe('NAKAU_SIZE_LABELS (S5b chain-specific labels)', () => {
    // 実 PDF (2026-08-19) の実測値による fixture:
    //   card 1 = 丼 (小盛/並盛/大盛)、 card 2 = W 系、 card 3 = 丼、
    //   card 4 = 麺 (単独漢字)、 card 5 = 特盛+豪快盛付き丼。
    const NAKAU_FIXTURE = `
(kcal) (g) (g) (g) (g)
小盛 884 26.1 41.2 100.9 6.0
並盛 1022 28.5 41.6 132.1 6.0
大盛 1143 30.5 42.1 159.5 6.0
W 小盛 1325 41.3 71.9 123.8 9.0
W 並盛 1464 43.6 72.3 155.4 9.0
W 大盛 1584 45.6 72.8 182.5 9.0
小盛 412 15.6 8.5 68.1 3.5
並盛 532 18.0 9.0 99.4 3.5
大盛 672 20.0 9.4 126.8 3.5
小 349 10.2 3.9 65.5 3.1
並 425 12.5 4.3 82.3 3.8
大 574 16.2 5.3 111.6 4.9
特 723 19.9 6.3 140.9 6.0
並盛 709 24.5 21.2 105.0 2.1
大盛 830 26.5 21.7 132.3 2.1
特盛 1071 42.0 39.6 136.9 3.0
豪快盛 1313 57.4 57.5 141.5 3.9
更新日 2026年8月19日
`;

    it('captures 単独漢字 / W 〜 / 豪快盛 labels with the extended list', () => {
      const rows = extractSizeRows(NAKAU_FIXTURE, NAKAU_SIZE_LABELS);
      expect(rows.length).toBe(17);
      const wRow = rows.find((r) => r.size === 'W小盛');
      expect(wRow).toEqual({
        size: 'W小盛', calories: 1325, protein: 41.3, fat: 71.9, carb: 123.8, salt: 9.0,
      });
      const plain = rows.find((r) => r.size === '並' && r.calories === 425);
      expect(plain).toBeDefined();
      expect(plain!.protein).toBe(12.5);
    });

    it('does not let 単独漢字 label shadow 〜盛 label (alternation length order)', () => {
      const rows = extractSizeRows('小盛 412 15.6 8.5 68.1 3.5', NAKAU_SIZE_LABELS);
      expect(rows.length).toBe(1);
      expect(rows[0].size).toBe('小盛');
    });

    it('splits groups on family change (W card does not swallow the next base card)', () => {
      const rows = extractSizeRows(NAKAU_FIXTURE, NAKAU_SIZE_LABELS);
      const groups = groupSizeRows(rows, NAKAU_SIZE_LABELS);
      expect(groups.map((g) => g.length)).toEqual([3, 3, 3, 4, 4]);
      expect(groups[1][0].size).toBe('W小盛');
      // W card の直後の base card が別 group になっている
      expect(groups[2][0].size).toBe('小盛');
      expect(groups[2][0].calories).toBe(412);
      // 麺類の単独漢字 card
      expect(groups[3].map((r) => r.size)).toEqual(['小', '並', '大', '特']);
      // 豪快盛 は直前の 特盛 card に merge (昇順 + 同 family)
      expect(groups[4].map((r) => r.size)).toEqual(['並盛', '大盛', '特盛', '豪快盛']);
    });

    it('keeps sukiya extraction identical with DEFAULT labels (no regression)', () => {
      const defaultRows = extractSizeRows(SUKIYA_FIRST_2_GROUPS);
      const groups = groupSizeRows(defaultRows);
      expect(defaultRows.length).toBe(13);
      expect(groups.length).toBe(2);
      // 単独漢字 / W 行は default labels では無視される
      const mixed = `${SUKIYA_FIRST_2_GROUPS}\n小 349 10.2 3.9 65.5 3.1\nW 小盛 1325 41.3 71.9 123.8 9.0`;
      expect(extractSizeRows(mixed).length).toBe(13);
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
