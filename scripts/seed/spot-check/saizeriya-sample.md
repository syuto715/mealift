# サイゼリヤ 抜粋 sample (11/71 items)

- Source URL: https://allergy.saizeriya.co.jp/
- Captured at: 2026-05-19
- Seed: `saizeriya` (deterministic — re-run yields the same sample)
- **Partial scrape**: 4 rows were dropped
  (parse / validation failures — see "Dropped items" section below)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | アンチョビコーンのアーリオオーリオ | P12.0 F14.0 C76.0 | 470 | https://allergy.saizeriya.co.jp/ | [ ] |
| 2 | お子様ドリア | P9.0 F11.0 C36.0 | 280 | https://allergy.saizeriya.co.jp/ | [ ] |
| 3 | セミドライトマトのアラビアータ | P14.0 F16.0 C81.0 | 526 | https://allergy.saizeriya.co.jp/ | [ ] |
| 4 | チキンとブロッコリーの煮込み | P24.0 F16.0 C18.0 | 320 | https://allergy.saizeriya.co.jp/ | [ ] |
| 5 | ハンバーグステーキ デミグラスソース | P28.0 F35.0 C62.0 | 690 | https://allergy.saizeriya.co.jp/ | [ ] |
| 6 | プチデザートセット | P5.0 F12.0 C38.0 | 280 | https://allergy.saizeriya.co.jp/ | [ ] |
| 7 | フライドポテト | P3.0 F12.0 C34.0 | 250 | https://allergy.saizeriya.co.jp/ | [ ] |
| 8 | ほうれん草のソテー | P3.0 F4.5 C6.0 | 70 | https://allergy.saizeriya.co.jp/ | [ ] |
| 9 | ミートソースボロニア風 | P18.0 F16.0 C84.0 | 558 | https://allergy.saizeriya.co.jp/ | [ ] |
| 10 | メロンのジェラート | P1.5 F0.5 C30.0 | 130 | https://allergy.saizeriya.co.jp/ | [ ] |
| 11 | 粉チーズ (小) | P1.0 F1.0 C0.5 | 15 | https://allergy.saizeriya.co.jp/ | [ ] |

## Dropped items (4)

Rows the scraper extracted but parse / validation failed to
promote to a final record. Syuto: decide whether to re-scrape
(parser fix), hand-enter as `source: manual`, or defer to a
future seed refresh.

- ワイン (グラス、 デカンタ 250mL) [PFC inconsistent: calories=175 vs Atwater=7.2 (deviation 95.9%)]
- ワイン (デカンタ 500mL) [PFC inconsistent: calories=350 vs Atwater=14.0 (deviation 96.0%)]
- ハウスワイン (グラス) [PFC inconsistent: calories=90 vs Atwater=4.8 (deviation 94.7%)]
- タバスコ [PFC inconsistent: calories=1 vs Atwater=0.8 (deviation 20.0%)]

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
