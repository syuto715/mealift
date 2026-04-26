import type { FoodDefinition } from './foods';

// 50 brand-agnostic generic items inserted with source='manual_seed'.
// These fill gaps where 八訂 (MEXT) entries don't exist or don't match
// what a fitness user actually logs (protein bars, ready-meal portions,
// supplement scoops). All names are 一般名 — NO brand references.
//
// Nutrition figures are realistic estimates for a single serving and
// match the labelled portion size in servingSizeG. Extended nutrients
// are null where we don't have a confident source — the calculator
// preserves null rather than coercing to 0.

export const GENERIC_FOODS: FoodDefinition[] = [
  // === コンビニ風汎用 (15品) ============================================
  { id: 'gen_001', nameJa: 'サラダチキン プレーン', nameEn: 'Salad Chicken Plain', brand: null, category: 'convenience', servingSizeG: 110, servingUnit: '1袋', caloriesPerServing: 113, proteinG: 24.0, fatG: 1.5, carbG: 0.5, fiberG: 0, sodiumMg: 480, saltG: 1.2 },
  { id: 'gen_002', nameJa: 'おにぎり ツナマヨ', nameEn: 'Onigiri Tuna Mayo', brand: null, category: 'convenience', servingSizeG: 110, servingUnit: '1個', caloriesPerServing: 245, proteinG: 6.5, fatG: 7.0, carbG: 38.0, fiberG: 0.6, sodiumMg: 480, saltG: 1.2 },
  { id: 'gen_003', nameJa: 'おにぎり 鮭', nameEn: 'Onigiri Salmon', brand: null, category: 'convenience', servingSizeG: 110, servingUnit: '1個', caloriesPerServing: 200, proteinG: 5.0, fatG: 2.0, carbG: 39.0, fiberG: 0.5, sodiumMg: 520, saltG: 1.3 },
  { id: 'gen_004', nameJa: 'ゆで卵', nameEn: 'Boiled Egg', brand: null, category: 'convenience', servingSizeG: 50, servingUnit: '1個', caloriesPerServing: 76, proteinG: 6.5, fatG: 5.0, carbG: 0.3, fiberG: 0, sodiumMg: 60, saltG: 0.2, cholesterolMg: 185 },
  { id: 'gen_005', nameJa: 'サンドイッチ 卵', nameEn: 'Egg Sandwich', brand: null, category: 'convenience', servingSizeG: 130, servingUnit: '1パック', caloriesPerServing: 320, proteinG: 10.0, fatG: 19.0, carbG: 27.0, fiberG: 1.5, sodiumMg: 580, saltG: 1.5 },
  { id: 'gen_006', nameJa: 'サンドイッチ ハム', nameEn: 'Ham Sandwich', brand: null, category: 'convenience', servingSizeG: 130, servingUnit: '1パック', caloriesPerServing: 290, proteinG: 11.0, fatG: 14.0, carbG: 30.0, fiberG: 1.5, sodiumMg: 720, saltG: 1.8 },
  { id: 'gen_007', nameJa: 'おでん こんにゃく', nameEn: 'Oden Konnyaku', brand: null, category: 'convenience', servingSizeG: 80, servingUnit: '1個', caloriesPerServing: 6, proteinG: 0.1, fatG: 0, carbG: 1.5, fiberG: 1.8, sodiumMg: 200, saltG: 0.5 },
  { id: 'gen_008', nameJa: '焼き鳥 もも塩', nameEn: 'Yakitori Thigh Salt', brand: null, category: 'convenience', servingSizeG: 30, servingUnit: '1本', caloriesPerServing: 56, proteinG: 5.0, fatG: 4.0, carbG: 0.1, fiberG: 0, sodiumMg: 180, saltG: 0.5 },
  { id: 'gen_009', nameJa: '焼き鳥 むね塩', nameEn: 'Yakitori Breast Salt', brand: null, category: 'convenience', servingSizeG: 30, servingUnit: '1本', caloriesPerServing: 35, proteinG: 7.0, fatG: 0.6, carbG: 0.1, fiberG: 0, sodiumMg: 180, saltG: 0.5 },
  { id: 'gen_010', nameJa: '海藻サラダ', nameEn: 'Seaweed Salad', brand: null, category: 'convenience', servingSizeG: 100, servingUnit: '1袋', caloriesPerServing: 25, proteinG: 1.5, fatG: 0.2, carbG: 4.0, fiberG: 2.5, sodiumMg: 320, saltG: 0.8 },
  { id: 'gen_011', nameJa: 'おにぎり 梅', nameEn: 'Onigiri Umeboshi', brand: null, category: 'convenience', servingSizeG: 110, servingUnit: '1個', caloriesPerServing: 178, proteinG: 3.0, fatG: 0.3, carbG: 39.0, fiberG: 0.5, sodiumMg: 600, saltG: 1.5 },
  { id: 'gen_012', nameJa: 'フランクフルト', nameEn: 'Frankfurter', brand: null, category: 'convenience', servingSizeG: 60, servingUnit: '1本', caloriesPerServing: 188, proteinG: 8.0, fatG: 17.0, carbG: 3.0, fiberG: 0, sodiumMg: 480, saltG: 1.2, cholesterolMg: 35 },
  { id: 'gen_013', nameJa: 'サラダチキン スモーク', nameEn: 'Salad Chicken Smoke', brand: null, category: 'convenience', servingSizeG: 110, servingUnit: '1袋', caloriesPerServing: 124, proteinG: 24.0, fatG: 2.0, carbG: 1.0, fiberG: 0, sodiumMg: 520, saltG: 1.3 },
  { id: 'gen_014', nameJa: '唐揚げ', nameEn: 'Karaage', brand: null, category: 'convenience', servingSizeG: 25, servingUnit: '1個', caloriesPerServing: 70, proteinG: 4.0, fatG: 5.0, carbG: 2.0, fiberG: 0, sodiumMg: 90, saltG: 0.2 },
  { id: 'gen_015', nameJa: '肉まん', nameEn: 'Nikuman (Pork Bun)', brand: null, category: 'convenience', servingSizeG: 100, servingUnit: '1個', caloriesPerServing: 251, proteinG: 8.0, fatG: 5.0, carbG: 43.0, fiberG: 1.5, sodiumMg: 420, saltG: 1.1 },

  // === プロテインバー風 (5品) ============================================
  { id: 'gen_016', nameJa: 'プロテインバー チョコ', nameEn: 'Protein Bar Chocolate', brand: null, category: 'supplement', servingSizeG: 40, servingUnit: '1本', caloriesPerServing: 160, proteinG: 15.0, fatG: 6.0, carbG: 11.0, fiberG: 2.0, sodiumMg: 100, saltG: 0.25, sugarG: 5.0 },
  { id: 'gen_017', nameJa: 'プロテインバー ナッツ', nameEn: 'Protein Bar Nut', brand: null, category: 'supplement', servingSizeG: 40, servingUnit: '1本', caloriesPerServing: 165, proteinG: 14.0, fatG: 7.0, carbG: 11.0, fiberG: 2.5, sodiumMg: 95, saltG: 0.24, sugarG: 4.0 },
  { id: 'gen_018', nameJa: 'プロテインバー ベイクド', nameEn: 'Protein Bar Baked', brand: null, category: 'supplement', servingSizeG: 45, servingUnit: '1本', caloriesPerServing: 175, proteinG: 15.0, fatG: 5.0, carbG: 17.0, fiberG: 1.5, sodiumMg: 130, saltG: 0.33, sugarG: 7.0 },
  { id: 'gen_019', nameJa: 'プロテインクッキー', nameEn: 'Protein Cookie', brand: null, category: 'supplement', servingSizeG: 40, servingUnit: '1枚', caloriesPerServing: 170, proteinG: 12.0, fatG: 7.0, carbG: 14.0, fiberG: 1.5, sodiumMg: 110, saltG: 0.28, sugarG: 6.0 },
  { id: 'gen_020', nameJa: 'プロテインゼリー飲料', nameEn: 'Protein Jelly Drink', brand: null, category: 'supplement', servingSizeG: 180, servingUnit: '1パウチ', caloriesPerServing: 100, proteinG: 15.0, fatG: 0, carbG: 10.0, fiberG: 0, sodiumMg: 75, saltG: 0.19, sugarG: 8.0 },

  // === プロテインパウダー風 (5品) ========================================
  { id: 'gen_021', nameJa: 'ホエイプロテイン プレーン', nameEn: 'Whey Protein Plain', brand: null, category: 'supplement', servingSizeG: 30, servingUnit: '1スクープ', caloriesPerServing: 116, proteinG: 24.0, fatG: 1.5, carbG: 2.0, fiberG: 0, sodiumMg: 60, saltG: 0.15, calciumMg: 110 },
  { id: 'gen_022', nameJa: 'ホエイプロテイン チョコ', nameEn: 'Whey Protein Chocolate', brand: null, category: 'supplement', servingSizeG: 30, servingUnit: '1スクープ', caloriesPerServing: 120, proteinG: 22.0, fatG: 1.7, carbG: 4.0, fiberG: 0.5, sodiumMg: 65, saltG: 0.16, calciumMg: 100, sugarG: 2.0 },
  { id: 'gen_023', nameJa: 'カゼインプロテイン プレーン', nameEn: 'Casein Protein Plain', brand: null, category: 'supplement', servingSizeG: 30, servingUnit: '1スクープ', caloriesPerServing: 110, proteinG: 24.0, fatG: 0.8, carbG: 2.0, fiberG: 0, sodiumMg: 50, saltG: 0.13, calciumMg: 380 },
  { id: 'gen_024', nameJa: 'ソイプロテイン プレーン', nameEn: 'Soy Protein Plain', brand: null, category: 'supplement', servingSizeG: 30, servingUnit: '1スクープ', caloriesPerServing: 113, proteinG: 22.0, fatG: 1.0, carbG: 3.0, fiberG: 1.0, sodiumMg: 70, saltG: 0.18 },
  { id: 'gen_025', nameJa: 'WPI（アイソレート）プレーン', nameEn: 'Whey Isolate Plain', brand: null, category: 'supplement', servingSizeG: 30, servingUnit: '1スクープ', caloriesPerServing: 117, proteinG: 26.0, fatG: 0.5, carbG: 1.0, fiberG: 0, sodiumMg: 50, saltG: 0.13, calciumMg: 80 },

  // === 冷凍食品系汎用 (5品) ==============================================
  { id: 'gen_026', nameJa: '冷凍 鶏むねステーキ', nameEn: 'Frozen Chicken Breast Steak', brand: null, category: 'convenience', servingSizeG: 150, servingUnit: '1食', caloriesPerServing: 165, proteinG: 36.0, fatG: 1.5, carbG: 1.0, fiberG: 0, sodiumMg: 600, saltG: 1.5 },
  { id: 'gen_027', nameJa: '冷凍 ブロッコリー', nameEn: 'Frozen Broccoli', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: '1食', caloriesPerServing: 35, proteinG: 3.6, fatG: 0.4, carbG: 6.0, fiberG: 4.0, sodiumMg: 15, vitaminCMg: 50, calciumMg: 38 },
  { id: 'gen_028', nameJa: '冷凍 玄米ごはん', nameEn: 'Frozen Brown Rice', brand: null, category: 'staple', servingSizeG: 150, servingUnit: '1食', caloriesPerServing: 240, proteinG: 5.0, fatG: 1.5, carbG: 51.0, fiberG: 2.1, magnesiumMg: 70, sodiumMg: 5 },
  { id: 'gen_029', nameJa: '冷凍 鮭の塩焼き', nameEn: 'Frozen Grilled Salmon', brand: null, category: 'fish', servingSizeG: 80, servingUnit: '1切', caloriesPerServing: 155, proteinG: 18.0, fatG: 9.0, carbG: 0.3, fiberG: 0, sodiumMg: 480, saltG: 1.2, vitaminDUg: 26 },
  { id: 'gen_030', nameJa: '冷凍 さば塩焼き', nameEn: 'Frozen Grilled Mackerel', brand: null, category: 'fish', servingSizeG: 80, servingUnit: '1切', caloriesPerServing: 200, proteinG: 17.0, fatG: 14.0, carbG: 0.5, fiberG: 0, sodiumMg: 520, saltG: 1.3, vitaminDUg: 9 },

  // === サプリ・健康食品 (5品) ============================================
  { id: 'gen_031', nameJa: 'EAA', nameEn: 'EAA', brand: null, category: 'supplement', servingSizeG: 10, servingUnit: '1スクープ', caloriesPerServing: 39, proteinG: 9.5, fatG: 0, carbG: 0.2, fiberG: 0, sodiumMg: 5 },
  { id: 'gen_032', nameJa: 'BCAA', nameEn: 'BCAA', brand: null, category: 'supplement', servingSizeG: 5, servingUnit: '1スクープ', caloriesPerServing: 19, proteinG: 4.5, fatG: 0, carbG: 0.1, fiberG: 0, sodiumMg: 3 },
  { id: 'gen_033', nameJa: 'クレアチン', nameEn: 'Creatine Monohydrate', brand: null, category: 'supplement', servingSizeG: 5, servingUnit: '1スクープ', caloriesPerServing: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0, sodiumMg: 0 },
  { id: 'gen_034', nameJa: 'マルチビタミン', nameEn: 'Multivitamin Tablet', brand: null, category: 'supplement', servingSizeG: 1, servingUnit: '1錠', caloriesPerServing: 1, proteinG: 0, fatG: 0, carbG: 0.1, fiberG: 0 },
  { id: 'gen_035', nameJa: 'フィッシュオイル', nameEn: 'Fish Oil Softgel', brand: null, category: 'supplement', servingSizeG: 1, servingUnit: '1粒', caloriesPerServing: 9, proteinG: 0, fatG: 1.0, carbG: 0, fiberG: 0 },

  // === 飲料系 (5品) ======================================================
  { id: 'gen_036', nameJa: '高タンパク飲料', nameEn: 'High Protein Drink', brand: null, category: 'supplement', servingSizeG: 200, servingUnit: '200ml', caloriesPerServing: 80, proteinG: 15.0, fatG: 0.5, carbG: 4.0, fiberG: 0, sodiumMg: 100, saltG: 0.25, calciumMg: 200 },
  { id: 'gen_037', nameJa: '無調整豆乳', nameEn: 'Unsweetened Soy Milk', brand: null, category: 'soy', servingSizeG: 200, servingUnit: '200ml', caloriesPerServing: 92, proteinG: 7.2, fatG: 4.0, carbG: 5.8, fiberG: 0.4, sodiumMg: 4, calciumMg: 30, ironMg: 2.4 },
  { id: 'gen_038', nameJa: 'アーモンドミルク 無糖', nameEn: 'Unsweetened Almond Milk', brand: null, category: 'convenience', servingSizeG: 200, servingUnit: '200ml', caloriesPerServing: 28, proteinG: 1.0, fatG: 2.5, carbG: 0.6, fiberG: 0.4, sodiumMg: 60, saltG: 0.15, calciumMg: 120, vitaminEMg: 9.6 },
  { id: 'gen_039', nameJa: '経口補水液', nameEn: 'Oral Rehydration Solution', brand: null, category: 'convenience', servingSizeG: 500, servingUnit: '500ml', caloriesPerServing: 50, proteinG: 0, fatG: 0, carbG: 12.5, fiberG: 0, sodiumMg: 575, saltG: 1.46, potassiumMg: 390 },
  { id: 'gen_040', nameJa: 'スポーツドリンク', nameEn: 'Sports Drink', brand: null, category: 'convenience', servingSizeG: 500, servingUnit: '500ml', caloriesPerServing: 105, proteinG: 0, fatG: 0, carbG: 26.0, fiberG: 0, sodiumMg: 200, saltG: 0.5, potassiumMg: 100, sugarG: 26.0 },

  // === 菓子類(高タンパク) (5品) =========================================
  { id: 'gen_041', nameJa: '高タンパクヨーグルト プレーン', nameEn: 'High Protein Yogurt Plain', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: '1個', caloriesPerServing: 60, proteinG: 10.0, fatG: 0, carbG: 5.0, fiberG: 0, sodiumMg: 50, calciumMg: 130 },
  { id: 'gen_042', nameJa: '高タンパクヨーグルト 加糖', nameEn: 'High Protein Yogurt Sweetened', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: '1個', caloriesPerServing: 80, proteinG: 10.0, fatG: 0, carbG: 10.0, fiberG: 0, sodiumMg: 50, calciumMg: 130, sugarG: 5.0 },
  { id: 'gen_043', nameJa: '高タンパクアイス バニラ', nameEn: 'High Protein Ice Cream Vanilla', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: '1個', caloriesPerServing: 130, proteinG: 12.0, fatG: 4.0, carbG: 13.0, fiberG: 0.5, sodiumMg: 80, saltG: 0.2, calciumMg: 110, sugarG: 8.0 },
  { id: 'gen_044', nameJa: '高タンパクプリン', nameEn: 'High Protein Pudding', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: '1個', caloriesPerServing: 95, proteinG: 10.0, fatG: 3.0, carbG: 6.0, fiberG: 0, sodiumMg: 75, saltG: 0.19, calciumMg: 120 },
  { id: 'gen_045', nameJa: 'ナチュラルチーズ スティック', nameEn: 'Natural Cheese Stick', brand: null, category: 'egg_dairy', servingSizeG: 25, servingUnit: '1本', caloriesPerServing: 85, proteinG: 5.0, fatG: 7.0, carbG: 0.3, fiberG: 0, sodiumMg: 200, saltG: 0.5, calciumMg: 158 },

  // === その他汎用 (5品) ==================================================
  { id: 'gen_046', nameJa: 'ピーナッツバター 無糖', nameEn: 'Peanut Butter Unsweetened', brand: null, category: 'seasoning', servingSizeG: 15, servingUnit: '大さじ1', caloriesPerServing: 95, proteinG: 4.0, fatG: 8.0, carbG: 3.0, fiberG: 1.2, sodiumMg: 5, magnesiumMg: 26 },
  { id: 'gen_047', nameJa: 'ミックスナッツ 無塩', nameEn: 'Mixed Nuts Unsalted', brand: null, category: 'seasoning', servingSizeG: 30, servingUnit: '1袋', caloriesPerServing: 180, proteinG: 6.0, fatG: 16.0, carbG: 6.0, fiberG: 2.5, sodiumMg: 1, magnesiumMg: 75, vitaminEMg: 5.0 },
  { id: 'gen_048', nameJa: 'アボカド', nameEn: 'Avocado', brand: null, category: 'fruit', servingSizeG: 70, servingUnit: '1/2個', caloriesPerServing: 130, proteinG: 1.4, fatG: 13.0, carbG: 1.0, fiberG: 3.7, potassiumMg: 504, magnesiumMg: 21, vitaminEMg: 2.4 },
  { id: 'gen_049', nameJa: 'オリーブオイル', nameEn: 'Olive Oil', brand: null, category: 'seasoning', servingSizeG: 12, servingUnit: '大さじ1', caloriesPerServing: 108, proteinG: 0, fatG: 12.0, carbG: 0, fiberG: 0, vitaminEMg: 0.9, saturatedFatG: 1.7 },
  { id: 'gen_050', nameJa: 'MCTオイル', nameEn: 'MCT Oil', brand: null, category: 'seasoning', servingSizeG: 15, servingUnit: '大さじ1', caloriesPerServing: 134, proteinG: 0, fatG: 15.0, carbG: 0, fiberG: 0, saturatedFatG: 14.0 },
];
