import {
  PROTEIN_PER_KG,
  FAT_CALORIE_RATIO,
  CALORIES_PER_PROTEIN_G,
  CALORIES_PER_FAT_G,
  CALORIES_PER_CARB_G,
} from '../constants/defaults';

export interface MacroTargets {
  proteinG: number;
  fatG: number;
  carbG: number;
}

export function calculateMacros(
  targetCalories: number,
  weightKg: number,
  proteinPerKg: number = PROTEIN_PER_KG,
  fatRatio: number = FAT_CALORIE_RATIO
): MacroTargets {
  const proteinG = Math.round(weightKg * proteinPerKg);
  const fatG = Math.round((targetCalories * fatRatio) / CALORIES_PER_FAT_G);

  const proteinCal = proteinG * CALORIES_PER_PROTEIN_G;
  const fatCal = fatG * CALORIES_PER_FAT_G;
  const carbG = Math.max(0, Math.round((targetCalories - proteinCal - fatCal) / CALORIES_PER_CARB_G));

  return { proteinG, fatG, carbG };
}

export function macrosToCalories(macros: MacroTargets): number {
  return (
    macros.proteinG * CALORIES_PER_PROTEIN_G +
    macros.fatG * CALORIES_PER_FAT_G +
    macros.carbG * CALORIES_PER_CARB_G
  );
}

export function getMacroPercentages(macros: MacroTargets): {
  proteinPct: number;
  fatPct: number;
  carbPct: number;
} {
  const total = macrosToCalories(macros);
  if (total === 0) return { proteinPct: 0, fatPct: 0, carbPct: 0 };
  return {
    proteinPct: (macros.proteinG * CALORIES_PER_PROTEIN_G) / total,
    fatPct: (macros.fatG * CALORIES_PER_FAT_G) / total,
    carbPct: (macros.carbG * CALORIES_PER_CARB_G) / total,
  };
}
