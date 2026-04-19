import type { MextRawRow } from './parse';

export interface MextFoodSeed {
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
  sodiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminAUg: number | null;
  vitaminB1Mg: number | null;
  vitaminB2Mg: number | null;
  vitaminB6Mg: number | null;
  vitaminB12Ug: number | null;
  folateUg: number | null;
  vitaminCMg: number | null;
  vitaminDUg: number | null;
  vitaminEMg: number | null;
  potassiumMg: number | null;
  magnesiumMg: number | null;
  zincMg: number | null;
  cholesterolMg: number | null;
  saturatedFatG: number | null;
  sugarG: number | null;
  saltG: number | null;
  source: 'mext';
  isCommon: boolean;
}

/**
 * Map the first two digits of the 食品番号 (MEXT food group code) to the
 * app's internal `FOOD_CATEGORIES` ids. See `src/constants/foods.ts` for
 * the canonical list.
 */
const GROUP_TO_CATEGORY: Record<string, string> = {
  '01': 'staple', // 穀類
  '02': 'vegetable', // いも及びでん粉類
  '03': 'seasoning', // 砂糖及び甘味類
  '04': 'soy', // 豆類
  '05': 'staple', // 種実類
  '06': 'vegetable', // 野菜類
  '07': 'fruit', // 果実類
  '08': 'vegetable', // きのこ類
  '09': 'vegetable', // 藻類
  '10': 'fish', // 魚介類
  '11': 'meat', // 肉類
  '12': 'egg_dairy', // 卵類
  '13': 'egg_dairy', // 乳類
  '14': 'seasoning', // 油脂類
  '15': 'convenience', // 菓子類
  '16': 'convenience', // し好飲料類
  '17': 'seasoning', // 調味料及び香辛料類
  '18': 'convenience', // 調理済み流通食品類
};

/**
 * ~30 MEXT food numbers for the most frequently-searched items. These are
 * flagged `isCommon = true` and will rank higher in search results.
 *
 * These numbers follow the 八訂 増補2023年 edition. If a number does not
 * match any parsed row it is simply ignored — the heuristic will still
 * catch common items via the alias dictionary.
 */
const COMMON_FOOD_NUMBERS = new Set<string>([
  // 穀類
  '01088', // こめ [水稲めし] 精白米 うるち米
  '01085', // こめ [水稲めし] 玄米
  '01026', // 食パン
  '01038', // うどん ゆで
  '01128', // 干しそば ゆで → 代替 '01128'
  '01064', // マカロニ・スパゲッティ ゆで
  '01117', // もち
  '01004', // オートミール
  '01084', // 精白米 うるち米 めし(茶碗)
  // 肉類
  '11220', // 若鶏肉 むね 皮つき 生
  '11221', // 若鶏肉 むね 皮なし 生
  '11230', // 若鶏肉 もも 皮つき 生
  '11234', // 若鶏肉 ささみ 生
  '11130', // 豚 大型種 ロース 脂身つき 生
  '11036', // 和牛肉 もも 脂身つき 生
  // 卵・乳
  '12004', // 鶏卵 全卵 生
  '13003', // 牛乳 (普通)
  '13025', // ヨーグルト 全脂無糖
  // 大豆
  '04032', // 木綿豆腐
  '04033', // 絹ごし豆腐
  '04046', // 納豆 糸引き
  // 野菜・果物
  '06061', // キャベツ 結球葉 生
  '06267', // ほうれんそう 通年平均 葉 生
  '06264', // ブロッコリー 花序 生
  '06153', // たまねぎ りん茎 生
  '06245', // ピーマン 青 果実 生
  '07107', // バナナ 生
  '07148', // りんご 皮なし 生
  // 魚
  '10253', // まぐろ類 きはだ 生
  '10134', // しろさけ 生
  '10154', // まさば 生
]);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundNullable(n: number | null): number | null {
  return n == null ? null : round2(n);
}

export function transformMextRows(rows: MextRawRow[]): MextFoodSeed[] {
  const out: MextFoodSeed[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.foodNumber || !r.nameJa) continue;
    const id = `mext_${r.foodNumber}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const prefix = r.foodNumber.slice(0, 2);
    const category = GROUP_TO_CATEGORY[prefix] ?? 'convenience';
    out.push({
      id,
      nameJa: r.nameJa,
      nameEn: null,
      brand: null,
      category,
      servingSizeG: 100,
      servingUnit: 'g',
      caloriesPerServing: round1(r.caloriesKcal),
      proteinG: round1(r.proteinG),
      fatG: round1(r.fatG),
      carbG: round1(r.carbG),
      fiberG: r.fiberG != null ? round1(r.fiberG) : null,
      sodiumMg: roundNullable(r.sodiumMg),
      calciumMg: roundNullable(r.calciumMg),
      ironMg: roundNullable(r.ironMg),
      vitaminAUg: roundNullable(r.vitaminAUg),
      vitaminB1Mg: roundNullable(r.vitaminB1Mg),
      vitaminB2Mg: roundNullable(r.vitaminB2Mg),
      vitaminB6Mg: roundNullable(r.vitaminB6Mg),
      vitaminB12Ug: roundNullable(r.vitaminB12Ug),
      folateUg: roundNullable(r.folateUg),
      vitaminCMg: roundNullable(r.vitaminCMg),
      vitaminDUg: roundNullable(r.vitaminDUg),
      vitaminEMg: roundNullable(r.vitaminEMg),
      potassiumMg: roundNullable(r.potassiumMg),
      magnesiumMg: roundNullable(r.magnesiumMg),
      zincMg: roundNullable(r.zincMg),
      cholesterolMg: roundNullable(r.cholesterolMg),
      saturatedFatG: roundNullable(r.saturatedFatG),
      sugarG: roundNullable(r.sugarG),
      saltG: roundNullable(r.saltG),
      source: 'mext',
      isCommon: COMMON_FOOD_NUMBERS.has(r.foodNumber),
    });
  }
  return out;
}
