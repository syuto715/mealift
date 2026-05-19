# バーミヤン 抜粋 sample (11/71 items)

- Source URL: https://allergy.skylark.co.jp/scene?shop=171099
- Captured at: 2026-05-19
- Seed: `bamiyan` (deterministic — re-run yields the same sample)
- **Partial scrape**: 2 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | ウーロン茶 | P0.0 F0.0 C0.0 | 0 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 2 | お子様炒飯セット | P13.0 F14.0 C75.0 | 480 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 3 | ソフトクリーム | P4.0 F9.0 C26.0 | 200 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 4 | ちゃんぽん麺 | P28.0 F22.0 C88.0 | 680 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 5 | ニラレバ炒め | P26.0 F24.0 C20.0 | 410 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 6 | 回鍋肉セット | P28.0 F34.0 C115.0 | 940 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 7 | 海鮮八宝菜 | P24.0 F16.0 C32.0 | 360 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 8 | 皿うどん | P24.0 F30.0 C88.0 | 740 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 9 | 酢豚 | P18.0 F22.0 C60.0 | 540 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 10 | 中華丼 | P22.0 F22.0 C105.0 | 720 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |
| 11 | 豚キムチ炒飯 | P22.0 F26.0 C108.0 | 780 | https://allergy.skylark.co.jp/scene?shop=171099 | [ ] |

## Dropped items (2)

Rows the scraper extracted but parse / validation failed to
promote to a final record. Syuto: decide whether to re-scrape
(parser fix), hand-enter as `source: manual`, or defer to a
future seed refresh.

- ホットコーヒー [PFC inconsistent: calories=8 vs Atwater=5.6 (deviation 30.0%)]
- アイスコーヒー [PFC inconsistent: calories=8 vs Atwater=5.6 (deviation 30.0%)]

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
