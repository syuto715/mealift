import { UUID, ISODateTimeString } from './common';
import { ExtendedNutrients } from './food';

export type DishCategory =
  | 'japanese'
  | 'western'
  | 'chinese'
  | 'korean'
  | 'other'
  | 'convenience'
  | 'fast_food';

export interface Dish extends ExtendedNutrients {
  id: UUID;
  nameJa: string;
  nameEn: string | null;
  category: DishCategory;
  servingDescription: string;
  totalCalories: number;
  totalProteinG: number;
  totalFatG: number;
  totalCarbG: number;
  isCustom: boolean;
  isFavorite: boolean;
  useCount: number;
  createdAt: ISODateTimeString;
}

export interface DishIngredient extends ExtendedNutrients {
  id: UUID;
  dishId: UUID;
  foodName: string;
  amountG: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  sortOrder: number;
}

export interface DishWithIngredients extends Dish {
  ingredients: DishIngredient[];
}
