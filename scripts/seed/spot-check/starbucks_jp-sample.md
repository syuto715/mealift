# スターバックスコーヒー 抜粋 sample (11/76 items)

- Source URL: https://product.starbucks.co.jp/allergy/
- Captured at: 2026-05-19
- Seed: `starbucks_jp` (deterministic — re-run yields the same sample)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | アイス アール グレイ ティー ラテ (Tall) | P7.0 F7.0 C10.0 | 130 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 2 | アメリカン スコーン チョコレート チャンク | P7.0 F22.0 C48.0 | 420 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 3 | エスプレッソ (Solo) | P0.3 F0.0 C1.0 | 5 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 4 | キャラメル マキアート (Tall) | P8.0 F8.5 C30.0 | 230 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 5 | スターバックス ラテ (Short) | P6.5 F7.0 C10.0 | 130 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 6 | スターバックス ラテ (Tall) | P8.5 F9.0 C13.0 | 165 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 7 | スターバックス ラテ (Venti) | P14.0 F14.5 C21.0 | 270 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 8 | ストロベリー フラペチーノ (Tall) | P6.0 F9.0 C64.0 | 360 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 9 | ハム&グリュイエール フォカッチャ | P15.0 F17.0 C40.0 | 370 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 10 | ハム&マリボーチーズ フォカッチャ | P14.0 F16.0 C40.0 | 360 | https://product.starbucks.co.jp/allergy/ | [ ] |
| 11 | ブルーベリー マフィン | P5.5 F16.0 C49.0 | 360 | https://product.starbucks.co.jp/allergy/ | [ ] |

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).
