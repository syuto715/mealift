# ジョイフル 抜粋 sample (20/346 items)

- Source URL: https://www.joyfull.co.jp/cal_pdf/cal.pdf
- Captured at: 2026-08-30
- Seed: `joyfull-s5b` (deterministic — re-run yields the same sample)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | （火）ハンバーグ＆ポテトコロッケ（ライス） | P28.5 F46.8 C103.5 | 975 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 2 | （金）ハンバーグ＆唐揚げ（ブールパン） | P36.5 F58.3 C58.2 | 927 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 3 | （水）ガーリックチキンステーキ＆ポテトコロッケ弁当 | P24.2 F25.7 C90.5 | 708 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 4 | （水）和風ハンバーグ＆蒸し鶏サラダ | P27.3 F36.7 C58.7 | 692 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 5 | （土）てりやきペッパーチキンステーキ＆白身魚フライ（トースト） | P24.9 F33.3 C46.3 | 590 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 6 | ５種チーズのとろ～りチーズインハンバーグ（単品） | P24.3 F34.3 C19.2 | 493 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 7 | イタリアンモッツァレラチーズのカプレーゼサラダ（テイクアウト） | P8.6 F12.2 C12.3 | 187 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 8 | かき氷みるく山梨産白桃 マンゴーソーストッピング（大） | P2.5 F5.0 C59.9 | 280 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 9 | カラダはぐくむ！薄切りビーフとミックスビーンズのパワーサラダ＆アサイーヨーグルト | P19.6 F34.2 C34.4 | 521 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 10 | キッズドリアプレート | P5.4 F14.2 C51.1 | 353 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 11 | キッズミートスパゲティプレート | P21.9 F30.1 C66.1 | 628 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 12 | ジョイフル塩唐揚げ（単品） | P30.1 F50.4 C27.8 | 700 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 13 | たっぷりおろしと出汁ポン酢のロースかつ（単品） | P21.5 F40.1 C42.2 | 604 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 14 | たっぷりタルタルソースのチキン南蛮定食 | P35.3 F63.0 C119.1 | 1210 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 15 | ハーゲンダッツストロベリーとレアチーズのご褒美パフェ | P5.9 F22.1 C34.6 | 358 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 16 | ミルクシロップ増量 | P1.4 F1.6 C9.8 | 59 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 17 | 角ハイボール（大） | P0.1 F0.1 C1.6 | 147 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 18 | 牛焼肉とおろし唐揚げ定食 | P40.2 F60.9 C108.4 | 1175 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 19 | 七種の和定食 | P26.7 F16.2 C84.4 | 599 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |
| 20 | 豚汁定食（生たまご） | P16.7 F17.7 C81.0 | 561 | https://www.joyfull.co.jp/cal_pdf/cal.pdf | [ ] |

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).

## S5b 照合結果 (2026-08-30, Claude 実施)

- 原本: cal.pdf (更新日 令和8年8月25日, 11p)
- 方法: pdfjs-dist + @napi-rs/canvas で該当ページを PNG レンダリングし、
  視覚テーブルの kcal/P/F/C/食塩の 5 値を目視照合 (`scripts/seed/render-pdf.mjs`)。
- 結果: **20/20 一致、転記ミス 0 件** (小数点・列ズレ・サイズ取り違えなし)。
- 原本参照位置 (メニュー → PDF ページ):
  - かき氷みるく山梨産白桃 マンゴーソーストッピング（大）: p8
  - たっぷりおろしと出汁ポン酢のロースかつ（単品）: p8
  - たっぷりタルタルソースのチキン南蛮定食: p6
  - イタリアンモッツァレラチーズのカプレーゼサラダ（テイクアウト）: p8
  - カラダはぐくむ！薄切りビーフとミックスビーンズのパワーサラダ＆アサイーヨーグルト: p3
  - キッズドリアプレート: p2
  - キッズミートスパゲティプレート: p2
  - ジョイフル塩唐揚げ（単品）: p3
  - ハーゲンダッツストロベリーとレアチーズのご褒美パフェ: p7
  - ミルクシロップ増量: p8
  - 七種の和定食: p3
  - 牛焼肉とおろし唐揚げ定食: p5
  - 角ハイボール（大）: p2
  - 豚汁定食（生たまご）: p3
  - （土）てりやきペッパーチキンステーキ＆白身魚フライ（トースト）: p7
  - （水）ガーリックチキンステーキ＆ポテトコロッケ弁当: p9
  - （水）和風ハンバーグ＆蒸し鶏サラダ: p7
  - （火）ハンバーグ＆ポテトコロッケ（ライス）: p7
  - （金）ハンバーグ＆唐揚げ（ブールパン）: p7
  - ５種チーズのとろ～りチーズインハンバーグ（単品）: p9
