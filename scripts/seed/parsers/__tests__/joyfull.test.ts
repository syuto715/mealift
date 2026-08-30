// S5b — joyfull parser unit tests (fixture は 2026-08-25 版 cal.pdf の実行構造)。

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseJoyfull } from '../joyfull';

const FIXTURE = `
2026年8月25日
●栄養成分についてはエネルギー、たんぱく質、脂質、炭水化物、食塩相当量を掲載しております。
(kcal) (g) (g) (g) (g)
キッズ
Ｊｏｙチーズインハンバーグセット 852 29.8 38.3 91.0 2.6 ● ● ● ● ● ●
キッズアイス（チョコ） 87 1.7 4.6 9.3 0.1 ● ●

-- 1 of 11 --

単品・セットメニュー
目玉焼き（単品） 80 6.9 5.7 0.2 0.2 ●
彩り野菜と若鶏の黒酢あんかけ（単品） 747 21.9 53.4 44.5 4.0 ● ● ● ● ● ●
グリル
目玉焼き（単品） 80 6.9 5.7 0.2 0.2 ●
テイクアウト（サラダ・アペタイザー・単品）
ポテトフライ 446 4.3 26.5 47.7 0.8 ●
テイクアウト（定食）
彩り野菜と若鶏の黒酢あんかけ（単品） 718 22.5 50.8 43.0 3.5 ● ● ● ●
`;

function writeFixture(content: string): string {
  const p = path.join(os.tmpdir(), `joyfull-test-${process.pid}.txt`);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

const OPTS = {
  sourceUrl: 'https://www.joyfull.co.jp/cal_pdf/cal.pdf',
  sourceCapturedAt: '2026-08-30',
};

describe('parseJoyfull', () => {
  it('extracts 品名 + 5 値 rows in (kcal, P, F, C, salt) order, ignoring ● and headers', () => {
    const { output } = parseJoyfull({ rawTextPath: writeFixture(FIXTURE), ...OPTS });
    const joy = output.menuItems.find((m) => m.name === 'Ｊｏｙチーズインハンバーグセット');
    expect(joy).toBeDefined();
    expect(joy!.caloriesPerServing).toBe(852);
    expect(joy!.proteinG).toBe(29.8);
    expect(joy!.fatG).toBe(38.3);
    expect(joy!.carbG).toBe(91.0);
    expect(joy!.saltG).toBe(2.6);
    expect(joy!.source).toBe('official_disclosure');
    // 見出し・注記・ページマーカーは item にならない
    expect(output.menuItems.some((m) => /キッズ$|単品・セットメニュー|of 11/.test(m.name))).toBe(false);
  });

  it('gives 全角英数 names an NFKC alias for search', () => {
    const { output } = parseJoyfull({ rawTextPath: writeFixture(FIXTURE), ...OPTS });
    const joy = output.menuItems.find((m) => m.name === 'Ｊｏｙチーズインハンバーグセット');
    expect(joy!.aliases).toEqual(['Joyチーズインハンバーグセット']);
    const kids = output.menuItems.find((m) => m.name === 'キッズアイス（チョコ）');
    expect(kids!.aliases).toBeUndefined();
  });

  it('dedupes identical re-listings and suffixes takeaway variants that differ', () => {
    const { output, dedupedCount } = parseJoyfull({ rawTextPath: writeFixture(FIXTURE), ...OPTS });
    // 目玉焼き（単品） は店内 2 セクション同値再掲 → 1 件に dedupe
    expect(output.menuItems.filter((m) => m.name.startsWith('目玉焼き')).length).toBe(1);
    expect(dedupedCount).toBe(1);
    // 彩り野菜… はテイクアウト版が異値 → suffix 付きで別 item
    const kurozu = output.menuItems.filter((m) => m.name.startsWith('彩り野菜と若鶏の黒酢あんかけ'));
    expect(kurozu.map((m) => m.name).sort()).toEqual([
      '彩り野菜と若鶏の黒酢あんかけ（単品）',
      '彩り野菜と若鶏の黒酢あんかけ（単品）（テイクアウト）',
    ]);
    expect(kurozu.find((m) => m.name.endsWith('（テイクアウト）'))!.caloriesPerServing).toBe(718);
    // テイクアウト専用 item (店内と非衝突) は suffix なし
    expect(output.menuItems.some((m) => m.name === 'ポテトフライ')).toBe(true);
  });

  it('throws on same-name different-values within the same mode', () => {
    const broken = `
(kcal) (g) (g) (g) (g)
目玉焼き（単品） 80 6.9 5.7 0.2 0.2 ●
目玉焼き（単品） 95 6.9 5.7 0.2 0.2 ●
`;
    expect(() => parseJoyfull({ rawTextPath: writeFixture(broken), ...OPTS })).toThrow(/duplicate name/);
  });

  it('flags Atwater outliers as suspects without dropping them', () => {
    const outlier = `
(kcal) (g) (g) (g) (g)
検証用アイテム 900 5.0 5.0 5.0 0.5 ●
`;
    const { output, suspects } = parseJoyfull({ rawTextPath: writeFixture(outlier), ...OPTS });
    expect(output.menuItems).toHaveLength(1);
    expect(suspects.length).toBe(1);
    expect(suspects[0]).toContain('検証用アイテム');
  });
});
