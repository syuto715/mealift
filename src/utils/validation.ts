import { z } from 'zod/v4';
import { LIMITS } from '../constants/config';

export const weightSchema = z.number()
  .min(LIMITS.MIN_WEIGHT_KG, `${LIMITS.MIN_WEIGHT_KG}kg以上で入力してください`)
  .max(LIMITS.MAX_WEIGHT_KG, `${LIMITS.MAX_WEIGHT_KG}kg以下で入力してください`);

export const heightSchema = z.number()
  .min(LIMITS.MIN_HEIGHT_CM, `${LIMITS.MIN_HEIGHT_CM}cm以上で入力してください`)
  .max(LIMITS.MAX_HEIGHT_CM, `${LIMITS.MAX_HEIGHT_CM}cm以下で入力してください`);

export const bodyFatSchema = z.number()
  .min(LIMITS.MIN_BODY_FAT_PCT, `${LIMITS.MIN_BODY_FAT_PCT}%以上で入力してください`)
  .max(LIMITS.MAX_BODY_FAT_PCT, `${LIMITS.MAX_BODY_FAT_PCT}%以下で入力してください`);

export const caloriesSchema = z.number()
  .min(0, 'カロリーは0以上で入力してください')
  .max(LIMITS.MAX_CALORIES, `${LIMITS.MAX_CALORIES}kcal以下で入力してください`);

export const repsSchema = z.number()
  .min(0)
  .max(LIMITS.MAX_REPS)
  .int();

export const setsSchema = z.number()
  .min(1)
  .max(LIMITS.MAX_SETS)
  .int();

export const rpeSchema = z.number()
  .min(LIMITS.MIN_RPE)
  .max(LIMITS.MAX_RPE);

export const profileInputSchema = z.object({
  displayName: z.string().min(1, '名前を入力してください'),
  gender: z.enum(['male', 'female', 'other']),
  birthYear: z.number().int().min(1920).max(new Date().getFullYear()),
  heightCm: heightSchema,
  currentWeightKg: weightSchema,
  targetWeightKg: weightSchema.optional().nullable(),
  targetBodyFatPct: bodyFatSchema.optional().nullable(),
  goalType: z.enum(['cut', 'bulk', 'maintain', 'recomp']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  trainingDaysPerWeek: z.number().int().min(0).max(7),
  targetDate: z.string().optional().nullable(),
  equipment: z.enum(['gym', 'dumbbell', 'bodyweight']),
});

export const bodyLogInputSchema = z.object({
  date: z.string(),
  weightKg: weightSchema.optional().nullable(),
  bodyFatPct: bodyFatSchema.optional().nullable(),
  muscleMassKg: z.number().positive().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const mealLogItemInputSchema = z.object({
  foodId: z.string().optional().nullable(),
  foodName: z.string().min(1, '食品名を入力してください'),
  servingAmount: z.number().positive('量は0より大きくしてください'),
  servingUnit: z.string().min(1),
  calories: caloriesSchema,
  proteinG: z.number().min(0),
  fatG: z.number().min(0),
  carbG: z.number().min(0),
  note: z.string().optional().nullable(),
});
