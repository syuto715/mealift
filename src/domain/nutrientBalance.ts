import { MealType } from '../types/common';
import { DailyNutritionSummary, DailyExtendedNutrients, MealLogWithItems } from '../types/nutrition';
import { DAILY_NUTRIENT_TARGETS } from '../constants/dailyNutrientTargets';
import { Gender } from '../types/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BalanceStatus = 'adequate' | 'excess' | 'deficient';

export interface NutrientBalanceItem {
  key: string;
  label: string;
  unit: string;
  intake: number;
  target: number;
  /** intake / target (0–2+) */
  ratio: number;
  status: BalanceStatus;
  isUpperLimit: boolean;
  /** true = Plus plan required to display */
  isPremium: boolean;
}

export interface NutrientBalanceResult {
  items: NutrientBalanceItem[];
  overallScore: number;
  adequateCount: number;
  excessCount: number;
  deficientCount: number;
  mealType: MealType | 'daily';
}

// ---------------------------------------------------------------------------
// Meal ratio (あすけん style)
// ---------------------------------------------------------------------------

export const MEAL_RATIO: Record<MealType | 'daily', number> = {
  breakfast: 0.30,
  lunch: 0.35,
  dinner: 0.30,
  snack: 0.05,
  daily: 1.0,
} as const;

// ---------------------------------------------------------------------------
// Extended nutrient definitions for balance display
// ---------------------------------------------------------------------------

interface BalanceNutrientDef {
  key: string;
  label: string;
  unit: string;
  isUpperLimit: boolean;
  /** Key on DailyExtendedNutrients, or null for PFC/kcal */
  extKey: keyof DailyExtendedNutrients | null;
  /** For targets from dailyNutrientTargets.ts */
  targetKey: string | null;
}

const BALANCE_NUTRIENTS: BalanceNutrientDef[] = [
  // PFC (free tier)
  { key: 'calories', label: 'エネルギー', unit: 'kcal', isUpperLimit: false, extKey: null, targetKey: null },
  { key: 'protein', label: 'たんぱく質', unit: 'g', isUpperLimit: false, extKey: null, targetKey: null },
  { key: 'fat', label: '脂質', unit: 'g', isUpperLimit: false, extKey: null, targetKey: null },
  { key: 'carb', label: '炭水化物', unit: 'g', isUpperLimit: false, extKey: null, targetKey: null },
  // Extended (premium)
  { key: 'calciumMg', label: 'カルシウム', unit: 'mg', isUpperLimit: false, extKey: 'calciumMg', targetKey: 'calciumMg' },
  { key: 'magnesiumMg', label: 'マグネシウム', unit: 'mg', isUpperLimit: false, extKey: 'magnesiumMg', targetKey: 'magnesiumMg' },
  { key: 'ironMg', label: '鉄', unit: 'mg', isUpperLimit: false, extKey: 'ironMg', targetKey: 'ironMg' },
  { key: 'zincMg', label: '亜鉛', unit: 'mg', isUpperLimit: false, extKey: 'zincMg', targetKey: 'zincMg' },
  { key: 'vitaminAUg', label: 'ビタミンA', unit: 'μg', isUpperLimit: false, extKey: 'vitaminAUg', targetKey: 'vitaminAUg' },
  { key: 'vitaminDUg', label: 'ビタミンD', unit: 'μg', isUpperLimit: false, extKey: 'vitaminDUg', targetKey: 'vitaminDUg' },
  { key: 'vitaminB1Mg', label: 'ビタミンB1', unit: 'mg', isUpperLimit: false, extKey: 'vitaminB1Mg', targetKey: 'vitaminB1Mg' },
  { key: 'vitaminB2Mg', label: 'ビタミンB2', unit: 'mg', isUpperLimit: false, extKey: 'vitaminB2Mg', targetKey: 'vitaminB2Mg' },
  { key: 'vitaminB6Mg', label: 'ビタミンB6', unit: 'mg', isUpperLimit: false, extKey: 'vitaminB6Mg', targetKey: 'vitaminB6Mg' },
  { key: 'vitaminB12Ug', label: 'ビタミンB12', unit: 'μg', isUpperLimit: false, extKey: 'vitaminB12Ug', targetKey: 'vitaminB12Ug' },
  { key: 'folateUg', label: '葉酸', unit: 'μg', isUpperLimit: false, extKey: 'folateUg', targetKey: 'folateUg' },
  { key: 'vitaminCMg', label: 'ビタミンC', unit: 'mg', isUpperLimit: false, extKey: 'vitaminCMg', targetKey: 'vitaminCMg' },
  { key: 'fiberG', label: '食物繊維', unit: 'g', isUpperLimit: false, extKey: 'fiberG', targetKey: 'fiberG' },
  { key: 'saturatedFatG', label: '飽和脂肪酸', unit: 'g', isUpperLimit: true, extKey: 'saturatedFatG', targetKey: null },
  { key: 'saltG', label: '食塩相当量', unit: 'g', isUpperLimit: true, extKey: 'saltG', targetKey: 'saltG' },
];

