import { UUID, ISODateTimeString, FoodSource } from './common';

export interface ExtendedNutrients {
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
}

/** Keys of ExtendedNutrients for iteration */
export const EXTENDED_NUTRIENT_KEYS: (keyof ExtendedNutrients)[] = [
  'fiberG', 'sodiumMg', 'calciumMg', 'ironMg',
  'vitaminAUg', 'vitaminB1Mg', 'vitaminB2Mg',
  'vitaminB6Mg', 'vitaminB12Ug', 'folateUg',
  'vitaminCMg', 'vitaminDUg', 'vitaminEMg',
  'potassiumMg', 'magnesiumMg', 'zincMg',
  'cholesterolMg', 'saturatedFatG', 'sugarG', 'saltG',
];

/** Map camelCase key → snake_case DB column */
export const EXTENDED_NUTRIENT_DB_COLUMNS: Record<keyof ExtendedNutrients, string> = {
  fiberG: 'fiber_g',
  sodiumMg: 'sodium_mg',
  calciumMg: 'calcium_mg',
  ironMg: 'iron_mg',
  vitaminAUg: 'vitamin_a_ug',
  vitaminB1Mg: 'vitamin_b1_mg',
  vitaminB2Mg: 'vitamin_b2_mg',
  vitaminB6Mg: 'vitamin_b6_mg',
  vitaminB12Ug: 'vitamin_b12_ug',
  folateUg: 'folate_ug',
  vitaminCMg: 'vitamin_c_mg',
  vitaminDUg: 'vitamin_d_ug',
  vitaminEMg: 'vitamin_e_mg',
  potassiumMg: 'potassium_mg',
  magnesiumMg: 'magnesium_mg',
  zincMg: 'zinc_mg',
  cholesterolMg: 'cholesterol_mg',
  saturatedFatG: 'saturated_fat_g',
  sugarG: 'sugar_g',
  saltG: 'salt_g',
};

export interface Food extends ExtendedNutrients {
  id: UUID;
  nameJa: string;
  nameEn: string | null;
  brand: string | null;
  barcode: string | null;
  servingSizeG: number;
  servingUnit: string;
  /** Optional descriptor that disambiguates the kcal basis when the
   * serving unit alone is ambiguous (e.g. CoCo壱 「ライス量「普通(300g)」
   * の場合」 for `servingUnit: "皿"`). Restaurant rows carry this from
   * `nutrition_json.servingDescription`; foods table rows leave it
   * undefined. v1.5.1 hotfix Gap 2 — surfaced after Codex Round 1
   * flagged that hiding gram size on `1 皿 / 918 kcal` rows would
   * mask the rice-quantity basis of the calorie value. */
  servingDescription?: string | null;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  source: FoodSource;
  externalId: string | null;
  isCustom: boolean;
  isFavorite: boolean;
  isUserAdded: boolean;
  verified: boolean;
  addedAt: ISODateTimeString | null;
  useCount: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface FoodInput {
  nameJa: string;
  nameEn?: string | null;
  brand?: string | null;
  barcode?: string | null;
  servingSizeG: number;
  servingUnit: string;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number | null;
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
  source?: FoodSource;
}

export interface FoodCategory {
  id: string;
  nameJa: string;
  nameEn: string;
}
