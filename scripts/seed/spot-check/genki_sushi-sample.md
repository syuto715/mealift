# 元気寿司 抜粋 sample (9/57 items)

- Source URL: https://en.genki-gdc.co.jp/
- Captured at: 2026-05-19
- Seed: `genki_sushi` (deterministic — re-run yields the same sample)
- **Partial scrape**: 3 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | コーラ | P0.0 F0.0 C35.0 | 140 | https://en.genki-gdc.co.jp/ | [ ] |
| 2 | サーモン巻 (1本) | P6.0 F3.5 C18.5 | 124 | https://en.genki-gdc.co.jp/ | [ ] |
| 3 | たこ (2貫) | P5.5 F0.2 C8.5 | 56 | https://en.genki-gdc.co.jp/ | [ ] |
| 4 | ポテト | P2.5 F10.0 C25.0 | 200 | https://en.genki-gdc.co.jp/ | [ ] |
| 5 | メロンソーダ | P0.0 F0.0 C38.0 | 152 | https://en.genki-gdc.co.jp/ | [ ] |
| 6 | ラーメン (醤油) | P14.0 F8.0 C62.0 | 380 | https://en.genki-gdc.co.jp/ | [ ] |
| 7 | 海老天うどん | P13.0 F15.0 C58.0 | 420 | https://en.genki-gdc.co.jp/ | [ ] |
| 8 | 玉子 (2貫) | P4.0 F2.5 C12.5 | 92 | https://en.genki-gdc.co.jp/ | [ ] |
| 9 | 唐揚げ (3個) | P14.0 F14.0 C14.0 | 240 | https://en.genki-gdc.co.jp/ | [ ] |

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