const PFC_KEYS = new Set(['calories', 'protein', 'fat', 'carb']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatus(ratio: number, isUpperLimit: boolean): BalanceStatus {
  if (isUpperLimit) {
    return ratio <= 1.0 ? 'adequate' : 'excess';
  }
  if (ratio >= 0.8 && ratio <= 1.2) return 'adequate';
  if (ratio > 1.2) return 'excess';
  return 'deficient';
}

/** Sum nutrient values from meal log items for a specific meal type */
function sumMealNutrients(
  summary: DailyNutritionSummary,
  mealType: MealType,
): { calories: number; proteinG: number; fatG: number; carbG: number; extended: Partial<DailyExtendedNutrients> } {
  const meal = summary.meals.find((m) => m.mealType === mealType);
  if (!meal) {
    return { calories: 0, proteinG: 0, fatG: 0, carbG: 0, extended: {} };
  }

  let calories = 0, proteinG = 0, fatG = 0, carbG = 0;
  const ext: Record<string, number> = {};

  for (const item of meal.items) {
    calories += item.calories;
    proteinG += item.proteinG;
    fatG += item.fatG;
    carbG += item.carbG;
    // Sum extended nutrients
    ext.fiberG = (ext.fiberG ?? 0) + item.fiberG;
    ext.saltG = (ext.saltG ?? 0) + item.saltG;
    ext.calciumMg = (ext.calciumMg ?? 0) + item.calciumMg;
    ext.ironMg = (ext.ironMg ?? 0) + item.ironMg;
    ext.vitaminAUg = (ext.vitaminAUg ?? 0) + item.vitaminAUg;
    ext.vitaminB1Mg = (ext.vitaminB1Mg ?? 0) + item.vitaminB1Mg;
    ext.vitaminB2Mg = (ext.vitaminB2Mg ?? 0) + item.vitaminB2Mg;
    ext.vitaminB6Mg = (ext.vitaminB6Mg ?? 0) + item.vitaminB6Mg;
    ext.vitaminB12Ug = (ext.vitaminB12Ug ?? 0) + item.vitaminB12Ug;
    ext.folateUg = (ext.folateUg ?? 0) + item.folateUg;
    ext.vitaminCMg = (ext.vitaminCMg ?? 0) + item.vitaminCMg;
    ext.vitaminDUg = (ext.vitaminDUg ?? 0) + item.vitaminDUg;
    ext.vitaminEMg = (ext.vitaminEMg ?? 0) + item.vitaminEMg;
    ext.potassiumMg = (ext.potassiumMg ?? 0) + item.potassiumMg;
    ext.magnesiumMg = (ext.magnesiumMg ?? 0) + item.magnesiumMg;
    ext.zincMg = (ext.zincMg ?? 0) + item.zincMg;
    ext.cholesterolMg = (ext.cholesterolMg ?? 0) + item.cholesterolMg;
    ext.saturatedFatG = (ext.saturatedFatG ?? 0) + item.saturatedFatG;
    ext.sugarG = (ext.sugarG ?? 0) + item.sugarG;
    ext.sodiumMg = (ext.sodiumMg ?? 0) + item.sodiumMg;
  }

  return { calories, proteinG, fatG, carbG, extended: ext as Partial<DailyExtendedNutrients> };
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export interface BalanceTargets {
  targetCalories: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbG: number;
}

export function calculateNutrientBalance(
  summary: DailyNutritionSummary,
  targets: BalanceTargets,
  gender: Gender,
  mealType: MealType | 'daily',
): NutrientBalanceResult {
  const ratio = MEAL_RATIO[mealType];

  // Determine intake values
  let calories: number, proteinG: number, fatG: number, carbG: number;
  let extended: Partial<DailyExtendedNutrients>;

  if (mealType === 'daily') {
    calories = summary.totalCalories;
    proteinG = summary.totalProteinG;
    fatG = summary.totalFatG;
    carbG = summary.totalCarbG;
    extended = summary.extended;
  } else {
    const mealData = sumMealNutrients(summary, mealType);
    calories = mealData.calories;
    proteinG = mealData.proteinG;
    fatG = mealData.fatG;
    carbG = mealData.carbG;
    extended = mealData.extended;
  }

  // Saturated fat target: 7% of target calories / 9 (kcal/g)
  const saturatedFatTarget = Math.round(targets.targetCalories * 0.07 / 9 * ratio * 10) / 10;

  const items: NutrientBalanceItem[] = [];

  for (const def of BALANCE_NUTRIENTS) {
    let intake: number;
    let target: number;

    if (def.key === 'calories') {
      intake = Math.round(calories);
      target = Math.round(targets.targetCalories * ratio);
    } else if (def.key === 'protein') {
      intake = Math.round(proteinG * 10) / 10;
      target = Math.round(targets.targetProteinG * ratio * 10) / 10;
    } else if (def.key === 'fat') {
      intake = Math.round(fatG * 10) / 10;
      target = Math.round(targets.targetFatG * ratio * 10) / 10;
    } else if (def.key === 'carb') {
      intake = Math.round(carbG * 10) / 10;
      target = Math.round(targets.targetCarbG * ratio * 10) / 10;
    } else if (def.key === 'saturatedFatG') {
      intake = Math.round((extended.saturatedFatG ?? 0) * 10) / 10;
      target = saturatedFatTarget;
    } else if (def.extKey && def.targetKey) {
      intake = Math.round((extended[def.extKey] ?? 0) * 10) / 10;
      const t = DAILY_NUTRIENT_TARGETS[def.targetKey];
      const baseTarget = t ? (gender === 'female' ? t.female : t.male) : 0;
      target = Math.round(baseTarget * ratio * 10) / 10;
    } else {
      intake = Math.round((extended[def.extKey!] ?? 0) * 10) / 10;
      target = 0;
    }

    const r = target > 0 ? intake / target : 0;
    const status = target > 0 ? getStatus(r, def.isUpperLimit) : 'adequate';

    items.push({
      key: def.key,
      label: def.label,
      unit: def.unit,
      intake,
      target,
      ratio: Math.round(r * 100) / 100,
      status,
      isUpperLimit: def.isUpperLimit,
      isPremium: !PFC_KEYS.has(def.key),
    });
  }

  const scorable = items.filter((i) => i.target > 0);
  const adequateCount = scorable.filter((i) => i.status === 'adequate').length;
  const excessCount = scorable.filter((i) => i.status === 'excess').length;
  const deficientCount = scorable.filter((i) => i.status === 'deficient').length;
  const overallScore = scorable.length > 0
    ? Math.round((adequateCount / scorable.length) * 100)
    : 0;

  return {
    items,
    overallScore,
    adequateCount,
    excessCount,
    deficientCount,
    mealType,
  };
}
