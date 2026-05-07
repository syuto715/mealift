import { Food } from '../../types/food';
import { APP_CONFIG } from '../../constants/config';
import { supabase } from '../supabase/client';

// === 型定義 ===

export type AIErrorCode =
  | 'unauthorized'
  | 'invalid_token'
  | 'pro_required'
  | 'quota_exceeded'
  | 'invalid_request'
  | 'gemini_error'
  | 'internal_error'
  | 'network_error'
  | 'not_configured'
  // Build 15 / Session 8 / Feature 5-元 — generate-workout-menu EF
  // returns these on top of the nutrition pipeline's set.
  | 'no_equipment'
  | 'validation_failed';

export class AIError extends Error {
  code: AIErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: AIErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

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

// === Edge function call helper ===

async function getAccessToken(): Promise<string> {
  if (!supabase) {
    throw new AIError(
      'not_configured',
      'サーバー接続が設定されていません',
      0,
    );
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new AIError(
      'unauthorized',
      'ログインが必要です',
      401,
    );
  }
  return token;
}

// Exported for sibling AI services (aiWorkoutService Build 15 / Session 8).
// Token retrieval, error mapping, and structured-error parsing are
// uniform across every Edge Function call in the app.
export async function callEdgeFunction<TReq, TRes>(
  path: string,
  body: TReq,
): Promise<TRes> {
  const token = await getAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    throw new AIError(
      'network_error',
      'ネットワーク接続を確認してください',
      0,
      { cause: e instanceof Error ? e.message : String(e) },
    );
  }

  // Try to parse the body regardless of status so we can surface structured
  // error codes from the edge function.
  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const errObj =
      parsed && typeof parsed === 'object'
        ? (parsed as {
            error?: string;
            message?: string;
            details?: Record<string, unknown>;
          })
        : {};
    const code = (errObj.error as AIErrorCode) ?? 'internal_error';
    const message = errObj.message ?? 'エラーが発生しました';
    throw new AIError(code, message, response.status, errObj.details);
  }

  return parsed as TRes;
}

// === Step 1: Supabase Edge Function で料理を材料に分解 ===

export async function decomposeRecipe(
  dishName: string,
): Promise<RecipeDecomposition> {
  const parsed = await callEdgeFunction<
    { dishName: string },
    RecipeDecomposition
  >('estimate-nutrition', { dishName });

  if (!parsed || !parsed.dishName || !Array.isArray(parsed.ingredients)) {
    throw new AIError(
      'gemini_error',
      'AI応答の形式が不正です',
      502,
    );
  }
  return parsed;
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
): Promise<EstimatedNutrition> {
  const decomposition = await decomposeRecipe(dishName);

  return calculateNutritionFromDecomposition(
    decomposition,
    findByExactName,
    searchFoodsFn,
  );
}

// === Advice call (used by balance screen) ===

export async function fetchNutritionAdvice(prompt: string): Promise<string> {
  const res = await callEdgeFunction<{ prompt: string }, { advice?: string }>(
    'nutrition-advice',
    { prompt },
  );
  if (!res || typeof res.advice !== 'string' || !res.advice) {
    throw new AIError('gemini_error', 'AIから応答がありませんでした', 502);
  }
  return res.advice;
}
