import { UUID, ISODateString, ISODateTimeString, MealType } from './common';
import { ExtendedNutrients } from './food';

export interface MealLog {
  id: UUID;
  profileId: UUID;
  date: ISODateString;
  mealType: MealType;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface MealLogItem {
  id: UUID;
  mealLogId: UUID;
  foodId: UUID | null;
  foodName: string;
  servingAmount: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
  sodiumMg: number;
  calciumMg: number;
  ironMg: number;
  vitaminAUg: number;
  vitaminB1Mg: number;
  vitaminB2Mg: number;
  vitaminB6Mg: number;
  vitaminB12Ug: number;
  folateUg: number;
  vitaminCMg: number;
  vitaminDUg: number;
  vitaminEMg: number;
  potassiumMg: number;
  magnesiumMg: number;
  zincMg: number;
  cholesterolMg: number;
  saturatedFatG: number;
  sugarG: number;
  saltG: number;
  note: string | null;
  createdAt: ISODateTimeString;
}

export interface MealLogItemInput {
  foodId?: UUID | null;
  foodName: string;
  servingAmount: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number;
  sodiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
  vitaminAUg?: number;
  vitaminB1Mg?: number;
  vitaminB2Mg?: number;
  vitaminB6Mg?: number;
  vitaminB12Ug?: number;
  folateUg?: number;
  vitaminCMg?: number;
  vitaminDUg?: number;
  vitaminEMg?: number;
  potassiumMg?: number;
  magnesiumMg?: number;
  zincMg?: number;
  cholesterolMg?: number;
  saturatedFatG?: number;
  sugarG?: number;
  saltG?: number;
  note?: string | null;
}

export interface MealLogWithItems extends MealLog {
  items: MealLogItem[];
}

export interface DailyExtendedNutrients {
  fiberG: number;
  saltG: number;
  calciumMg: number;
  ironMg: number;
  vitaminAUg: number;
  vitaminB1Mg: number;
  vitaminB2Mg: number;
  vitaminB6Mg: number;
  vitaminB12Ug: number;
  folateUg: number;
  vitaminCMg: number;
  vitaminDUg: number;
  vitaminEMg: number;
  potassiumMg: number;
  magnesiumMg: number;
  zincMg: number;
  cholesterolMg: number;
  saturatedFatG: number;
  sugarG: number;
  sodiumMg: number;
}

export interface DailyNutritionSummary {
  date: ISODateString;
  totalCalories: number;
  totalProteinG: number;
  totalFatG: number;
  totalCarbG: number;
  extended: DailyExtendedNutrients;
  meals: MealLogWithItems[];
}

export interface MealTemplate {
  id: UUID;
  profileId: UUID;
  name: string;
  mealType: MealType | null;
  items: MealLogItemInput[];
  useCount: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}
