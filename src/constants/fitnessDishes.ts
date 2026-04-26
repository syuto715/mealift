import type { DishCategory } from '../types/dish';

// 50 fitness-oriented recipes, all 一般名 (no brand references). These are
// inserted into `dishes` with id = 'fitness_*' so the seed pass can gate on
// `WHERE id LIKE 'fitness_%'` independently of the older legacy DISHES seed.
//
// Each ingredient references a canonical food row by id (fd_* from the
// hand-curated FOODS constant, gen_* from manual_seed generic foods,
// or mext_* from MEXT 八訂 imports). seedFitnessDishes resolves these at
// boot time and runs the recipe calculator — so per-ingredient + total
// nutrition stays grounded in 八訂 figures rather than being hand-entered
// (and drifting away from the source over time).

export interface FitnessDishIngredient {
  foodId: string;
  amountG: number;
}

export interface FitnessDishDef {
  id: string;
  nameJa: string;
  nameEn: string | null;
  category: DishCategory;
  servingDescription: string;
  ingredients: FitnessDishIngredient[];
}

export const FITNESS_DISHES: FitnessDishDef[] = [
  // === 鶏むね料理 (8品) ================================================
  {
    id: 'fitness_001',
    nameJa: '鶏むねの塩こしょう焼き',
    nameEn: 'Salt-pepper Grilled Chicken Breast',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 200 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_002',
    nameJa: '鶏むね蒸し',
    nameEn: 'Steamed Chicken Breast',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 200 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_003',
    nameJa: '鶏むねの照り焼き',
    nameEn: 'Teriyaki Chicken Breast',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 200 },
      { foodId: 'fd_118', amountG: 18 },
      { foodId: 'fd_119', amountG: 18 },
      { foodId: 'fd_216', amountG: 5 },
    ],
  },
  {
    id: 'fitness_004',
    nameJa: '鶏むね肉のグリル ブロッコリー添え',
    nameEn: 'Grilled Chicken Breast with Broccoli',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 200 },
      { foodId: 'fd_070', amountG: 100 },
      { foodId: 'fd_115', amountG: 5 },
    ],
  },
  {
    id: 'fitness_005',
    nameJa: '鶏むね肉とほうれん草炒め',
    nameEn: 'Stir-fried Chicken Breast and Spinach',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 150 },
      { foodId: 'fd_071', amountG: 80 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_118', amountG: 9 },
    ],
  },
  {
    id: 'fitness_006',
    nameJa: '鶏むね肉のサラダ仕立て',
    nameEn: 'Chicken Breast Salad',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 150 },
      { foodId: 'fd_072', amountG: 50 },
      { foodId: 'fd_117', amountG: 8 },
    ],
  },
  {
    id: 'fitness_007',
    nameJa: '鶏むね肉のレモンマリネ',
    nameEn: 'Lemon Marinated Chicken Breast',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 200 },
      { foodId: 'fd_115', amountG: 8 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_008',
    nameJa: 'ささみと鶏むね肉のミックスステーキ',
    nameEn: 'Tenderloin & Breast Mixed Steak',
    category: 'other',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 100 },
      { foodId: 'fd_023', amountG: 100 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },

  // === 鶏もも料理 (4品) ================================================
  {
    id: 'fitness_009',
    nameJa: '鶏もも肉のグリル',
    nameEn: 'Grilled Chicken Thigh',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_021', amountG: 150 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_010',
    nameJa: '鶏もも肉の生姜焼き風',
    nameEn: 'Ginger Chicken Thigh',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_021', amountG: 150 },
      { foodId: 'fd_118', amountG: 18 },
      { foodId: 'fd_119', amountG: 18 },
      { foodId: 'fd_115', amountG: 5 },
    ],
  },
  {
    id: 'fitness_011',
    nameJa: '鶏ひき肉のそぼろ',
    nameEn: 'Soboro Ground Chicken',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_030', amountG: 150 },
      { foodId: 'fd_118', amountG: 18 },
      { foodId: 'fd_119', amountG: 18 },
      { foodId: 'fd_216', amountG: 5 },
    ],
  },
  {
    id: 'fitness_012',
    nameJa: '鶏もも肉のカレー風味焼き',
    nameEn: 'Curry-flavored Chicken Thigh',
    category: 'other',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_021', amountG: 150 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },

  // === 魚料理 (6品) ====================================================
  {
    id: 'fitness_013',
    nameJa: '鮭の塩焼き',
    nameEn: 'Salt-grilled Salmon',
    category: 'japanese',
    servingDescription: '1切',
    ingredients: [
      { foodId: 'fd_040', amountG: 100 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_014',
    nameJa: 'まぐろ赤身の刺身定食',
    nameEn: 'Tuna Sashimi Set',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_041', amountG: 80 },
      { foodId: 'fd_001', amountG: 150 },
      { foodId: 'fd_118', amountG: 9 },
    ],
  },
  {
    id: 'fitness_015',
    nameJa: 'さばの味噌煮風',
    nameEn: 'Miso-style Mackerel',
    category: 'japanese',
    servingDescription: '1切',
    ingredients: [
      { foodId: 'fd_042', amountG: 100 },
      { foodId: 'fd_119', amountG: 9 },
      { foodId: 'fd_216', amountG: 5 },
    ],
  },
  {
    id: 'fitness_016',
    nameJa: 'ツナ缶サラダ',
    nameEn: 'Canned Tuna Salad',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_044', amountG: 70 },
      { foodId: 'fd_072', amountG: 60 },
      { foodId: 'fd_117', amountG: 8 },
    ],
  },
  {
    id: 'fitness_017',
    nameJa: 'さば缶のトマト和え',
    nameEn: 'Canned Mackerel with Tomato',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_046', amountG: 95 },
      { foodId: 'fd_200', amountG: 30 },
    ],
  },
  {
    id: 'fitness_018',
    nameJa: 'サーモン刺身ボウル',
    nameEn: 'Salmon Sashimi Bowl',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_049', amountG: 80 },
      { foodId: 'fd_001', amountG: 150 },
      { foodId: 'fd_118', amountG: 9 },
    ],
  },

  // === 卵料理 (5品) ====================================================
  {
    id: 'fitness_019',
    nameJa: 'ゆで卵2個',
    nameEn: 'Two Boiled Eggs',
    category: 'other',
    servingDescription: '2個',
    ingredients: [
      { foodId: 'fd_051', amountG: 110 },
    ],
  },
  {
    id: 'fitness_020',
    nameJa: 'プレーンオムレツ',
    nameEn: 'Plain Omelette',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_050', amountG: 110 },
      { foodId: 'fd_059', amountG: 5 },
      { foodId: 'fd_215', amountG: 0.5 },
    ],
  },
  {
    id: 'fitness_021',
    nameJa: '卵かけご飯',
    nameEn: 'Tamago Kake Gohan',
    category: 'japanese',
    servingDescription: '1膳',
    ingredients: [
      { foodId: 'fd_001', amountG: 150 },
      { foodId: 'fd_050', amountG: 55 },
      { foodId: 'fd_118', amountG: 5 },
    ],
  },
  {
    id: 'fitness_022',
    nameJa: 'ほうれん草と卵の炒め物',
    nameEn: 'Stir-fried Spinach and Egg',
    category: 'chinese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_050', amountG: 110 },
      { foodId: 'fd_071', amountG: 60 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_215', amountG: 0.5 },
    ],
  },
  {
    id: 'fitness_023',
    nameJa: 'だし巻き卵',
    nameEn: 'Dashimaki Tamago',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_050', amountG: 110 },
      { foodId: 'fd_119', amountG: 9 },
      { foodId: 'fd_118', amountG: 5 },
    ],
  },

  // === 牛肉料理 (3品) ==================================================
  {
    id: 'fitness_024',
    nameJa: '牛もも肉のステーキ',
    nameEn: 'Beef Round Steak',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_027', amountG: 150 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_025',
    nameJa: '牛肉野菜炒め',
    nameEn: 'Beef and Vegetable Stir-fry',
    category: 'chinese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_027', amountG: 100 },
      { foodId: 'fd_072', amountG: 80 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_118', amountG: 9 },
    ],
  },
  {
    id: 'fitness_026',
    nameJa: '合いびき肉のハンバーグ',
    nameEn: 'Mixed Meat Hamburg Steak',
    category: 'western',
    servingDescription: '1個',
    ingredients: [
      { foodId: 'fd_029', amountG: 150 },
      { foodId: 'fd_241', amountG: 10 },
      { foodId: 'fd_050', amountG: 27 },
      { foodId: 'fd_215', amountG: 1 },
      { foodId: 'fd_201', amountG: 30 },
    ],
  },

  // === 豚肉料理 (4品) ==================================================
  {
    id: 'fitness_027',
    nameJa: '豚ヒレのソテー',
    nameEn: 'Pork Tenderloin Sauté',
    category: 'western',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_025', amountG: 150 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_028',
    nameJa: '豚ロースの生姜焼き',
    nameEn: 'Pork Loin Ginger Yaki',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_024', amountG: 150 },
      { foodId: 'fd_118', amountG: 18 },
      { foodId: 'fd_119', amountG: 18 },
    ],
  },
  {
    id: 'fitness_029',
    nameJa: '豚ヒレの蒸し焼き ブロッコリー添え',
    nameEn: 'Steamed Pork Tenderloin with Broccoli',
    category: 'other',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_025', amountG: 150 },
      { foodId: 'fd_070', amountG: 100 },
    ],
  },
  {
    id: 'fitness_030',
    nameJa: '豚ロースとキャベツの炒め物',
    nameEn: 'Stir-fried Pork Loin and Cabbage',
    category: 'chinese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_024', amountG: 120 },
      { foodId: 'fd_072', amountG: 80 },
      { foodId: 'fd_115', amountG: 5 },
      { foodId: 'fd_118', amountG: 9 },
    ],
  },

  // === オートミール料理 (5品) ==========================================
  {
    id: 'fitness_031',
    nameJa: 'オートミール プレーン',
    nameEn: 'Plain Oatmeal',
    category: 'western',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_008', amountG: 40 },
      { foodId: 'fd_052', amountG: 200 },
    ],
  },
  {
    id: 'fitness_032',
    nameJa: 'オートミール バナナ',
    nameEn: 'Oatmeal with Banana',
    category: 'western',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_008', amountG: 40 },
      { foodId: 'fd_052', amountG: 200 },
      { foodId: 'fd_085', amountG: 100 },
    ],
  },
  {
    id: 'fitness_033',
    nameJa: 'オーバーナイトオーツ',
    nameEn: 'Overnight Oats',
    category: 'western',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_008', amountG: 40 },
      { foodId: 'fd_054', amountG: 100 },
    ],
  },
  {
    id: 'fitness_034',
    nameJa: 'プロテインオートミール チョコ',
    nameEn: 'Protein Oatmeal Chocolate',
    category: 'other',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_008', amountG: 40 },
      { foodId: 'gen_022', amountG: 30 },
      { foodId: 'fd_052', amountG: 200 },
    ],
  },
  {
    id: 'fitness_035',
    nameJa: 'オートミール卵粥',
    nameEn: 'Oatmeal Egg Porridge',
    category: 'other',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_008', amountG: 40 },
      { foodId: 'fd_050', amountG: 55 },
      { foodId: 'fd_215', amountG: 0.5 },
    ],
  },

  // === プロテイン系レシピ (5品) ========================================
  {
    id: 'fitness_036',
    nameJa: 'プロテインシェイク（牛乳）',
    nameEn: 'Protein Shake with Milk',
    category: 'other',
    servingDescription: '1杯',
    ingredients: [
      { foodId: 'gen_021', amountG: 30 },
      { foodId: 'fd_052', amountG: 200 },
    ],
  },
  {
    id: 'fitness_037',
    nameJa: 'プロテインシェイク（豆乳）',
    nameEn: 'Protein Shake with Soy Milk',
    category: 'other',
    servingDescription: '1杯',
    ingredients: [
      { foodId: 'gen_021', amountG: 30 },
      { foodId: 'fd_063', amountG: 200 },
    ],
  },
  {
    id: 'fitness_038',
    nameJa: 'プロテインオートミール',
    nameEn: 'Protein Oatmeal',
    category: 'other',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'gen_021', amountG: 30 },
      { foodId: 'fd_008', amountG: 40 },
      { foodId: 'fd_052', amountG: 200 },
    ],
  },
  {
    id: 'fitness_039',
    nameJa: 'プロテインヨーグルト',
    nameEn: 'Protein Yogurt',
    category: 'other',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_055', amountG: 100 },
      { foodId: 'gen_021', amountG: 15 },
    ],
  },
  {
    id: 'fitness_040',
    nameJa: 'プロテインパンケーキ風',
    nameEn: 'Protein Pancake Style',
    category: 'other',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_008', amountG: 30 },
      { foodId: 'fd_050', amountG: 55 },
      { foodId: 'gen_021', amountG: 20 },
    ],
  },

  // === 和食一般 (5品) ==================================================
  {
    id: 'fitness_041',
    nameJa: '鮭ご飯定食',
    nameEn: 'Salmon Rice Set',
    category: 'japanese',
    servingDescription: '1膳',
    ingredients: [
      { foodId: 'fd_001', amountG: 150 },
      { foodId: 'fd_040', amountG: 80 },
      { foodId: 'fd_062', amountG: 45 },
    ],
  },
  {
    id: 'fitness_042',
    nameJa: '玄米と豆腐の食事',
    nameEn: 'Brown Rice and Tofu Set',
    category: 'japanese',
    servingDescription: '1膳',
    ingredients: [
      { foodId: 'fd_002', amountG: 150 },
      { foodId: 'fd_060', amountG: 150 },
      { foodId: 'fd_118', amountG: 9 },
    ],
  },
  {
    id: 'fitness_043',
    nameJa: '鶏むね親子丼風',
    nameEn: 'Chicken Breast Oyakodon Style',
    category: 'japanese',
    servingDescription: '1膳',
    ingredients: [
      { foodId: 'fd_001', amountG: 150 },
      { foodId: 'fd_020', amountG: 100 },
      { foodId: 'fd_050', amountG: 55 },
      { foodId: 'fd_118', amountG: 9 },
      { foodId: 'fd_119', amountG: 9 },
    ],
  },
  {
    id: 'fitness_044',
    nameJa: 'きな粉ヨーグルト',
    nameEn: 'Kinako Yogurt',
    category: 'japanese',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_054', amountG: 100 },
      { foodId: 'fd_067', amountG: 10 },
    ],
  },
  {
    id: 'fitness_045',
    nameJa: '納豆ご飯',
    nameEn: 'Natto Rice',
    category: 'japanese',
    servingDescription: '1膳',
    ingredients: [
      { foodId: 'fd_001', amountG: 150 },
      { foodId: 'fd_062', amountG: 45 },
      { foodId: 'fd_118', amountG: 5 },
    ],
  },

  // === 減量期向け低カロリー (5品) ======================================
  {
    id: 'fitness_046',
    nameJa: 'ささみとキャベツの蒸し物',
    nameEn: 'Steamed Tenderloin and Cabbage',
    category: 'other',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_023', amountG: 150 },
      { foodId: 'fd_072', amountG: 100 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_047',
    nameJa: '鶏むねサラダチキン風',
    nameEn: 'Chicken Breast Salad Bowl',
    category: 'other',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_020', amountG: 150 },
      { foodId: 'fd_070', amountG: 80 },
      { foodId: 'fd_072', amountG: 50 },
    ],
  },
  {
    id: 'fitness_048',
    nameJa: 'たらの蒸し物',
    nameEn: 'Steamed Cod',
    category: 'japanese',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_047', amountG: 150 },
      { foodId: 'fd_070', amountG: 100 },
      { foodId: 'fd_215', amountG: 1 },
    ],
  },
  {
    id: 'fitness_049',
    nameJa: 'ツナ水煮と海藻サラダ',
    nameEn: 'Water-pack Tuna and Seaweed Salad',
    category: 'other',
    servingDescription: '1人前',
    ingredients: [
      { foodId: 'fd_044', amountG: 70 },
      { foodId: 'gen_010', amountG: 100 },
    ],
  },
  {
    id: 'fitness_050',
    nameJa: '少量オートミールとゆで卵',
    nameEn: 'Light Oatmeal and Boiled Egg',
    category: 'other',
    servingDescription: '1食',
    ingredients: [
      { foodId: 'fd_008', amountG: 30 },
      { foodId: 'fd_051', amountG: 55 },
    ],
  },
];
