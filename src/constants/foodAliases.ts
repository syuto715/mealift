// Alias mappings to boost food search for common ways users refer to items.
// Keys are food IDs from `foods.ts`; values are alternate search names.
export const FOOD_ALIASES: Record<string, string[]> = {
  fd_001: ['白米', 'ご飯', 'ごはん', 'お米', 'ライス'],
  fd_002: ['玄米', 'ブラウンライス'],
  fd_003: ['食パン', 'パン', 'トースト', 'ブレッド'],
  fd_004: ['うどん', 'ウドン'],
  fd_005: ['そば', 'ソバ', '蕎麦'],
  fd_006: ['パスタ', 'スパゲッティ', 'スパゲティ', 'spaghetti'],
  fd_007: ['もち', 'モチ', '餅'],
  fd_008: ['オートミール', 'オーツ', 'oats'],
  fd_009: ['グラノーラ', 'granola'],
  fd_010: ['ベーグル', 'bagel'],
};

export interface FoodAliasSeed {
  foodId: string;
  aliasName: string;
  aliasType: 'kana' | 'short' | 'brand' | 'common';
}

export function getAllAliasSeeds(): FoodAliasSeed[] {
  const out: FoodAliasSeed[] = [];
  for (const [foodId, aliases] of Object.entries(FOOD_ALIASES)) {
    for (const alias of aliases) {
      out.push({ foodId, aliasName: alias, aliasType: 'common' });
    }
  }
  return out;
}
