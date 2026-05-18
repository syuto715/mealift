# すき家 抜粋 sample (5/12 items)

- Source URL: https://www.sukiya.jp/about/safety.html
- Captured at: 2026-05-18
- Seed: `sukiya` (deterministic — re-run yields the same sample)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | 牛皿 ミニ | P10.4 F15.1 C7.0 | 204 | https://www.sukiya.jp/about/safety.html | [ ] |
| 2 | 牛皿 中盛 | P21.1 F32.3 C12.2 | 423 | https://www.sukiya.jp/about/safety.html | [ ] |
| 3 | 牛皿 並盛 | P15.0 F22.0 C9.9 | 297 | https://www.sukiya.jp/about/safety.html | [ ] |
| 4 | 牛丼 大盛 | P28.4 F30.7 C130.1 | 908 | https://www.sukiya.jp/about/safety.html | [ ] |
| 5 | 高菜明太マヨ牛丼 並盛 | P32.9 F36.7 C102.8 | 871 | https://www.sukiya.jp/about/safety.html | [ ] |

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
