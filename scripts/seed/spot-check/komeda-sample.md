# コメダ珈琲店 抜粋 sample (11/73 items)

- Source URL: https://www.komeda.co.jp/allergy_check/
- Captured at: 2026-05-19
- Seed: `komeda` (deterministic — re-run yields the same sample)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | アイスココア | P6.0 F12.0 C38.0 | 280 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 2 | アイスティー | P0.2 F0.0 C1.0 | 5 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 3 | あんバタートースト | P9.5 F12.0 C78.0 | 460 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 4 | コーヒーゼリー | P4.0 F14.0 C44.0 | 320 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 5 | コーラ | P0.0 F0.0 C30.0 | 120 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 6 | シナモントースト | P7.5 F10.0 C50.0 | 320 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 7 | ソフトクリーム | P6.0 F16.0 C48.0 | 360 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 8 | たまごバンズ | P11.0 F14.0 C52.0 | 380 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 9 | プリン | P4.0 F9.0 C32.0 | 230 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 10 | ベイクドポテト | P4.0 F8.0 C32.0 | 220 | https://www.komeda.co.jp/allergy_check/ | [ ] |
| 11 | ホットケーキ (ハチミツ) | P12.0 F18.0 C100.0 | 620 | https://www.komeda.co.jp/allergy_check/ | [ ] |

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
