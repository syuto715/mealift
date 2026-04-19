export interface FoodDefinition {
  id: string;
  nameJa: string;
  nameEn: string | null;
  brand: string | null;
  category: string;
  servingSizeG: number;
  servingUnit: string;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number | null;
  // Extended nutrients (optional — null if unknown)
  sodiumMg?: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
  vitaminAUg?: number | null;
  vitaminB1Mg?: number | null;
  vitaminB2Mg?: number | null;
  vitaminB6Mg?: number | null;
  vitaminB12Ug?: number | null;
  folateUg?: number | null;
  vitaminCMg?: number | null;
  vitaminDUg?: number | null;
  vitaminEMg?: number | null;
  potassiumMg?: number | null;
  magnesiumMg?: number | null;
  zincMg?: number | null;
  cholesterolMg?: number | null;
  saturatedFatG?: number | null;
  sugarG?: number | null;
  saltG?: number | null;
}

export const FOOD_CATEGORIES = [
  { id: 'staple', nameJa: '主食', nameEn: 'Staples' },
  { id: 'meat', nameJa: '肉類', nameEn: 'Meat' },
  { id: 'fish', nameJa: '魚介類', nameEn: 'Fish & Seafood' },
  { id: 'egg_dairy', nameJa: '卵・乳製品', nameEn: 'Eggs & Dairy' },
  { id: 'soy', nameJa: '大豆・豆腐', nameEn: 'Soy & Tofu' },
  { id: 'vegetable', nameJa: '野菜', nameEn: 'Vegetables' },
  { id: 'fruit', nameJa: '果物', nameEn: 'Fruits' },
  { id: 'supplement', nameJa: 'プロテイン・サプリ', nameEn: 'Supplements' },
  { id: 'convenience', nameJa: '外食・コンビニ', nameEn: 'Convenience & Dining' },
  { id: 'seasoning', nameJa: '調味料・油', nameEn: 'Seasonings & Oils' },
] as const;

