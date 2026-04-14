import { Food } from '../../types/food';
import { APP_CONFIG } from '../../constants/config';

// === 型定義 ===

export interface RecipeDecomposition {
  dishName: string;
  servingDescription: string;
  ingredients: {
    name: string;
    amountG: number;
  }[];
}

export interface EstimatedIngredient {
  name: string;
  amountG: number;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  matchedFromDB: boolean;
}

export interface EstimatedNutrition {
  dishName: string;
  servingDescription: string;
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarb: number;
  ingredients: EstimatedIngredient[];
  confidence: 'high' | 'medium' | 'low';
}

// === Step 1: Supabase Edge Function で料理を材料に分解 ===

export async function decomposeRecipe(
  dishName: string,
): Promise<RecipeDecomposition | null> {
  try {
    const response = await fetch(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/estimate-nutrition`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ dishName }),
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    const parsed = data as RecipeDecomposition;

    // Basic validation
    if (!parsed.dishName || !Array.isArray(parsed.ingredients)) return null;

    return parsed;
  } catch (error) {
    console.error('[AI] decomposeRecipe error:', error);
    return null;
  }
}

// === Step 2: ローカル DB から栄養計算 ===

export async function calculateNutritionFromDecomposition(
  decomposition: RecipeDecomposition,
  findByExactName: (name: string) => Promise<Food | null>,
  searchFoodsFn: (query: string) => Promise<Food[]>,
): Promise<EstimatedNutrition> {
  const ingredients: EstimatedIngredient[] = [];
  let matchedCount = 0;

  for (const ing of decomposition.ingredients) {
    // 1. 完全一致検索
    let food = await findByExactName(ing.name);

    // 2. 部分一致（最初のヒット）
    if (!food) {
      const results = await searchFoodsFn(ing.name);
      food = results[0] || null;
    }

    if (food) {
      const ratio = ing.amountG / food.servingSizeG;
      ingredients.push({
        name: ing.name,
        amountG: ing.amountG,
        calories: Math.round(food.caloriesPerServing * ratio),
        protein: Math.round(food.proteinG * ratio * 10) / 10,
        fat: Math.round(food.fatG * ratio * 10) / 10,
        carb: Math.round(food.carbG * ratio * 10) / 10,
        matchedFromDB: true,
      });
      matchedCount++;
    } else {
      ingredients.push({
        name: ing.name,
        amountG: ing.amountG,
        calories: 0,
        protein: 0,
        fat: 0,
        carb: 0,
        matchedFromDB: false,
      });
    }
  }

  const totalCalories = ingredients.reduce((sum, i) => sum + i.calories, 0);
  const totalProtein =
    Math.round(ingredients.reduce((sum, i) => sum + i.protein, 0) * 10) / 10;
  const totalFat =
    Math.round(ingredients.reduce((sum, i) => sum + i.fat, 0) * 10) / 10;
  const totalCarb =
    Math.round(ingredients.reduce((sum, i) => sum + i.carb, 0) * 10) / 10;

  const matchRate =
    decomposition.ingredients.length > 0
      ? matchedCount / decomposition.ingredients.length
      : 0;
  const confidence: EstimatedNutrition['confidence'] =
    matchRate >= 0.8 ? 'high' : matchRate >= 0.5 ? 'medium' : 'low';

  return {
    dishName: decomposition.dishName,
    servingDescription: decomposition.servingDescription,
    totalCalories,
    totalProtein,
    totalFat,
    totalCarb,
    ingredients,
    confidence,
  };
}

// === Step 3: 一括実行（UIから呼ぶ関数） ===

export async function estimateDishNutrition(
  dishName: string,
  findByExactName: (name: string) => Promise<Food | null>,
  searchFoodsFn: (query: string) => Promise<Food[]>,
): Promise<EstimatedNutrition | null> {
  const decomposition = await decomposeRecipe(dishName);
  if (!decomposition) return null;

  return calculateNutritionFromDecomposition(
    decomposition,
    findByExactName,
    searchFoodsFn,
  );
}
