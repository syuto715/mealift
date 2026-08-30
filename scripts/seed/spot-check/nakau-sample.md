# なか卯 抜粋 sample (20/248 items)

- Source URL: https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf
- Captured at: 2026-08-30
- Seed: `nakau-s5b` (deterministic — re-run yields the same sample)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | うなぎあいがけ親子丼 特盛 | P66.3 F54.7 C152.5 | 1373 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 2 | うなぎあいがけ親子丼 並盛 | P48.8 F36.4 C120.5 | 1011 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 3 | うな重 豪快盛 | P57.4 F57.5 C141.5 | 1313 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 4 | かつお節オクラすだちおろしうどん 並 | P11.2 F1.6 C69.3 | 330 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 5 | かつお節オクラ梅おろしそば 大 | P18.1 F2.4 C100.5 | 493 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 6 | ざるうどん 並 | P7.2 F0.8 C50.8 | 248 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 7 | すだちおろしうどん 並 | P9.5 F1.5 C65.9 | 312 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 8 | すだちおろしそば 並 | P11.4 F1.6 C64.8 | 318 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 9 | とろたま親子丼 並盛 | P36.7 F22.1 C99.8 | 754 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 10 | ねぎラー鶏から丼 小盛 | P26.5 F44.1 C99.2 | 907 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 11 | 牛あいがけカツ丼 大盛 | P40.3 F51.8 C164.3 | 1305 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 12 | 金胡麻だれざるうどん 並 | P8.9 F6.7 C54.1 | 321 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 13 | 銀鮭朝食 並盛 | P22.9 F12.2 C99.8 | 578 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 14 | 月見うどん 小 | P10.6 F8.8 C30.9 | 250 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 15 | 親子丼 小盛 | P27.1 F16.0 C64.7 | 517 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 16 | 目玉焼き朝食 大盛 | P19.5 F10.4 C125.7 | 674 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 17 | 目玉焼き朝食 並盛 | P17.5 F10.0 C98.3 | 535 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 18 | 和風カツカレー 2倍盛 | P37.4 F55.6 C237.8 | 1610 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 19 | 和風カツカレー 並盛 | P25.6 F43.1 C130.4 | 1003 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |
| 20 | 和風牛あいがけカレー 大盛 | P20.2 F24.7 C144.9 | 889 | https://images.zensho.co.jp/materials/nakau/allergen/nutrition.pdf | [ ] |

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).

## S5b 照合結果 (2026-08-30, Claude 実施)

- 原本: nutrition.pdf (更新日 2026-08-19, 9p)
- 方法: pdfjs-dist + @napi-rs/canvas で該当ページを PNG レンダリングし、
  視覚テーブルの kcal/P/F/C/食塩の 5 値を目視照合 (`scripts/seed/render-pdf.mjs`)。
- 結果: **20/20 一致、転記ミス 0 件** (小数点・列ズレ・サイズ取り違えなし)。
- 原本参照位置 (メニュー → PDF ページ):
  - うなぎあいがけ親子丼: p3
  - うな重: p3
  - かつお節オクラすだちおろしうどん: p4
  - かつお節オクラ梅おろしそば: p6
  - ざるうどん: p4
  - すだちおろしうどん: p4
  - すだちおろしそば: p6
  - とろたま親子丼: p1
  - ねぎラー鶏から丼: p3
  - 和風カツカレー: p3
  - 和風牛あいがけカレー: p3
  - 月見うどん: p5
  - 牛あいがけカツ丼: p2
  - 目玉焼き朝食: p7
  - 親子丼: p1
  - 金胡麻だれざるうどん: p4
  - 銀鮭朝食: p7