// 栄養値は100gあたり（servingSizeG=100の場合）
// 出典: 文部科学省 日本食品標準成分表（八訂）
export const FOODS: FoodDefinition[] = [
  // === 主食 (Staples) - 15品 ===
  { id: 'fd_001', nameJa: '白米（炊飯）', nameEn: 'Cooked White Rice', brand: null, category: 'staple', servingSizeG: 150, servingUnit: 'bowl', caloriesPerServing: 234, proteinG: 3.8, fatG: 0.5, carbG: 53.4, fiberG: 0.5, calciumMg: 5, ironMg: 0.2, vitaminB1Mg: 0.03, potassiumMg: 44, magnesiumMg: 11, zincMg: 0.9, saltG: 0 },
  { id: 'fd_002', nameJa: '玄米（炊飯）', nameEn: 'Cooked Brown Rice', brand: null, category: 'staple', servingSizeG: 150, servingUnit: '茶碗1杯', caloriesPerServing: 228, proteinG: 4.2, fatG: 1.5, carbG: 51.3, fiberG: 2.1, calciumMg: 11, ironMg: 0.9, vitaminB1Mg: 0.24, magnesiumMg: 74, zincMg: 1.2, potassiumMg: 150, saltG: 0 },
  { id: 'fd_003', nameJa: '食パン', nameEn: 'White Bread', brand: null, category: 'staple', servingSizeG: 60, servingUnit: 'slice', caloriesPerServing: 149, proteinG: 5.3, fatG: 2.5, carbG: 26.6, fiberG: 1.4, calciumMg: 17, ironMg: 0.4, vitaminB1Mg: 0.04, saltG: 0.8 },
  { id: 'fd_004', nameJa: 'うどん（ゆで）', nameEn: 'Boiled Udon', brand: null, category: 'staple', servingSizeG: 250, servingUnit: 'serving', caloriesPerServing: 263, proteinG: 6.5, fatG: 1.0, carbG: 54.0, fiberG: 2.0 },
  { id: 'fd_005', nameJa: 'そば（ゆで）', nameEn: 'Boiled Soba', brand: null, category: 'staple', servingSizeG: 170, servingUnit: 'serving', caloriesPerServing: 224, proteinG: 8.2, fatG: 1.7, carbG: 44.2, fiberG: 2.6 },
  { id: 'fd_006', nameJa: 'パスタ（ゆで）', nameEn: 'Boiled Pasta', brand: null, category: 'staple', servingSizeG: 250, servingUnit: 'serving', caloriesPerServing: 375, proteinG: 13.0, fatG: 2.3, carbG: 72.5, fiberG: 3.0 },
  { id: 'fd_007', nameJa: 'もち', nameEn: 'Rice Cake (Mochi)', brand: null, category: 'staple', servingSizeG: 50, servingUnit: 'piece', caloriesPerServing: 112, proteinG: 2.1, fatG: 0.3, carbG: 25.2, fiberG: 0.3 },
  { id: 'fd_008', nameJa: 'オートミール', nameEn: 'Oatmeal', brand: null, category: 'staple', servingSizeG: 40, servingUnit: '1食分', caloriesPerServing: 152, proteinG: 5.5, fatG: 2.3, carbG: 27.6, fiberG: 3.8 },
  { id: 'fd_009', nameJa: 'グラノーラ', nameEn: 'Granola', brand: null, category: 'staple', servingSizeG: 50, servingUnit: '1食分', caloriesPerServing: 223, proteinG: 4.1, fatG: 7.8, carbG: 35.5, fiberG: 2.2 },
  { id: 'fd_010', nameJa: 'ベーグル', nameEn: 'Bagel', brand: null, category: 'staple', servingSizeG: 90, servingUnit: '1個', caloriesPerServing: 234, proteinG: 8.1, fatG: 1.4, carbG: 47.7, fiberG: 1.8 },
  { id: 'fd_011', nameJa: 'ロールパン', nameEn: 'Roll Bread', brand: null, category: 'staple', servingSizeG: 30, servingUnit: '1個', caloriesPerServing: 93, proteinG: 3.0, fatG: 2.7, carbG: 14.6, fiberG: 0.6 },
  { id: 'fd_012', nameJa: 'クロワッサン', nameEn: 'Croissant', brand: null, category: 'staple', servingSizeG: 40, servingUnit: '1個', caloriesPerServing: 179, proteinG: 3.1, fatG: 10.7, carbG: 17.1, fiberG: 0.7 },
  { id: 'fd_013', nameJa: '中華麺（ゆで）', nameEn: 'Boiled Chinese Noodles', brand: null, category: 'staple', servingSizeG: 130, servingUnit: 'serving', caloriesPerServing: 195, proteinG: 6.4, fatG: 0.8, carbG: 39.0, fiberG: 1.3 },
  { id: 'fd_014', nameJa: 'さつまいも（蒸し）', nameEn: 'Steamed Sweet Potato', brand: null, category: 'staple', servingSizeG: 150, servingUnit: '1本', caloriesPerServing: 198, proteinG: 1.8, fatG: 0.3, carbG: 47.3, fiberG: 3.5 },
  { id: 'fd_015', nameJa: 'じゃがいも（蒸し）', nameEn: 'Steamed Potato', brand: null, category: 'staple', servingSizeG: 150, servingUnit: '1個', caloriesPerServing: 114, proteinG: 2.7, fatG: 0.2, carbG: 26.3, fiberG: 4.4 },

  // === 肉類 (Meat) - 15品 ===
  { id: 'fd_020', nameJa: '鶏むね肉（皮なし）', nameEn: 'Chicken Breast (Skinless)', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 108, proteinG: 22.3, fatG: 1.5, carbG: 0.0, fiberG: 0, ironMg: 0.3, vitaminB1Mg: 0.1, vitaminB2Mg: 0.11, zincMg: 0.7, cholesterolMg: 73, saturatedFatG: 0.4, potassiumMg: 350, saltG: 0.1 },
  { id: 'fd_021', nameJa: '鶏もも肉（皮なし）', nameEn: 'Chicken Thigh (Skinless)', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 116, proteinG: 18.8, fatG: 3.9, carbG: 0.0, fiberG: 0, ironMg: 0.6, vitaminB2Mg: 0.15, zincMg: 1.6, cholesterolMg: 90, saturatedFatG: 1.0, potassiumMg: 290, saltG: 0.2 },
  { id: 'fd_022', nameJa: '鶏むね肉（皮つき）', nameEn: 'Chicken Breast (Skin-on)', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 191, proteinG: 19.5, fatG: 11.6, carbG: 0.0, fiberG: 0, cholesterolMg: 79, saturatedFatG: 3.2, potassiumMg: 300, saltG: 0.1 },
  { id: 'fd_023', nameJa: '鶏ささみ', nameEn: 'Chicken Tenderloin', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 105, proteinG: 23.0, fatG: 0.8, carbG: 0.0, fiberG: 0, ironMg: 0.2, vitaminB1Mg: 0.09, zincMg: 0.6, cholesterolMg: 67, saturatedFatG: 0.2, potassiumMg: 420, saltG: 0.1 },
  { id: 'fd_024', nameJa: '豚ロース', nameEn: 'Pork Loin', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 263, proteinG: 19.3, fatG: 19.2, carbG: 0.1, fiberG: 0, vitaminB1Mg: 0.69, vitaminB2Mg: 0.15, zincMg: 1.6, cholesterolMg: 61, saturatedFatG: 7.8, potassiumMg: 310, saltG: 0.1 },
  { id: 'fd_025', nameJa: '豚ヒレ', nameEn: 'Pork Tenderloin', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 115, proteinG: 22.8, fatG: 1.9, carbG: 0.2, fiberG: 0, vitaminB1Mg: 1.32, vitaminB2Mg: 0.25, ironMg: 0.9, zincMg: 2.2, cholesterolMg: 64, saturatedFatG: 0.7, potassiumMg: 410, saltG: 0.1 },
  { id: 'fd_026', nameJa: '豚バラ', nameEn: 'Pork Belly', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 386, proteinG: 14.2, fatG: 34.6, carbG: 0.1, fiberG: 0, vitaminB1Mg: 0.54, cholesterolMg: 70, saturatedFatG: 14.6, potassiumMg: 210, saltG: 0.1 },
  { id: 'fd_027', nameJa: '牛もも肉', nameEn: 'Beef Round', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 182, proteinG: 21.2, fatG: 9.6, carbG: 0.3, fiberG: 0, ironMg: 2.7, vitaminB2Mg: 0.22, zincMg: 4.0, cholesterolMg: 65, saturatedFatG: 3.7, potassiumMg: 340, saltG: 0.1 },
  { id: 'fd_028', nameJa: '牛肩ロース', nameEn: 'Beef Chuck Roll', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 240, proteinG: 17.9, fatG: 17.4, carbG: 0.1, fiberG: 0, ironMg: 1.3, zincMg: 4.6, cholesterolMg: 72, saturatedFatG: 7.1, potassiumMg: 280, saltG: 0.1 },
  { id: 'fd_029', nameJa: '合いびき肉', nameEn: 'Ground Meat (Beef/Pork)', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 259, proteinG: 17.3, fatG: 19.7, carbG: 0.5, fiberG: 0 },
  { id: 'fd_030', nameJa: '鶏ひき肉', nameEn: 'Ground Chicken', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 166, proteinG: 20.9, fatG: 8.3, carbG: 0.0, fiberG: 0 },
  { id: 'fd_031', nameJa: 'ベーコン', nameEn: 'Bacon', brand: null, category: 'meat', servingSizeG: 17, servingUnit: 'slice', caloriesPerServing: 69, proteinG: 2.2, fatG: 6.6, carbG: 0.1, fiberG: 0 },
  { id: 'fd_032', nameJa: 'ウインナー', nameEn: 'Wiener Sausage', brand: null, category: 'meat', servingSizeG: 20, servingUnit: 'piece', caloriesPerServing: 64, proteinG: 2.4, fatG: 5.8, carbG: 0.6, fiberG: 0 },
  { id: 'fd_033', nameJa: 'ハム（ロース）', nameEn: 'Ham (Loin)', brand: null, category: 'meat', servingSizeG: 20, servingUnit: '1枚', caloriesPerServing: 39, proteinG: 3.3, fatG: 2.8, carbG: 0.3, fiberG: 0 },
  { id: 'fd_034', nameJa: '鶏レバー', nameEn: 'Chicken Liver', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 111, proteinG: 18.9, fatG: 3.1, carbG: 0.6, fiberG: 0, vitaminAUg: 14000, ironMg: 9.0, vitaminB1Mg: 0.38, vitaminB2Mg: 1.80, zincMg: 3.3, cholesterolMg: 370, potassiumMg: 330, saltG: 0.2 },

  // === 魚介類 (Fish & Seafood) - 10品 ===
  { id: 'fd_040', nameJa: '鮭（生）', nameEn: 'Salmon (Raw)', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 133, proteinG: 22.3, fatG: 4.1, carbG: 0.1, fiberG: 0, vitaminDUg: 32.0, vitaminB2Mg: 0.15, vitaminEMg: 1.2, potassiumMg: 350, cholesterolMg: 59, saturatedFatG: 0.8, saltG: 0.1 },
  { id: 'fd_041', nameJa: 'まぐろ赤身（生）', nameEn: 'Tuna Lean (Raw)', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 125, proteinG: 26.4, fatG: 1.4, carbG: 0.1, fiberG: 0, ironMg: 1.1, vitaminDUg: 5.0, zincMg: 0.4, potassiumMg: 380, cholesterolMg: 50, saturatedFatG: 0.3, saltG: 0.1 },
  { id: 'fd_042', nameJa: 'さば（生）', nameEn: 'Mackerel (Raw)', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 202, proteinG: 20.7, fatG: 12.1, carbG: 0.3, fiberG: 0, vitaminDUg: 11.0, vitaminB2Mg: 0.31, vitaminB1Mg: 0.21, ironMg: 1.2, zincMg: 1.1, cholesterolMg: 64, saturatedFatG: 3.3, potassiumMg: 320, saltG: 0.3 },
  { id: 'fd_043', nameJa: 'えび（ゆで）', nameEn: 'Boiled Shrimp', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 99, proteinG: 21.6, fatG: 0.6, carbG: 0.3, fiberG: 0 },
  { id: 'fd_044', nameJa: 'ツナ缶（水煮）', nameEn: 'Canned Tuna (Water)', brand: null, category: 'fish', servingSizeG: 70, servingUnit: '1缶', caloriesPerServing: 50, proteinG: 11.2, fatG: 0.2, carbG: 0.1, fiberG: 0 },
  { id: 'fd_045', nameJa: 'ツナ缶（油漬）', nameEn: 'Canned Tuna (Oil)', brand: null, category: 'fish', servingSizeG: 70, servingUnit: '1缶', caloriesPerServing: 186, proteinG: 12.5, fatG: 14.7, carbG: 0.1, fiberG: 0 },
  { id: 'fd_046', nameJa: 'さば缶（水煮）', nameEn: 'Canned Mackerel (Water)', brand: null, category: 'fish', servingSizeG: 190, servingUnit: '1缶', caloriesPerServing: 323, proteinG: 39.5, fatG: 17.1, carbG: 0.6, fiberG: 0 },
  { id: 'fd_047', nameJa: 'たら（生）', nameEn: 'Cod (Raw)', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 77, proteinG: 17.6, fatG: 0.2, carbG: 0.1, fiberG: 0 },
  { id: 'fd_048', nameJa: 'いか（生）', nameEn: 'Squid (Raw)', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 88, proteinG: 18.1, fatG: 1.2, carbG: 0.2, fiberG: 0 },
  { id: 'fd_049', nameJa: 'サーモン刺身', nameEn: 'Salmon Sashimi', brand: null, category: 'fish', servingSizeG: 80, servingUnit: '5切', caloriesPerServing: 142, proteinG: 16.2, fatG: 8.0, carbG: 0.1, fiberG: 0 },

  // === 卵・乳製品 (Eggs & Dairy) - 10品 ===
  { id: 'fd_050', nameJa: '卵（全卵・生）', nameEn: 'Whole Egg (Raw)', brand: null, category: 'egg_dairy', servingSizeG: 55, servingUnit: 'piece', caloriesPerServing: 83, proteinG: 6.8, fatG: 5.7, carbG: 0.2, fiberG: 0, calciumMg: 28, ironMg: 1.0, vitaminAUg: 83, vitaminB2Mg: 0.24, vitaminDUg: 1.0, zincMg: 0.7, cholesterolMg: 231, saturatedFatG: 1.7, saltG: 0.2 },
  { id: 'fd_051', nameJa: 'ゆで卵', nameEn: 'Boiled Egg', brand: null, category: 'egg_dairy', servingSizeG: 55, servingUnit: 'piece', caloriesPerServing: 83, proteinG: 7.1, fatG: 5.5, carbG: 0.2, fiberG: 0, calciumMg: 28, ironMg: 1.0, vitaminAUg: 78, vitaminDUg: 0.9, cholesterolMg: 220, saturatedFatG: 1.6, saltG: 0.2 },
  { id: 'fd_052', nameJa: '牛乳', nameEn: 'Milk', brand: null, category: 'egg_dairy', servingSizeG: 200, servingUnit: 'cup', caloriesPerServing: 134, proteinG: 6.6, fatG: 7.6, carbG: 9.6, fiberG: 0, calciumMg: 220, vitaminAUg: 76, vitaminB2Mg: 0.30, vitaminDUg: 0.6, potassiumMg: 300, saturatedFatG: 4.7, saltG: 0.2 },
  { id: 'fd_053', nameJa: '低脂肪牛乳', nameEn: 'Low-fat Milk', brand: null, category: 'egg_dairy', servingSizeG: 200, servingUnit: 'コップ1杯', caloriesPerServing: 92, proteinG: 7.6, fatG: 2.0, carbG: 11.0, fiberG: 0 },
  { id: 'fd_054', nameJa: 'プレーンヨーグルト', nameEn: 'Plain Yogurt', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'cup', caloriesPerServing: 62, proteinG: 3.6, fatG: 3.0, carbG: 4.9, fiberG: 0, calciumMg: 120, vitaminB2Mg: 0.14, potassiumMg: 170, saltG: 0.1 },
  { id: 'fd_055', nameJa: 'ギリシャヨーグルト', nameEn: 'Greek Yogurt', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 100, proteinG: 10.0, fatG: 4.0, carbG: 5.5, fiberG: 0, calciumMg: 110, potassiumMg: 160, saturatedFatG: 2.5, saltG: 0.1 },
  { id: 'fd_056', nameJa: 'プロセスチーズ', nameEn: 'Processed Cheese', brand: null, category: 'egg_dairy', servingSizeG: 20, servingUnit: '1枚', caloriesPerServing: 63, proteinG: 4.5, fatG: 5.2, carbG: 0.3, fiberG: 0 },
  { id: 'fd_057', nameJa: 'カッテージチーズ', nameEn: 'Cottage Cheese', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 105, proteinG: 13.3, fatG: 4.5, carbG: 1.9, fiberG: 0 },
  { id: 'fd_058', nameJa: 'モッツァレラチーズ', nameEn: 'Mozzarella Cheese', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 276, proteinG: 18.4, fatG: 19.9, carbG: 4.2, fiberG: 0 },
  { id: 'fd_059', nameJa: 'バター', nameEn: 'Butter', brand: null, category: 'egg_dairy', servingSizeG: 10, servingUnit: '大さじ約1', caloriesPerServing: 75, proteinG: 0.1, fatG: 8.1, carbG: 0.0, fiberG: 0 },

  // === 大豆・豆腐 (Soy & Tofu) - 8品 ===
  { id: 'fd_060', nameJa: '木綿豆腐', nameEn: 'Firm Tofu', brand: null, category: 'soy', servingSizeG: 300, servingUnit: 'pack', caloriesPerServing: 216, proteinG: 21.0, fatG: 12.6, carbG: 4.8, fiberG: 1.2, calciumMg: 360, ironMg: 2.7, magnesiumMg: 99, potassiumMg: 420, zincMg: 1.8, saltG: 0 },
  { id: 'fd_061', nameJa: '絹ごし豆腐', nameEn: 'Silken Tofu', brand: null, category: 'soy', servingSizeG: 300, servingUnit: 'pack', caloriesPerServing: 168, proteinG: 14.8, fatG: 9.0, carbG: 6.0, fiberG: 1.0, calciumMg: 258, ironMg: 2.4, magnesiumMg: 132, potassiumMg: 450, saltG: 0 },
  { id: 'fd_062', nameJa: '納豆', nameEn: 'Natto', brand: null, category: 'soy', servingSizeG: 45, servingUnit: 'pack', caloriesPerServing: 90, proteinG: 7.4, fatG: 4.5, carbG: 5.4, fiberG: 3.0, calciumMg: 41, ironMg: 1.5, vitaminB2Mg: 0.07, magnesiumMg: 45, potassiumMg: 300, zincMg: 0.9, saltG: 0 },
  { id: 'fd_063', nameJa: '豆乳（無調整）', nameEn: 'Soy Milk (Unsweetened)', brand: null, category: 'soy', servingSizeG: 200, servingUnit: 'コップ1杯', caloriesPerServing: 92, proteinG: 7.2, fatG: 4.0, carbG: 6.2, fiberG: 0.4 },
  { id: 'fd_064', nameJa: '枝豆（ゆで）', nameEn: 'Boiled Edamame', brand: null, category: 'soy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 134, proteinG: 11.7, fatG: 6.2, carbG: 8.8, fiberG: 5.0 },
  { id: 'fd_065', nameJa: '厚揚げ', nameEn: 'Deep-fried Tofu', brand: null, category: 'soy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 150, proteinG: 10.7, fatG: 11.3, carbG: 0.9, fiberG: 0.7 },
  { id: 'fd_066', nameJa: '油揚げ', nameEn: 'Thin Fried Tofu', brand: null, category: 'soy', servingSizeG: 30, servingUnit: '1枚', caloriesPerServing: 116, proteinG: 5.6, fatG: 10.2, carbG: 0.1, fiberG: 0.2 },
  { id: 'fd_067', nameJa: 'きな粉', nameEn: 'Kinako (Soybean Flour)', brand: null, category: 'soy', servingSizeG: 10, servingUnit: '大さじ1', caloriesPerServing: 44, proteinG: 3.6, fatG: 2.3, carbG: 3.1, fiberG: 1.7 },

  // === 野菜 (Vegetables) - 12品 ===
  { id: 'fd_070', nameJa: 'ブロッコリー（ゆで）', nameEn: 'Boiled Broccoli', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 27, proteinG: 3.5, fatG: 0.4, carbG: 4.3, fiberG: 3.7, vitaminCMg: 54, vitaminAUg: 67, calciumMg: 33, ironMg: 0.7, potassiumMg: 180, vitaminEMg: 2.4, saltG: 0 },
  { id: 'fd_071', nameJa: 'ほうれん草（ゆで）', nameEn: 'Boiled Spinach', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 25, proteinG: 2.6, fatG: 0.5, carbG: 3.6, fiberG: 3.6, vitaminAUg: 450, ironMg: 0.9, calciumMg: 69, vitaminCMg: 19, potassiumMg: 490, magnesiumMg: 40, vitaminEMg: 2.1, saltG: 0 },
  { id: 'fd_072', nameJa: 'キャベツ（生）', nameEn: 'Raw Cabbage', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 23, proteinG: 1.3, fatG: 0.2, carbG: 5.2, fiberG: 1.8 },
  { id: 'fd_073', nameJa: 'トマト', nameEn: 'Tomato', brand: null, category: 'vegetable', servingSizeG: 150, servingUnit: '1個', caloriesPerServing: 29, proteinG: 1.1, fatG: 0.2, carbG: 7.1, fiberG: 1.5 },
  { id: 'fd_074', nameJa: 'きゅうり', nameEn: 'Cucumber', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: '1本', caloriesPerServing: 14, proteinG: 1.0, fatG: 0.1, carbG: 3.0, fiberG: 1.1 },
  { id: 'fd_075', nameJa: 'にんじん', nameEn: 'Carrot', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 39, proteinG: 0.7, fatG: 0.2, carbG: 9.3, fiberG: 2.8 },
  { id: 'fd_076', nameJa: '玉ねぎ', nameEn: 'Onion', brand: null, category: 'vegetable', servingSizeG: 200, servingUnit: '1個', caloriesPerServing: 74, proteinG: 2.0, fatG: 0.2, carbG: 17.6, fiberG: 3.2 },
  { id: 'fd_077', nameJa: 'アボカド', nameEn: 'Avocado', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: '1/2個', caloriesPerServing: 187, proteinG: 2.5, fatG: 18.7, carbG: 6.2, fiberG: 5.3, potassiumMg: 720, vitaminEMg: 3.3, vitaminB1Mg: 0.10, magnesiumMg: 33, ironMg: 0.7, saltG: 0 },
  { id: 'fd_078', nameJa: 'レタス', nameEn: 'Lettuce', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 12, proteinG: 0.6, fatG: 0.1, carbG: 2.8, fiberG: 1.1 },
  { id: 'fd_079', nameJa: 'もやし', nameEn: 'Bean Sprouts', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 14, proteinG: 1.7, fatG: 0.1, carbG: 2.6, fiberG: 1.3 },
  { id: 'fd_080', nameJa: 'ピーマン', nameEn: 'Green Pepper', brand: null, category: 'vegetable', servingSizeG: 30, servingUnit: '1個', caloriesPerServing: 7, proteinG: 0.3, fatG: 0.1, carbG: 1.6, fiberG: 0.7 },
  { id: 'fd_081', nameJa: 'かぼちゃ（ゆで）', nameEn: 'Boiled Pumpkin', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 93, proteinG: 1.6, fatG: 0.3, carbG: 21.3, fiberG: 3.6 },

  // === 果物 (Fruits) - 8品 ===
  { id: 'fd_085', nameJa: 'バナナ', nameEn: 'Banana', brand: null, category: 'fruit', servingSizeG: 120, servingUnit: '1本', caloriesPerServing: 103, proteinG: 1.3, fatG: 0.2, carbG: 27.1, fiberG: 1.3, potassiumMg: 432, magnesiumMg: 38, vitaminB1Mg: 0.06, vitaminCMg: 19, sugarG: 25.2, saltG: 0 },
  { id: 'fd_086', nameJa: 'りんご', nameEn: 'Apple', brand: null, category: 'fruit', servingSizeG: 250, servingUnit: '1個', caloriesPerServing: 145, proteinG: 0.5, fatG: 0.8, carbG: 38.8, fiberG: 3.8 },
  { id: 'fd_087', nameJa: 'みかん', nameEn: 'Mandarin Orange', brand: null, category: 'fruit', servingSizeG: 80, servingUnit: '1個', caloriesPerServing: 37, proteinG: 0.6, fatG: 0.1, carbG: 9.2, fiberG: 0.8 },
  { id: 'fd_088', nameJa: 'いちご', nameEn: 'Strawberry', brand: null, category: 'fruit', servingSizeG: 100, servingUnit: '5個', caloriesPerServing: 34, proteinG: 0.9, fatG: 0.1, carbG: 8.5, fiberG: 1.4 },
  { id: 'fd_089', nameJa: 'キウイ', nameEn: 'Kiwi', brand: null, category: 'fruit', servingSizeG: 100, servingUnit: '1個', caloriesPerServing: 53, proteinG: 1.0, fatG: 0.1, carbG: 13.5, fiberG: 2.5 },
  { id: 'fd_090', nameJa: 'ぶどう', nameEn: 'Grapes', brand: null, category: 'fruit', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 59, proteinG: 0.4, fatG: 0.1, carbG: 15.7, fiberG: 0.5 },
  { id: 'fd_091', nameJa: 'もも', nameEn: 'Peach', brand: null, category: 'fruit', servingSizeG: 200, servingUnit: '1個', caloriesPerServing: 80, proteinG: 1.2, fatG: 0.2, carbG: 20.2, fiberG: 2.6 },
  { id: 'fd_092', nameJa: 'グレープフルーツ', nameEn: 'Grapefruit', brand: null, category: 'fruit', servingSizeG: 200, servingUnit: '1/2個', caloriesPerServing: 76, proteinG: 1.8, fatG: 0.2, carbG: 19.2, fiberG: 1.2 },

  // === プロテイン・サプリ (Supplements) - 5品 ===
  { id: 'fd_095', nameJa: 'ホエイプロテイン', nameEn: 'Whey Protein', brand: null, category: 'supplement', servingSizeG: 30, servingUnit: 'scoop', caloriesPerServing: 118, proteinG: 24.0, fatG: 1.5, carbG: 2.5, fiberG: 0 },
  { id: 'fd_096', nameJa: 'カゼインプロテイン', nameEn: 'Casein Protein', brand: null, category: 'supplement', servingSizeG: 30, servingUnit: 'scoop', caloriesPerServing: 115, proteinG: 23.0, fatG: 1.0, carbG: 3.5, fiberG: 0 },
  { id: 'fd_097', nameJa: 'ソイプロテイン', nameEn: 'Soy Protein', brand: null, category: 'supplement', servingSizeG: 30, servingUnit: 'scoop', caloriesPerServing: 112, proteinG: 22.0, fatG: 1.2, carbG: 3.0, fiberG: 0.5 },
  { id: 'fd_098', nameJa: 'プロテインバー', nameEn: 'Protein Bar', brand: null, category: 'supplement', servingSizeG: 60, servingUnit: '1本', caloriesPerServing: 216, proteinG: 15.0, fatG: 8.0, carbG: 22.0, fiberG: 2.0 },
  { id: 'fd_099', nameJa: 'BCAA', nameEn: 'BCAA', brand: null, category: 'supplement', servingSizeG: 10, servingUnit: '1回分', caloriesPerServing: 30, proteinG: 7.0, fatG: 0.0, carbG: 0.5, fiberG: 0 },

  // === 外食・コンビニ (Convenience & Dining) - 12品 ===
  { id: 'fd_100', nameJa: 'おにぎり（鮭）', nameEn: 'Rice Ball (Salmon)', brand: null, category: 'convenience', servingSizeG: 110, servingUnit: 'piece', caloriesPerServing: 177, proteinG: 5.2, fatG: 1.3, carbG: 37.5, fiberG: 0.3 },
  { id: 'fd_101', nameJa: 'おにぎり（梅）', nameEn: 'Rice Ball (Plum)', brand: null, category: 'convenience', servingSizeG: 110, servingUnit: 'piece', caloriesPerServing: 170, proteinG: 3.5, fatG: 0.8, carbG: 38.0, fiberG: 0.3 },
  { id: 'fd_102', nameJa: 'サラダチキン', nameEn: 'Salad Chicken', brand: null, category: 'convenience', servingSizeG: 115, servingUnit: 'piece', caloriesPerServing: 119, proteinG: 25.3, fatG: 1.4, carbG: 1.0, fiberG: 0 },
  { id: 'fd_103', nameJa: 'コンビニゆで卵', nameEn: 'Convenience Store Boiled Egg', brand: null, category: 'convenience', servingSizeG: 60, servingUnit: '1個', caloriesPerServing: 76, proteinG: 6.5, fatG: 5.0, carbG: 0.6, fiberG: 0 },
  { id: 'fd_104', nameJa: '幕の内弁当', nameEn: 'Makunouchi Bento', brand: null, category: 'convenience', servingSizeG: 400, servingUnit: '1食', caloriesPerServing: 680, proteinG: 22.0, fatG: 18.0, carbG: 105.0, fiberG: 3.0 },
  { id: 'fd_105', nameJa: 'カレーライス', nameEn: 'Curry Rice', brand: null, category: 'convenience', servingSizeG: 500, servingUnit: '1食', caloriesPerServing: 750, proteinG: 18.0, fatG: 22.0, carbG: 115.0, fiberG: 4.0 },
  { id: 'fd_106', nameJa: '牛丼（並）', nameEn: 'Gyudon (Regular)', brand: null, category: 'convenience', servingSizeG: 400, servingUnit: '1食', caloriesPerServing: 656, proteinG: 20.0, fatG: 18.5, carbG: 100.0, fiberG: 2.0 },
  { id: 'fd_107', nameJa: 'コンビニサンドイッチ', nameEn: 'Convenience Sandwich', brand: null, category: 'convenience', servingSizeG: 120, servingUnit: '1パック', caloriesPerServing: 290, proteinG: 9.0, fatG: 13.0, carbG: 34.0, fiberG: 1.5 },
  { id: 'fd_108', nameJa: 'ザバスミルクプロテイン', nameEn: 'SAVAS Milk Protein', brand: 'SAVAS', category: 'convenience', servingSizeG: 430, servingUnit: '1本', caloriesPerServing: 102, proteinG: 15.0, fatG: 0.0, carbG: 10.0, fiberG: 0 },
  { id: 'fd_109', nameJa: 'カップヌードル', nameEn: 'Cup Noodle', brand: null, category: 'convenience', servingSizeG: 78, servingUnit: '1個', caloriesPerServing: 351, proteinG: 10.5, fatG: 14.6, carbG: 44.5, fiberG: 2.0 },
  { id: 'fd_110', nameJa: '鶏そぼろ弁当', nameEn: 'Chicken Soboro Bento', brand: null, category: 'convenience', servingSizeG: 380, servingUnit: '1食', caloriesPerServing: 590, proteinG: 24.0, fatG: 12.0, carbG: 98.0, fiberG: 2.5 },
  { id: 'fd_111', nameJa: '肉まん', nameEn: 'Nikuman (Meat Bun)', brand: null, category: 'convenience', servingSizeG: 100, servingUnit: '1個', caloriesPerServing: 230, proteinG: 8.0, fatG: 7.5, carbG: 32.0, fiberG: 1.0 },

  // === 調味料・油 (Seasonings & Oils) - 5品 ===
  { id: 'fd_115', nameJa: 'オリーブオイル', nameEn: 'Olive Oil', brand: null, category: 'seasoning', servingSizeG: 13, servingUnit: '大さじ1', caloriesPerServing: 120, proteinG: 0.0, fatG: 13.0, carbG: 0.0, fiberG: 0 },
  { id: 'fd_116', nameJa: 'ごま油', nameEn: 'Sesame Oil', brand: null, category: 'seasoning', servingSizeG: 13, servingUnit: '大さじ1', caloriesPerServing: 120, proteinG: 0.0, fatG: 13.0, carbG: 0.0, fiberG: 0 },
  { id: 'fd_117', nameJa: 'マヨネーズ', nameEn: 'Mayonnaise', brand: null, category: 'seasoning', servingSizeG: 15, servingUnit: '大さじ1', caloriesPerServing: 100, proteinG: 0.3, fatG: 11.2, carbG: 0.1, fiberG: 0 },
  { id: 'fd_118', nameJa: '醤油', nameEn: 'Soy Sauce', brand: null, category: 'seasoning', servingSizeG: 18, servingUnit: '大さじ1', caloriesPerServing: 13, proteinG: 1.4, fatG: 0.0, carbG: 1.8, fiberG: 0 },
  { id: 'fd_119', nameJa: 'みりん', nameEn: 'Mirin', brand: null, category: 'seasoning', servingSizeG: 18, servingUnit: '大さじ1', caloriesPerServing: 43, proteinG: 0.1, fatG: 0.0, carbG: 7.8, fiberG: 0 },

  // === AI マッチ率向上用 追加食材（100gあたり / 八訂準拠） ===

  // --- 調味料・ソース類 ---
  { id: 'fd_200', nameJa: 'ケチャップ', nameEn: 'Ketchup', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 100, proteinG: 1.6, fatG: 0.1, carbG: 26.6, fiberG: 1.8 },
  { id: 'fd_201', nameJa: 'デミグラスソース', nameEn: 'Demi-glace Sauce', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 82, proteinG: 2.8, fatG: 3.4, carbG: 10.1, fiberG: 0.6 },
  { id: 'fd_202', nameJa: 'オイスターソース', nameEn: 'Oyster Sauce', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 107, proteinG: 6.4, fatG: 0.3, carbG: 18.9, fiberG: 0.2 },
  { id: 'fd_203', nameJa: '豆板醤', nameEn: 'Doubanjiang', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 60, proteinG: 2.0, fatG: 3.2, carbG: 5.5, fiberG: 3.2 },
  { id: 'fd_204', nameJa: '甜面醤', nameEn: 'Tianmianjiang', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 256, proteinG: 5.6, fatG: 3.4, carbG: 50.4, fiberG: 2.5 },
  { id: 'fd_205', nameJa: 'コチュジャン', nameEn: 'Gochujang', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 256, proteinG: 5.1, fatG: 2.3, carbG: 53.3, fiberG: 5.4 },
  { id: 'fd_206', nameJa: '料理酒', nameEn: 'Cooking Sake', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 109, proteinG: 0.2, fatG: 0, carbG: 4.9, fiberG: 0 },
  { id: 'fd_207', nameJa: '酢', nameEn: 'Vinegar', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 25, proteinG: 0.1, fatG: 0, carbG: 2.4, fiberG: 0 },
  { id: 'fd_208', nameJa: 'だし汁', nameEn: 'Dashi Stock', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 3, proteinG: 0.5, fatG: 0, carbG: 0.3, fiberG: 0 },
  { id: 'fd_209', nameJa: '鶏がらスープ', nameEn: 'Chicken Stock', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 5, proteinG: 0.6, fatG: 0.1, carbG: 0.3, fiberG: 0 },
  { id: 'fd_210', nameJa: 'コンソメ', nameEn: 'Consomme', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 12, proteinG: 1.1, fatG: 0.2, carbG: 1.5, fiberG: 0 },
  { id: 'fd_211', nameJa: 'ソース（中濃）', nameEn: 'Worcester Sauce (Medium)', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 132, proteinG: 0.8, fatG: 0.1, carbG: 30.9, fiberG: 0.5 },
  { id: 'fd_212', nameJa: 'ラー油', nameEn: 'Chili Oil', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 919, proteinG: 0, fatG: 99.8, carbG: 0, fiberG: 0 },
  { id: 'fd_213', nameJa: 'サラダ油', nameEn: 'Salad Oil', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 921, proteinG: 0, fatG: 100, carbG: 0, fiberG: 0 },
  { id: 'fd_214', nameJa: '味噌', nameEn: 'Miso', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 192, proteinG: 12.5, fatG: 6.0, carbG: 17.0, fiberG: 4.9 },
  { id: 'fd_215', nameJa: '塩', nameEn: 'Salt', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0 },
  { id: 'fd_216', nameJa: '砂糖', nameEn: 'Sugar', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 384, proteinG: 0, fatG: 0, carbG: 99.2, fiberG: 0 },
  { id: 'fd_217', nameJa: '小麦粉', nameEn: 'Wheat Flour', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 349, proteinG: 8.3, fatG: 1.5, carbG: 75.8, fiberG: 2.5 },

  // --- 加工肉 ---
  { id: 'fd_220', nameJa: 'チャーシュー', nameEn: 'Chashu Pork', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 172, proteinG: 19.4, fatG: 8.2, carbG: 5.1, fiberG: 0 },
  { id: 'fd_221', nameJa: 'カニカマ', nameEn: 'Crab Stick (Surimi)', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 90, proteinG: 12.1, fatG: 0.5, carbG: 9.2, fiberG: 0 },

  // --- 野菜（不足分） ---
  { id: 'fd_230', nameJa: 'ニラ', nameEn: 'Chinese Chives', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 21, proteinG: 1.7, fatG: 0.3, carbG: 4.0, fiberG: 2.7 },
  { id: 'fd_231', nameJa: '長ねぎ', nameEn: 'Japanese Leek', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 28, proteinG: 0.5, fatG: 0.1, carbG: 7.2, fiberG: 2.2 },
  { id: 'fd_232', nameJa: 'たけのこ', nameEn: 'Bamboo Shoot', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 26, proteinG: 3.6, fatG: 0.2, carbG: 4.3, fiberG: 2.8 },
  { id: 'fd_233', nameJa: 'チンゲン菜', nameEn: 'Bok Choy', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 9, proteinG: 0.6, fatG: 0.1, carbG: 2.0, fiberG: 1.2 },
  { id: 'fd_234', nameJa: '大根', nameEn: 'Daikon Radish', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 18, proteinG: 0.5, fatG: 0.1, carbG: 4.1, fiberG: 1.4 },
  { id: 'fd_235', nameJa: 'グリンピース', nameEn: 'Green Peas', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 93, proteinG: 6.9, fatG: 0.4, carbG: 15.3, fiberG: 7.7 },

  // --- 粉類・その他 ---
  { id: 'fd_240', nameJa: '片栗粉', nameEn: 'Potato Starch', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 330, proteinG: 0.1, fatG: 0.1, carbG: 81.6, fiberG: 0 },
  { id: 'fd_241', nameJa: 'パン粉', nameEn: 'Panko Breadcrumbs', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 373, proteinG: 14.6, fatG: 6.8, carbG: 63.4, fiberG: 2.3 },
  { id: 'fd_242', nameJa: '天かす', nameEn: 'Tempura Flakes', brand: null, category: 'seasoning', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 564, proteinG: 4.9, fatG: 38.8, carbG: 49.8, fiberG: 1.0 },
  { id: 'fd_243', nameJa: '生クリーム', nameEn: 'Heavy Cream', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 433, proteinG: 2.0, fatG: 45.0, carbG: 3.1, fiberG: 0 },
  { id: 'fd_244', nameJa: '粉チーズ', nameEn: 'Grated Parmesan', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 475, proteinG: 44.0, fatG: 30.8, carbG: 1.9, fiberG: 0 },
  { id: 'fd_245', nameJa: 'わかめ（乾燥）', nameEn: 'Dried Wakame', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 138, proteinG: 13.6, fatG: 1.6, carbG: 41.3, fiberG: 32.7 },
  { id: 'fd_246', nameJa: 'のり', nameEn: 'Nori Seaweed', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 188, proteinG: 41.4, fatG: 3.7, carbG: 44.3, fiberG: 36.0 },
  { id: 'fd_247', nameJa: 'かつお節', nameEn: 'Bonito Flakes', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 356, proteinG: 77.1, fatG: 2.9, carbG: 0.8, fiberG: 0 },

  // --- 豚ひき肉（プロンプトの材料名対応） ---
  { id: 'fd_248', nameJa: '豚ひき肉', nameEn: 'Ground Pork', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 221, proteinG: 18.6, fatG: 15.1, carbG: 0, fiberG: 0 },
  { id: 'fd_249', nameJa: '豚バラ肉', nameEn: 'Pork Belly', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 386, proteinG: 14.2, fatG: 34.6, carbG: 0.1, fiberG: 0 },
  { id: 'fd_250', nameJa: '海老', nameEn: 'Shrimp', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 97, proteinG: 21.6, fatG: 0.6, carbG: 0.1, fiberG: 0 },
  { id: 'fd_251', nameJa: 'チーズ', nameEn: 'Cheese (Process)', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 339, proteinG: 22.7, fatG: 26.0, carbG: 1.3, fiberG: 0 },
  { id: 'fd_252', nameJa: 'スパゲティ', nameEn: 'Spaghetti (Boiled)', brand: null, category: 'staple', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 150, proteinG: 5.2, fatG: 0.9, carbG: 29.0, fiberG: 1.2 },
  { id: 'fd_253', nameJa: '白米', nameEn: 'Cooked Rice', brand: null, category: 'staple', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 156, proteinG: 2.5, fatG: 0.3, carbG: 35.6, fiberG: 0.3 },
  { id: 'fd_254', nameJa: 'ご飯', nameEn: 'Cooked Rice', brand: null, category: 'staple', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 156, proteinG: 2.5, fatG: 0.3, carbG: 35.6, fiberG: 0.3 },
  { id: 'fd_255', nameJa: '卵', nameEn: 'Egg', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 151, proteinG: 12.3, fatG: 10.3, carbG: 0.3, fiberG: 0 },
  { id: 'fd_256', nameJa: 'ほうれん草', nameEn: 'Spinach', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 20, proteinG: 2.2, fatG: 0.4, carbG: 3.1, fiberG: 2.8 },
  { id: 'fd_257', nameJa: 'ブロッコリー', nameEn: 'Broccoli', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 33, proteinG: 4.3, fatG: 0.5, carbG: 5.2, fiberG: 4.4 },
  { id: 'fd_258', nameJa: 'キャベツ', nameEn: 'Cabbage', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 23, proteinG: 1.3, fatG: 0.2, carbG: 5.2, fiberG: 1.8 },
  { id: 'fd_259', nameJa: 'じゃがいも', nameEn: 'Potato', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 76, proteinG: 1.8, fatG: 0.1, carbG: 17.6, fiberG: 2.9 },
  { id: 'fd_260', nameJa: 'にんじん', nameEn: 'Carrot', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 39, proteinG: 0.7, fatG: 0.1, carbG: 9.3, fiberG: 2.8 },
  { id: 'fd_261', nameJa: '鶏もも肉', nameEn: 'Chicken Thigh', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 200, proteinG: 16.2, fatG: 14.0, carbG: 0, fiberG: 0 },
  { id: 'fd_262', nameJa: '鶏むね肉', nameEn: 'Chicken Breast', brand: null, category: 'meat', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 108, proteinG: 22.3, fatG: 1.5, carbG: 0, fiberG: 0 },
  { id: 'fd_263', nameJa: '鮭', nameEn: 'Salmon', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 133, proteinG: 22.3, fatG: 4.1, carbG: 0.1, fiberG: 0 },
  { id: 'fd_264', nameJa: 'まぐろ', nameEn: 'Tuna', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 125, proteinG: 26.4, fatG: 1.4, carbG: 0.1, fiberG: 0 },
  { id: 'fd_265', nameJa: 'さば', nameEn: 'Mackerel', brand: null, category: 'fish', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 202, proteinG: 20.7, fatG: 12.1, carbG: 0.3, fiberG: 0 },
  { id: 'fd_266', nameJa: '玉ねぎ', nameEn: 'Onion', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 37, proteinG: 1.0, fatG: 0.1, carbG: 8.8, fiberG: 1.6 },
  { id: 'fd_267', nameJa: 'トマト', nameEn: 'Tomato', brand: null, category: 'vegetable', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 19, proteinG: 0.7, fatG: 0.1, carbG: 4.7, fiberG: 1.0 },
  { id: 'fd_268', nameJa: '牛乳', nameEn: 'Milk', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 67, proteinG: 3.3, fatG: 3.8, carbG: 4.8, fiberG: 0 },
  { id: 'fd_269', nameJa: 'バター', nameEn: 'Butter', brand: null, category: 'egg_dairy', servingSizeG: 100, servingUnit: 'g', caloriesPerServing: 745, proteinG: 0.6, fatG: 81.0, carbG: 0.2, fiberG: 0 },
];
