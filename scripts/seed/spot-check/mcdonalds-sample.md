# マクドナルド 抜粋 sample (10/64 items)

- Source URL: https://www.mcdonalds.co.jp/quality/allergy_Nutrition/
- Captured at: 2026-05-18
- Seed: `mcdonalds` (deterministic — re-run yields the same sample)
- **Partial scrape**: 1 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | エグチ(エッグチーズバーガー) | P22.4 F19.0 C31.2 | 390 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 2 | キャラメルラテ(M) | P5.8 F6.5 C21.5 | 169 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 3 | タルタル油淋鶏風チキンタツタ | P18.0 F19.7 C43.8 | 421 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 4 | チキンフィレオ® | P19.9 F23.8 C47.0 | 479 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 5 | てりやきマックバーガー | P14.5 F30.2 C37.5 | 477 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 6 | ハンバーガー | P13.0 F9.5 C30.3 | 259 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 7 | フィレオフィッシュ® | P15.0 F14.2 C37.4 | 338 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 8 | ホットカフェモカ(M) | P9.5 F9.3 C35.3 | 264 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 9 | マックシェイク® チョコレート(M) | P7.8 F6.2 C74.8 | 383 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |
| 10 | マックシェイク® バニラ(M) | P6.8 F5.7 C72.2 | 367 | https://www.mcdonalds.co.jp/quality/allergy_Nutrition/ | [ ] |

## Dropped items (1)

Rows the scraper extracted but parse / validation failed to
promote to a final record. Syuto: decide whether to re-scrape
(parser fix), hand-enter as `source: manual`, or defer to a
future seed refresh.

- サイドサラダ [PFC inconsistent: calories=10 vs Atwater=12.1 (deviation 21.0%)]

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
