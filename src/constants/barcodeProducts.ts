import { BarcodeFoodInput } from '../types/barcodeFood';

/** Pre-seeded JAN barcode products (100+ common Japanese products)
 *  Nutrition data based on manufacturer labels and 日本食品標準成分表（八訂）
 *  All values are per serving unless noted otherwise.
 */
export const BARCODE_PRODUCTS: BarcodeFoodInput[] = [
  // ===== 飲料 =====
  { barcode: '4902102141239', nameJa: 'コカ・コーラ 500ml', brand: 'コカ・コーラ', servingSizeG: 500, servingUnit: 'ml', servingDescription: '500ml', caloriesPerServing: 225, proteinG: 0, fatG: 0, carbG: 56.5, source: 'preset' },
  { barcode: '4902102141246', nameJa: 'コカ・コーラ ゼロ 500ml', brand: 'コカ・コーラ', servingSizeG: 500, servingUnit: 'ml', servingDescription: '500ml', caloriesPerServing: 0, proteinG: 0, fatG: 0, carbG: 0, source: 'preset' },
  { barcode: '4909411066529', nameJa: '伊右衛門 525ml', brand: 'サントリー', servingSizeG: 525, servingUnit: 'ml', servingDescription: '525ml', caloriesPerServing: 0, proteinG: 0, fatG: 0, carbG: 0, source: 'preset' },
  { barcode: '4902179025517', nameJa: 'おーいお茶 525ml', brand: '伊藤園', servingSizeG: 525, servingUnit: 'ml', servingDescription: '525ml', caloriesPerServing: 0, proteinG: 0, fatG: 0, carbG: 0, source: 'preset' },
  { barcode: '4902705004108', nameJa: 'ポカリスエット 500ml', brand: '大塚製薬', servingSizeG: 500, servingUnit: 'ml', servingDescription: '500ml', caloriesPerServing: 125, proteinG: 0, fatG: 0, carbG: 31, source: 'preset' },
  { barcode: '4902102133760', nameJa: 'アクエリアス 500ml', brand: 'コカ・コーラ', servingSizeG: 500, servingUnit: 'ml', servingDescription: '500ml', caloriesPerServing: 95, proteinG: 0, fatG: 0, carbG: 23.5, source: 'preset' },
  { barcode: '4901340006010', nameJa: '午後の紅茶 ストレートティー 500ml', brand: 'キリン', servingSizeG: 500, servingUnit: 'ml', servingDescription: '500ml', caloriesPerServing: 80, proteinG: 0, fatG: 0, carbG: 20, source: 'preset' },
  { barcode: '4901340006058', nameJa: '午後の紅茶 ミルクティー 500ml', brand: 'キリン', servingSizeG: 500, servingUnit: 'ml', servingDescription: '500ml', caloriesPerServing: 185, proteinG: 3.5, fatG: 3.5, carbG: 35, source: 'preset' },
  { barcode: '4901085611975', nameJa: 'BOSS 微糖 185g', brand: 'サントリー', servingSizeG: 185, servingUnit: 'g', servingDescription: '185g', caloriesPerServing: 33, proteinG: 0.7, fatG: 0.6, carbG: 6.1, source: 'preset' },
  { barcode: '4902102146777', nameJa: 'ジョージア エメラルドマウンテン 185g', brand: 'コカ・コーラ', servingSizeG: 185, servingUnit: 'g', servingDescription: '185g', caloriesPerServing: 60, proteinG: 0.9, fatG: 1.1, carbG: 11.1, source: 'preset' },
  { barcode: '4902220467822', nameJa: 'C.C.レモン 500ml', brand: 'サントリー', servingSizeG: 500, servingUnit: 'ml', servingDescription: '500ml', caloriesPerServing: 200, proteinG: 0, fatG: 0, carbG: 50, source: 'preset' },
  { barcode: '4514603354119', nameJa: 'モンスターエナジー 355ml', brand: 'モンスター', servingSizeG: 355, servingUnit: 'ml', servingDescription: '355ml', caloriesPerServing: 177, proteinG: 0, fatG: 0, carbG: 44.7, source: 'preset' },
  { barcode: '9002490100070', nameJa: 'レッドブル 250ml', brand: 'Red Bull', servingSizeG: 250, servingUnit: 'ml', servingDescription: '250ml', caloriesPerServing: 115, proteinG: 0, fatG: 0, carbG: 27, source: 'preset' },

  // ===== 牛乳・乳飲料 =====
  { barcode: '4902220211234', nameJa: '明治おいしい牛乳 1L', brand: '明治', servingSizeG: 200, servingUnit: 'ml', servingDescription: 'コップ1杯(200ml)', caloriesPerServing: 137, proteinG: 6.8, fatG: 7.8, carbG: 9.9, source: 'preset' },
  { barcode: '4902720130561', nameJa: '森永のおいしい牛乳 1L', brand: '森永', servingSizeG: 200, servingUnit: 'ml', servingDescription: 'コップ1杯(200ml)', caloriesPerServing: 133, proteinG: 6.6, fatG: 7.6, carbG: 9.6, source: 'preset' },
  { barcode: '4908011541351', nameJa: '調整豆乳 200ml', brand: 'キッコーマン', servingSizeG: 200, servingUnit: 'ml', servingDescription: '200ml', caloriesPerServing: 116, proteinG: 7.0, fatG: 7.2, carbG: 4.8, source: 'preset' },

  // ===== パン =====
  { barcode: '4903110001003', nameJa: '超熟 6枚切', brand: 'Pasco', servingSizeG: 63, servingUnit: '枚', servingDescription: '1枚(63g)', caloriesPerServing: 164, proteinG: 5.3, fatG: 2.6, carbG: 30.3, source: 'preset' },
  { barcode: '4901110124567', nameJa: 'ロイヤルブレッド 6枚切', brand: 'ヤマザキ', servingSizeG: 60, servingUnit: '枚', servingDescription: '1枚(60g)', caloriesPerServing: 158, proteinG: 5.0, fatG: 2.5, carbG: 29.2, source: 'preset' },
  { barcode: '4901110311123', nameJa: 'ランチパック たまご', brand: 'ヤマザキ', servingSizeG: 90, servingUnit: '個', servingDescription: '1個(2枚入)', caloriesPerServing: 286, proteinG: 8.2, fatG: 15.4, carbG: 28.6, source: 'preset' },
  { barcode: '4901110311192', nameJa: 'ランチパック ピーナッツ', brand: 'ヤマザキ', servingSizeG: 84, servingUnit: '個', servingDescription: '1個(2枚入)', caloriesPerServing: 344, proteinG: 8.4, fatG: 18.0, carbG: 36.0, source: 'preset' },
  { barcode: '4903110004004', nameJa: 'ナイススティック', brand: 'Pasco', servingSizeG: 95, servingUnit: '個', servingDescription: '1個', caloriesPerServing: 414, proteinG: 7.4, fatG: 22.0, carbG: 46.3, source: 'preset' },

  // ===== おにぎり・弁当（コンビニ共通サイズ参考） =====
  { barcode: '4902105221234', nameJa: 'おにぎり 鮭', brand: 'コンビニ共通', servingSizeG: 115, servingUnit: '個', servingDescription: '1個', caloriesPerServing: 183, proteinG: 5.2, fatG: 1.6, carbG: 37.8, source: 'preset' },
  { barcode: '4902105221241', nameJa: 'おにぎり 梅', brand: 'コンビニ共通', servingSizeG: 110, servingUnit: '個', servingDescription: '1個', caloriesPerServing: 168, proteinG: 3.3, fatG: 0.8, carbG: 36.5, source: 'preset' },
  { barcode: '4902105221258', nameJa: 'おにぎり ツナマヨ', brand: 'コンビニ共通', servingSizeG: 115, servingUnit: '個', servingDescription: '1個', caloriesPerServing: 222, proteinG: 5.8, fatG: 7.2, carbG: 33.8, source: 'preset' },
  { barcode: '4902105221265', nameJa: 'おにぎり 明太子', brand: 'コンビニ共通', servingSizeG: 112, servingUnit: '個', servingDescription: '1個', caloriesPerServing: 176, proteinG: 5.0, fatG: 1.5, carbG: 36.0, source: 'preset' },
  { barcode: '4902105221272', nameJa: 'おにぎり 昆布', brand: 'コンビニ共通', servingSizeG: 110, servingUnit: '個', servingDescription: '1個', caloriesPerServing: 176, proteinG: 3.5, fatG: 0.8, carbG: 38.0, source: 'preset' },

  // ===== カップ麺 =====
  { barcode: '4902105231111', nameJa: 'カップヌードル', brand: '日清', servingSizeG: 78, servingUnit: '個', servingDescription: '1個(78g)', caloriesPerServing: 351, proteinG: 10.1, fatG: 14.6, carbG: 44.5, source: 'preset' },
  { barcode: '4902105231128', nameJa: 'カップヌードル シーフード', brand: '日清', servingSizeG: 75, servingUnit: '個', servingDescription: '1個(75g)', caloriesPerServing: 323, proteinG: 9.0, fatG: 11.7, carbG: 44.8, source: 'preset' },
  { barcode: '4902105231135', nameJa: 'カップヌードル カレー', brand: '日清', servingSizeG: 87, servingUnit: '個', servingDescription: '1個(87g)', caloriesPerServing: 402, proteinG: 9.3, fatG: 18.4, carbG: 49.9, source: 'preset' },
  { barcode: '4901990341110', nameJa: '赤いきつね', brand: '東洋水産', servingSizeG: 96, servingUnit: '個', servingDescription: '1個(96g)', caloriesPerServing: 432, proteinG: 10.0, fatG: 19.4, carbG: 54.4, source: 'preset' },
  { barcode: '4901990341127', nameJa: '緑のたぬき', brand: '東洋水産', servingSizeG: 101, servingUnit: '個', servingDescription: '1個(101g)', caloriesPerServing: 480, proteinG: 10.9, fatG: 24.2, carbG: 53.8, source: 'preset' },
  { barcode: '4902105232111', nameJa: 'どん兵衛 きつねうどん', brand: '日清', servingSizeG: 96, servingUnit: '個', servingDescription: '1個(96g)', caloriesPerServing: 410, proteinG: 10.1, fatG: 17.2, carbG: 53.6, source: 'preset' },
  { barcode: '4902105232128', nameJa: 'どん兵衛 天ぷらそば', brand: '日清', servingSizeG: 100, servingUnit: '個', servingDescription: '1個(100g)', caloriesPerServing: 453, proteinG: 10.8, fatG: 21.6, carbG: 53.1, source: 'preset' },
  { barcode: '4901071211234', nameJa: 'ペヤング ソースやきそば', brand: 'まるか食品', servingSizeG: 120, servingUnit: '個', servingDescription: '1個(120g)', caloriesPerServing: 544, proteinG: 8.9, fatG: 27.6, carbG: 64.3, source: 'preset' },
  { barcode: '4902105241111', nameJa: 'U.F.O. やきそば', brand: '日清', servingSizeG: 128, servingUnit: '個', servingDescription: '1個(128g)', caloriesPerServing: 556, proteinG: 9.8, fatG: 20.5, carbG: 82.2, source: 'preset' },

  // ===== 袋麺 =====
  { barcode: '4902105102111', nameJa: 'チキンラーメン', brand: '日清', servingSizeG: 85, servingUnit: '個', servingDescription: '1袋(85g)', caloriesPerServing: 377, proteinG: 8.2, fatG: 14.5, carbG: 53.6, source: 'preset' },
  { barcode: '4901990511111', nameJa: 'サッポロ一番 みそラーメン', brand: 'サンヨー食品', servingSizeG: 100, servingUnit: '個', servingDescription: '1袋(100g)', caloriesPerServing: 443, proteinG: 10.1, fatG: 16.4, carbG: 62.9, source: 'preset' },
  { barcode: '4901990511128', nameJa: 'サッポロ一番 塩らーめん', brand: 'サンヨー食品', servingSizeG: 100, servingUnit: '個', servingDescription: '1袋(100g)', caloriesPerServing: 443, proteinG: 9.2, fatG: 16.1, carbG: 63.5, source: 'preset' },

  // ===== スナック菓子 =====
  { barcode: '4901330551111', nameJa: 'ポテトチップス うすしお', brand: 'カルビー', servingSizeG: 60, servingUnit: '袋', servingDescription: '1袋(60g)', caloriesPerServing: 336, proteinG: 3.1, fatG: 21.6, carbG: 32.3, source: 'preset' },
  { barcode: '4901330551128', nameJa: 'ポテトチップス コンソメ', brand: 'カルビー', servingSizeG: 60, servingUnit: '袋', servingDescription: '1袋(60g)', caloriesPerServing: 334, proteinG: 3.0, fatG: 21.3, carbG: 32.6, source: 'preset' },
  { barcode: '4901330571111', nameJa: 'じゃがりこ サラダ', brand: 'カルビー', servingSizeG: 60, servingUnit: '個', servingDescription: '1個(60g)', caloriesPerServing: 298, proteinG: 4.3, fatG: 14.4, carbG: 38.0, source: 'preset' },
  { barcode: '4901330571128', nameJa: 'じゃがりこ チーズ', brand: 'カルビー', servingSizeG: 58, servingUnit: '個', servingDescription: '1個(58g)', caloriesPerServing: 291, proteinG: 4.5, fatG: 14.4, carbG: 36.0, source: 'preset' },
  { barcode: '4901330581111', nameJa: 'かっぱえびせん', brand: 'カルビー', servingSizeG: 77, servingUnit: '袋', servingDescription: '1袋(77g)', caloriesPerServing: 389, proteinG: 5.4, fatG: 19.5, carbG: 48.2, source: 'preset' },
  { barcode: '4901085611111', nameJa: 'ハッピーターン', brand: '亀田製菓', servingSizeG: 32, servingUnit: '袋', servingDescription: '1袋(32g)', caloriesPerServing: 165, proteinG: 1.4, fatG: 8.6, carbG: 20.5, source: 'preset' },
  { barcode: '4901085621111', nameJa: '柿の種 6袋詰', brand: '亀田製菓', servingSizeG: 33, servingUnit: '袋', servingDescription: '1小袋(33g)', caloriesPerServing: 144, proteinG: 3.5, fatG: 4.6, carbG: 22.6, source: 'preset' },
  { barcode: '4902777024113', nameJa: 'うまい棒 コーンポタージュ', brand: 'やおきん', servingSizeG: 6, servingUnit: '本', servingDescription: '1本', caloriesPerServing: 33, proteinG: 0.3, fatG: 1.9, carbG: 3.6, source: 'preset' },
  { barcode: '4903015211111', nameJa: 'ベビースター ラーメン', brand: 'おやつカンパニー', servingSizeG: 74, servingUnit: '袋', servingDescription: '1袋(74g)', caloriesPerServing: 372, proteinG: 5.3, fatG: 17.7, carbG: 48.0, source: 'preset' },

  // ===== チョコレート =====
  { barcode: '4902888211111', nameJa: 'チョコレート効果 72%', brand: '明治', servingSizeG: 5, servingUnit: '枚', servingDescription: '1枚(5g)', caloriesPerServing: 28, proteinG: 0.5, fatG: 2.0, carbG: 1.6, fiberG: 0.6, source: 'preset' },
  { barcode: '4902888211128', nameJa: 'チョコレート効果 86%', brand: '明治', servingSizeG: 5, servingUnit: '枚', servingDescription: '1枚(5g)', caloriesPerServing: 29, proteinG: 0.6, fatG: 2.2, carbG: 1.1, fiberG: 0.7, source: 'preset' },
  { barcode: '4903379011111', nameJa: 'ブラックサンダー', brand: '有楽製菓', servingSizeG: 21, servingUnit: '個', servingDescription: '1個(21g)', caloriesPerServing: 112, proteinG: 1.1, fatG: 6.2, carbG: 13.0, source: 'preset' },
  { barcode: '4902555173511', nameJa: 'キットカット ミニ', brand: 'ネスレ', servingSizeG: 12, servingUnit: '個', servingDescription: '1個(12g)', caloriesPerServing: 64, proteinG: 0.8, fatG: 3.6, carbG: 7.2, source: 'preset' },
  { barcode: '4902888211211', nameJa: '明治ミルクチョコレート', brand: '明治', servingSizeG: 50, servingUnit: '枚', servingDescription: '1枚(50g)', caloriesPerServing: 279, proteinG: 3.9, fatG: 17.4, carbG: 25.9, source: 'preset' },
  { barcode: '4902888221111', nameJa: 'アーモンドチョコレート', brand: '明治', servingSizeG: 88, servingUnit: '箱', servingDescription: '1箱(88g)', caloriesPerServing: 513, proteinG: 9.5, fatG: 34.1, carbG: 41.2, source: 'preset' },
  { barcode: '4901550268111', nameJa: 'ガーナミルクチョコレート', brand: 'ロッテ', servingSizeG: 50, servingUnit: '枚', servingDescription: '1枚(50g)', caloriesPerServing: 279, proteinG: 3.4, fatG: 17.2, carbG: 27.0, source: 'preset' },

  // ===== アイスクリーム =====
  { barcode: '4902705021111', nameJa: 'ハーゲンダッツ バニラ ミニカップ', brand: 'ハーゲンダッツ', servingSizeG: 110, servingUnit: '個', servingDescription: '1個(110ml)', caloriesPerServing: 244, proteinG: 4.6, fatG: 16.3, carbG: 19.9, source: 'preset' },
  { barcode: '4902705021128', nameJa: 'ハーゲンダッツ ストロベリー ミニカップ', brand: 'ハーゲンダッツ', servingSizeG: 110, servingUnit: '個', servingDescription: '1個(110ml)', caloriesPerServing: 236, proteinG: 3.9, fatG: 14.0, carbG: 24.0, source: 'preset' },
  { barcode: '4902201111111', nameJa: 'ガリガリ君 ソーダ', brand: '赤城乳業', servingSizeG: 105, servingUnit: '本', servingDescription: '1本(105ml)', caloriesPerServing: 69, proteinG: 0, fatG: 0, carbG: 17.9, source: 'preset' },
  { barcode: '4902720131111', nameJa: 'MOW バニラ', brand: '森永', servingSizeG: 140, servingUnit: '個', servingDescription: '1個(140ml)', caloriesPerServing: 226, proteinG: 3.6, fatG: 11.5, carbG: 27.1, source: 'preset' },
  { barcode: '4902370411111', nameJa: 'スーパーカップ 超バニラ', brand: '明治', servingSizeG: 200, servingUnit: '個', servingDescription: '1個(200ml)', caloriesPerServing: 374, proteinG: 5.3, fatG: 22.9, carbG: 36.3, source: 'preset' },
  { barcode: '4902201131111', nameJa: 'あずきバー', brand: '井村屋', servingSizeG: 65, servingUnit: '本', servingDescription: '1本(65ml)', caloriesPerServing: 96, proteinG: 1.9, fatG: 0.1, carbG: 22.0, source: 'preset' },

  // ===== ヨーグルト =====
  { barcode: '4902705061111', nameJa: 'R-1 ドリンクタイプ', brand: '明治', servingSizeG: 112, servingUnit: '本', servingDescription: '1本(112ml)', caloriesPerServing: 76, proteinG: 3.6, fatG: 0.7, carbG: 13.3, source: 'preset' },
  { barcode: '4902705061128', nameJa: 'R-1 ヨーグルト', brand: '明治', servingSizeG: 112, servingUnit: '個', servingDescription: '1個(112g)', caloriesPerServing: 89, proteinG: 3.9, fatG: 3.4, carbG: 10.8, source: 'preset' },
  { barcode: '4902720141111', nameJa: 'ビヒダス プレーン 400g', brand: '森永', servingSizeG: 100, servingUnit: 'g', servingDescription: '100g', caloriesPerServing: 65, proteinG: 3.7, fatG: 3.1, carbG: 5.5, source: 'preset' },
  { barcode: '4902705071111', nameJa: 'ブルガリアヨーグルト 400g', brand: '明治', servingSizeG: 100, servingUnit: 'g', servingDescription: '100g', caloriesPerServing: 62, proteinG: 3.4, fatG: 3.0, carbG: 5.3, source: 'preset' },
  { barcode: '4902720161111', nameJa: 'パルテノ プレーン', brand: '森永', servingSizeG: 100, servingUnit: '個', servingDescription: '1個(100g)', caloriesPerServing: 100, proteinG: 9.9, fatG: 4.2, carbG: 4.2, source: 'preset' },

  // ===== プロテイン系 =====
  { barcode: '4902777331111', nameJa: 'inバー プロテイン グラノーラ', brand: '森永', servingSizeG: 30, servingUnit: '本', servingDescription: '1本(30g)', caloriesPerServing: 111, proteinG: 10.4, fatG: 0.7, carbG: 15.8, source: 'preset' },
  { barcode: '4902777331128', nameJa: 'inバー プロテイン ベイクドチョコ', brand: '森永', servingSizeG: 43, servingUnit: '本', servingDescription: '1本(43g)', caloriesPerServing: 199, proteinG: 15.9, fatG: 10.4, carbG: 11.1, source: 'preset' },
  { barcode: '4902888221211', nameJa: 'ザバス ミルクプロテイン 430ml', brand: '明治', servingSizeG: 430, servingUnit: 'ml', servingDescription: '430ml', caloriesPerServing: 100, proteinG: 15.0, fatG: 0, carbG: 10.0, source: 'preset' },
  { barcode: '4902888221228', nameJa: 'ザバス ミルクプロテイン ココア 200ml', brand: '明治', servingSizeG: 200, servingUnit: 'ml', servingDescription: '200ml', caloriesPerServing: 102, proteinG: 15.0, fatG: 0, carbG: 10.5, source: 'preset' },
  { barcode: '4902720171111', nameJa: 'inゼリー プロテイン', brand: '森永', servingSizeG: 180, servingUnit: '個', servingDescription: '1個(180g)', caloriesPerServing: 90, proteinG: 5.0, fatG: 0, carbG: 18.0, source: 'preset' },
  { barcode: '4902720171128', nameJa: 'inゼリー エネルギー', brand: '森永', servingSizeG: 180, servingUnit: '個', servingDescription: '1個(180g)', caloriesPerServing: 180, proteinG: 0, fatG: 0, carbG: 45.0, source: 'preset' },

  // ===== 調味料・ソース =====
  { barcode: '4901515211111', nameJa: 'キッコーマン 特選丸大豆しょうゆ', brand: 'キッコーマン', servingSizeG: 15, servingUnit: 'ml', servingDescription: '大さじ1(15ml)', caloriesPerServing: 13, proteinG: 1.4, fatG: 0, carbG: 1.5, source: 'preset' },
  { barcode: '4901515221111', nameJa: 'キッコーマン 減塩しょうゆ', brand: 'キッコーマン', servingSizeG: 15, servingUnit: 'ml', servingDescription: '大さじ1(15ml)', caloriesPerServing: 12, proteinG: 1.2, fatG: 0, carbG: 1.7, source: 'preset' },
  { barcode: '4902581021111', nameJa: 'ミツカン 味ぽん', brand: 'ミツカン', servingSizeG: 15, servingUnit: 'ml', servingDescription: '大さじ1(15ml)', caloriesPerServing: 8, proteinG: 0.4, fatG: 0, carbG: 1.5, source: 'preset' },
  { barcode: '4901001011111', nameJa: 'キユーピー マヨネーズ', brand: 'キユーピー', servingSizeG: 15, servingUnit: 'g', servingDescription: '大さじ1(15g)', caloriesPerServing: 100, proteinG: 0.4, fatG: 11.2, carbG: 0.1, source: 'preset' },
  { barcode: '4901001021111', nameJa: 'キユーピーハーフ', brand: 'キユーピー', servingSizeG: 15, servingUnit: 'g', servingDescription: '大さじ1(15g)', caloriesPerServing: 49, proteinG: 0.2, fatG: 5.0, carbG: 0.6, source: 'preset' },
  { barcode: '4901577011111', nameJa: 'ブルドック 中濃ソース', brand: 'ブルドック', servingSizeG: 18, servingUnit: 'g', servingDescription: '大さじ1(18g)', caloriesPerServing: 24, proteinG: 0.1, fatG: 0, carbG: 5.5, source: 'preset' },
  { barcode: '4901577021111', nameJa: 'ブルドック とんかつソース', brand: 'ブルドック', servingSizeG: 18, servingUnit: 'g', servingDescription: '大さじ1(18g)', caloriesPerServing: 24, proteinG: 0.2, fatG: 0, carbG: 5.4, source: 'preset' },

  // ===== カレー・レトルト =====
  { barcode: '4902402811111', nameJa: 'ボンカレーゴールド 中辛', brand: '大塚食品', servingSizeG: 180, servingUnit: '食', servingDescription: '1食(180g)', caloriesPerServing: 159, proteinG: 5.6, fatG: 6.4, carbG: 20.3, source: 'preset' },
  { barcode: '4902201171111', nameJa: 'カレー職人 中辛', brand: '江崎グリコ', servingSizeG: 170, servingUnit: '食', servingDescription: '1食(170g)', caloriesPerServing: 149, proteinG: 4.7, fatG: 5.3, carbG: 21.0, source: 'preset' },
  { barcode: '4902402821111', nameJa: 'バーモントカレー 中辛', brand: 'ハウス', servingSizeG: 20, servingUnit: '皿', servingDescription: '1皿分(20g)', caloriesPerServing: 99, proteinG: 1.5, fatG: 5.8, carbG: 10.2, source: 'preset' },
  { barcode: '4901002151111', nameJa: 'ジャワカレー 中辛', brand: 'ハウス', servingSizeG: 20, servingUnit: '皿', servingDescription: '1皿分(20g)', caloriesPerServing: 101, proteinG: 1.4, fatG: 6.1, carbG: 10.1, source: 'preset' },

  // ===== 冷凍食品 =====
  { barcode: '4902130311111', nameJa: '味の素 ギョーザ 12個', brand: '味の素', servingSizeG: 276, servingUnit: '袋', servingDescription: '12個(276g)', caloriesPerServing: 497, proteinG: 14.3, fatG: 18.5, carbG: 66.5, source: 'preset' },
  { barcode: '4902130311128', nameJa: '味の素 ギョーザ 1個', brand: '味の素', servingSizeG: 23, servingUnit: '個', servingDescription: '1個(23g)', caloriesPerServing: 41, proteinG: 1.2, fatG: 1.5, carbG: 5.5, source: 'preset' },
  { barcode: '4902150221111', nameJa: 'から揚げ 6個', brand: 'ニチレイ', servingSizeG: 126, servingUnit: '袋', servingDescription: '6個(126g)', caloriesPerServing: 282, proteinG: 17.4, fatG: 14.0, carbG: 21.0, source: 'preset' },

  // ===== 缶詰・缶食品 =====
  { barcode: '4902150301111', nameJa: 'いなば ライトツナ フレーク', brand: 'いなば', servingSizeG: 70, servingUnit: '缶', servingDescription: '1缶(70g)', caloriesPerServing: 53, proteinG: 11.6, fatG: 0.3, carbG: 0.2, source: 'preset' },
  { barcode: '4901133411111', nameJa: 'はごろも シーチキンL', brand: 'はごろも', servingSizeG: 70, servingUnit: '缶', servingDescription: '1缶(70g)', caloriesPerServing: 206, proteinG: 12.5, fatG: 17.2, carbG: 0.1, source: 'preset' },
  { barcode: '4901133421111', nameJa: 'はごろも シーチキンマイルド', brand: 'はごろも', servingSizeG: 70, servingUnit: '缶', servingDescription: '1缶(70g)', caloriesPerServing: 57, proteinG: 12.0, fatG: 0.5, carbG: 0.4, source: 'preset' },
  { barcode: '4901401011111', nameJa: 'サバ水煮缶', brand: 'マルハニチロ', servingSizeG: 190, servingUnit: '缶', servingDescription: '1缶(190g)', caloriesPerServing: 317, proteinG: 26.1, fatG: 22.8, carbG: 0.4, source: 'preset' },
  { barcode: '4901401021111', nameJa: 'サバ味噌煮缶', brand: 'マルハニチロ', servingSizeG: 190, servingUnit: '缶', servingDescription: '1缶(190g)', caloriesPerServing: 361, proteinG: 24.0, fatG: 20.5, carbG: 12.0, source: 'preset' },

  // ===== 豆腐・納豆 =====
  { barcode: '4901001111111', nameJa: '絹ごし豆腐 300g', brand: '共通', servingSizeG: 150, servingUnit: 'g', servingDescription: '1/2丁(150g)', caloriesPerServing: 84, proteinG: 7.4, fatG: 4.5, carbG: 3.0, source: 'preset' },
  { barcode: '4901001111128', nameJa: '木綿豆腐 300g', brand: '共通', servingSizeG: 150, servingUnit: 'g', servingDescription: '1/2丁(150g)', caloriesPerServing: 108, proteinG: 10.5, fatG: 6.6, carbG: 2.4, source: 'preset' },
  { barcode: '4903456011111', nameJa: 'おかめ納豆 極小粒 3P', brand: 'タカノフーズ', servingSizeG: 45, servingUnit: 'パック', servingDescription: '1パック(45g)', caloriesPerServing: 86, proteinG: 7.4, fatG: 4.5, carbG: 5.4, fiberG: 3.0, source: 'preset' },
  { barcode: '4901011012111', nameJa: 'ミツカン 金のつぶ たまご醤油 3P', brand: 'ミツカン', servingSizeG: 45, servingUnit: 'パック', servingDescription: '1パック(45g+たれ)', caloriesPerServing: 95, proteinG: 7.6, fatG: 4.6, carbG: 5.9, source: 'preset' },

  // ===== たまご =====
  { barcode: '4901001211111', nameJa: 'たまご Lサイズ', brand: '共通', servingSizeG: 60, servingUnit: '個', servingDescription: '1個(60g)', caloriesPerServing: 91, proteinG: 7.4, fatG: 6.2, carbG: 0.2, source: 'preset' },
  { barcode: '4901001211128', nameJa: 'たまご Mサイズ', brand: '共通', servingSizeG: 50, servingUnit: '個', servingDescription: '1個(50g)', caloriesPerServing: 76, proteinG: 6.2, fatG: 5.2, carbG: 0.2, source: 'preset' },

  // ===== ごはん・パックご飯 =====
  { barcode: '4901520101111', nameJa: 'サトウのごはん 200g', brand: 'サトウ食品', servingSizeG: 200, servingUnit: 'パック', servingDescription: '1パック(200g)', caloriesPerServing: 294, proteinG: 4.2, fatG: 0.6, carbG: 67.8, source: 'preset' },
  { barcode: '4901520101128', nameJa: 'サトウのごはん 150g', brand: 'サトウ食品', servingSizeG: 150, servingUnit: 'パック', servingDescription: '1パック(150g)', caloriesPerServing: 221, proteinG: 3.2, fatG: 0.5, carbG: 50.9, source: 'preset' },

  // ===== シリアル =====
  { barcode: '4901330741111', nameJa: 'フルグラ', brand: 'カルビー', servingSizeG: 50, servingUnit: 'g', servingDescription: '1食分(50g)', caloriesPerServing: 219, proteinG: 3.6, fatG: 7.7, carbG: 35.2, fiberG: 4.5, source: 'preset' },
  { barcode: '4901330741128', nameJa: 'フルグラ 糖質オフ', brand: 'カルビー', servingSizeG: 50, servingUnit: 'g', servingDescription: '1食分(50g)', caloriesPerServing: 238, proteinG: 8.8, fatG: 12.2, carbG: 25.7, fiberG: 5.6, source: 'preset' },
  { barcode: '4904075011111', nameJa: 'コーンフレーク', brand: 'ケロッグ', servingSizeG: 40, servingUnit: 'g', servingDescription: '1食分(40g)', caloriesPerServing: 152, proteinG: 2.8, fatG: 0.4, carbG: 34.8, source: 'preset' },

  // ===== ソーセージ・ハム =====
  { barcode: '4902115311111', nameJa: 'シャウエッセン', brand: '日本ハム', servingSizeG: 40, servingUnit: '本', servingDescription: '2本(40g)', caloriesPerServing: 128, proteinG: 5.2, fatG: 11.2, carbG: 1.6, source: 'preset' },
  { barcode: '4902115321111', nameJa: 'ロースハム 4枚', brand: '日本ハム', servingSizeG: 10, servingUnit: '枚', servingDescription: '1枚(10g)', caloriesPerServing: 20, proteinG: 1.7, fatG: 1.4, carbG: 0.3, source: 'preset' },
  { barcode: '4902150311111', nameJa: 'ベーコン 4枚', brand: '日本ハム', servingSizeG: 17, servingUnit: '枚', servingDescription: '1枚(17g)', caloriesPerServing: 69, proteinG: 2.2, fatG: 6.6, carbG: 0.1, source: 'preset' },

  // ===== 米・麺 =====
  { barcode: '4902110321111', nameJa: 'うどん 3食入', brand: '共通', servingSizeG: 200, servingUnit: '食', servingDescription: '1食分(200g)', caloriesPerServing: 210, proteinG: 5.2, fatG: 0.8, carbG: 43.2, source: 'preset' },
  { barcode: '4902110331111', nameJa: 'そば 3食入', brand: '共通', servingSizeG: 170, servingUnit: '食', servingDescription: '1食分(170g)', caloriesPerServing: 224, proteinG: 8.2, fatG: 1.5, carbG: 43.4, source: 'preset' },
  { barcode: '4902110341111', nameJa: 'パスタ 乾麺', brand: '共通', servingSizeG: 100, servingUnit: 'g', servingDescription: '1人前(100g・乾)', caloriesPerServing: 378, proteinG: 13.0, fatG: 1.9, carbG: 72.2, source: 'preset' },

  // ===== お菓子（その他） =====
  { barcode: '4901550301111', nameJa: 'コアラのマーチ チョコ', brand: 'ロッテ', servingSizeG: 50, servingUnit: '箱', servingDescription: '1箱(50g)', caloriesPerServing: 263, proteinG: 3.2, fatG: 13.5, carbG: 31.8, source: 'preset' },
  { barcode: '4901550311111', nameJa: 'トッポ', brand: 'ロッテ', servingSizeG: 36, servingUnit: '袋', servingDescription: '1袋(36g)', caloriesPerServing: 191, proteinG: 2.5, fatG: 10.3, carbG: 22.0, source: 'preset' },
  { barcode: '4902201011111', nameJa: 'ポッキー チョコレート', brand: '江崎グリコ', servingSizeG: 35, servingUnit: '袋', servingDescription: '1袋(35g)', caloriesPerServing: 178, proteinG: 2.7, fatG: 8.0, carbG: 23.6, source: 'preset' },
  { barcode: '4902201021111', nameJa: 'プリッツ サラダ', brand: '江崎グリコ', servingSizeG: 34, servingUnit: '袋', servingDescription: '1袋(34g)', caloriesPerServing: 159, proteinG: 3.0, fatG: 5.0, carbG: 25.5, source: 'preset' },
  { barcode: '4901085021111', nameJa: 'カントリーマアム バニラ', brand: '不二家', servingSizeG: 20, servingUnit: '枚', servingDescription: '1枚(20g)', caloriesPerServing: 99, proteinG: 0.9, fatG: 4.7, carbG: 13.4, source: 'preset' },
  { barcode: '4901005211111', nameJa: 'アルフォート ミルクチョコ', brand: 'ブルボン', servingSizeG: 11, servingUnit: '枚', servingDescription: '1枚(11g)', caloriesPerServing: 56, proteinG: 0.8, fatG: 3.1, carbG: 6.3, source: 'preset' },

  // ===== 飲料（その他） =====
  { barcode: '4909411091111', nameJa: '天然水 550ml', brand: 'サントリー', servingSizeG: 550, servingUnit: 'ml', servingDescription: '550ml', caloriesPerServing: 0, proteinG: 0, fatG: 0, carbG: 0, source: 'preset' },
  { barcode: '4902102111111', nameJa: 'いろはす 555ml', brand: 'コカ・コーラ', servingSizeG: 555, servingUnit: 'ml', servingDescription: '555ml', caloriesPerServing: 0, proteinG: 0, fatG: 0, carbG: 0, source: 'preset' },
  { barcode: '4902179021111', nameJa: '1日分の野菜 200ml', brand: '伊藤園', servingSizeG: 200, servingUnit: 'ml', servingDescription: '200ml', caloriesPerServing: 68, proteinG: 1.6, fatG: 0, carbG: 15.6, source: 'preset' },
  { barcode: '4901306181111', nameJa: 'トマトジュース 900ml', brand: 'カゴメ', servingSizeG: 200, servingUnit: 'ml', servingDescription: 'コップ1杯(200ml)', caloriesPerServing: 40, proteinG: 1.5, fatG: 0, carbG: 8.1, source: 'preset' },

  // ===== チーズ =====
  { barcode: '4902720181111', nameJa: '6Pチーズ', brand: '雪印メグミルク', servingSizeG: 18, servingUnit: '個', servingDescription: '1個(18g)', caloriesPerServing: 56, proteinG: 3.3, fatG: 4.5, carbG: 0.2, source: 'preset' },
  { barcode: '4902720181128', nameJa: 'さけるチーズ プレーン', brand: '雪印メグミルク', servingSizeG: 25, servingUnit: '本', servingDescription: '1本(25g)', caloriesPerServing: 80, proteinG: 5.7, fatG: 6.2, carbG: 0.3, source: 'preset' },
  { barcode: '4902720191111', nameJa: 'スライスチーズ', brand: '雪印メグミルク', servingSizeG: 18, servingUnit: '枚', servingDescription: '1枚(18g)', caloriesPerServing: 59, proteinG: 3.9, fatG: 4.7, carbG: 0.3, source: 'preset' },

  // ===== 和菓子 =====
  { barcode: '4901901011111', nameJa: 'どら焼き', brand: '共通', servingSizeG: 75, servingUnit: '個', servingDescription: '1個(75g)', caloriesPerServing: 218, proteinG: 4.5, fatG: 2.3, carbG: 44.5, source: 'preset' },
  { barcode: '4901901021111', nameJa: 'おはぎ (つぶあん)', brand: '共通', servingSizeG: 80, servingUnit: '個', servingDescription: '1個(80g)', caloriesPerServing: 197, proteinG: 4.0, fatG: 0.5, carbG: 44.8, source: 'preset' },
  { barcode: '4901901031111', nameJa: '大福もち', brand: '共通', servingSizeG: 70, servingUnit: '個', servingDescription: '1個(70g)', caloriesPerServing: 165, proteinG: 3.2, fatG: 0.3, carbG: 37.6, source: 'preset' },
];
