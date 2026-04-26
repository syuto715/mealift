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
  isMyDish: boolean;
  userNote: string | null;
  lastUsedAt: ISODateTimeString | null;
  useCount: number;
  createdAt: ISODateTimeString;
}

export interface DishIngredient extends ExtendedNutrients {
  id: UUID;
  dishId: UUID;
  // Optional canonical reference to a row in `foods`. Set by the
  // recipe calculator (Sprint 2) when an ingredient was picked from
  // the food database; null on legacy seed rows and AI-estimate
  // dishes where the ingredient is free-text only.
  foodId: UUID | null;
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
