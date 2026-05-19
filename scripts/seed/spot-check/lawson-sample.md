# ローソン 抜粋 sample (9/57 items)

- Source URL: https://www.lawson.co.jp/recommend/allergy/detail/index.html
- Captured at: 2026-05-19
- Seed: `lawson` (deterministic — re-run yields the same sample)
- **Partial scrape**: 1 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | Uchi Caf&eacute;×森半　抹茶ミルクロールケーキ | P3.8 F15.1 C13.7 | 205 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |
| 2 | コールスローサラダ | P2.6 F11.1 C12.4 | 154 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |
| 3 | バスチー　−バスク風チーズケーキ− | P4.5 F15.4 C19.6 | 235 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |
| 4 | プレミアムおにぎり　いくら醤油漬 | P5.0 F1.7 C40.2 | 193 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |
| 5 | プレミアムおにぎり　鮭明太 | P5.4 F1.3 C40.6 | 193 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |
| 6 | ミックスサンド | P10.9 F16.8 C29.5 | 310 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |
| 7 | 混ぜて食べる　海鮮ばくだん　まぐろ | P5.3 F0.4 C4.8 | 41 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |
| 8 | 大きなおにぎり　シーチキン&reg;マヨネーズ | P6.8 F11.2 C60.5 | 366 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |
| 9 | 味噌バターコーンラーメン | P27.1 F25.0 C64.2 | 574 | https://www.lawson.co.jp/recommend/allergy/detail/index.html | [ ] |

## Dropped items (1)

Rows the scraper extracted but parse / validation failed to
promote to a final record. Syuto: decide whether to re-scrape
(parser fix), hand-enter as `source: manual`, or defer to a
future seed refresh.

- おかズドン！トリプルメンチカツ弁当 [PFC inconsistent: calories=157 vs Atwater=1172.6 (deviation 646.9%)]

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
