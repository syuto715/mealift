# デイリーヤマザキ 抜粋 sample (5/10 items)

- Source URL: https://www.daily-yamazaki.jp/dh/
- Captured at: 2026-05-18
- Seed: `daily_yamazaki` (deterministic — re-run yields the same sample)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | あんパン | P6.0 F6.0 C52.0 | 285 | https://www.daily-yamazaki.jp/dh/ | [ ] |
| 2 | おにぎり (鮭) | P4.0 F0.8 C37.0 | 175 | https://www.daily-yamazaki.jp/dh/ | [ ] |
| 3 | コーヒー (ホット M) | P0.3 F0.0 C1.5 | 8 | https://www.daily-yamazaki.jp/dh/ | [ ] |
| 4 | ランチパック (ツナマヨネーズ) | P10.0 F16.0 C33.0 | 320 | https://www.daily-yamazaki.jp/dh/ | [ ] |
| 5 | ランチパック (ピーナッツ) | P8.5 F17.0 C45.0 | 370 | https://www.daily-yamazaki.jp/dh/ | [ ] |

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
