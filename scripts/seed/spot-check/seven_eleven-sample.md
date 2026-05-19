# セブン-イレブン 抜粋 sample (12/80 items)

- Source URL: https://www.sej.co.jp/products/info_allergy.html
- Captured at: 2026-05-19
- Seed: `seven_eleven` (deterministic — re-run yields the same sample)
- **Partial scrape**: 3 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | アイスカフェラテ (M) | P4.0 F4.5 C6.5 | 80 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 2 | カフェラテ (ホット S) | P4.5 F5.5 C7.5 | 95 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 3 | サラダチキン (ハーブ) | P23.0 F1.5 C1.0 | 110 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 4 | セブンプレミアム ウーロン茶 (PET) | P0.0 F0.0 C0.0 | 0 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 5 | セブンプレミアム 冷凍唐揚げ | P14.0 F14.0 C14.0 | 230 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 6 | たまごサンド | P11.0 F18.0 C27.0 | 320 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 7 | ツナマヨネーズサンド | P12.0 F14.0 C30.0 | 290 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 8 | ハンバーグ弁当 | P22.0 F22.0 C88.0 | 660 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 9 | プレミアムカステラ | P5.0 F5.0 C40.0 | 220 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 10 | 昆布おにぎり | P4.0 F0.6 C37.0 | 170 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 11 | 中華まん 肉まん | P7.0 F8.0 C30.0 | 230 | https://www.sej.co.jp/products/info_allergy.html | [ ] |
| 12 | 唐揚げ弁当 | P24.0 F26.0 C96.0 | 740 | https://www.sej.co.jp/products/info_allergy.html | [ ] |

## Dropped items (3)

Rows the scraper extracted but parse / validation failed to
promote to a final record. Syuto: decide whether to re-scrape
(parser fix), hand-enter as `source: manual`, or defer to a
future seed refresh.

- ぶどうサワー [PFC inconsistent: calories=80 vs Atwater=28.0 (deviation 65.0%)]
- ハイボール [PFC inconsistent: calories=50 vs Atwater=0.0 (deviation 100.0%)]
- ビール 350ml [PFC inconsistent: calories=140 vs Atwater=44.0 (deviation 68.6%)]

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
