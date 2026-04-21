export type UUID = string;
export type ISODateString = string;
export type ISODateTimeString = string;

export type GoalType = 'cut' | 'bulk' | 'maintain' | 'recomp';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Gender = 'male' | 'female' | 'other';
export type Equipment = 'gym' | 'dumbbell' | 'bodyweight';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type NoteCategory = 'training' | 'nutrition' | 'condition' | 'general';
export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type FoodSource =
  | 'mext'
  | 'usda'
  | 'manual'
  | 'barcode'
  | 'open_food_facts'
  | 'user'
  | 'curated';
export type PaceLabel = 'too_fast' | 'fast' | 'on_track' | 'slow' | 'too_slow';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'legs'
  | 'arms'
  | 'core'
  | 'full_body';
