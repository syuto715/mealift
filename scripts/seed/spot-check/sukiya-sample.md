# すき家 抜粋 sample (20/401 items)

- Source URL: https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf
- Captured at: 2026-08-30
- Seed: `sukiya-s5b` (deterministic — re-run yields the same sample)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | うな牛 並盛 | P32.2 F34.3 C105.5 | 860 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 2 | うな皿 並盛 | P16.0 F17.3 C8.5 | 255 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 3 | おんたま牛ネバとろ丼 大盛 | P29.4 F23.0 C139.3 | 878 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 4 | キムチ牛カルビ焼肉丼 並盛 | P28.3 F39.0 C116.5 | 929 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 5 | シビ辛麻婆茄子牛丼 特盛 | P33.9 F49.0 C143.6 | 1146 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 6 | トリプルニンニク牛丼 特盛 | P43.1 F51.7 C156.8 | 1259 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 7 | とろ～りチーズカレー 並盛 | P24.0 F29.0 C118.3 | 829 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 8 | にんにく明太マヨチーズ牛カルビ焼肉丼 特盛 | P51.3 F83.7 C169.7 | 1635 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 9 | ねぎ玉牛カルビ焼肉丼 ごはん少なめ | P33.8 F45.3 C101.2 | 946 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 10 | ねぎ玉牛丼 並盛 | P28.9 F29.8 C102.7 | 793 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 11 | ほうれん草カレー 大盛 | P20.6 F23.5 C171.9 | 978 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 12 | 牛たまかけ朝食 ミニ | P21.1 F18.4 C71.2 | 532 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 13 | 牛たまかけ朝食 大盛 | P25.4 F19.3 C129.8 | 791 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 14 | 牛丼ライト ミニ | P18.5 F19.9 C14.7 | 311 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 15 | 高菜明太マヨ牛丼 ミニ | P16.4 F24.1 C70.0 | 564 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 16 | 高菜明太マヨ牛丼 メガ | P52.4 F74.4 C145.9 | 1465 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 17 | 山かけまぐろたたき丼 並盛 | P29.0 F9.6 C105.5 | 628 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 18 | 自社製ベーコンエッグ朝食 並盛 | P23.1 F22.9 C99.4 | 692 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 19 | 鉄火丼 特盛 | P50.8 F5.9 C124.0 | 760 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |
| 20 | 納豆まぜのっけ朝食 並盛 | P24.5 F13.3 C102.4 | 619 | https://images.zensho.co.jp/materials/sukiya/allergen/nutrition.pdf | [ ] |

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).

## S5b 照合結果 (2026-08-30, Claude 実施)

- 原本: nutrition.pdf (更新日 2026-08-18, 9p)
- 方法: pdfjs-dist + @napi-rs/canvas で該当ページを PNG レンダリングし、
  視覚テーブルの kcal/P/F/C/食塩の 5 値を目視照合 (`scripts/seed/render-pdf.mjs`)。
- 結果: **20/20 一致、転記ミス 0 件** (小数点・列ズレ・サイズ取り違えなし)。
- 原本参照位置 (メニュー → PDF ページ):
  - うな牛: p6
  - うな皿: p6
  - おんたま牛ネバとろ丼: p5
  - とろ～りチーズカレー: p3
  - にんにく明太マヨチーズ牛カルビ焼肉丼: p5
  - ねぎ玉牛カルビ焼肉丼: p5
  - ねぎ玉牛丼: p1
  - ほうれん草カレー: p3
  - キムチ牛カルビ焼肉丼: p5
  - シビ辛麻婆茄子牛丼: p5
  - トリプルニンニク牛丼: p2
  - 山かけまぐろたたき丼: p4
  - 牛たまかけ朝食: p7
  - 牛丼ライト: p2
  - 納豆まぜのっけ朝食: p6
  - 自社製ベーコンエッグ朝食: p7
  - 鉄火丼: p4
  - 高菜明太マヨ牛丼: p1
