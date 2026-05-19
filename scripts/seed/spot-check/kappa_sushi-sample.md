# かっぱ寿司 抜粋 sample (11/72 items)

- Source URL: https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf
- Captured at: 2026-05-19
- Seed: `kappa_sushi` (deterministic — re-run yields the same sample)
- **Partial scrape**: 4 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | あんみつ | P2.5 F0.5 C41.0 | 184 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 2 | オレンジジュース | P0.8 F0.0 C28.5 | 116 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 3 | コーラ | P0.0 F0.0 C35.0 | 140 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 4 | サラダ軍艦 (2貫) | P5.0 F5.5 C10.0 | 112 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 5 | ソフトクリーム | P3.5 F6.5 C27.5 | 184 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 6 | ハマチ (2貫) | P9.0 F5.5 C8.5 | 110 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 7 | フライドポテト〜ケチャップ添え〜 | P3.5 F12.0 C38.0 | 280 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 8 | プレミアムホイッププリン | P4.0 F11.0 C26.0 | 220 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 9 | 海鮮サラダ | P9.0 F6.0 C10.0 | 130 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 10 | 玉子 (2貫) | P4.0 F2.5 C12.5 | 92 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |
| 11 | 炙りサーモン (2貫) | P6.5 F6.0 C8.5 | 110 | https://www.kappasushi.jp/master_data/pdf/info_allergen.pdf | [ ] |

## Dropped items (4)

Rows the scraper extracted but parse / validation failed to
promote to a final record. Syuto: decide whether to re-scrape
(parser fix), hand-enter as `source: manual`, or defer to a
future seed refresh.

- 特盛いくら軍艦 (1貫) [PFC inconsistent: calories=80 vs Atwater=67.5 (deviation 15.6%)]
- ホットコーヒー [PFC inconsistent: calories=8 vs Atwater=5.6 (deviation 30.0%)]
- アイスコーヒー [PFC inconsistent: calories=8 vs Atwater=5.6 (deviation 30.0%)]
- 緑茶 [PFC inconsistent: calories=2 vs Atwater=1.6 (deviation 20.0%)]

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
