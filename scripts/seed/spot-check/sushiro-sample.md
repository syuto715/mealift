# スシロー 抜粋 sample (12/77 items)

- Source URL: https://www.akindo-sushiro.co.jp/menu/allergy.html
- Captured at: 2026-05-19
- Seed: `sushiro` (deterministic — re-run yields the same sample)
- **Partial scrape**: 3 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | アカバナかんぱち (2貫) | P8.0 F3.5 C8.5 | 96 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 2 | あさり味噌汁 | P2.5 F0.5 C2.5 | 28 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 3 | あじ (2貫) | P8.0 F3.0 C8.5 | 92 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 4 | あじとサバの食べ比べ (1貫) | P4.0 F2.0 C4.5 | 52 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 5 | コーンポタージュ | P2.5 F3.5 C15.0 | 100 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 6 | プリン | P3.0 F6.0 C21.5 | 152 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 7 | 甘えび (2貫) | P6.0 F0.3 C7.5 | 56 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 8 | 枝豆 | P9.0 F4.0 C5.5 | 92 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 9 | 赤えび (1貫) | P3.5 F0.1 C4.0 | 32 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 10 | 大とろ (2貫) | P6.5 F11.5 C8.5 | 152 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 11 | 茶碗蒸し | P5.5 F2.5 C5.5 | 72 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |
| 12 | 炙り赤えび塩レモン (1貫) | P3.5 F0.8 C4.5 | 38 | https://www.akindo-sushiro.co.jp/menu/allergy.html | [ ] |

## Dropped items (3)

Rows the scraper extracted but parse / validation failed to
promote to a final record. Syuto: decide whether to re-scrape
(parser fix), hand-enter as `source: manual`, or defer to a
future seed refresh.

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
