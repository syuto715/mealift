# はま寿司 抜粋 sample (8/56 items)

- Source URL: https://www.hamazushi.com/menu/allergen/
- Captured at: 2026-05-18
- Seed: `hama_sushi` (deterministic — re-run yields the same sample)
- **Partial scrape**: 3 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | うなぎ (2貫) | P7.5 F7.5 C12.5 | 142 | https://www.hamazushi.com/menu/allergen/ | [ ] |
| 2 | かっぱ巻 (1本) | P2.5 F0.4 C18.5 | 88 | https://www.hamazushi.com/menu/allergen/ | [ ] |
| 3 | コーンマヨ軍艦 (2貫) | P4.0 F7.5 C14.0 | 144 | https://www.hamazushi.com/menu/allergen/ | [ ] |
| 4 | サーモン (2貫) | P6.5 F5.0 C8.5 | 102 | https://www.hamazushi.com/menu/allergen/ | [ ] |
| 5 | ソフトクリーム | P3.5 F6.5 C27.5 | 184 | https://www.hamazushi.com/menu/allergen/ | [ ] |
| 6 | とろサーモン (2貫) | P6.0 F11.0 C8.5 | 154 | https://www.hamazushi.com/menu/allergen/ | [ ] |
| 7 | わらび餅 | P1.5 F0.5 C28.5 | 124 | https://www.hamazushi.com/menu/allergen/ | [ ] |
| 8 | 穴子 (2貫) | P7.5 F5.0 C12.0 | 116 | https://www.hamazushi.com/menu/allergen/ | [ ] |

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
