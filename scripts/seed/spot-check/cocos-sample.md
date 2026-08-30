# ココス 抜粋 sample (20/175 items)

- Source URL: https://www.cocos-jpn.co.jp/menu/
- Captured at: 2026-08-30
- Seed: `cocos-s5b` (deterministic — re-run yields the same sample)

| # | menu_name | extracted PFC | kcal | source URL | OK/NG |
|---|---|---|---|---|---|
| 1 | おこさまナポリタン | P8.4 F11.8 C54.5 | 362 | https://www.cocos-jpn.co.jp/menu/kids/jr_napolitan1910.html | [ ] |
| 2 | おこさままぐろ丼 | P13.7 F3.2 C70.3 | 355 | https://www.cocos-jpn.co.jp/menu/kids/jr_seared_tuna2510.html | [ ] |
| 3 | カリブチキンジャンバラヤ | P45.3 F49.7 C77.6 | 970 | https://www.cocos-jpn.co.jp/menu/grand/plate/jambalaya2203.html | [ ] |
| 4 | ココスのきのこハンバーグプレート | P23.7 F25.1 C74.8 | 625 | https://www.cocos-jpn.co.jp/menu/grand/plate/hb_plate2409.html | [ ] |
| 5 | コンボランチ | P31.0 F36.0 C85.4 | 789 | https://www.cocos-jpn.co.jp/menu/lunch/combo_lunch2409.html | [ ] |
| 6 | シェアサイズ カリカリチェダーのシーザーサラダ | P11.2 F24.4 C5.6 | 287 | https://www.cocos-jpn.co.jp/menu/grand/salad/caesar_salad2203.html | [ ] |
| 7 | シェアサイズ チキンとナッツのサラダ | P21.2 F29.4 C22.4 | 434 | https://www.cocos-jpn.co.jp/menu/grand/salad/chicken_salad2203.html | [ ] |
| 8 | チーズソースの濃厚ビーフシチュー包み焼きハンバーグ 145g ランチ | P33.6 F46.1 C106.3 | 990 | https://www.cocos-jpn.co.jp/menu/lunch/145beefstew_foilpack_cheesesauce_lunch2512.html | [ ] |
| 9 | トッピングフルーツ | P0.4 F0.1 C11.9 | 46 | https://www.cocos-jpn.co.jp/menu/grand/dessert/topping_fruits2603.html | [ ] |
| 10 | ミニ！ベーコンの濃厚カルボナーラ | P16.7 F28.5 C50.1 | 510 | https://www.cocos-jpn.co.jp/menu/grand/pasta/mini_carbonara2209.html | [ ] |
| 11 | ライス | P4.0 F0.5 C59.4 | 250 | https://www.cocos-jpn.co.jp/menu/grand/set/rice.html | [ ] |
| 12 | ランチ 白玉クリームあずき | P4.2 F2.5 C46.8 | 227 | https://www.cocos-jpn.co.jp/menu/lunch/lu_shiratama_cream_redbean2406.html | [ ] |
| 13 | 鶏と野菜のリゾット&鮭のホワイトシチュー | P3.4 F0.4 C17.3 | 86 | https://www.cocos-jpn.co.jp/menu/kids/jr_stew2109.html | [ ] |
| 14 | 厚切り!!サーロインステーキ | P44.3 F65.9 C33.0 | 932 | https://www.cocos-jpn.co.jp/menu/grand/steak/sirloinsteak2312.html | [ ] |
| 15 | 山盛りチーズの濃厚ビーフシチュー包み焼きハンバーグ110g | P27.6 F35.8 C38.0 | 603 | https://www.cocos-jpn.co.jp/menu/grand/hamburg/granapadano_mini_beefstew_foilpack2503.html | [ ] |
| 16 | 純氷ふわふわかき氷 ドバイチョコ | P8.2 F43.7 C83.7 | 750 | https://www.cocos-jpn.co.jp/menu/fair/shaved_ice2606/shaved_ice_dubaichocolate2606.html | [ ] |
| 17 | 純氷ふわふわかき氷 ポップブルー | P2.3 F23.5 C80.4 | 529 | https://www.cocos-jpn.co.jp/menu/fair/shaved_ice2606/shaved_ice_popblue2606.html | [ ] |
| 18 | 純氷ふわふわかき氷 ミニ！マンゴー | P1.4 F2.2 C48.4 | 214 | https://www.cocos-jpn.co.jp/menu/fair/shaved_ice2606/mini_shaved_ice_mango2606.html | [ ] |
| 19 | 追加目玉焼き | P6.3 F6.1 C0.2 | 81 | https://www.cocos-jpn.co.jp/menu/grand/set/add_friedegg2603.html | [ ] |
| 20 | 本気の唐揚げ | P18.0 F15.8 C21.7 | 313 | https://www.cocos-jpn.co.jp/menu/grand/pizza/fried_chicken2603.html | [ ] |

## Review procedure

1. Open the Source URL above in a browser.
2. For each row, locate the matching menu item on the official page.
3. Compare 公式 PFC vs. extracted PFC. If exact match → check `[x] OK`.
   If mismatch → record actual values in a follow-up note + check `[x] NG`.
4. If mismatch count / sample size > 5%, the scrape needs to be re-run
   (per epic §4.1 step 2 threshold).

## S5b 照合結果 (2026-08-30, Claude 実施)

- 原本: 各 item の公式メニューページ (表の source URL 列がそのまま原本参照位置)。
- 方法: sample 20 件の item ページを再取得 (2.2s 間隔) し、メイン栄養テーブルの
  5 値を突き合わせ (`tmp/s5b/cocos-verify.ts`)。
- 結果: **20/20 一致、転記ミス 0 件**。
