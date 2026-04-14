import * as SQLite from 'expo-sqlite';
import { DISHES } from '../../../constants/dishes';
import { generateId } from '../../../utils/id';

export async function seedDishes(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM dishes WHERE is_custom = 0",
  );
  if (existing && existing.count > 0) {
    return;
  }


  for (const dish of DISHES) {
    try {
      // Calculate totals from ingredients
      const totalCalories = dish.ingredients.reduce((s, i) => s + i.calories, 0);
      const totalProteinG = dish.ingredients.reduce((s, i) => s + i.proteinG, 0);
      const totalFatG = dish.ingredients.reduce((s, i) => s + i.fatG, 0);
      const totalCarbG = dish.ingredients.reduce((s, i) => s + i.carbG, 0);

      await db.runAsync(
        `INSERT OR IGNORE INTO dishes (id, name_ja, name_en, category, serving_description, total_calories, total_protein_g, total_fat_g, total_carb_g, is_custom, use_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          dish.id,
          dish.nameJa,
          dish.nameEn ?? null,
          dish.category,
          dish.servingDescription,
          Math.round(totalCalories),
          Math.round(totalProteinG * 10) / 10,
          Math.round(totalFatG * 10) / 10,
          Math.round(totalCarbG * 10) / 10,
        ],
      );

      for (let i = 0; i < dish.ingredients.length; i++) {
        const ing = dish.ingredients[i];
        const ingId = generateId();
        await db.runAsync(
          `INSERT OR IGNORE INTO dish_ingredients (id, dish_id, food_name, amount_g, calories, protein_g, fat_g, carb_g, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ingId,
            dish.id,
            ing.foodName,
            ing.amountG,
            Math.round(ing.calories),
            Math.round(ing.proteinG * 10) / 10,
            Math.round(ing.fatG * 10) / 10,
            Math.round(ing.carbG * 10) / 10,
            i,
          ],
        );
      }
    } catch (error) {
    }
  }

  const afterSeed = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM dishes',
  );
}
